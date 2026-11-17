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
import type { ReportRow, ReportSection, ReportSource } from "./report-data";
import { changeDescription } from "./report-period";
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
  return (
    <View style={styles.card}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${title}. ${moneyLabel(expense ? -section.current : section.current, currency)}. ${changeDescription(section.current, section.previous, expense).description}`}
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
        <Values
          current={section.current}
          previous={section.previous}
          expense={expense}
          currency={currency}
          heading
          stacked={stacked}
        />
      </View>
      {section.current === 0 ? (
        <Text style={styles.empty}>
          {expense
            ? "No expenses in this period."
            : "No income in this period."}
        </Text>
      ) : (
        section.rows.map((row) => {
          const expansionKey = `${title}_${row.id}`;
          const open = expanded.has(expansionKey);
          const label = `${row.name}. ${moneyLabel(expense ? -row.current : row.current, currency)}. ${changeDescription(row.current, row.previous, expense).description}`;
          const contents = (
            <>
              <View style={styles.identity}>
                <CategoryIcon iconKey={row.iconKey} size={32} />
                <Text
                  style={[
                    styles.name,
                    row.children.length > 0 && styles.parentName
                  ]}
                >
                  {row.name}
                </Text>
              </View>
              <Values
                {...row}
                expense={expense}
                currency={currency}
                stacked={stacked}
              />
              {row.children.length > 0 && (
                <View
                  style={[styles.chevron, stacked && styles.stackedChevron]}
                >
                  <ReportIcon kind={open ? "up" : "down"} size={16} />
                </View>
              )}
            </>
          );
          return (
            <View key={row.id}>
              {row.children.length ? (
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
                row.children.map((child) => (
                  <View
                    key={child.id}
                    accessible
                    accessibilityLabel={`${child.name}. ${moneyLabel(expense ? -child.current : child.current, currency)}. ${changeDescription(child.current, child.previous, expense).description}`}
                    style={[
                      styles.row,
                      styles.child,
                      stacked && styles.stacked
                    ]}
                  >
                    <View style={styles.identity}>
                      <Text style={styles.childName}>{child.name}</Text>
                    </View>
                    <Values
                      {...child}
                      expense={expense}
                      currency={currency}
                      stacked={stacked}
                    />
                  </View>
                ))}
            </View>
          );
        })
      )}
    </View>
  );
}

function Values({
  current,
  previous,
  currency,
  expense,
  heading = false,
  stacked
}: Pick<ReportRow, "current" | "previous"> & {
  currency: Currency;
  expense: boolean;
  heading?: boolean;
  stacked: boolean;
}) {
  const change = changeDescription(current, previous, expense);
  return (
    <View style={[styles.values, stacked && styles.stackedValues]}>
      <Text
        style={[
          styles.amount,
          stacked && styles.fluidValue,
          heading && styles.headingAmount
        ]}
      >
        {moneyLabel(expense && current ? -current : current, currency)}
      </Text>
      <Text
        accessibilityLabel={change.description}
        style={[
          styles.change,
          stacked && styles.fluidChange,
          change.tone === "good" && styles.good,
          change.tone === "bad" && styles.bad
        ]}
      >
        {change.label}
      </Text>
    </View>
  );
}

export function ReportIcon({
  kind,
  color = theme.color.primary,
  size = 24
}: {
  kind: "reports" | "charts" | "calendar" | "up" | "down";
  color?: string;
  size?: number;
}) {
  const paths = {
    reports: "M5 15v5m7-11v11m7-17v17",
    charts: "M12 3v9h9M9 4a9 9 0 1 0 11 11M15 2v7h7a9 9 0 0 0-7-7Z",
    calendar:
      "M5 3v4m14-4v4M3 10h18M4 5h16a1 1 0 0 1 1 1v14H3V6a1 1 0 0 1 1-1Z",
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
    borderTopColor: theme.color.primarySoft,
    paddingRight: 34
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
  values: { flexDirection: "row", alignItems: "center", gap: 10 },
  amount: {
    width: 104,
    textAlign: "right",
    color: theme.color.text,
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  },
  headingAmount: { fontWeight: "800", fontSize: 15 },
  fluidValue: { width: "auto", minWidth: 104, maxWidth: "100%" },
  fluidChange: { width: "auto", minWidth: 56, maxWidth: "100%" },
  change: {
    width: 56,
    textAlign: "right",
    color: theme.color.muted,
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  good: { color: "#167335" },
  bad: { color: "#BC2346" },
  chevron: { position: "absolute", right: 10 },
  child: { marginLeft: 52, paddingLeft: 0, minHeight: 48 },
  childName: { color: theme.color.text, fontSize: 13, flex: 1 },
  stacked: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  stackedValues: {
    marginLeft: 40,
    justifyContent: "flex-end",
    flexWrap: "wrap"
  },
  stackedChevron: { top: 18 }
});
