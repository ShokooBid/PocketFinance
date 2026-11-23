import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { ClientFailure } from "./auth/transport";
import {
  accountInput,
  parseOpeningBalance,
  type Account,
  type AccountSource
} from "./account-data";
import { localDate } from "./entry-data";
import { uncertainWrite, type Currency } from "./transaction-data";

export type AccountManagementProps = {
  source: AccountSource;
  currency: Currency;
  defaultAccountId: string | null;
  onDefault: (id: string | null) => Promise<void>;
  onReloadPreferences?: () => Promise<void>;
  preferencesReady?: boolean;
  active?: boolean;
  changes?: { subscribe(listener: () => void): () => void };
};

type AccountPanel =
  { kind: "create" } | { kind: "edit" | "archive"; account: Account } | null;

function actionMessage(failure: unknown) {
  if (failure instanceof ClientFailure) {
    if (failure.code === "ACCOUNT_NAME_CONFLICT")
      return "An active account already uses that name. Choose a distinct name, such as BMO Chequing or BMO Savings.";
    if (failure.code === "PREFERENCE_CHANGED")
      return "This account must use your permanent currency. Review the currency before creating it.";
    if (failure.code === "ACCOUNT_ARCHIVED")
      return "This account was archived. Its history is preserved.";
    if (failure.code === "OPENING_DATE_AFTER_ACTIVITY")
      return "Choose an opening date on or before this account's earliest transaction or transfer.";
    if (failure.kind === "unavailable")
      return "This account is unavailable. Review your accounts before continuing.";
    if (failure.code === "INVALID_ACCOUNT")
      return "Choose an active account in the configured currency as the default.";
  }
  return "The account action could not be confirmed. Review your accounts before another change.";
}

