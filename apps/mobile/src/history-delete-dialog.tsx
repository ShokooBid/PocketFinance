import { ConfirmationDialog } from "./confirmation-dialog";
import {
  historyDateLabel,
  historyRecordText,
  type HistoryRow
} from "./history-data";
import { Body } from "./ui";

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
    <ConfirmationDialog
      title={
        row.kind === "transfer" ? "Delete transfer?" : "Delete transaction?"
      }
      busy={busy}
      busyMessage={needsCheck ? "Checking entry…" : "Deleting entry…"}
      error={error}
      confirmLabel={needsCheck ? "Check entry" : "Delete"}
      confirmVariant={needsCheck ? "secondary" : "destructive"}
      confirmDisabled={writeBlocked}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <Body>{description}</Body>
      <Body>
        {accounts} · {amount} · {historyDateLabel(row.date)}
      </Body>
      {row.kind === "transfer" && (
        <Body>Both account balances will be updated.</Body>
      )}
    </ConfirmationDialog>
  );
}
