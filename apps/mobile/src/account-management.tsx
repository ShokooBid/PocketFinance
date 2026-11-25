import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Body, Button, Field, StateNotice } from "./ui";
import { amountText } from "./transaction-data";
import { theme } from "./theme";
import { HelpTooltip } from "./help-tooltip";
import { AccountTypeSelect } from "./account-type-select";
import { AccountCard } from "./account-card";
import { SingleDateField } from "./date-picker";
import { ConfirmationDialog } from "./confirmation-dialog";
import {
  useAccountManagement,
  type AccountManagementProps
} from "./use-account-management";

export function AccountManagement(
  props: AccountManagementProps & {
    createInline?: boolean;
    onOpenHistory?: (id: string) => void;
    onRevealEditForm?: () => void;
  }
) {
  const { currency, defaultAccountId, createInline = false } = props;
  const state = useAccountManagement(props, createInline);
  const { archiving, busy, disabled, rows } = state;
  const editScrollPending = useRef(false);
  const errorScrollPending = useRef(false);
  function revealEditForm() {
    if (!editScrollPending.current) return;
    editScrollPending.current = false;
    props.onRevealEditForm?.();
  }
  const accounts = [
    ...rows.filter((row) => !row.archivedAt),
    ...rows.filter((row) => row.archivedAt)
  ];
  const form = (state.creating || state.editing) && (
    <View
      key={state.editing?.id ?? "new"}
      style={styles.card}
      onLayout={state.editing ? revealEditForm : undefined}
    >
      <View style={styles.formHeading}>
        <Text accessibilityRole="header" style={styles.heading}>
          {state.editing ? "Edit account" : "Add account"}
        </Text>
        <HelpTooltip
          label={state.editing ? "Edit account help" : "Add account help"}
          description={
            state.editing
              ? "Change the account name, type or opening date."
              : `Track your money in a named account, such as Chequing, Savings or Cash. No bank connection is created. Currency is ${currency}, inherited from your permanent choice.`
          }
        />
      </View>
      <Field
        label="Account name"
        value={state.name}
        editable={!disabled}
        autoCapitalize="words"
        onChangeText={state.setName}
      />
      <AccountTypeSelect
        value={state.type}
        onChange={state.setType}
        disabled={disabled}
      />
      {!state.editing && (
        <Field
          label="Opening balance (optional)"
          help="Your starting balance, not income. Leave blank for zero. Use a period for decimals and a minus sign for a negative balance, such as -12.34. Only your currency's supported decimal places are allowed. This balance cannot be edited after creation."
          value={state.opening}
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={state.setOpening}
        />
      )}
      <SingleDateField
        label="Opening date"
        accessibilityLabel="Choose account opening date"
        help={
          state.editing
            ? "Choose a date on or before this account's earliest transaction or transfer."
            : "Transactions must be dated on or after the opening date. To record older cash transactions, choose an earlier opening date."
        }
        value={state.date}
        onChange={state.setDate}
        disabled={disabled}
      />
      <Button
        label={state.editing ? "Save account changes" : "Create account"}
        variant="primary"
        disabled={disabled}
        onPress={() => {
          errorScrollPending.current = !!state.editing;
          void state.action("save");
        }}
      />
      {(state.editing || !createInline) && (
        <Button
          label={state.editing ? "Cancel account editing" : "Cancel"}
          disabled={busy}
          onPress={state.closePanel}
        />
      )}
      {state.editError && (
        <View
          onLayout={() => {
            if (!errorScrollPending.current) return;
            errorScrollPending.current = false;
            props.onRevealEditForm?.();
          }}
        >
          <StateNotice
            kind="error"
            title="Account changes could not be saved"
            message={state.editError}
          />
        </View>
      )}
    </View>
  );
  return (
    <>
      <View
        accessibilityElementsHidden={!!archiving}
        importantForAccessibility={archiving ? "no-hide-descendants" : "auto"}
        style={styles.section}
      >
        {busy && (
          <StateNotice
            kind="loading"
            title="Loading accounts or confirming a change"
            message="Please wait. Your entered account values are retained."
          />
        )}
        {state.error && (
          <StateNotice
            kind="error"
            title="Accounts need attention"
            message={state.error}
            {...(!busy && (!state.ready || (state.uncertain && !state.reviewed))
              ? { onRetry: () => void state.reload() }
              : {})}
          />
        )}
        {state.notice && (
          <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={state.notice}
          >
            <Body>{state.notice}</Body>
          </View>
        )}
        {state.uncertain && (
          <>
            <Body>
              The change may have succeeded. Review the refreshed accounts
              before another change.
            </Body>
            <Button
              label="I reviewed accounts; enable changes"
              disabled={busy || !state.ready || !state.reviewed}
              onPress={state.acknowledgeReview}
            />
          </>
        )}
        {accounts.map((row) => (
          <AccountCard
            key={row.id}
            account={row}
            isDefault={defaultAccountId === row.id}
            expanded={state.selectedId === row.id}
            disabled={disabled}
            viewDisabled={state.selectedId !== row.id && (busy || !state.ready)}
            defaultEligible={row.currency === currency}
            onToggleDetails={() => state.toggleDetails(row)}
            onEdit={() => {
              editScrollPending.current = true;
              state.edit(row);
              if (state.editing?.id === row.id) revealEditForm();
            }}
            onDefault={() => void state.action("default", row)}
            onArchive={() => state.startArchiving(row)}
          >
            {state.selectedId === row.id && (
              <View style={styles.section}>
                {props.onOpenHistory && (
                  <Button
                    label={`View history for ${row.name}`}
                    disabled={busy || !state.ready}
                    onPress={() => props.onOpenHistory?.(row.id)}
                  />
                )}
                <Body>Currency: {row.currency}</Body>
                <Body>Opening date: {row.openingDate}</Body>
                <Body>
                  Opening balance: {row.openingBalanceMinor < 0 ? "-" : ""}
                  {amountText(
                    Math.abs(row.openingBalanceMinor),
                    row.currency
                  )}{" "}
                  {row.currency}
                </Body>
                {row.archivedAt && (
                  <Body>Archived: {row.archivedAt.slice(0, 10)}</Body>
                )}
                {state.detailError && (
                  <StateNotice
                    kind="error"
                    title="Tracked balance unavailable"
                    message={state.detailError}
                    onRetry={() => void state.viewDetails(row)}
                  />
                )}
                {state.detail?.id === row.id && (
                  <Body>
                    Tracked balance as of {state.detail.asOf}:{" "}
                    {state.detail.balanceMinor < 0 ? "-" : ""}
                    {amountText(
                      Math.abs(state.detail.balanceMinor),
                      row.currency
                    )}{" "}
                    {row.currency}
                  </Body>
                )}
              </View>
            )}
          </AccountCard>
        ))}
        {!createInline && !state.creating && (
          <Button
            label="Add Account"
            variant="primary"
            disabled={disabled}
            onPress={state.startCreating}
          />
        )}
        {form}
      </View>
      {archiving && (
        <ConfirmationDialog
          title={`Archive ${archiving.name}?`}
          busy={busy}
          busyMessage="Updating accounts…"
          error={
            state.uncertain
              ? "The archive may have succeeded. Close this window and review your accounts."
              : state.error
          }
          confirmLabel="Archive"
          confirmDisabled={disabled}
          onCancel={state.closePanel}
          onConfirm={() => void state.action("archive")}
        >
          <Body>
            Future entries cannot select this account. Historical transactions
            and balances are preserved.
          </Body>
        </ConfirmationDialog>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.space.md },
  formHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 3
  },
  card: {
    gap: theme.space.md,
    padding: theme.space.md,
    borderWidth: 1,
    borderColor: theme.color.softBorder,
    borderRadius: theme.radius
  },
  heading: {
    color: theme.color.text,
    fontSize: theme.font.body,
    fontWeight: "700"
  }
});
