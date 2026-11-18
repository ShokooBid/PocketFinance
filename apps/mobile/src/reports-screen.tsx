import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { CategoryIcon } from "./category-icon";
import { RangeDateField } from "./date-picker";
import { moneyLabel } from "./dashboard-data";
import type { ReportSection, ReportSource } from "./report-data";
import { theme } from "./theme";
import type { Currency } from "./transaction-data";
import { StateNotice } from "./ui";
import { useReport } from "./use-report";

export function ReportsScreen({
  source,
  currency,
  demo = false
}: {
  source: ReportSource;
  currency: Currency;
  demo?: boolean;
}) {
  const state = useReport(source, currency);
  const [picking, setPicking] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  function toggleExpanded(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.15;
  const disabled = state.state.status === "loading";
  return (
    <>
      <View accessibilityRole="tablist" style={styles.tabs}>
        <View
          accessible
          accessibilityRole="tab"
          accessibilityLabel="Reports"
          accessibilityState={{ selected: true }}
          style={[styles.tab, styles.selectedTab]}
        >
          <ReportIcon kind="reports" color={theme.color.onPrimary} />
          <Text style={[styles.tabText, styles.selectedText]}>Reports</Text>
        </View>
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Charts"
          accessibilityHint="Charts are not available in this version"
          accessibilityState={{ selected: false, disabled: true }}
          disabled
          style={styles.tab}
        >
          <ReportIcon kind="charts" />
          <View style={styles.tabLabel}>
            <Text style={styles.tabText}>Charts</Text>
            <Text style={styles.unavailable}>Unavailable</Text>
          </View>
        </Pressable>
      </View>
      <RangeDateField
        from={state.range.from}
        to={state.range.to}
        expanded={picking}
        disabled={disabled}
        onToggle={() => setPicking((current) => !current)}
        onChange={state.apply}
        onClose={() => setPicking(false)}
      />
      {demo && (
        <Text style={styles.caption}>
          Demo · Temporary transactions on this device
        </Text>
      )}
      {!state.report &&
        (state.state.status === "error" ? (
          <StateNotice
            kind="error"
            title="Reports unavailable"
            message={state.state.message}
            onRetry={state.refresh}
          />
        ) : (
          <StateNotice
            kind="loading"
            title="Loading reports"
            message={
              state.range.from && state.range.to
                ? `Loading ${state.range.from} through ${state.range.to} in ${currency}.`
                : `Loading all dates in ${currency}.`
            }
          />
        ))}
      {state.report && (
        <>
          <ReportCard
            title="Income"
            section={state.report.income}
            expanded={expanded}
            onToggle={toggleExpanded}
            currency={currency}
            stacked={stacked}
          />
          <ReportCard
            title="Expenses"
            section={state.report.expenses}
            expanded={expanded}
            onToggle={toggleExpanded}
            currency={currency}
            stacked={stacked}
            expense
          />
        </>
      )}
    </>
  );
}

function ReportCard({
  title,
  section,
  currency,
  stacked,
  expanded,
  onToggle,
  expense = false
}: {
  title: string;
  section: ReportSection;
  currency: Currency;
  stacked: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  expense?: boolean;
}) {
  const formatAmount = (amountMinor: number) =>
    moneyLabel(expense ? -amountMinor : amountMinor, currency);
  const total = formatAmount(section.totalMinor);
  return (
    <View style={styles.card}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${title}. ${total}.`}
        style={[styles.row, styles.cardHeading, stacked && styles.stacked]}
      >
        <View style={styles.identity}>
          <View style={[styles.totalIcon, expense && styles.expenseIcon]}>
            <Text
              accessible={false}
              style={[styles.arrow, expense && styles.expenseArrow]}
            >
              {expense ? "↑" : "↓"}
            </Text>
          </View>
          <Text style={styles.heading}>{title}</Text>
        </View>
        <ReportAmount amount={total} heading stacked={stacked} />
      </View>
      {section.totalMinor === 0 ? (
        <Text style={styles.empty}>
          {expense
            ? "No expenses in this period."
            : "No income in this period."}
        </Text>
      ) : (
        section.rows.map((row) => {
          const expansionKey = `${title}_${row.id}`;
          const open = expanded.has(expansionKey);
          const amount = formatAmount(row.amountMinor);
          const label = `${row.name}. ${amount}.`;
          const expandable = row.children.length > 0;
          const contents = (
            <>
              <View style={styles.identity}>
                <CategoryIcon iconKey={row.iconKey} size={32} />
                <Text style={[styles.name, expandable && styles.parentName]}>
                  {row.name}
                </Text>
              </View>
              <ReportAmount
                amount={amount}
                stacked={stacked}
                chevron={expandable ? (open ? "up" : "down") : undefined}
              />
            </>
          );
          return (
            <View key={row.id}>
              {expandable ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityHint="Show or hide subcategories, including direct entries"
                  accessibilityState={{ expanded: open }}
                  onPress={() => onToggle(expansionKey)}
                  style={[styles.row, stacked && styles.stacked]}
                >
                  {contents}
                </Pressable>
              ) : (
                <View
                  accessible
                  accessibilityLabel={label}
                  style={[styles.row, stacked && styles.stacked]}
                >
                  {contents}
                </View>
              )}
              {open &&
                row.children.map((child) => {
                  const childAmount = formatAmount(child.amountMinor);
                  return (
                    <View
                      key={child.id}
                      accessible
                      accessibilityLabel={`${child.name}. ${childAmount}.`}
                      style={[
                        styles.row,
                        styles.child,
                        stacked && styles.stacked
                      ]}
                    >
                      <View style={styles.identity}>
                        <Text style={styles.childName}>{child.name}</Text>
                      </View>
                      <ReportAmount amount={childAmount} stacked={stacked} />
                    </View>
                  );
                })}
            </View>
          );
        })
      )}
    </View>
  );
}

function ReportAmount({
  amount,
  heading = false,
  stacked,
  chevron
}: {
  amount: string;
  heading?: boolean;
  stacked: boolean;
  chevron?: "up" | "down" | undefined;
}) {
  return (
    <View style={[styles.amountGroup, stacked && styles.stackedAmountGroup]}>
      <Text style={[styles.amount, heading && styles.headingAmount]}>
        {amount}
      </Text>
      {chevron && <ReportIcon kind={chevron} size={16} />}
    </View>
  );
}

function ReportIcon({
  kind,
  color = theme.color.primary,
  size = 24
}: {
  kind: "reports" | "charts" | "up" | "down";
  color?: string;
  size?: number;
}) {
  const paths = {
    reports: "M5 15v5m7-11v11m7-17v17",
    charts: "M12 3v9h9M9 4a9 9 0 1 0 11 11M15 2v7h7a9 9 0 0 0-7-7Z",
    up: "m5 15 7-7 7 7",
    down: "m5 9 7 7 7-7"
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={paths[kind]}
        stroke={color}
        strokeWidth={kind === "reports" ? 4 : 2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8 },
  tab: {
    flex: 1,
    minHeight: 52,
    padding: 10,
    borderRadius: 999,
    backgroundColor: theme.color.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  selectedTab: { backgroundColor: theme.color.primary },
  tabText: {
    color: theme.color.primary,
    fontSize: 18,
    fontWeight: "700",
    flexShrink: 1
  },
  selectedText: { color: theme.color.onPrimary },
  tabLabel: { flexShrink: 1 },
  unavailable: { color: theme.color.muted, fontSize: 10 },
  caption: {
    color: theme.color.muted,
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1
  },
  empty: {
    color: theme.color.muted,
    fontSize: 14,
    padding: 16,
    lineHeight: 22
  },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.color.softBorder,
    overflow: "hidden",
    boxShadow: "0px 2px 6px rgba(112, 67, 217, 0.07)"
  },
  row: {
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: theme.color.primarySoft
  },
  cardHeading: { backgroundColor: theme.color.primarySoft, borderTopWidth: 0 },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  heading: {
    color: theme.color.text,
    fontSize: 17,
    fontWeight: "800",
    flex: 1
  },
  name: { color: theme.color.text, fontSize: 14, flex: 1 },
  parentName: { fontWeight: "700" },
  totalIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#DCF7E4",
    alignItems: "center",
    justifyContent: "center"
  },
  expenseIcon: { backgroundColor: "#FFE1EA" },
  arrow: { color: "#167335", fontSize: 27, fontWeight: "700", lineHeight: 32 },
  expenseArrow: { color: "#BC2346" },
  amountGroup: {
    maxWidth: "55%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8
  },
  amount: {
    flexShrink: 1,
    textAlign: "right",
    color: theme.color.text,
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  headingAmount: { fontWeight: "800", fontSize: 15 },
  child: { marginLeft: 52, paddingLeft: 0, minHeight: 48 },
  childName: { color: theme.color.text, fontSize: 13, flex: 1 },
  stacked: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  stackedAmountGroup: { alignSelf: "flex-end", maxWidth: "100%" }
});
