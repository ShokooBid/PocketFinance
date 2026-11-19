import { useRef, useState } from "react";
import { ClientFailure } from "./auth/transport";
import { historyRecordId, type HistoryRow } from "./history-data";
import { uncertainWrite } from "./transaction-data";

export function useHistoryDeletion({
  remove,
  recordExists,
  onRemoved
}: {
  remove: (row: HistoryRow) => Promise<void>;
  recordExists: (row: HistoryRow) => Promise<boolean>;
  onRemoved: (row: HistoryRow) => void;
}) {
  const [row, setRow] = useState<HistoryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertainRows, setUncertainRows] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const recordId = row ? historyRecordId(row) : null;
  const needsCheck = recordId !== null && uncertainRows.includes(recordId);

  function cancel() {
    if (!pending.current) setRow(null);
  }

  async function confirm() {
    if (!row || !recordId || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (needsCheck) {
        const exists = await recordExists(row);
        setUncertainRows((current) => current.filter((id) => id !== recordId));
        if (exists) return;
      } else {
        await remove(row);
      }
      onRemoved(row);
      setRow(null);
    } catch (failure) {
      if (needsCheck) {
        setError("Could not check this entry. Try checking it again.");
      } else if (
        uncertainWrite(failure) ||
        (failure instanceof ClientFailure && failure.kind === "unavailable")
      ) {
        setUncertainRows((current) => [...current, recordId]);
      } else {
        setError("Could not delete this entry. Try again.");
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return {
    row,
    busy,
    needsCheck,
    error:
      error ??
      (needsCheck
        ? "Could not confirm deletion. Check this entry before retrying."
        : null),
    open: (target: HistoryRow) => {
      if (pending.current) return;
      setError(null);
      setRow(target);
    },
    cancel,
    confirm
  };
}
