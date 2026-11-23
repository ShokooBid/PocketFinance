import type { PropsWithChildren } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { theme } from "./theme";
import { Button } from "./ui";

export function ConfirmationDialog({
  title,
  busy,
  busyMessage,
  error,
  confirmLabel,
  confirmVariant = "destructive",
  confirmDisabled = false,
  onCancel,
  onConfirm,
  children
}: PropsWithChildren<{
  title: string;
  busy: boolean;
  busyMessage: string;
  error: string | null;
  confirmLabel: string;
  confirmVariant?: "destructive" | "secondary";
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onCancel}
          style={styles.dialog}
        >
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {children}
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            {busy && (
              <Text accessibilityLiveRegion="polite" style={styles.status}>
                {busyMessage}
              </Text>
            )}
            <View style={styles.actions}>
              <Button
                label="Cancel"
                size="compact"
                onPress={onCancel}
                disabled={busy}
              />
              <Button
                label={confirmLabel}
                size="compact"
                variant={confirmVariant}
                onPress={onConfirm}
                disabled={busy || confirmDisabled}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.space.md,
    backgroundColor: "rgba(48, 33, 63, 0.45)"
  },
  dialog: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "100%",
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius,
    overflow: "hidden"
  },
  content: { gap: theme.space.sm, padding: theme.space.md },
  title: { fontSize: 20, fontWeight: "700", color: theme.color.text },
  error: { color: theme.color.error, fontSize: theme.font.body },
  status: { color: theme.color.muted, fontSize: theme.font.body },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.space.sm,
    marginTop: theme.space.sm
  }
});
