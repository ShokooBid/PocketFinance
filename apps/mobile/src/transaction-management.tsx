import { View } from "react-native";
import { useState } from "react";
import { CategoryIcon } from "./category-icon";
import { Body, Button, StateNotice } from "./ui";
import { amountText } from "./transaction-data";
import { theme } from "./theme";
import { RangeDatePicker } from "./date-picker";
import { useTransactionManagement } from "./use-transaction-management";
export function TransactionManagement(
  props: Parameters<typeof useTransactionManagement>[0]
) {
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const {
    demo = false,
    preferencesReady = true,
    onCurrencySettings,
    detailId,
    onOpenDetail
  } = props;
  const {
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
  } = useTransactionManagement(props);
  return (
    <View style={{ gap: theme.space.md }}>
      {!preferencesReady && (
        <StateNotice
          kind="error"
          title="Currency settings need attention"
          message="Reload currency settings before changing transactions."
          {...(onCurrencySettings ? { onRetry: onCurrencySettings } : {})}
        />
      )}
      {demo && (
        <Body>
          Demo only: transactions stay in memory and are discarded when you
          exit. No API requests or persistent data.
        </Body>
      )}
      {busy && (
        <StateNotice
          kind="loading"
          title={loadingMore ? "Loading more transactions" : "Working"}
          message={
            loadingMore ? "Your current history stays visible." : "Please wait."
          }
        />
      )}
      {error && (
        <StateNotice
          kind="error"
          title="Transaction action needs attention"
          message={error}
        />
      )}
      {notice && <Body>{notice}</Body>}
      {accountError && (
        <StateNotice
          kind="error"
          title="Accounts need attention"
          message={accountError}
          onRetry={() => void refreshAccounts()}
        />
      )}
      {!accountsReady && !accountError && (
        <StateNotice
          kind="loading"
          title="Loading account choices"
          message="Please wait while accounts refresh."
        />
      )}
      {(detailId || error || (uncertain && !reviewed)) && (
        <Button
          label="Reload transactions and categories"
          disabled={busy}
          onPress={() => void load(uncertain ? {} : (retryFilter ?? applied))}
        />
      )}
      {uncertain && (
        <>
          <Body>
            The deletion may have succeeded. Review the reloaded list before
            making another change.
          </Body>
          <Button
            label="I reviewed the list; enable changes"
            disabled={busy || !reviewed || !ready}
            onPress={acknowledgeDelete}
          />
        </>
      )}
      {!detailId && (
        <>
          <Body>
            {Object.values(applied).some(Boolean)
              ? `Active filters: ${applied.from ?? "any date"}${applied.to ? ` to ${applied.to}` : ""}, ${applied.direction ?? "all directions"}, ${categoryLabel(applied.categoryId, "all categories")}.`
              : "Showing all transactions."}
          </Body>
          <Button
            label={`Date range: ${filter.from && filter.to ? `${filter.from} – ${filter.to}` : "All dates"}`}
            disabled={busy || uncertain}
            onPress={() => setDateRangeOpen((open) => !open)}
          />
          {dateRangeOpen && (
            <RangeDatePicker
              from={filter.from}
              to={filter.to}
              disabled={busy || uncertain}
              onClose={() => setDateRangeOpen(false)}
              onChange={(range) => {
                const next = { ...filter };
                if (range.from && range.to) {
                  next.from = range.from;
                  next.to = range.to;
                } else {
                  delete next.from;
                  delete next.to;
                }
                setFilter(next);
                void load(next);
              }}
            />
          )}
          {([undefined, "income", "expense"] as const).map((direction) => (
            <Button
              key={direction ?? "all"}
              label={`Filter: ${direction ?? "all directions"}`}
              selected={filter.direction === direction}
              disabled={busy}
              onPress={() =>
                setFilter((previous) => {
                  const next = { ...previous };
                  if (direction) next.direction = direction;
                  else delete next.direction;
                  return next;
                })
              }
            />
          ))}
          <Button
            label="Filter: all categories"
            disabled={busy}
            selected={!filter.categoryId}
            onPress={() =>
              setFilter((previous) => {
                const next = { ...previous };
                delete next.categoryId;
                return next;
              })
            }
          />
          {choices.map((category) => (
            <Button
              key={category.id}
              label={`Filter category: ${categoryLabel(category.id)}${category.archivedAt ? " (archived)" : ""}`}
              leading={
                !demo ? <CategoryIcon iconKey={category.iconKey} /> : undefined
              }
              selected={filter.categoryId === category.id}
              disabled={busy}
              onPress={() => setFilter({ ...filter, categoryId: category.id })}
            />
          ))}
          <Button
            label="Apply filters"
            disabled={busy || uncertain}
            onPress={() => void load(filter)}
          />
          {props.onAdd && (
            <Button
              label="Add transaction"
              variant="primary"
              disabled={disabled}
              onPress={props.onAdd}
            />
          )}
        </>
      )}
      {ready && !rows.length && (
        <Body>
          {detailId
            ? deleted
              ? "Transaction deleted. Return to history to continue."
              : "This transaction is unavailable. It may have been deleted or may not belong to this account."
            : "No transactions match this view."}
        </Body>
      )}
      {rows.map((row) => (
        <View key={row.id}>
          <Body>
            {row.date} · {row.direction} ·{" "}
            {amountText(row.amountMinor, row.currency)} {row.currency} ·{" "}
            {row.note || `Transaction on ${row.date}`}
          </Body>
          <Body>
            {accountLabel(row.accountId)} · {categoryLabel(row.categoryId)}
          </Body>
          {highlightedId === row.id && <Body>Saved record</Body>}
          {detailId && (
            <>
              <Body>Created: {row.createdAt}</Body>
              <Body>Last updated: {row.updatedAt}</Body>
            </>
          )}
          {!detailId && onOpenDetail && (
            <Button
              label={`View details for ${row.note || `Transaction on ${row.date}`}`}
              disabled={disabled}
              onPress={() => onOpenDetail(row.id)}
            />
          )}
          <Button
            label={`Edit ${row.note || `Transaction on ${row.date}`}`}
            disabled={disabled}
            onPress={() => props.onEdit(row)}
          />
          <Button
            label={`Delete ${row.note || `Transaction on ${row.date}`}`}
            disabled={disabled}
            onPress={() => setDeleting(row)}
          />
        </View>
      ))}
      {after && (
        <Button
          label="Load more transactions"
          disabled={busy}
          onPress={() => void load(applied, true)}
        />
      )}
      {deleting && (
        <View>
          <Body>
            Delete {deleting.note || `Transaction on ${deleting.date}`}? This
            permanently removes the transaction.
          </Body>
          <Button
            label="Confirm delete transaction"
            disabled={disabled}
            onPress={() => void remove()}
          />
          <Button
            label="Keep transaction"
            disabled={busy || uncertain}
            onPress={() => setDeleting(null)}
          />
        </View>
      )}
    </View>
  );
}
