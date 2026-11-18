import type { Category, CategoryReadSource } from "./category-data";
import type { DashboardSource, DashboardSummary } from "./dashboard-data";
import { comparisonRange } from "./report-period";
import { ClientFailure } from "./auth/transport";
import type { PickerRange } from "./date-picker-data";
import { validDateFilter, type Currency } from "./transaction-data";

export type ReportRow = {
  id: string;
  name: string;
  iconKey?: string | undefined;
  current: number;
  previous: number | null;
  children: ReportRow[];
};
export type ReportSection = {
  current: number;
  previous: number | null;
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
  current: DashboardSummary,
  previous: DashboardSummary | null,
  categories: Category[]
): Report {
  if (previous && previous.currency !== current.currency)
    throw new ClientFailure("protocol");
  const metadata = new Map(categories.map((row) => [row.id, row]));
  const now = new Map(
    current.categoryBreakdown.map((row) => [row.categoryId, row])
  );
  const before = new Map(
    previous?.categoryBreakdown.map((row) => [row.categoryId, row]) ?? []
  );
  const ids = [...new Set([...now.keys(), ...before.keys()])];
  const rootId = (id: string | null) =>
    id === null
      ? null
      : (metadata.get(id)?.parentId ??
        now.get(id)?.rootId ??
        before.get(id)?.rootId ??
        id);
  const roots = [...new Set(ids.map(rootId))].filter((id) => id !== null);
  const name = (id: string) =>
    metadata.get(id)?.name ??
    now.get(id)?.categoryName ??
    before.get(id)?.categoryName ??
    "Unavailable category";
  const order = (a: string, b: string) =>
    (metadata.get(a)?.sortOrder ?? 0) - (metadata.get(b)?.sortOrder ?? 0) ||
    name(a).localeCompare(name(b)) ||
    a.localeCompare(b);

  function section(expense: boolean): ReportSection {
    const field = expense ? "expensesMinor" : "incomeMinor";
    const amount = (id: string | null, old: boolean) =>
      (old ? before : now).get(id)?.[field] ?? 0;
    const leaf = (id: string, label = name(id)): ReportRow => ({
      id,
      name: label,
      iconKey: metadata.get(id)?.iconKey,
      current: amount(id, false),
      previous: previous ? amount(id, true) : null,
      children: []
    });
    const rows = roots
      .sort(order)
      .map((id): ReportRow => {
        const postings = ids.filter((item) => rootId(item) === id);
        const sum = (old: boolean) =>
          Number(
            postings.reduce(
              (total, item) => total + BigInt(amount(item, old)),
              0n
            )
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
          current: sum(false),
          previous: previous ? sum(true) : null,
          children: children.length
            ? [
                leaf(id, `General · ${name(id)}`),
                ...children.map((child) => leaf(child))
              ]
            : []
        };
      })
      .filter((row) => row.current !== 0 || (row.previous ?? 0) !== 0);
    if (amount(null, false) > 0 || amount(null, true) > 0)
      rows.push({
        id: "uncategorized",
        name: expense ? "Uncategorized expenses" : "Uncategorized income",
        current: amount(null, false),
        previous: previous ? amount(null, true) : null,
        children: []
      });
    return {
      current: current[field],
      previous: previous?.[field] ?? null,
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
      const comparison = bounded ? comparisonRange(bounded) : null;
      const [current, previous, rows] = await Promise.all([
        dashboard.summary(
          bounded ?? { allDates: true, currency: selection.currency }
        ),
        comparison
          ? dashboard
              .summary({ ...comparison, currency: selection.currency })
              .catch(() => null)
          : null,
        categories.list()
      ]);
      return aggregateReport(current, previous, rows);
    }
  };
}
