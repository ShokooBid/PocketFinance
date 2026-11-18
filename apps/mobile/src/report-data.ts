import type { Category, CategoryReadSource } from "./category-data";
import type { DashboardSource, DashboardSummary } from "./dashboard-data";
import { ClientFailure } from "./auth/transport";
import type { PickerRange } from "./date-picker-data";
import { validDateFilter, type Currency } from "./transaction-data";

export type ReportRow = {
  id: string;
  name: string;
  iconKey?: string | undefined;
  amountMinor: number;
  children: ReportRow[];
};
export type ReportSection = {
  totalMinor: number;
  rows: ReportRow[];
};
export type Report = {
  income: ReportSection;
  expenses: ReportSection;
};
type ReportSelection = PickerRange & { currency: Currency };
export interface ReportSource {
  load(selection: ReportSelection): Promise<Report>;
  subscribe(listener: () => void): () => void;
}

// Work from exact category postings only. The API's root breakdown is another
// view of the same money and must never be added to its children.
export function aggregateReport(
  summary: DashboardSummary,
  categories: Category[]
): Report {
  const metadata = new Map(categories.map((row) => [row.id, row]));
  const breakdown = new Map(
    summary.categoryBreakdown.map((row) => [row.categoryId, row])
  );
  const ids = [...breakdown.keys()];
  const rootId = (id: string | null) =>
    id === null
      ? null
      : (metadata.get(id)?.parentId ?? breakdown.get(id)?.rootId ?? id);
  const roots = [...new Set(ids.map(rootId))].filter((id) => id !== null);
  const name = (id: string) =>
    metadata.get(id)?.name ??
    breakdown.get(id)?.categoryName ??
    "Unavailable category";
  const order = (a: string, b: string) =>
    (metadata.get(a)?.sortOrder ?? 0) - (metadata.get(b)?.sortOrder ?? 0) ||
    name(a).localeCompare(name(b)) ||
    a.localeCompare(b);

  function section(expense: boolean): ReportSection {
    const field = expense ? "expensesMinor" : "incomeMinor";
    const amount = (id: string | null) => breakdown.get(id)?.[field] ?? 0;
    const leaf = (id: string, label = name(id)): ReportRow => ({
      id,
      name: label,
      iconKey: metadata.get(id)?.iconKey,
      amountMinor: amount(id),
      children: []
    });
    const rows = roots
      .sort(order)
      .map((id): ReportRow => {
        const postings = ids.filter((item) => rootId(item) === id);
        const amountMinor = Number(
          postings.reduce((total, item) => total + BigInt(amount(item)), 0n)
        );
        const children = [
          ...new Set([
            ...categories
              .filter((row) => row.parentId === id)
              .map((row) => row.id),
            ...postings.filter(
              (item): item is string => item !== null && item !== id
            )
          ])
        ].sort(order);
        return {
          ...leaf(id),
          amountMinor,
          children: children.length
            ? [
                leaf(id, `General · ${name(id)}`),
                ...children.map((child) => leaf(child))
              ]
            : []
        };
      })
      .filter((row) => row.amountMinor > 0);
    if (amount(null) > 0)
      rows.push({
        id: "uncategorized",
        name: expense ? "Uncategorized expenses" : "Uncategorized income",
        amountMinor: amount(null),
        children: []
      });
    return {
      totalMinor: summary[field],
      rows
    };
  }
  return { income: section(false), expenses: section(true) };
}

export function createReportSource(
  dashboard: DashboardSource,
  categories: CategoryReadSource
): ReportSource {
  return {
    subscribe: (listener) => dashboard.subscribe(listener),
    async load(selection) {
      if (
        !validDateFilter({ from: selection.from ?? "", to: selection.to ?? "" })
      )
        throw new ClientFailure("validation");
      const bounded =
        selection.from && selection.to
          ? {
              from: selection.from,
              to: selection.to,
              currency: selection.currency
            }
          : null;
      const [summary, rows] = await Promise.all([
        dashboard.summary(
          bounded ?? { allDates: true, currency: selection.currency }
        ),
        categories.list()
      ]);
      return aggregateReport(summary, rows);
    }
  };
}
