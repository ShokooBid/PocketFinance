import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Body, Button, Dropdown, Field, StateNotice } from "./ui";
import { theme } from "./theme";
import { CategoryIcon } from "./category-icon";
import { categoryPath } from "./category-hierarchy";
import { CategoryPicker } from "./finance-picker";
import { RangeDateField } from "./date-picker";
import { HistoryDeleteDialog } from "./history-delete-dialog";
import {
  historyDateLabel,
  historyKey,
  historyRecordId,
  historyRecordText,
  type HistoryRow
} from "./history-data";
import { useHistory, type HistoryProps } from "./use-history";
import { useHistoryDeletion } from "./use-history-deletion";

export function HistoryScreen(
  props: HistoryProps & {
    onEdit: (row: HistoryRow) => void;
    onDelete: (row: HistoryRow) => Promise<void>;
    recordExists: (row: HistoryRow) => Promise<boolean>;
    writeBlocked?: boolean;
  }
) {
  const state = useHistory(props);
  const { fontScale, width } = useWindowDimensions();
  const { filter, page, busy } = state;
  const [picker, setPicker] = useState<
    "account" | "category" | "type" | "range" | null
  >(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const deletion = useHistoryDeletion({
    remove: props.onDelete,
    recordExists: props.recordExists,
    onRemoved: (row) => {
      setExpandedKey(null);
      state.removeFromPage(row);
    }
  });
  useEffect(() => {
    if (
      expandedKey &&
      !page?.items.some((row) => historyRecordId(row) === expandedKey)
    )
      setExpandedKey(null);
  }, [expandedKey, page]);
  const category = state.categoryChoices.find(
    (row) => row.id === filter.categoryId
  );
  const account = state.accountChoices.find(
    (row) => row.id === filter.accountId
  );
  const dates = [...new Set(page?.items.map((row) => row.date) ?? [])];
  const disabled = busy || !props.ready || !props.active;
  const modalOpen = picker === "category" || deletion.row !== null;
  function open(value: typeof picker) {
    setAccountSearch("");
    setPicker((current) => (current === value ? null : value));
  }
  function clearCategory() {
    state.updateFilters({
      categoryId: undefined,
      includeSubcategories: undefined
    });
    setPicker(null);
  }
  return (
    <>
      <View
        accessibilityElementsHidden={modalOpen}
        importantForAccessibility={modalOpen ? "no-hide-descendants" : "auto"}
        style={styles.section}
      >
        <RangeDateField
          from={filter.from}
          to={filter.to}
          expanded={picker === "range"}
          disabled={disabled}
          onToggle={() => open("range")}
          onChange={state.updateFilters}
          onClose={() => setPicker(null)}
        />
        <View
          style={[styles.filterBar, fontScale > 1.3 && styles.filterBarWrap]}
        >
          <HistoryPill
            label={`Account: ${account?.name ?? (filter.accountId ? "Unavailable" : "All")}${account?.archivedAt ? " (archived)" : ""}`}
            text={`⌂  ${account?.name ?? "Account"}  ⌄`}
            disabled={disabled}
            onPress={() => open("account")}
            expanded={picker === "account"}
            style={[
              styles.filterChip,
              fontScale > 1.3 && styles.filterChipWide
            ]}
          />
          <HistoryPill
            label={`Type: ${filter.type ?? "All"}`}
            text={`⇄  ${filter.type ?? "Type"}  ⌄`}
            disabled={disabled}
            onPress={() => open("type")}
            expanded={picker === "type"}
            style={[
              styles.filterChip,
              fontScale > 1.3 && styles.filterChipWide
            ]}
          />
          <HistoryPill
            label={`Category: ${category ? categoryPath(category, state.categoryChoices) : filter.categoryId ? "Unavailable" : "All"}`}
            text={`◇  ${category?.name ?? "Category"}  ⌄`}
            disabled={disabled}
            onPress={() => open("category")}
            style={[
              styles.filterChip,
              fontScale > 1.3 && styles.filterChipWide
            ]}
          />
        </View>
        {picker === "account" && (
          <Dropdown
            label="Account filter options"
            options={[
              { value: undefined, label: "All accounts" },
              ...state.accountChoices
                .filter((row) =>
                  row.name
                    .toLocaleLowerCase()
                    .includes(accountSearch.toLocaleLowerCase())
                )
                .map((row) => ({
                  value: row.id,
                  label: `${row.name} · ${row.currency}${row.archivedAt ? " (archived)" : ""}`
                }))
            ]}
            selected={filter.accountId}
            disabled={disabled}
            onClose={() => setPicker(null)}
            onSelect={(accountId) => {
              setPicker(null);
              state.updateFilters({ accountId });
            }}
          >
            {state.accountChoices.length > 6 && (
              <Field
                label="Search account choices"
                value={accountSearch}
                onChangeText={setAccountSearch}
              />
            )}
          </Dropdown>
        )}
        {picker === "type" && (
          <Dropdown
            label="Type filter options"
            options={(
              [undefined, "income", "expense", "transfer"] as const
            ).map((value) => ({ value, label: value ?? "All types" }))}
            selected={filter.type}
            disabled={disabled}
            style={styles.typeDropdown}
            onClose={() => setPicker(null)}
            onSelect={(type) => {
              setPicker(null);
              state.updateFilters({ type });
            }}
          />
        )}
        {category && !category.parentId && (
          <HistoryPill
            label={
              filter.includeSubcategories
                ? "Category scope: Parent and subcategories"
                : "Category scope: Exact category"
            }
            text={
              filter.includeSubcategories
                ? "Include subcategories"
                : "Exact category"
            }
            selected={!!filter.includeSubcategories}
            disabled={disabled}
            style={styles.scopeChip}
            onPress={() =>
              state.updateFilters({
                includeSubcategories: !filter.includeSubcategories
              })
            }
          />
        )}
        {filter.categoryId && (
          <Body>
            Transfers have no category and are excluded when a category filter
            is applied.
          </Body>
        )}
        <View style={styles.actions}>
          <HistoryPill
            label="Clear filters"
            text="Clear"
            disabled={disabled}
            onPress={state.clear}
            style={styles.textAction}
          />
          <HistoryPill
            label="Refresh history"
            text="Refresh"
            disabled={disabled}
            onPress={state.refresh}
            style={styles.textAction}
          />
        </View>
        {page?.adjustments.length ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {page.adjustments.join(" ")}
          </Text>
        ) : null}
        {busy && (
          <StateNotice
            kind="loading"
            title="Loading history"
            message="Existing rows stay visible while History refreshes."
          />
        )}
        {state.error && (
          <StateNotice
            kind="error"
            title="History needs attention"
            message={state.error}
            {...(!busy ? { onRetry: state.refresh } : {})}
          />
        )}
        {state.stale && page && (
          <Body>
            Previously loaded history may be out of date. Refresh before
            continuing pagination.
          </Body>
        )}
        {page?.previousCursor && (
          <Button
            label="Load newer transactions"
            disabled={disabled || state.stale}
            onPress={() => state.more("newer")}
          />
        )}
        {page && !page.items.length && !busy && !state.error && (
          <StateNotice
            kind="empty"
            title="No transactions match"
            message="Adjust the date, account, type or category filters, or clear them to see all history."
          />
        )}
        {dates.map((date) => (
          <View key={date} style={styles.group}>
            <Text accessibilityRole="header" style={styles.groupHeader}>
              {historyDateLabel(date)}
            </Text>
            {page?.items
              .filter((row) => row.date === date)
              .map((row) => (
                <HistoryRecord
                  key={historyRecordId(row)}
                  row={row}
                  highlighted={page.focusedKey === historyKey(row)}
                  expanded={expandedKey === historyRecordId(row)}
                  actionWidth={176 * Math.max(1, fontScale)}
                  stackActions={width <= 375 || fontScale > 1.3}
                  {...(page.applied.accountId
                    ? { statementAccountId: page.applied.accountId }
                    : {})}
                  disabled={disabled || !!props.writeBlocked}
                  onPress={() =>
                    setExpandedKey((current) =>
                      current === historyRecordId(row)
                        ? null
                        : historyRecordId(row)
                    )
                  }
                  onEdit={() => {
                    setExpandedKey(null);
                    props.onEdit(row);
                  }}
                  onDelete={() => deletion.open(row)}
                />
              ))}
          </View>
        ))}
        {page?.nextCursor ? (
          <Button
            label="Load older transactions"
            disabled={disabled || state.stale}
            onPress={() => state.more("older")}
          />
        ) : page?.items.length && !busy ? (
          <Body>End of matching history.</Body>
        ) : null}
      </View>
      {picker === "category" && (
        <CategoryPicker
          source={props.categories}
          mode="filter"
          selectedId={filter.categoryId ?? ""}
          onSelect={(id, rows) => {
            state.selectCategory(id, rows);
            setPicker(null);
          }}
          onClear={clearCategory}
          onClose={() => setPicker(null)}
        />
      )}
      {deletion.row && (
        <HistoryDeleteDialog
          row={deletion.row}
          busy={deletion.busy}
          needsCheck={deletion.needsCheck}
          error={deletion.error}
          writeBlocked={!!props.writeBlocked || !props.ready || !props.active}
          onCancel={deletion.cancel}
          onConfirm={() => void deletion.confirm()}
        />
      )}
    </>
  );
}
function HistoryPill({
  label,
  text,
  disabled,
  onPress,
  style,
  selected = false,
  expanded
}: {
  label: string;
  text: string;
  disabled: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
  expanded?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled,
        selected,
        ...(expanded === undefined ? {} : { expanded })
      }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        style,
        (pressed || disabled) && styles.pressed
      ]}
    >
      <Text numberOfLines={1} style={styles.pillText}>
        {text}
      </Text>
    </Pressable>
  );
}
function HistoryRecord({
  row,
  highlighted,
  expanded,
  actionWidth,
  stackActions,
  disabled,
  onPress,
  onEdit,
  onDelete,
  statementAccountId
}: {
  row: HistoryRow;
  highlighted: boolean;
  expanded: boolean;
  actionWidth: number;
  stackActions: boolean;
  disabled: boolean;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  statementAccountId?: string;
}) {
  const transfer = row.kind === "transfer";
  const { category, description, accounts, amount, typeLabel } =
    historyRecordText(row, statementAccountId);
  const inlineActions = expanded && !stackActions;
  const amountText = (
    <Text
      numberOfLines={inlineActions ? undefined : 1}
      style={[
        styles.amount,
        inlineActions && styles.inlineAmount,
        row.type === "expense" && styles.expense,
        row.type === "income" && styles.income
      ]}
    >
      {amount}
    </Text>
  );
  return (
    <View
      style={[
        styles.row,
        highlighted && styles.highlighted,
        expanded && stackActions && styles.stackedRow
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${highlighted ? "Saved record. " : ""}${description}. ${typeLabel}. ${accounts}. ${category ?? ""}. ${amount}. ${historyDateLabel(row.date)}`}
        accessibilityHint={
          expanded ? "Hide record actions" : "Show record actions"
        }
        accessibilityState={{ disabled, expanded }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.rowContent,
          expanded && stackActions && styles.stackedContent,
          pressed && styles.pressed
        ]}
      >
        {transfer ? (
          <View style={styles.transferIcon}>
            <Svg width={32} height={32} viewBox="0 0 24 24" accessible={false}>
              <Path
                d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"
                stroke={theme.color.primary}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        ) : (
          <CategoryIcon iconKey={row.iconKey ?? undefined} size={44} />
        )}
        <View style={styles.rowText}>
          <Text numberOfLines={expanded ? 2 : 1} style={styles.description}>
            {description}
          </Text>
          <Text numberOfLines={expanded ? 2 : 1} style={styles.secondary}>
            {accounts}
            {category ? ` · ${category}` : ""}
          </Text>
          {inlineActions && amountText}
          {highlighted && <Text style={styles.notice}>Saved record</Text>}
        </View>
        {!inlineActions && amountText}
      </Pressable>
      {expanded && (
        <View
          style={[
            styles.recordActions,
            { width: actionWidth },
            stackActions && styles.stackedActions
          ]}
        >
          <Button
            label="Edit"
            size="compact"
            style={styles.recordAction}
            disabled={disabled}
            onPress={onEdit}
            leading={<RecordActionIcon kind="edit" />}
          />
          <Button
            label="Delete"
            size="compact"
            variant="destructive"
            style={styles.recordAction}
            disabled={disabled}
            onPress={onDelete}
            leading={<RecordActionIcon kind="delete" />}
          />
        </View>
      )}
    </View>
  );
}

function RecordActionIcon({ kind }: { kind: "edit" | "delete" }) {
  const edit = kind === "edit";
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={
          edit
            ? "m14 6 4 4M4 20l4-.8L20 7l-4-4L4.8 15.2 4 20Z"
            : "M4 7h16m-13 0 1 13h8l1-13M9 7V4h6v3m-5 4v5m4-5v5"
        }
        stroke={edit ? theme.color.primary : theme.color.onPrimary}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
const styles = StyleSheet.create({
  section: { gap: 10, marginHorizontal: -8 },
  filterBar: { flexDirection: "row", gap: 6 },
  filterBarWrap: { flexWrap: "wrap" },
  typeDropdown: { maxWidth: 200, alignSelf: "center" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 14 },
  pill: {
    minHeight: 42,
    borderRadius: theme.pillRadius,
    backgroundColor: theme.color.primarySoft,
    borderWidth: 1,
    borderColor: theme.color.softBorder,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  pillText: { fontSize: 13, color: theme.color.primary, fontWeight: "600" },
  filterChip: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
  filterChipWide: { minWidth: 130 },
  scopeChip: { alignSelf: "flex-start" },
  textAction: {
    minHeight: 34,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 4
  },
  group: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.color.softBorder,
    overflow: "hidden"
  },
  groupHeader: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: "700",
    color: theme.color.text,
    backgroundColor: theme.color.primarySoft
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 64,
    borderTopWidth: 1,
    borderTopColor: theme.color.softBorder,
    backgroundColor: theme.color.surface
  },
  stackedRow: { flexDirection: "column", alignItems: "stretch" },
  rowContent: {
    flex: 1,
    minHeight: 44,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  stackedContent: { flex: 0 },
  recordActions: {
    flexDirection: "row",
    maxWidth: "100%",
    gap: 6
  },
  stackedActions: { alignSelf: "flex-end" },
  recordAction: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  rowText: { flex: 1, gap: 2, minWidth: 0 },
  description: { color: theme.color.text, fontWeight: "700", fontSize: 15 },
  secondary: { fontSize: 12, color: theme.color.muted },
  amount: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.color.text,
    flexShrink: 1,
    textAlign: "right"
  },
  inlineAmount: { textAlign: "left" },
  expense: { color: theme.color.error },
  income: { color: "#176441" },
  highlighted: {
    backgroundColor: theme.color.primarySoft,
    borderColor: theme.color.primary,
    borderWidth: 2
  },
  notice: { color: theme.color.primary, fontSize: 15 },
  pressed: { opacity: 0.7 },
  transferIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.primarySoft,
    borderRadius: 12
  }
});
