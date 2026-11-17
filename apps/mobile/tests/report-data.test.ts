import { describe, expect, it, jest } from "@jest/globals";
import { aggregateReport, createReportSource } from "../src/report-data";
import {
  changeDescription,
  comparisonRange,
  initialReportRange,
  percentageChange
} from "../src/report-period";
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

describe("report calendar and comparison rules", () => {
  it.each([
    [new Date(2026, 10, 17, 23, 59), "2026-11-01", "2026-11-30"],
    [new Date(2027, 0, 1), "2027-01-01", "2027-01-31"],
    [new Date(2026, 11, 31), "2026-12-01", "2026-12-31"],
    [new Date(2024, 1, 29), "2024-02-01", "2024-02-29"],
    [new Date(2100, 1, 17), "2100-02-01", "2100-02-28"]
  ])(
    "initializes both inclusive month boundaries using the local calendar (%s)",
    (date, from, to) => {
      expect(initialReportRange(date as Date)).toEqual({ from, to });
    }
  );
  it.each([
    ["2026-11-01", "2026-11-30", "2026-10-01", "2026-10-31"],
    ["2027-01-01", "2027-01-31", "2026-12-01", "2026-12-31"],
    ["2024-03-01", "2024-03-31", "2024-02-01", "2024-02-29"],
    ["2024-02-01", "2024-02-29", "2024-01-01", "2024-01-31"],
    ["2026-11-17", "2026-11-17", "2026-11-16", "2026-11-16"],
    ["2024-03-01", "2024-03-03", "2024-02-27", "2024-02-29"],
    ["2026-11-01", "2026-11-02", "2026-10-30", "2026-10-31"],
    ["2026-03-08", "2026-03-10", "2026-03-05", "2026-03-07"]
  ])(
    "compares %s–%s with the appropriate preceding period",
    (from, to, start, end) => {
      expect(comparisonRange({ from, to })).toEqual({ from: start, to: end });
    }
  );
  it("marks unsupported comparisons unavailable and preserves History's range bound", () => {
    expect(
      comparisonRange({ from: "0001-01-01", to: "0001-01-31" })
    ).toBeNull();
    expect(
      comparisonRange({ from: "0001-01-02", to: "0001-01-05" })
    ).toBeNull();
    expect(
      comparisonRange({ from: "2026-12-01", to: "2026-11-01" })
    ).toBeNull();
    expect(
      comparisonRange({ from: "2024-01-01", to: "2025-01-01" })
    ).not.toBeNull();
    expect(
      comparisonRange({ from: "2024-01-01", to: "2025-01-02" })
    ).toBeNull();
  });
  it("uses positive magnitudes, signs, favorable direction and absent/zero baselines", () => {
    expect(percentageChange(150, 100)).toBe(50);
    expect(percentageChange(100, 0)).toBeNull();
    expect(percentageChange(100, null)).toBeNull();
    expect(changeDescription(150, 100, false)).toMatchObject({
      label: "+50%",
      tone: "good"
    });
    expect(changeDescription(150, 100, true)).toMatchObject({
      label: "+50%",
      tone: "bad"
    });
    expect(changeDescription(50, 100, true)).toMatchObject({
      label: "−50%",
      tone: "good",
      description: expect.stringContaining("Spending decreased")
    });
    expect(changeDescription(0, 100, false)).toMatchObject({
      label: "−100%",
      tone: "bad"
    });
    expect(changeDescription(0, 0, true).label).toBe("—");
    expect(changeDescription(100, 100, true)).toMatchObject({
      label: "+0%",
      tone: "neutral"
    });
  });
});

describe("report aggregation and sources", () => {
  it("clears the date filter with one aggregate read and no bounded comparison", async () => {
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
    expect(report.comparison).toBeNull();
    expect(report.income).toEqual({ current: 0, previous: null, rows: [] });
    expect(report.expenses).toEqual({ current: 0, previous: null, rows: [] });
  });
  it("keeps current totals with unavailable comparisons when the baseline cannot load", async () => {
    const read = jest
      .fn<DashboardSource["summary"]>()
      .mockResolvedValueOnce(
        summary([{ categoryId: root, incomeMinor: 100, expensesMinor: 200 }])
      )
      .mockRejectedValueOnce(new Error("offline comparison"));
    const source = createReportSource(
      { summary: read, subscribe: () => () => {} },
      { list: async () => categories }
    );
    const report = await source.load({
      from: "2026-11-01",
      to: "2026-11-30",
      currency: "USD"
    });
    expect(report.income).toMatchObject({ current: 100, previous: null });
    expect(report.expenses).toMatchObject({ current: 200, previous: null });
    expect(report.comparison).toBeNull();
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
    const previous = summary([
      { categoryId: child, incomeMinor: 0, expensesMinor: 2000 }
    ]);
    const report = aggregateReport(current, previous, categories);
    expect(report.income.current).toBe(1300);
    expect(report.expenses.current).toBe(1050);
    const food = report.expenses.rows[0]!;
    expect(food).toMatchObject({
      name: "Food & Drinks",
      current: 1000,
      previous: 2000
    });
    expect(food.children.map((row) => [row.name, row.current])).toEqual([
      ["General · Food & Drinks", 200],
      ["Cafe", 0],
      ["Groceries", 800]
    ]);
    expect(food.children.reduce((sum, row) => sum + row.current, 0)).toBe(
      food.current
    );
    expect(
      report.expenses.rows.reduce((sum, row) => sum + row.current, 0)
    ).toBe(1050);
    expect(report.income.rows.at(-1)).toMatchObject({
      name: "Uncategorized income",
      current: 300
    });
    expect(report.expenses.rows.at(-1)).toMatchObject({
      name: "Uncategorized expenses",
      current: 50
    });
  });
  it("retains previous-only, archived and unavailable categories and marks absent comparisons", () => {
    const old = summary([
      { categoryId: child, incomeMinor: 0, expensesMinor: 100 }
    ]);
    const report = aggregateReport(
      summary([]),
      old,
      categories.map((row) => ({ ...row, archivedAt: "2026-11-01T00:00:00Z" }))
    );
    expect(report.expenses.rows[0]).toMatchObject({
      current: 0,
      previous: 100
    });
    expect(aggregateReport(old, null, []).expenses.rows[0]).toMatchObject({
      current: 100,
      previous: null
    });
    expect(() =>
      aggregateReport(old, summary([], "EUR"), categories)
    ).toThrow();
  });
  it("loads two bounded aggregate requests in the selected currency without reading transaction pages", async () => {
    const fetcher = jest.fn<FetchRequest>().mockImplementation(async (url) => {
      const query = new URL(String(url)).searchParams;
      return response({
        ...summary([], "JPY"),
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
    expect(report.comparison).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(fetcher.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://api.example.invalid/v1/dashboard/summary?from=2026-11-01&to=2026-11-30&currency=JPY&recentLimit=5",
      "https://api.example.invalid/v1/dashboard/summary?from=2026-10-01&to=2026-10-31&currency=JPY&recentLimit=5"
    ]);
  });
});
