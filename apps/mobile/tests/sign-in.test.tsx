import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest
} from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { router } from "expo-router";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SignInScreen from "../src/app/sign-in";
import SignUpScreen from "../src/app/sign-up";
import * as session from "../src/session";
import { ClientFailure } from "../src/auth/transport";
import { deferred, harness } from "./auth-fixtures";

const publicEnv = [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"
] as const;
const originalEnv = publicEnv.map((key) => process.env[key]);
beforeEach(() => {
  // Baseline: a configured iOS development build with Google client IDs.
  process.env.EXPO_PUBLIC_API_URL = "https://api.example.invalid";
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID =
    "synthetic-web.apps.googleusercontent.com";
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID =
    "synthetic-ios.apps.googleusercontent.com";
  jest.replaceProperty(Platform, "OS", "ios");
  jest.replaceProperty(
    Constants,
    "executionEnvironment",
    ExecutionEnvironment.Bare
  );
});
afterEach(() => {
  publicEnv.forEach((key, index) => {
    const value = originalEnv[index];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  jest.restoreAllMocks();
});
const googleButton = () =>
  screen.queryByRole("button", { name: "Continue with Google" });

function open(Screen: () => React.JSX.Element = SignInScreen) {
  const controller = harness(null).controller;
  const signIn = jest.spyOn(controller, "signIn").mockResolvedValue(undefined);
  const enterDemo = jest.fn();
  const replace = jest.spyOn(router, "replace").mockImplementation(() => {});
  jest.spyOn(session, "useSession").mockReturnValue({
    session: { status: "signed-out" },
    controller,
    enterDemo,
    exitDemo: jest.fn()
  });
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 24, right: 0, bottom: 34, left: 0 }
      }}
    >
      <Screen />
    </SafeAreaProvider>
  );
  return { signIn, enterDemo, replace };
}
async function press(name: string, role: "button" | "link" = "button") {
  await act(async () => fireEvent.press(screen.getByRole(role, { name })));
}
async function credentials(password = "synthetic password") {
  await act(async () => {
    fireEvent.changeText(
      screen.getByLabelText("Email address"),
      "test@example.invalid"
    );
    fireEvent.changeText(screen.getByLabelText("Password"), password);
  });
}

