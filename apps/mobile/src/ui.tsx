import { type PropsWithChildren, type ReactNode } from "react";
import { Link, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "./theme";
import { ScreenDecoration } from "./screen-decoration";
import { UserMenu } from "./user-menu";
import { HelpTooltip } from "./help-tooltip";
import Svg, { Path } from "react-native-svg";

export function Body({ children }: PropsWithChildren) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  hint,
  disabled = false,
  selected = false,
  variant = "secondary",
  size = "default",
  leading
}: {
  label: string;
  onPress: () => void;
  hint?: string;
  disabled?: boolean;
  selected?: boolean;
  variant?: "primary" | "secondary" | "outline";
  size?: "default" | "compact";
  leading?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected, ...(disabled ? { disabled } : {}) }}
      disabled={disabled}
      hitSlop={size === "compact" ? 4 : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === "compact" && styles.buttonCompact,
        !!leading && styles.buttonWithIcon,
        variant === "outline" && styles.buttonOutline,
        (variant === "primary" || selected) && styles.buttonPrimary,
        selected && styles.buttonSelected,
        (pressed || disabled) && styles.pressed
      ]}
    >
      {leading}
      <Text
        style={[
          styles.buttonText,
          size === "compact" && styles.buttonTextCompact,
          !!leading && styles.buttonTextWithIcon,
          (variant === "primary" || selected) && styles.buttonTextPrimary
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Screen({
  title,
  children,
  back = false,
  backAction,
  showUserMenu = true,
  onViewportLayout,
  appearance = "standard"
}: PropsWithChildren<{
  title: string;
  back?: boolean;
  backAction?: { label: string; onPress: () => void };
  showUserMenu?: boolean;
  onViewportLayout?: (layout: { width: number; height: number }) => void;
  appearance?: "standard" | "welcome" | "entry" | "overview";
}>) {
  const router = useRouter();
  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={
        appearance === "entry" || appearance === "overview"
          ? ["top", "left", "right"]
          : ["top", "bottom", "left", "right"]
      }
    >
      <ScrollView
        onLayout={(event) => onViewportLayout?.(event.nativeEvent.layout)}
        contentContainerStyle={[
          styles.content,
          appearance === "welcome" && styles.welcomeContent,
          appearance === "entry" && styles.entryContent,
          appearance === "overview" && styles.overviewContent
        ]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        bounces={appearance !== "entry"}
        showsVerticalScrollIndicator={appearance !== "entry"}
      >
        <ScreenDecoration
          prominent={appearance === "welcome"}
          entry={appearance === "entry" || appearance === "overview"}
        />
        {(back || backAction) && (
          <Button
            label={backAction?.label ?? "Back to previous screen"}
            onPress={
              backAction?.onPress ??
              (() => {
                if (router.canGoBack()) router.back();
                else router.replace("/transactions");
              })
            }
          />
        )}
        {appearance === "welcome" && (
          <Text style={styles.brand}>POCKETFINANCE</Text>
        )}
        <View
          style={[
            styles.toolbar,
            appearance === "entry" && styles.entryToolbar,
            appearance === "overview" && styles.overviewToolbar
          ]}
        >
          {appearance === "overview" && (
            <Svg width={30} height={30} viewBox="0 0 24 24" accessible={false}>
              <Path
                d="M3 7V5l13-3 2 5M3 7h17v14H3Zm13 5h6v5h-6Z"
                stroke={theme.color.onPrimary}
                strokeWidth={1.8}
                fill="none"
                strokeLinejoin="round"
              />
            </Svg>
          )}
          <Text
            accessibilityRole="header"
            accessibilityLabel={`${title} screen`}
            style={[
              styles.heading,
              appearance === "welcome" && styles.welcomeHeading,
              appearance === "entry" && styles.entryHeading,
              appearance === "overview" && styles.overviewHeading
            ]}
          >
            {appearance === "overview" ? "PocketFinance" : title}
          </Text>
          {showUserMenu && <UserMenu />}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function NavigationLink({
  href,
  label
}: {
  href:
    | "/transactions"
    | "/categories"
    | "/import"
    | "/settings"
    | "/sign-in"
    | "/"
    | "/overview";
  label: string;
}) {
  return (
    <Link href={href} accessibilityLabel={label} style={styles.link}>
      {label}
    </Link>
  );
}

export function Field({
  label,
  help,
  ...props
}: TextInputProps & { label: string; help?: string }) {
  return (
    <View style={[styles.field, help && styles.helpField]}>
      <View style={styles.fieldLabel}>
        <Text style={styles.body}>{label}</Text>
        {help && <HelpTooltip label={`${label} help`} description={help} />}
      </View>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={theme.color.muted}
        style={styles.input}
      />
    </View>
  );
}

export function StateNotice({
  kind,
  title,
  message,
  onRetry
}: {
  kind: "loading" | "empty" | "error";
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.notice}>
      <View
        accessible
        accessibilityRole={kind === "error" ? "alert" : "text"}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${title}. ${message}`}
        accessibilityState={{ busy: kind === "loading" }}
      >
        {kind === "loading" && (
          <ActivityIndicator accessible={false} color={theme.color.primary} />
        )}
        <Text style={[styles.noticeTitle, kind === "error" && styles.error]}>
          {title}
        </Text>
        <Body>{message}</Body>
      </View>
      {onRetry && <Button label="Try again" onPress={onRetry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.color.background },
  content: {
    flexGrow: 1,
    padding: theme.space.lg,
    paddingTop: 48,
    paddingBottom: 96,
    gap: theme.space.md,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center"
  },
  welcomeContent: { maxWidth: 440, paddingTop: 164, paddingBottom: 164 },
  entryContent: {
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 12,
    gap: 6
  },
  overviewContent: {
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 28,
    gap: 18
  },
  overviewToolbar: { marginBottom: 42, paddingHorizontal: 8, gap: 10 },
  overviewHeading: { color: theme.color.onPrimary, fontSize: 24 },
  entryToolbar: {
    marginBottom: 0,
    paddingHorizontal: 8
  },
  entryHeading: { color: theme.color.onPrimary, fontSize: 20 },
  welcomeHeading: { textAlign: "center", fontSize: 34, fontWeight: "800" },
  brand: {
    color: theme.color.muted,
    textAlign: "center",
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "700"
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.space.md,
    zIndex: 10
  },
  heading: {
    flex: 1,
    color: theme.color.primary,
    fontSize: theme.font.heading,
    fontWeight: "700"
  },
  body: { color: theme.color.text, fontSize: theme.font.body, lineHeight: 24 },
  button: {
    backgroundColor: theme.color.primarySoft,
    borderColor: theme.color.softBorder,
    borderWidth: 1,
    borderRadius: theme.pillRadius,
    minHeight: theme.touchTarget,
    padding: theme.space.md,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonPrimary: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary
  },
  buttonOutline: { backgroundColor: theme.color.surface },
  buttonCompact: {
    minHeight: 40,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  buttonTextCompact: { fontSize: 14 },
  buttonWithIcon: { flexDirection: "row", gap: 8 },
  buttonTextWithIcon: { flexShrink: 1 },
  buttonSelected: { borderColor: theme.color.accent, borderWidth: 2 },
  pressed: { opacity: 0.8 },
  buttonText: {
    color: theme.color.primary,
    fontSize: theme.font.body,
    fontWeight: "600",
    textAlign: "center"
  },
  buttonTextPrimary: { color: theme.color.onPrimary },
  link: {
    color: theme.color.primary,
    backgroundColor: theme.color.surface,
    fontSize: theme.font.body,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: theme.color.softBorder,
    minHeight: theme.touchTarget,
    padding: theme.space.md,
    borderRadius: theme.pillRadius
  },
  field: { gap: theme.space.sm },
  helpField: { zIndex: 2 },
  fieldLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2
  },
  input: {
    color: theme.color.text,
    backgroundColor: theme.color.surface,
    fontSize: theme.font.body,
    minHeight: theme.touchTarget,
    padding: theme.space.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.pillRadius,
    paddingHorizontal: 20
  },
  notice: {
    backgroundColor: theme.color.surface,
    padding: theme.space.md,
    borderRadius: theme.radius,
    gap: theme.space.md,
    borderWidth: 1,
    borderColor: theme.color.softBorder
  },
  noticeTitle: {
    color: theme.color.text,
    fontSize: theme.font.body,
    fontWeight: "700",
    marginBottom: theme.space.sm
  },
  error: { color: theme.color.error }
});
