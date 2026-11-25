import { useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { googleConfigured } from "./auth/google";
import {
  authModes,
  credentialProblem,
  newPassword,
  passwordRuleMet,
  submitFailureMessage,
  type AuthMode
} from "./auth-form-data";
import { useSession } from "./session";
import { StateNotice } from "./ui";
import {
  GoogleMark,
  SignInBanner,
  SignInIcon,
  WalletIllustration,
  WalletMark
} from "./sign-in-artwork";
import { theme } from "./theme";

// Shared by the sign-in and create-account screens; `mode` picks the copy,
// the API method and the password-manager hint.
export function AuthForm({ mode }: { mode: AuthMode }) {
  const copy = authModes[mode];
  const { session, controller, enterDemo } = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const { height } = useWindowDimensions();
  const compact = height < 740;
  const insets = useSafeAreaInsets();
  const locked = useRef(false);
  const configured = Platform.OS !== "web" && !!process.env.EXPO_PUBLIC_API_URL;
  // Hide, rather than disable, Google when this build cannot use it.
  const googleAvailable = configured && googleConfigured();
  const ruleMet = passwordRuleMet(password);

  async function submit(method: "login" | "register" | "google") {
    if (locked.current) return;
    setNotice(null);
    if (method !== "google") {
      const problem = credentialProblem(mode, email, password);
      if (problem) {
        setNotice(problem);
        return;
      }
    }
    locked.current = true;
    setBusy(true);
    const secret = password;
    setPassword("");
    setPasswordVisible(false);
    try {
      await controller.signIn(method, email, secret);
    } catch (error) {
      setNotice(submitFailureMessage(mode, error));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.surface} edges={["left", "right", "bottom"]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
      >
        <View style={styles.card}>
          <View
            style={[
              styles.banner,
              { height: insets.top + (compact ? 76 : 84) }
            ]}
          >
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <SignInBanner />
            </View>
            <View style={[styles.brand, { paddingTop: insets.top + 12 }]}>
              <WalletMark />
              <Text style={styles.brandName}>PocketFinance</Text>
            </View>
          </View>
          <View style={[styles.content, compact && styles.compactContent]}>
            <View style={styles.hero}>
              <WalletIllustration size={compact ? 82 : 96} />
              <Text
                accessibilityRole="header"
                accessibilityLabel={copy.screenLabel}
                style={[styles.title, compact && styles.compactTitle]}
              >
                {copy.title}
              </Text>
              <Text style={styles.subtitle}>{copy.subtitle}</Text>
            </View>
            {session.status === "signed-out" && session.notice && (
              <Text accessibilityLiveRegion="polite" style={styles.feedback}>
                {session.notice}
              </Text>
            )}
            <View
              style={[
                styles.inputRow,
                focused === "email" && styles.inputFocused
              ]}
            >
              <SignInIcon kind="email" />
              <TextInput
                accessibilityLabel="Email address"
                placeholder="Email address"
                placeholderTextColor={theme.color.muted}
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                editable={configured && !busy}
                maxLength={254}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                onSubmitEditing={() => passwordInput.current?.focus()}
              />
            </View>
            <View
              style={[
                styles.inputRow,
                focused === "password" && styles.inputFocused
              ]}
            >
              <SignInIcon kind="lock" />
              <TextInput
                ref={passwordInput}
                accessibilityLabel="Password"
                {...(mode === "sign-up"
                  ? {
                      accessibilityHint: `Use ${newPassword.min} to ${newPassword.max} characters.`
                    }
                  : {})}
                placeholder="Password"
                placeholderTextColor={theme.color.muted}
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                editable={configured && !busy}
                maxLength={newPassword.max}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                secureTextEntry={!passwordVisible}
                // Lets iOS/Android password managers fill or save correctly.
                autoComplete={copy.passwordAutoComplete}
                textContentType={
                  mode === "sign-up" ? "newPassword" : "password"
                }
                returnKeyType="go"
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                onSubmitEditing={() => {
                  if (configured && !busy) void submit(copy.method);
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  passwordVisible ? "Hide password" : "Show password"
                }
                accessibilityState={{
                  selected: passwordVisible,
                  disabled: busy
                }}
                disabled={busy}
                onPress={() => setPasswordVisible((visible) => !visible)}
                style={styles.eye}
              >
                <SignInIcon kind={passwordVisible ? "eye-off" : "eye"} />
              </Pressable>
            </View>
            {mode === "sign-up" && (
              <Text
                accessibilityLabel={`Password rule: ${newPassword.min} to ${newPassword.max} characters, ${ruleMet ? "met" : "not met yet"}`}
                accessibilityLiveRegion="polite"
                style={[styles.rule, ruleMet && styles.ruleMet]}
              >
                {ruleMet ? "✓" : "•"} {newPassword.min}–{newPassword.max}{" "}
                characters
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.submitAccessibilityLabel}
              accessibilityState={{ disabled: !configured || busy, busy }}
              disabled={!configured || busy}
              onPress={() => {
                void submit(copy.method);
              }}
              style={({ pressed }) => [
                styles.submit,
                pressed && styles.pressed,
                (!configured || busy) && styles.disabled
              ]}
            >
              {busy && (
                <ActivityIndicator
                  accessible={false}
                  color={theme.color.onPrimary}
                />
              )}
              <Text style={styles.submitText}>
                {busy ? copy.busyLabel : copy.submitLabel}
              </Text>
            </Pressable>
            {googleAvailable && (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerRule} />
                  <Text style={styles.or}>or</Text>
                  <View style={styles.dividerRule} />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    void submit("google");
                  }}
                  style={({ pressed }) => [
                    styles.google,
                    pressed && styles.pressed,
                    busy && styles.disabled
                  ]}
                >
                  <GoogleMark />
                  <Text style={styles.googleText}>Continue with Google</Text>
                </Pressable>
              </>
            )}
            <View style={styles.switch}>
              <Text style={styles.switchPrompt}>{copy.switchPrompt}</Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={copy.switchAccessibilityLabel}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                // Replace, so Back never bounces between the two screens.
                onPress={() => router.replace(copy.switchHref)}
                style={({ pressed }) => [
                  styles.linkTarget,
                  pressed && styles.pressed,
                  busy && styles.disabled
                ]}
              >
                <Text style={styles.link}>{copy.switchLabel}</Text>
              </Pressable>
            </View>
            {notice && (
              <StateNotice
                kind="error"
                title={
                  mode === "sign-up"
                    ? "Account not created"
                    : "Sign-in unavailable"
                }
                message={notice}
              />
            )}
            {busy && (
              <StateNotice
                kind="loading"
                title={copy.busyLabel}
                message="Please wait while your session is verified."
              />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Explore demo screens without signing in"
              accessibilityHint="Explore the app without creating an account."
              accessibilityState={{ disabled: busy }}
              onPress={enterDemo}
              disabled={busy}
              style={styles.demo}
            >
              <Text style={styles.demoText}>Explore demo</Text>
            </Pressable>
            {!configured && (
              <Text style={styles.previewNotice}>
                Sign-in isn’t available in this preview. You can explore the
                demo above.
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: "#F4EDFF" },
  scroll: { flexGrow: 1 },
  card: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    flexGrow: 1,
    backgroundColor: "#FCF9FF",
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: "hidden"
  },
  banner: { width: "100%" },
  brand: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    alignItems: "center"
  },
  brandName: { color: "#FFF", fontSize: 25, fontWeight: "700" },
  content: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 24, gap: 12 },
  compactContent: { paddingTop: 0, gap: 10 },
  hero: { alignItems: "center", marginTop: -4, marginBottom: 10, gap: 6 },
  title: {
    color: "#542185",
    fontSize: 36,
    fontWeight: "800",
    textAlign: "center"
  },
  compactTitle: { fontSize: 32 },
  subtitle: {
    color: theme.color.text,
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
    maxWidth: 310
  },
  inputRow: {
    minHeight: 54,
    paddingLeft: 16,
    paddingRight: 4,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: 18
  },
  inputFocused: { borderColor: theme.color.primary },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 0,
    color: theme.color.text,
    fontSize: 16
  },
  eye: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  rule: {
    marginTop: -4,
    paddingLeft: 4,
    fontSize: 14,
    color: theme.color.muted
  },
  ruleMet: { color: theme.color.primary, fontWeight: "600" },
  submit: {
    marginTop: 8,
    minHeight: 52,
    padding: 12,
    borderRadius: theme.pillRadius,
    backgroundColor: "#8442D4",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  submitText: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    alignSelf: "center",
    width: "76%",
    marginVertical: 2
  },
  dividerRule: { flex: 1, height: 1, backgroundColor: theme.color.softBorder },
  or: { fontSize: 16, color: theme.color.muted },
  google: {
    minHeight: 52,
    padding: 12,
    borderRadius: theme.pillRadius,
    borderWidth: 1,
    borderColor: theme.color.softBorder,
    backgroundColor: "#F1E8FC",
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  googleText: {
    color: "#4E2874",
    fontSize: 17,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "center"
  },
  switch: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    justifyContent: "center"
  },
  switchPrompt: { color: theme.color.text, fontSize: 14 },
  linkTarget: { minHeight: 48, paddingHorizontal: 2, justifyContent: "center" },
  link: { color: "#6F2BB9", fontWeight: "700", fontSize: 14 },
  demo: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  demoText: { fontSize: 14, color: theme.color.primary, fontWeight: "600" },
  previewNotice: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.color.muted,
    textAlign: "center"
  },
  feedback: {
    color: theme.color.text,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center"
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.65 }
});
