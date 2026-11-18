import { describe, expect, it, jest } from "@jest/globals";
import { aggregateReport, createReportSource } from "../src/report-data";
import {
  createApiDashboardSource,
  type DashboardSource,
  type DashboardSummary
} from "../src/dashboard-data";
import { createTransport, type FetchRequest } from "../src/auth/transport";
import type { Category } from "../src/category-data";
import { response } from "./auth-fixtures";

const root = "10000000-0000-4000-8000-000000000001";
const child = "10000000-0000-4000-8000-000000000002";
const other = "10000000-0000-4000-8000-000000000003";
const categories: Category[] = [
  {
    id: root,
    name: "Food & Drinks",
    isDefault: true,
    archivedAt: null,
    iconKey: "food"
  },
  {
    id: child,
    name: "Groceries",
    parentId: root,
    isDefault: true,
    archivedAt: null
  },
  { id: other, name: "Cafe", parentId: root, isDefault: true, archivedAt: null }
];
function summary(
  groups: {
    categoryId: string | null;
    incomeMinor: number;
    expensesMinor: number;
  }[],
  currency: DashboardSummary["currency"] = "USD"
): DashboardSummary {
  const incomeMinor = groups.reduce((sum, row) => sum + row.incomeMinor, 0);
  const expensesMinor = groups.reduce((sum, row) => sum + row.expensesMinor, 0);
  return {
    from: "2026-11-01",
    to: "2026-11-30",
    currency,
    incomeMinor,
    expensesMinor,
    netMinor: incomeMinor - expensesMinor,
    categoryBreakdown: groups.map((row) => ({
      ...row,
      categoryName:
        categories.find((item) => item.id === row.categoryId)?.name ??
        "Uncategorized",
      rootId:
        row.categoryId === child || row.categoryId === other
          ? root
          : row.categoryId,
      netMinor: row.incomeMinor - row.expensesMinor
    })),
    recentTransactions: []
  };
}

describe("report aggregation and sources", () => {
  it("clears the date filter with one all-dates aggregate read", async () => {
    const read = jest
      .fn<DashboardSource["summary"]>()
      .mockResolvedValue({ ...summary([]), from: null, to: null });
    const source = createReportSource(
      { summary: read, subscribe: () => () => {} },
      { list: async () => categories }
    );
    const report = await source.load({
      from: undefined,
      to: undefined,
      currency: "USD"
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith({ allDates: true, currency: "USD" });
    expect(report.income).toEqual({ totalMinor: 0, rows: [] });
    expect(report.expenses).toEqual({ totalMinor: 0, rows: [] });
  });
  it("reconciles direct parent postings, children and uncategorized money without adding root totals twice", () => {
    const current = summary([
      { categoryId: root, incomeMinor: 1000, expensesMinor: 200 },
      { categoryId: child, incomeMinor: 0, expensesMinor: 800 },
      { categoryId: null, incomeMinor: 300, expensesMinor: 50 }
    ]);
    current.rootCategoryBreakdown = [
      {
        categoryId: root,
        categoryName: "Food & Drinks",
        incomeMinor: 1000,
        expensesMinor: 1000,
        netMinor: 0
      }
    ];
    const report = aggregateReport(current, categories);
    expect(report.income.totalMinor).toBe(1300);
    expect(report.expenses.totalMinor).toBe(1050);
    const food = report.expenses.rows[0]!;
    expect(food).toMatchObject({
      name: "Food & Drinks",
      amountMinor: 1000
    });
    expect(food.children.map((row) => [row.name, row.amountMinor])).toEqual([
      ["General · Food & Drinks", 200],
      ["Cafe", 0],
      ["Groceries", 800]
    ]);
    expect(food.children.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(
      food.amountMinor
    );
    expect(
      report.expenses.rows.reduce((sum, row) => sum + row.amountMinor, 0)
    ).toBe(1050);
    expect(report.income.rows.at(-1)).toMatchObject({
      name: "Uncategorized income",
      amountMinor: 300
    });
    expect(report.expenses.rows.at(-1)).toMatchObject({
      name: "Uncategorized expenses",
      amountMinor: 50
    });
  });
  it("retains archived and unavailable category labels for activity in the selected period", () => {
    const activity = summary([
      { categoryId: child, incomeMinor: 0, expensesMinor: 100 }
    ]);
    const archived = categories.map((row) => ({
      ...row,
      archivedAt: "2026-11-01T00:00:00Z"
    }));
    const food = aggregateReport(activity, archived).expenses.rows[0]!;
    expect(food).toMatchObject({ name: "Food & Drinks", amountMinor: 100 });
    expect(food.children).toContainEqual(
      expect.objectContaining({ name: "Groceries", amountMinor: 100 })
    );
    expect(aggregateReport(activity, []).expenses.rows[0]).toMatchObject({
      id: root,
      amountMinor: 100,
      children: [
        expect.anything(),
        expect.objectContaining({ name: "Groceries" })
      ]
    });
    expect(aggregateReport(summary([]), archived).expenses.rows).toEqual([]);
  });
  it("uses a single aggregate request in the selected currency and date range", async () => {
    const fetcher = jest.fn<FetchRequest>().mockImplementation(async (url) => {
      const query = new URL(String(url)).searchParams;
      return response({
        ...summary(
          [{ categoryId: root, incomeMinor: 100, expensesMinor: 200 }],
          "JPY"
        ),
        from: query.get("from"),
        to: query.get("to")
      });
    });
    const source = createReportSource(
      createApiDashboardSource(
        createTransport("https://api.example.invalid", fetcher),
        { subscribe: () => () => {} }
      ),
      { list: async () => categories }
    );
    const report = await source.load({
      from: "2026-11-01",
      to: "2026-11-30",
      currency: "JPY"
    });
    expect(report.income.totalMinor).toBe(100);
    expect(report.expenses.totalMinor).toBe(200);
    expect(fetcher.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://api.example.invalid/v1/dashboard/summary?from=2026-11-01&to=2026-11-30&currency=JPY&recentLimit=5"
    ]);
  });
});
