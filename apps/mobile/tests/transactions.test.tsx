import { accounts, accountId } from "./auth-fixtures";
import { describe, expect, it, jest } from "@jest/globals";
import {
  amountText,
  draftInput,
  createDemoTransactionSource,
  parseAmount,
  validDateFilter,
  type Currency
} from "../src/transaction-data";
import { createDemoCategorySource } from "../src/category-data";

it.each([
  ["CAD", "12.34", 1234],
  ["JPY", "1234", 1234],
  ["KWD", "1.234", 1234]
] as const)(
  "uses the %s account exponent and omits request currency",
  (currency, amount, expected) => {
    const account = { id: accountId(currency), currency };
    const draft = {
      direction: "expense" as const,
      amount,
      currency,
      date: "2026-11-06",
      accountId: account.id,
      categoryId: "food",
      note: ""
    };
    const input = draftInput(draft, account);
    expect(input.amountMinor).toBe(expected);
    expect(input).not.toHaveProperty("currency");
    expect(amountText(expected, currency)).toBe(amount);
    const excessivePrecision =
      currency === "JPY" ? amount + ".1" : amount + "1";
    expect(() =>
      draftInput({ ...draft, amount: excessivePrecision }, account)
    ).toThrow();
    expect(() => draftInput(draft, { ...account, currency: "USD" })).toThrow();
  }
);

it("rejects demo cross-currency moves without changing amounts and derives archived history currency", async () => {
  const categories = createDemoCategorySource({ catalog: false });
  await categories.create("Food");
  const rows = await accounts.list();
  const accountSource = { list: async () => rows };
  const source = createDemoTransactionSource(categories, accountSource);
  const payload = {
    clientRequestId: "90000000-0000-4000-8000-000000000001",
    accountId: accountId("CAD"),
    categoryId: (await categories.list())[0]!.id,
    direction: "expense" as const,
    amountMinor: 1234,
    date: "2026-11-06",
    note: null
  };
  const saved = await source.create(payload);
  await expect(
    source.update(saved.id, { accountId: accountId("JPY"), amountMinor: 999 })
  ).rejects.toMatchObject({ code: "CURRENCY_MISMATCH" });
  rows.find((row) => row.id === saved.accountId)!.archivedAt =
    "2026-11-06T00:00:00Z";
  expect(await source.get(saved.id)).toMatchObject({
    currency: "CAD",
    amountMinor: 1234
  });
  expect(await source.create(payload)).toEqual(await source.get(saved.id));
  expect(
    await source.update(saved.id, { note: "Historical edit" })
  ).toMatchObject({ currency: "CAD", amountMinor: 1234 });
  expect((await source.list({ currency: "CAD" })).items).toHaveLength(1);
  expect((await source.list({ currency: "JPY" })).items).toEqual([]);
  await expect(
    source.create({
      ...payload,
      clientRequestId: "90000000-0000-4000-8000-000000000002"
    })
  ).rejects.toMatchObject({ code: "INVALID_ACCOUNT" });
});

it("serializes demo creates, preserves creation intent through edits and releases keys after deletion", async () => {
  const categories = createDemoCategorySource({ catalog: false });
  await categories.create("Food");
  const source = createDemoTransactionSource(categories, accounts);
  const payload = {
    clientRequestId: "abcdefab-0000-4000-8000-000000000001",
    accountId: accountId("CAD"),
    categoryId: (await categories.list())[0]!.id,
    direction: "expense" as const,
    amountMinor: 1234,
    date: "2026-11-06",
    note: ""
  };
  const [first, second] = await Promise.all([
    source.create(payload),
    source.create({
      ...payload,
      clientRequestId: payload.clientRequestId.toUpperCase(),
      note: null
    })
  ]);
  expect(first.id).toBe(second.id);
  expect((await source.list({})).items).toHaveLength(1);
  expect(first).not.toHaveProperty("clientRequestId");
  expect(first).not.toHaveProperty("creationFingerprint");
  const edited = await source.update(first.id, {
    note: "Edited",
    amountMinor: 999
  });
  expect(await source.create(payload)).toEqual(edited);
  await expect(
    source.create({ ...payload, amountMinor: 999 })
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  // A failed queued write must not prevent later valid writes.
  expect(await source.create(payload)).toEqual(edited);
  await source.remove(first.id);
  const recreated = await source.create(payload);
  expect(recreated.id).not.toBe(first.id);
  expect(recreated).toMatchObject({ amountMinor: 1234, note: null });
});
describe("exact amount conversion", () => {
  it("validates inclusive bounded date filters as calendar dates", () => {
    expect(validDateFilter({})).toBe(true);
    expect(validDateFilter({ from: "2024-02-29", to: "2024-02-29" })).toBe(
      true
    );
    for (const filter of [
      { from: "2023-02-29", to: "2023-03-01" },
      { from: "2024-01-01" },
      { from: "2024-02-01", to: "2024-01-01" },
      { from: "2024-01-01", to: "2026-01-01" }
    ])
      expect(validDateFilter(filter)).toBe(false);
  });
  it.each([
    ["0.01", "CAD", 1],
    ["0.01", "USD", 1],
    ["1.01", "EUR", 101],
    ["21474836.47", "GBP", 2147483647],
    ["0001.2", "INR", 120],
    ["2147483647", "JPY", 2147483647],
    ["1.001", "KWD", 1001]
  ] as [string, Currency, number][])(
    "converts %s %s exactly",
    (raw, currency, expected) => {
      expect(parseAmount(raw, currency)).toBe(expected);
      expect(parseAmount(amountText(expected, currency), currency)).toBe(
        expected
      );
    }
  );
  it.each([
    "0",
    "-1",
    "1e2",
    "1,00",
    "1.001",
    "NaN",
    "Infinity",
    ".1",
    "1.",
    "21474836.48",
    " ",
    "1\n"
  ])("rejects %s", (raw) => expect(() => parseAmount(raw, "USD")).toThrow());
  it("rejects fractions for JPY and excessive KWD precision", () => {
    expect(() => parseAmount("1.1", "JPY")).toThrow();
    expect(() => parseAmount("1.0001", "KWD")).toThrow();
  });
});
jest.mock("expo-crypto", () => {
  let sequence = 0;
  return {
    randomUUID: () =>
      "90000000-0000-4000-8000-" + String(++sequence).padStart(12, "0")
  };
});
