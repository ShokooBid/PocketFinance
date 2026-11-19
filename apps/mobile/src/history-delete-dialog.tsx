import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  historyDateLabel,
  historyRecordText,
  type HistoryRow
} from "./history-data";
import { theme } from "./theme";
import { Body, Button } from "./ui";

export function HistoryDeleteDialog({
  row,
  busy,
  needsCheck,
  error,
  writeBlocked,
  onCancel,
  onConfirm
}: {
  row: HistoryRow;
  busy: boolean;
  needsCheck: boolean;
  error: string | null;
  writeBlocked: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { description, accounts, amount } = historyRecordText(row);
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
              {row.kind === "transfer"
                ? "Delete transfer?"
                : "Delete transaction?"}
            </Text>
            <Body>{description}</Body>
            <Body>
              {accounts} · {amount} · {historyDateLabel(row.date)}
            </Body>
            {row.kind === "transfer" && (
              <Body>Both account balances will be updated.</Body>
            )}
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            {busy && (
              <Text accessibilityLiveRegion="polite" style={styles.status}>
                {needsCheck ? "Checking entry…" : "Deleting entry…"}
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
                label={needsCheck ? "Check entry" : "Delete"}
                size="compact"
                variant={needsCheck ? "secondary" : "destructive"}
                onPress={onConfirm}
                disabled={busy || writeBlocked}
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