export function useAccountManagement(
  {
    source,
    currency,
    defaultAccountId,
    onDefault,
    onReloadPreferences,
    preferencesReady = true,
    active = true,
    changes
  }: AccountManagementProps,
  createInline: boolean
) {
  const [rows, setRows] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<Account["type"]>("bank");
  const [opening, setOpening] = useState("");
  const initialPanel: AccountPanel = createInline ? { kind: "create" } : null;
  const [panel, setPanel] = useState<AccountPanel>(initialPanel);
  const [date, setDate] = useState(localDate);
  const creating = panel?.kind === "create";
  const editing = panel?.kind === "edit" ? panel.account : null;
  const archiving = panel?.kind === "archive" ? panel.account : null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<
    ReturnType<AccountSource["get"]>
  > | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const mounted = useRef(false),
    lock = useRef(false);
  const [refreshRequested, setRefreshRequested] = useState(false);
  const selected = useRef(selectedId);
  selected.current = selectedId;

  const readDetail = useCallback(
    async (row: Account) => {
      setDetail(null);
      setDetailError(null);
      try {
        // The balance API rejects dates before opening; label future baselines honestly.
        const asOf = [new Date().toISOString().slice(0, 10), row.openingDate]
          .sort()
          .at(-1)!;
        const result = await source.get(row.id, asOf);
        if (mounted.current && selected.current === row.id) setDetail(result);
      } catch {
        if (mounted.current && selected.current === row.id)
          setDetailError("The tracked balance could not be loaded. Try again.");
      }
    },
    [source]
  );

  const refresh = useCallback(async () => {
    setDetail(null);
    const accounts = await source.list();
    if (!mounted.current) return;
    setRows(accounts);
    setReady(true);
    const row = accounts.find((row) => row.id === selected.current);
    if (row) await readDetail(row);
    else {
      setSelectedId(null);
      setDetailError(null);
    }
  }, [source, readDetail]);

  const reload = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setReady(false);
    try {
      await Promise.all([refresh(), onReloadPreferences?.()]);
      if (mounted.current) setReviewed(true);
    } catch {
      if (mounted.current) {
        setReady(false);
        setError(
          "Accounts could not be loaded. Try again before making changes."
        );
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [refresh, onReloadPreferences]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (active) setRefreshRequested(true);
  }, [active, reload]);
  useEffect(
    () => changes?.subscribe(() => setRefreshRequested(true)),
    [changes]
  );
  useEffect(() => {
    // A focus event during an older read/write still needs a fresh read afterward.
    if (active && !busy && refreshRequested) {
      setRefreshRequested(false);
      void reload();
    }
  }, [active, busy, reload, refreshRequested]);
  useEffect(() => {
    if (!active) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (lock.current) setRefreshRequested(true);
        else void reload();
      }
    });
    return () => subscription.remove();
  }, [active, reload]);

  async function viewDetails(row: Account) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setSelectedId(row.id);
    selected.current = row.id;
    await readDetail(row);
    lock.current = false;
    if (mounted.current) setBusy(false);
  }

  function toggleDetails(row: Account) {
    if (selected.current === row.id) {
      selected.current = null;
      setSelectedId(null);
      setDetail(null);
      setDetailError(null);
    } else if (!lock.current) void viewDetails(row);
  }

  function resetForm() {
    setName("");
    setType("bank");
    setOpening("");
    setDate(localDate());
  }

  function resetPanel() {
    resetForm();
    setPanel(initialPanel);
  }

  async function action(
    ...[operation, row]: ["save"] | ["archive"] | ["default", Account]
  ) {
    if (lock.current || uncertain || !ready || !preferencesReady) return;
    if (operation === "save" && !creating && !editing) return;
    let input;
    try {
      if (operation === "save")
        input = accountInput.parse({
          name,
          type,
          currency: editing?.currency ?? currency,
          openingDate: date,
          openingBalanceMinor:
            editing?.openingBalanceMinor ??
            parseOpeningBalance(opening, currency)
        });
      if (
        operation === "default" &&
        (!rows.some((owned) => owned.id === row.id) ||
          row.archivedAt ||
          row.currency !== currency)
      )
        throw new ClientFailure("validation", "INVALID_ACCOUNT");
    } catch (failure) {
      setError(
        operation !== "save"
          ? actionMessage(failure)
          : editing
            ? "Check the account name and opening date."
            : "Check the account name, signed opening amount and calendar date."
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    let confirmed = false;
    try {
      if (operation === "save") {
        if (editing)
          await source.update(editing.id, {
            name: input!.name,
            type: input!.type,
            ...(input!.openingDate !== editing.openingDate
              ? { openingDate: input!.openingDate }
              : {})
          });
        else await source.create(input!);
        if (!mounted.current) return;
        resetPanel();
        setNotice(
          editing
            ? "Account changes saved."
            : "Account created. Choose it explicitly as your default or select it in your transaction draft."
        );
      } else if (operation === "archive") {
        if (!archiving) return;
        await source.archive(archiving.id);
        if (!mounted.current) return;
        resetPanel();
        // The API clears its default atomically; keep the demo/provider in sync too.
        if (defaultAccountId === archiving.id) await onDefault(null);
      } else {
        await onDefault(row.id);
        if (mounted.current) setNotice(`${row.name} is the default account.`);
      }
      confirmed = true;
      await refresh();
    } catch (failure) {
      if (mounted.current) {
        if (confirmed) {
          setReady(false);
          setError(
            "The change was saved, but accounts could not be refreshed. Try again before making another change."
          );
          setRefreshRequested(true);
        } else {
          setError(actionMessage(failure));
          if (uncertainWrite(failure)) {
            setUncertain(true);
            setReviewed(false);
            setRefreshRequested(true);
          }
        }
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const disabled = busy || uncertain || !ready || !preferencesReady;
  return {
    rows,
    creating,
    name,
    setName,
    type,
    setType,
    opening,
    setOpening,
    date,
    setDate,
    editing,
    archiving,
    selectedId,
    detail,
    detailError,
    busy,
    ready,
    error,
    notice,
    uncertain,
    reviewed,
    disabled,
    reload,
    viewDetails,
    toggleDetails,
    action,
    startCreating() {
      resetForm();
      setPanel({ kind: "create" });
      setError(null);
    },
    edit(row: Account) {
      setPanel({ kind: "edit", account: row });
      setName(row.name);
      setType(row.type);
      setDate(row.openingDate);
      setError(null);
    },
    startArchiving(row: Account) {
      setPanel({ kind: "archive", account: row });
      setError(null);
    },
    closePanel() {
      if (lock.current) return;
      resetPanel();
      if (!uncertain && ready) setError(null);
    },
    acknowledgeReview() {
      setUncertain(false);
      setError(null);
      setNotice(null);
    }
  };
}
