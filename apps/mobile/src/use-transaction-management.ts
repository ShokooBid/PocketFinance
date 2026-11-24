import type { Account, AccountSource } from "./account-data";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Category, CategorySource } from "./category-data";
import { categoryPath } from "./category-hierarchy";
import { ClientFailure } from "./auth/transport";
import {
  appendTransactionPage,
  reconcileTransactions
} from "./transaction-history";
import {
  validDateFilter,
  transactionFailureMessage,
  uncertainWrite,
  type Currency,
  type Transaction,
  type TransactionFilter,
  type TransactionSource
} from "./transaction-data";

export function useTransactionManagement({
  source,
  categories,
  accounts,
  defaultAccountId = null,
  defaultCurrency = "CAD",
  preferencesReady = true,
  active = true,
  detailId,
  focusId,
  onFocusConsumed
}: {
  source: TransactionSource;
  categories: CategorySource;
  accounts: AccountSource;
  defaultAccountId?: string | null;
  demo?: boolean;
  defaultCurrency?: Currency;
  preferencesReady?: boolean;
  onCurrencySettings?: () => void;
  active?: boolean;
  detailId?: string;
  focusId?: string;
  onFocusConsumed?: () => void;
  onOpenDetail?: (id: string) => void;
  onEdit: (row: Transaction) => void;
  onAdd?: () => void;
}) {
  const [accountChoices, setAccountChoices] = useState<Account[]>([]);
  const [accountsReady, setAccountsReady] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const accountRevision = useRef(0);
  const accountLabel = (id: string) =>
    accountChoices.find((row) => row.id === id)?.name ?? "Account unavailable";
  const [rows, setRows] = useState<Transaction[]>([]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const focusConsumed = useRef(onFocusConsumed);
  focusConsumed.current = onFocusConsumed;
  const [choices, setChoices] = useState<Category[]>([]);
  function categoryLabel(
    id: string | undefined,
    fallback = "Category unavailable"
  ) {
    const row = choices.find((category) => category.id === id);
    return row
      ? categories.hierarchy
        ? categoryPath(row, choices)
        : row.name
      : fallback;
  }
  const [after, setAfter] = useState<string | null>(null);
  const [filter, setFilter] = useState<TransactionFilter>({});
  const [applied, setApplied] = useState<TransactionFilter>({});
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(false);
  const revision = useRef(0);
  const appliedRef = useRef(applied);
  appliedRef.current = applied;
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryFilter, setRetryFilter] = useState<TransactionFilter | null>(
    null
  );
  const [deleted, setDeleted] = useState(false);

  useEffect(
    () =>
      source.subscribe((change) => {
        if (
          detailId &&
          (change.type === "saved" ? change.row.id : change.id) !== detailId
        )
          return;
        revision.current++;
        if (detailId) {
          if (change.type === "saved" && change.row.id === detailId)
            setRows([change.row]);
          if (change.type === "deleted" && change.id === detailId) {
            setRows([]);
            setDeleted(true);
            setDeleting(null);
          }
        } else {
          setRows((previous) =>
            reconcileTransactions(previous, change, appliedRef.current)
          );
          // Local edits can move dates across the cursor. Keep the loaded history,
          // but require a fresh first page before continuing this pagination chain.
          if (change.type === "saved") {
            setAfter(null);
            setNotice("History changed. Apply filters to continue paging.");
          }
        }
      }),
    [source, detailId]
  );

  const read = useCallback(
    async (filter: TransactionFilter, cursor?: string) => {
      if (!detailId) return source.list(filter, cursor);
      try {
        return { items: [await source.get(detailId)], nextCursor: null };
      } catch (error) {
        if (error instanceof ClientFailure && error.kind === "unavailable")
          return { items: [], nextCursor: null };
        throw error;
      }
    },
    [source, detailId]
  );

  useEffect(() => {
    mounted.current = true;
    let active = true;
    lock.current = true;
    setBusy(true);
    const version = revision.current;
    Promise.all([read({}), categories.list()])
      .then(([page, items]) => {
        if (!active) return;
        if (version !== revision.current) {
          setChoices(items);
          setReady(true);
          return;
        }
        setRows(appendTransactionPage([], page));
        setAfter(page.nextCursor);
        setChoices(items);
        setReady(true);
      })
      .catch(() => {
        if (active)
          setError(
            "Transactions could not be loaded. Check your connection and reload."
          );
      })
      .finally(() => {
        if (active) {
          lock.current = false;
          setBusy(false);
        }
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [read, categories]);
  useEffect(() => {
    if (!focusId || detailId || !active) return;
    let current = true;
    void source
      .get(focusId)
      .then((row) => {
        if (!current) return;
        revision.current++;
        setRows([row]);
        setAfter(null);
        setApplied({});
        setFilter({});
        setHighlightedId(row.id);
        setNotice("Apply filters to browse the full transaction list.");
        focusConsumed.current?.();
      })
      .catch(() => {
        if (current)
          setError(
            "The saved record could not be loaded. Reload History and try again."
          );
      });
    return () => {
      current = false;
    };
  }, [focusId, detailId, active, source]);

  const refreshAccounts = useCallback(async () => {
    const version = ++accountRevision.current;
    setAccountsReady(false);
    setAccountError(null);
    try {
      const items = await accounts.list();
      if (mounted.current && version === accountRevision.current) {
        setAccountChoices(items);
        setAccountsReady(true);
      }
    } catch {
      if (mounted.current && version === accountRevision.current)
        setAccountError(
          "Accounts could not be refreshed. Reload accounts before changing transactions."
        );
    }
  }, [accounts]);
  useEffect(() => {
    if (active && preferencesReady) void refreshAccounts();
    return () => {
      accountRevision.current++;
    };
  }, [
    active,
    preferencesReady,
    refreshAccounts,
    defaultCurrency,
    defaultAccountId
  ]);
  async function load(nextFilter: TransactionFilter, more = false) {
    if (lock.current) return;
    if (!validDateFilter(nextFilter)) {
      setError(
        "Enter both real dates as YYYY-MM-DD, in order and no more than 366 days apart."
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setLoadingMore(more);
    setError(null);
    setNotice(null);
    const version = revision.current;
    try {
      const [page, items] = await Promise.all([
        read(nextFilter, more ? (after ?? undefined) : undefined),
        categories.list(),
        refreshAccounts()
      ]);
      if (!mounted.current) return;
      if (version !== revision.current) {
        setError(
          "Transactions changed while loading. Reload to see the latest history."
        );
        return;
      }
      const merged = appendTransactionPage(
        more ? rows : [],
        page,
        more ? (after ?? undefined) : undefined
      );
      setRows(merged);
      setAfter(page.nextCursor);
      setChoices(items);
      setApplied(nextFilter);
      setFilter(nextFilter);
      setRetryFilter(null);
      setReady(true);
      if (uncertain && !more) setReviewed(true);
    } catch {
      if (mounted.current) {
        setError(
          more
            ? "More transactions could not be loaded. Your current rows are unchanged. Try Load more transactions again."
            : "Transactions could not be loaded. Check your connection and reload."
        );
        if (!more) setReady(false);
        setRetryFilter(nextFilter);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
      if (mounted.current) setLoadingMore(false);
    }
  }
  async function remove() {
    if (lock.current || uncertain || !ready || !accountsReady || !deleting)
      return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await source.remove(deleting.id);
      if (!mounted.current) return;
      setRows((previous) => previous.filter((row) => row.id !== deleting.id));
      setDeleting(null);
      setNotice("Transaction deleted.");
    } catch (failure) {
      if (!mounted.current) return;
      setError(transactionFailureMessage(failure));
      if (uncertainWrite(failure)) {
        setUncertain(true);
        setReviewed(false);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function acknowledgeDelete() {
    setUncertain(false);
    setError(null);
    setDeleting(null);
  }
  const disabled =
    busy || uncertain || !ready || !preferencesReady || !accountsReady;
  return {
    rows,
    highlightedId,
    choices,
    accountsReady,
    accountError,
    refreshAccounts,
    accountLabel,
    categoryLabel,
    after,
    filter,
    setFilter,
    applied,
    deleting,
    setDeleting,
    busy,
    ready,
    error,
    notice,
    uncertain,
    reviewed,
    retryFilter,
    loadingMore,
    deleted,
    disabled,
    load,
    remove,
    acknowledgeDelete
  };
}