describe("sign-in screen", () => {
  it("keeps the brand and accessible fields, and toggles password visibility", async () => {
    open();
    expect(screen.getByText("PocketFinance")).toBeVisible();
    expect(
      screen.getByRole("header", { name: "Sign in screen" })
    ).toBeVisible();
    await credentials();
    expect(screen.getByLabelText("Password")).toHaveProp(
      "secureTextEntry",
      true
    );
    await press("Show password");
    expect(screen.getByLabelText("Password")).toHaveProp(
      "secureTextEntry",
      false
    );
    expect(screen.getByLabelText("Password")).toHaveProp(
      "value",
      "synthetic password"
    );
    await press("Hide password");
    expect(screen.getByLabelText("Password")).toHaveProp(
      "secureTextEntry",
      true
    );
  });

  it("signs in, clears the submitted password and lets password managers fill it", async () => {
    const { signIn } = open();
    expect(screen.getByLabelText("Password")).toHaveProp(
      "autoComplete",
      "current-password"
    );
    expect(screen.getByLabelText("Email address")).toHaveProp(
      "autoComplete",
      "email"
    );
    // Existing passwords are never held to today's 12-character creation rule.
    await credentials("short");
    await press("Sign in with email");
    expect(signIn).toHaveBeenCalledWith(
      "login",
      "test@example.invalid",
      "short"
    );
    expect(screen.getByLabelText("Password")).toHaveProp("value", "");
    expect(screen.queryByText(/12–128 characters/)).toBeNull();
  });

  it("links to account creation without offering a register action itself", async () => {
    const { replace } = open();
    expect(
      screen.queryByRole("button", { name: "Create account with email" })
    ).toBeNull();
    await press("Go to create account", "link");
    expect(replace).toHaveBeenCalledWith("/sign-up");
  });

  it("offers Google sign-in and demo entry when Google is configured", async () => {
    const { signIn, enterDemo } = open();
    expect(screen.getByText("or")).toBeVisible();
    await press("Continue with Google");
    expect(signIn).toHaveBeenCalledWith("google", "", "");
    await press("Explore demo screens without signing in");
    expect(enterDemo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the web client ID is missing", "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"],
    ["the iOS client ID is missing on iOS", "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"],
    ["it runs in Expo Go", null]
  ] as const)(
    "hides Google, keeping email sign-in, when %s",
    async (_reason, missing) => {
      if (missing) delete process.env[missing];
      else
        jest.replaceProperty(
          Constants,
          "executionEnvironment",
          ExecutionEnvironment.StoreClient
        );
      const { signIn } = open();
      expect(googleButton()).toBeNull();
      expect(screen.queryByText("or")).toBeNull();
      await credentials();
      await press("Sign in with email");
      expect(signIn).toHaveBeenCalledWith(
        "login",
        "test@example.invalid",
        "synthetic password"
      );
    }
  );

  it("shows Google on Android without an iOS client ID", () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    jest.replaceProperty(Platform, "OS", "android");
    open();
    expect(googleButton()).toBeEnabled();
  });

  it("keeps input for local validation failures and displays sign-in errors", async () => {
    const { signIn } = open();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Email address"), "not-email");
      fireEvent.changeText(screen.getByLabelText("Password"), "whatever");
    });
    await press("Sign in with email");
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Password")).toHaveProp("value", "whatever");
    expect(screen.getByText("Sign-in unavailable")).toBeVisible();
    await credentials();
    signIn.mockRejectedValueOnce(new ClientFailure("invalid"));
    await press("Sign in with email");
    expect(
      screen.getByText("Sign-in could not be verified. Please sign in again.")
    ).toBeVisible();
    expect(screen.getByLabelText("Password")).toHaveProp("value", "");
  });

  it("locks the form while submitting and prevents duplicate requests", async () => {
    const pending = deferred<void>();
    const { signIn } = open();
    signIn.mockReturnValueOnce(pending.promise);
    await credentials();
    await press("Sign in with email");
    expect(screen.getByLabelText("Email address")).toHaveProp(
      "editable",
      false
    );
    expect(
      screen.getByRole("button", { name: "Show password" })
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Go to create account" })
    ).toBeDisabled();
    await press("Sign in with email");
    expect(signIn).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    expect(
      screen.getByRole("button", { name: "Sign in with email" })
    ).toBeEnabled();
  });

  it("keeps unconfigured authentication disabled while the demo stays available", async () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    const { enterDemo } = open();
    expect(screen.getByLabelText("Email address")).toHaveProp(
      "editable",
      false
    );
    expect(
      screen.getByRole("button", { name: "Sign in with email" })
    ).toBeDisabled();
    expect(googleButton()).toBeNull();
    await press("Explore demo screens without signing in");
    expect(enterDemo).toHaveBeenCalledTimes(1);
  });
});

describe("create-account screen", () => {
  it("registers with a new-password hint and shows the live length rule", async () => {
    const { signIn } = open(SignUpScreen);
    expect(
      screen.getByRole("header", { name: "Create account screen" })
    ).toBeVisible();
    expect(screen.getByLabelText("Password")).toHaveProp(
      "autoComplete",
      "new-password"
    );
    expect(
      screen.getByLabelText(/Password rule: 12 to 128 characters, not met yet/)
    ).toBeVisible();
    await credentials();
    expect(
      screen.getByLabelText(/Password rule: 12 to 128 characters, met/)
    ).toBeVisible();
    await press("Create account with email");
    expect(signIn).toHaveBeenCalledWith(
      "register",
      "test@example.invalid",
      "synthetic password"
    );
    expect(screen.getByLabelText("Password")).toHaveProp("value", "");
  });

  it("rejects short or blank passwords locally and keeps the input", async () => {
    const { signIn } = open(SignUpScreen);
    for (const weak of ["short", " ".repeat(12)]) {
      await credentials(weak);
      await press("Create account with email");
      expect(screen.getByLabelText("Password")).toHaveProp("value", weak);
    }
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.getByText("Account not created")).toBeVisible();
  });

  it("answers a refused registration without revealing whether the email exists", async () => {
    const { signIn } = open(SignUpScreen);
    signIn.mockRejectedValueOnce(new ClientFailure("invalid"));
    await credentials();
    await press("Create account with email");
    expect(
      screen.getByText(
        "We couldn’t create an account with these details. If you already have one, sign in instead."
      )
    ).toBeVisible();
  });

  it("links back to sign-in and offers Google and the demo", async () => {
    const { replace, signIn, enterDemo } = open(SignUpScreen);
    expect(
      screen.queryByRole("button", { name: "Sign in with email" })
    ).toBeNull();
    await press("Continue with Google");
    expect(signIn).toHaveBeenCalledWith("google", "", "");
    await press("Go to sign in", "link");
    expect(replace).toHaveBeenCalledWith("/sign-in");
    await press("Explore demo screens without signing in");
    expect(enterDemo).toHaveBeenCalledTimes(1);
  });
});
