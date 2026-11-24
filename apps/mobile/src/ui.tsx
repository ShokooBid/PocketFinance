import { useState, type PropsWithChildren, type ReactNode } from "react";
import { Link, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle
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
  leading,
  style
}: {
  label: string;
  onPress: () => void;
  hint?: string;
  disabled?: boolean;
  selected?: boolean;
  variant?: "primary" | "secondary" | "outline" | "destructive";
  size?: "default" | "compact";
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
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
        variant === "destructive" && styles.buttonDestructive,
        selected && styles.buttonSelected,
        style,
        (pressed || disabled) && styles.pressed
      ]}
    >
      {leading}
      <Text
        style={[
          styles.buttonText,
          size === "compact" && styles.buttonTextCompact,
          !!leading && styles.buttonTextWithIcon,
          (variant === "primary" || variant === "destructive" || selected) &&
            styles.buttonTextPrimary
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export type DropdownOption<Value> = {
  value: Value;
  label: string;
  leading?: ReactNode;
  emphasized?: boolean;
};

export function Dropdown<Value extends string | undefined>({
  label,
  options,
  selected,
  disabled,
  onSelect,
  onClose,
  style,
  children
}: PropsWithChildren<{
  label: string;
  options: readonly DropdownOption<Value>[];
  selected: Value;
  disabled: boolean;
  onSelect: (value: Value) => void;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <View style={[styles.dropdown, style]} onAccessibilityEscape={onClose}>
      {children}
      {options.length > 0 && (
        <ScrollView
          accessibilityLabel={label}
          style={styles.dropdownList}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {options.map((option) => {
            const current = selected === option.value;
            return (
              <Pressable
                key={option.value ?? "all"}
                accessibilityRole="button"
                accessibilityLabel={
                  Platform.OS === "web" && current
                    ? `${option.label} (selected)`
                    : option.label
                }
                accessibilityState={{ selected: current, disabled }}
                disabled={disabled}
                onPress={() => onSelect(option.value)}
                style={({ pressed }) => [
                  styles.dropdownOption,
                  current && styles.dropdownSelected,
                  (pressed || disabled) && styles.dropdownPressed
                ]}
              >
                {option.leading}
                <Text
                  style={[
                    styles.dropdownLabel,
                    option.emphasized && styles.dropdownEmphasized
                  ]}
                >
                  {option.label}
                </Text>
                {current && (
                  <Text
                    accessible={false}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={styles.dropdownCheck}
                  >
                    ✓
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
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
  appearance?: "standard" | "welcome" | "entry" | "history" | "overview";
}>) {
  const router = useRouter();
  const [toolbarBottom, setToolbarBottom] = useState(0);
  const entry = appearance === "entry";
  const financeList = appearance === "history" || appearance === "overview";
  const gradientHeader = entry || financeList;
  // Leave room for the rising edge of the wave when the title wraps or scales.
  const gradientHeight = Math.ceil((toolbarBottom + theme.space.sm) * 1.4);
  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={
        gradientHeader
          ? ["top", "left", "right"]
          : ["top", "bottom", "left", "right"]
      }
    >
      <ScrollView
        onLayout={(event) => onViewportLayout?.(event.nativeEvent.layout)}
        contentContainerStyle={[
          styles.content,
          appearance === "welcome" && styles.welcomeContent,
          entry && styles.entryContent,
          appearance === "history" && styles.historyContent,
          appearance === "overview" && styles.overviewContent
        ]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        bounces={!entry}
        showsVerticalScrollIndicator={!entry}
      >
        <ScreenDecoration
          prominent={appearance === "welcome"}
          entry={gradientHeader}
          entryHeight={gradientHeight}
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
          onLayout={
            gradientHeader
              ? ({ nativeEvent: { layout } }) =>
                  setToolbarBottom(layout.y + layout.height)
              : undefined
          }
          style={[
            styles.toolbar,
            gradientHeader && styles.gradientToolbar,
            financeList && styles.financeListToolbar
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
          <View style={styles.titleGroup}>
            {gradientHeader && (
              <Text style={styles.financeBrand}>Pocket Finance</Text>
            )}
            <Text
              accessibilityRole="header"
              accessibilityLabel={`${title} screen`}
              style={[
                styles.heading,
                appearance === "welcome" && styles.welcomeHeading,
                gradientHeader && styles.gradientSubtitle
              ]}
            >
              {title}
            </Text>
          </View>
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
  historyContent: { paddingTop: 14 },
  overviewContent: {
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 28,
    gap: 18
  },
  gradientToolbar: { paddingHorizontal: 8 },
  financeListToolbar: { marginBottom: 42, gap: 10 },
  titleGroup: { flex: 1 },
  financeBrand: {
    color: theme.color.onPrimary,
    fontSize: 26,
    fontWeight: "700"
  },
  gradientSubtitle: { color: theme.color.onPrimary, fontSize: 19 },
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
  buttonDestructive: {
    backgroundColor: theme.color.destructive,
    borderColor: theme.color.destructive
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
  dropdown: {
    width: "100%",
    maxWidth: 320,
    alignSelf: "flex-start",
    padding: 6,
    borderWidth: 1,
    borderColor: theme.color.softBorder,
    borderRadius: 16,
    backgroundColor: theme.color.surface,
    gap: 6
  },
  dropdownList: { maxHeight: 240 },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: theme.touchTarget,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10
  },
  dropdownSelected: { backgroundColor: theme.color.primarySoft },
  dropdownPressed: { opacity: 0.7 },
  dropdownLabel: { flex: 1, color: theme.color.text, fontSize: 14 },
  dropdownEmphasized: { fontWeight: "700" },
  dropdownCheck: { color: theme.color.primary, fontSize: 16 },
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
