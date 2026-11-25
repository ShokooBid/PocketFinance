// Rendering-free rules for the sign-in and create-account screens.
import { z } from "zod";
import { ClientFailure, failureMessage } from "./auth/transport";

export type AuthMode = "sign-in" | "sign-up";
// Mirrors the API's register schema (apps/api/src/auth/routes.ts).
export const newPassword = { min: 12, max: 128 } as const;

export const authModes = {
  "sign-in": {
    method: "login",
    title: "Sign In",
    screenLabel: "Sign in screen",
    subtitle: "Track income, spending, and your monthly summary.",
    submitLabel: "Sign in",
    submitAccessibilityLabel: "Sign in with email",
    busyLabel: "Signing in…",
    passwordAutoComplete: "current-password",
    switchPrompt: "Don’t have an account?",
    switchLabel: "Create account",
    switchAccessibilityLabel: "Go to create account",
    switchHref: "/sign-up"
  },
  "sign-up": {
    method: "register",
    title: "Create account",
    screenLabel: "Create account screen",
    subtitle: "Start tracking your money in a minute.",
    submitLabel: "Create account",
    submitAccessibilityLabel: "Create account with email",
    busyLabel: "Creating account…",
    passwordAutoComplete: "new-password",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchAccessibilityLabel: "Go to sign in",
    switchHref: "/sign-in"
  }
} as const;

// Only the length rule applies when signing in; existing passwords are checked
// by the server, never re-validated against today's creation rules.
export function credentialProblem(
  mode: AuthMode,
  email: string,
  password: string
): string | null {
  const minimum = mode === "sign-up" ? newPassword.min : 1;
  if (
    !z.email().max(254).safeParse(email.trim()).success ||
    password.length < minimum ||
    password.length > newPassword.max ||
    !/\S/.test(password)
  )
    return failureMessage(new ClientFailure("validation"));
  return null;
}

export function passwordRuleMet(password: string) {
  return (
    password.length >= newPassword.min &&
    password.length <= newPassword.max &&
    /\S/.test(password)
  );
}

// The API answers an already-registered email with the same generic 401 as any
// other failure, so accounts cannot be probed. Say something true either way.
export function submitFailureMessage(mode: AuthMode, error: unknown) {
  if (
    mode === "sign-up" &&
    error instanceof ClientFailure &&
    error.kind === "invalid"
  )
    return "We couldn’t create an account with these details. If you already have one, sign in instead.";
  return failureMessage(error);
}
