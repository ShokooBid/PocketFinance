import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { summaryQuery, summarySchema } from "../src/dashboard/contracts.js";
import { createDashboardService } from "../src/dashboard/service.js";

const query = {
  from: "2026-10-01",
  to: "2026-10-31",
  currency: "USD",
  recentLimit: 5
} as const;
function service(
  groups: {
    incomeMinor: bigint;
    expensesMinor: bigint;
    categoryId?: string | null;
    rootId?: string | null;
    rootName?: string;
  }[]
) {
  // Only the database boundary is replaced: exercise real total/overflow logic.
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(
      groups.map((group, index) => ({
        categoryId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        categoryName: "Synthetic category",
        ...group
      }))
    ),
    transaction: { findMany: vi.fn().mockResolvedValue([]) }
  };
  const db = {
    $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      run(tx)
  };
  return createDashboardService(db as unknown as PrismaClient);
}
describe("dashboard exact monetary boundary", () => {
  it("allows an explicit all-dates filter while preserving paired bounded dates and range limits", () => {
    expect(summaryQuery.parse({ allDates: "true", currency: "USD" })).toEqual({
      allDates: "true",
      currency: "USD",
      recentLimit: 5
    });
    for (const input of [
      { currency: "USD" },
      { allDates: "false", currency: "USD" },
      { allDates: "true", ...query },
      { allDates: "true", currency: "USD", from: "2026-11-01" }
    ])
      expect(summaryQuery.safeParse(input).success).toBe(false);
  });
  it("includes uncategorized amounts and reconciles root totals with direct parent and child postings once", async () => {
    const parent = "00000000-0000-4000-8000-000000000001";
    const result = await service([
      {
        categoryId: parent,
        rootId: parent,
        rootName: "Food",
        incomeMinor: 100n,
        expensesMinor: 200n
      },
      {
        categoryId: "00000000-0000-4000-8000-000000000002",
        rootId: parent,
        rootName: "Food",
        incomeMinor: 0n,
        expensesMinor: 800n
      },
      {
        categoryId: null,
        rootId: null,
        rootName: "Uncategorized",
        incomeMinor: 300n,
        expensesMinor: 50n
      }
    ]).summary("owner", query);
    expect(result).toMatchObject({
      incomeMinor: 400,
      expensesMinor: 1050,
      netMinor: -650
    });
    expect(result.rootCategoryBreakdown).toEqual([
      {
        categoryId: null,
        categoryName: "Uncategorized",
        incomeMinor: 300,
        expensesMinor: 50,
        netMinor: 250
      },
      {
        categoryId: parent,
        categoryName: "Food",
        incomeMinor: 100,
        expensesMinor: 1000,
        netMinor: -900
      }
    ]);
    expect(summarySchema.safeParse(result).success).toBe(true);
  });
  it("accepts the largest safe JSON integer and a negative net", async () => {
    const result = await service([
      { incomeMinor: 0n, expensesMinor: BigInt(Number.MAX_SAFE_INTEGER) }
    ]).summary("owner", query);
    expect(result).toMatchObject({
      incomeMinor: 0,
      expensesMinor: Number.MAX_SAFE_INTEGER,
      netMinor: -Number.MAX_SAFE_INTEGER
    });
    expect(summarySchema.safeParse(result).success).toBe(true);
  });
  it("rejects an unsafe category sum even when the net would cancel", async () => {
    const amount = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    await expect(
      service([{ incomeMinor: amount, expensesMinor: amount }]).summary(
        "owner",
        query
      )
    ).rejects.toMatchObject({
      status: 422,
      code: "SUMMARY_AMOUNT_OUT_OF_RANGE"
    });
  });
  it("rejects unsafe overall totals made from individually safe categories", async () => {
    await expect(
      service([
        { incomeMinor: BigInt(Number.MAX_SAFE_INTEGER), expensesMinor: 0n },
        { incomeMinor: 1n, expensesMinor: 0n }
      ]).summary("owner", query)
    ).rejects.toMatchObject({ code: "SUMMARY_AMOUNT_OUT_OF_RANGE" });
  });
  it("defines inclusive dates at most 366 days apart without local-time arithmetic", () => {
    expect(
      summaryQuery.parse({
        from: "2024-01-01",
        to: "2025-01-01",
        currency: "USD"
      }).recentLimit
    ).toBe(5);
    expect(
      summaryQuery.safeParse({ ...query, from: "2024-01-01", to: "2025-01-02" })
        .success
    ).toBe(false);
    for (const date of ["0001-01-01", "9999-12-31", "2024-02-29"])
      expect(
        summaryQuery.safeParse({ ...query, from: date, to: date }).success
      ).toBe(true);
  });
});
