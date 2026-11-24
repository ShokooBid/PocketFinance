import { describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within
} from "@testing-library/react-native";
import { ClientFailure, createTransport } from "../src/auth/transport";
import {
  createApiHistorySource,
  historyDateLabel,
  historyKey,
  historyRecordText,
  mergeHistory,
  validateHistoryPage,
  type HistoryRow,
  type HistoryPage,
  type HistorySource,
  type HistoryFocus
} from "../src/history-data";
import { useHistory, type HistoryProps } from "../src/use-history";
import { accounts, deferred, response } from "./auth-fixtures";
import { HistoryScreen } from "../src/history-screen";
import type { Category, CategorySource } from "../src/category-data";
import { currentMonth, monthRange } from "../src/dashboard-data";

const id = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function row(n: number, extra: Partial<HistoryRow> = {}): HistoryRow {
  return {
    kind: "transaction",
    id: id(n),
    type: "expense",
    date: "2026-10-29",
    amountMinor: 100,
    currency: "CAD",
    note: null,
    accountId: id(10),
    accountName: "Cash",
    toAccountId: null,
    toAccountName: null,
    categoryId: id(20),
    categoryName: "Food",
    parentCategoryId: null,
    parentCategoryName: null,
    iconKey: "category",
    ...extra
  };
}
function page(
  items: HistoryRow[],
  extra: Partial<HistoryPage> = {}
): HistoryPage {
  return {
    items,
    days: items.length
      ? [
          {
            date: "2026-10-29",
            currency: "CAD",
            count: 4,
            incomeMinor: 0,
            expensesMinor: 400,
            netMinor: -400
          }
        ]
      : [],
    applied: {},
    adjustments: [],
    nextCursor: null,
    previousCursor: null,
    focusedKey: null,
    ...extra
  };
}
describe("History API and logical page rules", () => {
  it("labels transfer statement sides without treating them as income or expenses", () => {
    const transfer = row(2, {
      kind: "transfer",
      type: "transfer",
      categoryId: null,
      categoryName: null,
      toAccountId: id(11),
      toAccountName: "Savings"
    });
    expect(historyRecordText(transfer)).toMatchObject({
      typeLabel: "Transfer",
      amount: "CAD 1.00"
    });
    expect(historyRecordText(transfer, id(10))).toMatchObject({
      typeLabel: "Outgoing transfer",
      amount: "−CAD 1.00"
    });
    expect(historyRecordText(transfer, id(11))).toMatchObject({
      typeLabel: "Incoming transfer",
      amount: "+CAD 1.00"
    });
  });
  it("allows the authenticated transport path and preserves combined API filters", async () => {
    const filter = {
      from: "2026-10-29",
      to: "2026-10-29",
      type: "expense" as const,
      accountId: id(10),
      categoryId: id(20),
      includeSubcategories: true
    };
    const fetcher = jest
      .fn<NonNullable<Parameters<typeof createTransport>[1]>>()
      .mockResolvedValue(response(page([row(3)], { applied: filter })));
    const source = createApiHistorySource(
      createTransport("https://api.example.invalid", fetcher)
    );
    await source.list(filter);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/v1/history?"),
      expect.anything()
    );
    expect(fetcher.mock.calls[0]?.[0]).toContain("includeSubcategories=true");
    expect(fetcher.mock.calls[0]?.[0]).toContain("type=expense");
    await expect(source.list({ from: "2026-10-29" })).rejects.toMatchObject({
      kind: "validation"
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("merges same-day pages without summing full-day aggregates or losing same-ID transfers", () => {
    const transfer = row(2, {
      kind: "transfer",
      type: "transfer",
      categoryId: null,
      categoryName: null,
      toAccountId: id(11),
      toAccountName: "Savings"
    });
    const first = page([row(4), row(3)], { nextCursor: historyKey(row(3)) });
    const merged = mergeHistory(first, page([transfer, row(2)]), "older");
    expect(merged.items.map((record) => `${record.kind}_${record.id}`)).toEqual(
      [
        `transaction_${id(4)}`,
        `transaction_${id(3)}`,
        `transfer_${id(2)}`,
        `transaction_${id(2)}`
      ]
    );
    expect(merged.days).toHaveLength(1);
    expect(merged.days[0]?.count).toBe(4);
    expect(first.items).toHaveLength(2);
  });
  it("supports nearer-newer pages after a backdated reveal", () => {
    const saved = row(1),
      focused = page([saved], {
        focusedKey: historyKey(saved),
        previousCursor: historyKey(saved)
      });
    const merged = mergeHistory(
      focused,
      page([row(3), row(2)], {
        previousCursor: historyKey(row(3)),
        nextCursor: historyKey(row(2))
      }),
      "newer"
    );
    expect(merged.items.map((item) => item.id)).toEqual([id(3), id(2), id(1)]);
    expect(merged.focusedKey).toBe(historyKey(saved));
    expect(merged.nextCursor).toBeNull();
  });
  it("rejects order/cursor/aggregate protocol failures before mutating loaded rows", () => {
    for (const invalid of [
      page([row(2), row(3)]),
      page([row(3), row(3)]),
      page([row(3)], { days: [] }),
      page([], { nextCursor: historyKey(row(3)) }),
      page([row(3)], { nextCursor: historyKey(row(2)) })
    ]) {
      expect(() => validateHistoryPage(invalid)).toThrow();
    }
    expect(() =>
      validateHistoryPage(page([row(3)]), { after: historyKey(row(2)) })
    ).toThrow();
    expect(historyDateLabel("2026-10-29")).toMatch(/Thu/);
  });
});

function props(source: HistorySource): HistoryProps {
  // Only read ports are exercised; no demo ledger or write implementation.
  return {
    source,
    accounts: { list: async () => [] },
    categories: { list: async () => [] },
    changes: { subscribe: () => () => {} },
    active: true,
    ready: true
  };
}
const historyActions = {
  onEdit: () => {},
  onDelete: async () => {},
  recordExists: async () => true
};

async function press(name: string | RegExp) {
  await waitFor(() =>
    expect(screen.getByRole("button", { name })).toBeEnabled()
  );
  await act(async () => fireEvent.press(screen.getByRole("button", { name })));
}

describe("History filter selection", () => {
  it("keeps range edits in draft until Apply, discards dismissed edits and clears dates without changing other filters", async () => {
    const list = jest
      .fn<HistorySource["list"]>()
      .mockImplementation(async (filter) => page([], { applied: filter }));
    const config = props({ list });
    render(
      <HistoryScreen
        {...config}
        initialAccountId={id(10)}
        {...historyActions}
      />
    );
    await press("Type: All");
    await press("expense");
    expect(screen.queryByRole("button", { name: "Choose month" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply filters" })).toBeNull();
    await press(/^Date range:/);
    await press("2");
    expect(list).toHaveBeenCalledTimes(2);
    await press(/^Date range:/);
    expect(list).toHaveBeenCalledTimes(2);
    await press(/^Date range:/);
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
    await press("2");
    await press("5");
    expect(list).toHaveBeenCalledTimes(2);
    await press("Apply");
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(list.mock.calls[2]?.[0]).toMatchObject({
      from: `${currentMonth()}-02`,
      to: `${currentMonth()}-05`,
      accountId: id(10),
      type: "expense"
    });
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    await press(/^Date range:/);
    await act(async () =>
      fireEvent.press(
        within(screen.getByLabelText("Date range picker")).getByRole("button", {
          name: "Clear"
        })
      )
    );
    await waitFor(() => expect(list).toHaveBeenCalledTimes(4));
    expect(list.mock.calls[3]?.[0]).toEqual({
      accountId: id(10),
      type: "expense"
    });
    await press("Date range: All dates");
    await press("10");
    await press("Apply");
    await waitFor(() => expect(list).toHaveBeenCalledTimes(5));
    expect(list.mock.calls[4]?.[0]).toMatchObject({
      from: `${currentMonth()}-10`,
      to: `${currentMonth()}-10`
    });
  }, 15000);

  const categories: Category[] = [
    { id: id(20), name: "Food", isDefault: true, archivedAt: null },
    {
      id: id(21),
      name: "Groceries",
      parentId: id(20),
      isDefault: true,
      archivedAt: null
    },
    {
      id: id(22),
      name: "Old food",
      isDefault: false,
      archivedAt: "2026-10-01T00:00:00Z"
    },
    {
      id: id(23),
      name: "Old groceries",
      parentId: id(22),
      isDefault: false,
      archivedAt: "2026-10-01T00:00:00Z"
    }
  ];

  it("uses inline dropdowns and immediately applies account, type and category selections together", async () => {
    const list = jest
      .fn<HistorySource["list"]>()
      .mockImplementation(async (filter) => page([], { applied: filter }));
    const create = jest.fn<CategorySource["create"]>();
    const createChild = jest.fn<NonNullable<CategorySource["createChild"]>>();
    const categorySource = {
      list: async () => categories,
      recent: async () => [categories[1]!],
      create,
      createChild
    };
    const config = props({ list });
    config.categories = categorySource;
    config.accounts = {
      list: async () => [
        {
          id: id(10),
          name: "Cash",
          currency: "CAD",
          type: "cash",
          openingDate: "2024-01-01",
          openingBalanceMinor: 0,
          archivedAt: null,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z"
        }
      ]
    };
    render(<HistoryScreen {...config} {...historyActions} />);
    await press("Account: All");
    expect(
      screen.getByRole("button", { name: "Account: All", expanded: true })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Category: All" })).toBeVisible();
    await press("Account: All");
    expect(screen.queryByRole("button", { name: "Cash · CAD" })).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
    await press("Account: All");
    await press("Cash · CAD");
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(list.mock.calls[1]?.[0]).toMatchObject({ accountId: id(10) });
    expect(screen.queryByRole("button", { name: "All accounts" })).toBeNull();
    await press("Type: All");
    expect(
      screen.getByRole("button", { name: "Type: All", expanded: true })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Account: Cash" })).toBeVisible();
    await press("expense");
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(list.mock.calls[2]?.[0]).toMatchObject({
      accountId: id(10),
      type: "expense"
    });
    expect(screen.queryByRole("button", { name: "All types" })).toBeNull();
    await press("Category: All");
    expect(await screen.findByLabelText("Search categories")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Recent category: Food / Groceries" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Add personal category" })
    ).toBeNull();
    await press("Category: Food");
    expect(screen.getAllByText("Food")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Add subcategory under Food" })
    ).toBeNull();
    await press("Category: Food / Groceries");
    expect(
      screen.getByRole("button", { name: "Category: Food / Groceries" })
    ).toBeVisible();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(4));
    expect(list.mock.calls[3]?.[0]).toMatchObject({
      accountId: id(10),
      type: "expense",
      categoryId: id(21),
      includeSubcategories: false
    });

    await press("Category: Food / Groceries");
    await screen.findByLabelText("Search categories");
    await press("Cancel filter selection");
    expect(
      screen.getByRole("button", { name: "Category: Food / Groceries" })
    ).toBeVisible();
    expect(list).toHaveBeenCalledTimes(4);
    await press("Category: Food / Groceries");
    await screen.findByLabelText("Search categories");
    await press("All categories");
    await waitFor(() => expect(list).toHaveBeenCalledTimes(5));
    expect(list.mock.calls[4]?.[0]).toMatchObject({
      accountId: id(10),
      type: "expense"
    });
    expect(list.mock.calls[4]?.[0]).not.toHaveProperty("categoryId");
    expect(list.mock.calls[4]?.[0]).not.toHaveProperty("includeSubcategories");
    await press("Account: Cash");
    await press("All accounts");
    await waitFor(() => expect(list).toHaveBeenCalledTimes(6));
    expect(list.mock.calls[5]?.[0]).not.toHaveProperty("accountId");
    expect(list.mock.calls[5]?.[0]).toMatchObject({ type: "expense" });
    await press("Type: expense");
    await press("All types");
    await waitFor(() => expect(list).toHaveBeenCalledTimes(7));
    expect(list.mock.calls[6]?.[0]).toEqual(list.mock.calls[0]?.[0]);
    expect(create).not.toHaveBeenCalled();
    expect(createChild).not.toHaveBeenCalled();
  }, 15000);

  it("searches a longer account dropdown, includes archived accounts and switches or dismisses menus without filtering", async () => {
    const list = jest
      .fn<HistorySource["list"]>()
      .mockImplementation(async (filter) => page([], { applied: filter }));
    const baseAccount = (await accounts.list())[0]!;
    const accountRows = Array.from({ length: 8 }, (_, index) => ({
      ...baseAccount,
      id: id(10 + index),
      name: index === 7 ? "Old savings" : `Cash ${index}`,
      archivedAt: index === 7 ? "2026-10-01T00:00:00Z" : null
    }));
    const config = props({ list });
    config.accounts = { list: async () => accountRows };
    render(<HistoryScreen {...config} {...historyActions} />);
    await press("Account: All");
    await act(async () =>
      fireEvent.changeText(
        screen.getByLabelText("Search account choices"),
        "savings"
      )
    );
    expect(screen.queryByRole("button", { name: /^Cash 0/ })).toBeNull();
    await press(`Old savings · ${baseAccount.currency} (archived)`);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(list.mock.calls[1]?.[0]).toMatchObject({ accountId: id(17) });
    await press("Account: Old savings (archived)");
    expect(screen.getByLabelText("Search account choices")).toHaveProp(
      "value",
      ""
    );
    await press("Type: All");
    expect(screen.queryByLabelText("Search account choices")).toBeNull();
    expect(screen.getByRole("button", { name: "expense" })).toBeVisible();
    await press("Type: All");
    expect(screen.queryByRole("button", { name: "expense" })).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("keeps archived parent/child filters, parent scope and full-path search available", async () => {
    const list = jest
      .fn<HistorySource["list"]>()
      .mockImplementation(async (filter) => page([], { applied: filter }));
    const config = props({ list });
    config.categories = { list: async () => categories };
    render(<HistoryScreen {...config} {...historyActions} />);
    await press("Category: All");
    await screen.findByLabelText("Search categories");
    expect(screen.queryByText("Recent categories unavailable")).toBeNull();
    await press("Category: Old food (archived)");
    await press("Use this category: Old food");
    await press("Category scope: Exact category");
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(list.mock.calls[2]?.[0]).toMatchObject({
      categoryId: id(22),
      includeSubcategories: true
    });

    await press("Category: Old food");
    await screen.findByLabelText("Search categories");
    await act(async () =>
      fireEvent.changeText(
        screen.getByLabelText("Search categories"),
        "Old food / Old groceries"
      )
    );
    await press("Category: Old food / Old groceries (archived)");
    expect(
      screen.queryByRole("button", { name: /Category scope:/ })
    ).toBeNull();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(4));
    expect(list.mock.calls[3]?.[0]).toMatchObject({
      categoryId: id(23),
      includeSubcategories: false
    });
  });
});

describe("History request coordination", () => {
  it("keeps a newly selected filter when an older refresh finishes later", async () => {
    const oldRefresh = deferred<HistoryPage>();
    const list = jest
      .fn<HistorySource["list"]>()
      .mockResolvedValueOnce(page([row(1)]))
      .mockReturnValueOnce(oldRefresh.promise)
      .mockImplementation(async (filter) =>
        page([row(2)], { applied: filter })
      );
    const config = props({ list });
    const hook = renderHook(() => useHistory(config));
    await waitFor(() =>
      expect(hook.result.current.page?.items[0]?.id).toBe(id(1))
    );
    act(() => hook.result.current.refresh());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await act(async () =>
      hook.result.current.updateFilters({ type: "expense" })
    );
    await waitFor(() =>
      expect(hook.result.current.page?.applied.type).toBe("expense")
    );
    await act(async () => oldRefresh.resolve(page([row(1)])));
    expect(hook.result.current.filter.type).toBe("expense");
    expect(hook.result.current.page?.items[0]?.id).toBe(id(2));
    expect(hook.result.current.busy).toBe(false);
  });

  it("consumes account links and reapplies the same account when opened again", async () => {
    const list = jest
      .fn<HistorySource["list"]>()
      .mockImplementation(async (filter) => page([], { applied: filter }));
    const config = props({ list }),
      consumed = jest.fn();
    const hook = renderHook(
      (accountId: string | undefined) =>
        useHistory({
          ...config,
          ...(accountId ? { initialAccountId: accountId } : {}),
          onAccountConsumed: consumed
        }),
      { initialProps: id(10) as string | undefined }
    );
    await waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
    hook.rerender(undefined);
    await act(async () =>
      hook.result.current.updateFilters({ accountId: undefined })
    );
    await waitFor(() =>
      expect(hook.result.current.page?.applied).toEqual(
        monthRange(currentMonth())
      )
    );
    hook.rerender(id(10));
    await waitFor(() =>
      expect(hook.result.current.page?.applied.accountId).toBe(id(10))
    );
    expect(list.mock.calls.at(-1)?.[0]).toMatchObject({ accountId: id(10) });
  });
  it.each(["record", "account"] as const)(
    "uses Try again to recover from an unavailable History %s link",
    async (link) => {
      const list = jest
        .fn<HistorySource["list"]>()
        .mockRejectedValueOnce(new ClientFailure("unavailable", "NOT_FOUND"))
        .mockImplementation(async (applied) => page([], { applied }));
      const config = props({ list }),
        consumed = jest.fn();
      const selection =
        link === "record"
          ? {
              focus: { id: id(1), kind: "transaction" } as const,
              onFocusConsumed: consumed
            }
          : { initialAccountId: id(10), onAccountConsumed: consumed };
      render(<HistoryScreen {...config} {...historyActions} {...selection} />);
      expect(
        await screen.findByText(
          "This History link is unavailable. Try again to view your history."
        )
      ).toBeVisible();
      await press("Try again");
      expect(await screen.findByText("No transactions match")).toBeVisible();
      expect(consumed).toHaveBeenCalledTimes(1);
      expect(list.mock.calls[1]).toEqual([
        expect.objectContaining({
          from: expect.any(String),
          to: expect.any(String)
        }),
        {}
      ]);
      expect(list.mock.calls[1]?.[0]).not.toHaveProperty("accountId");
    }
  );
  it("moves the actions to the selected row and clears them when Edit opens", async () => {
    const transfer = row(2, {
      kind: "transfer",
      type: "transfer",
      categoryId: null,
      categoryName: null,
      toAccountId: id(11),
      toAccountName: "Savings"
    });
    const transaction = row(3);
    const config = props({ list: async () => page([transaction, transfer]) });
    const edit = jest.fn();
    render(<HistoryScreen {...config} {...historyActions} onEdit={edit} />);
    await waitFor(() =>
      expect(
        screen.getByRole("header", { name: historyDateLabel("2026-10-29") })
      ).toBeTruthy()
    );
    expect(screen.queryByText(/\bNet\b|\d+ transactions?\b/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    await press(/^Food\. expense/);
    expect(
      screen.getByRole("button", { name: /^Food\. expense/, expanded: true })
    ).toBeTruthy();
    expect(edit).not.toHaveBeenCalled();
    await press(/^Transfer\. Transfer\. Cash → Savings/);
    expect(
      screen.getByRole("button", { name: /^Food\. expense/, expanded: false })
    ).toBeTruthy();
    await press("Edit");
    expect(edit).toHaveBeenNthCalledWith(1, transfer);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    await press(/^Food\. expense/);
    await press("Edit");
    expect(edit).toHaveBeenCalledTimes(2);
    expect(edit).toHaveBeenNthCalledWith(2, transaction);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
  it("cancels without a write and refreshes the same filters after one confirmed delete", async () => {
    const date = `${currentMonth()}-01`;
    const selected = row(3, { date, note: "Lunch" });
    const remaining = row(2, { date, note: "Dinner" });
    let items = [selected, remaining];
    let invalidate = () => {};
    const done = deferred<void>();
    const list = jest.fn<HistorySource["list"]>(async (filter) =>
      page(items, { applied: filter })
    );
    const config = props({ list });
    config.changes = {
      subscribe: (listener) => {
        invalidate = listener;
        return () => {};
      }
    };
    const remove = jest.fn<(row: HistoryRow) => Promise<void>>(async () => {
      await done.promise;
      items = [remaining];
      invalidate();
    });
    render(
      <HistoryScreen
        {...config}
        {...historyActions}
        initialAccountId={selected.accountId}
        onDelete={remove}
      />
    );
    await press("Type: All");
    await press("expense");
    await press(/^Lunch\. expense/);
    const filters = list.mock.lastCall?.[0];
    expect(filters).toMatchObject({
      accountId: selected.accountId,
      type: "expense",
      from: expect.any(String),
      to: expect.any(String)
    });
    await press("Delete");
    expect(
      screen.getByRole("header", { name: "Delete transaction?" })
    ).toBeTruthy();
    expect(screen.getByText("Lunch")).toBeVisible();
    await press("Cancel");
    expect(remove).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /^Lunch\. expense/ })
    ).toBeTruthy();
    await press("Delete");
    const confirm = screen.getByRole("button", { name: "Delete" });
    await act(async () => {
      fireEvent.press(confirm);
      fireEvent.press(confirm);
    });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(selected);
    expect(confirm).toBeDisabled();
    await act(async () => done.resolve(undefined));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(list.mock.lastCall).toEqual([filters, {}]);
    expect(
      screen.queryByRole("button", { name: /^Lunch\. expense/ })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Dinner\. expense/ })
    ).toBeTruthy();
  });
  it("keeps a failed delete retryable and checks an uncertain outcome before issuing another write", async () => {
    const transfer = row(2, {
      kind: "transfer",
      type: "transfer",
      note: "Move to savings",
      categoryId: null,
      categoryName: null,
      toAccountId: id(11),
      toAccountName: "Savings"
    });
    const remove = jest
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new ClientFailure("rate-limit"))
      .mockRejectedValueOnce(new ClientFailure("network"));
    const recordExists = jest.fn<(row: HistoryRow) => Promise<boolean>>(
      async () => false
    );
    render(
      <HistoryScreen
        {...props({ list: async () => page([transfer]) })}
        {...historyActions}
        onDelete={remove}
        recordExists={recordExists}
      />
    );
    await press(/^Move to savings\. Transfer/);
    await press("Delete");
    expect(
      screen.getByRole("header", { name: "Delete transfer?" })
    ).toBeTruthy();
    await press("Delete");
    expect(
      screen.getByText("Could not delete this entry. Try again.")
    ).toBeVisible();
    await press("Cancel");
    expect(
      screen.getByRole("button", { name: /^Move to savings\. Transfer/ })
    ).toBeTruthy();
    await press("Delete");
    await press("Delete");
    expect(screen.getByText(/Could not confirm deletion/)).toBeVisible();
    await press("Cancel");
    await press("Delete");
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    await press("Check entry");
    expect(recordExists).toHaveBeenCalledWith(transfer);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", { name: /^Move to savings\. Transfer/ })
    ).toBeNull();
  });
  it("ignores an older response after a confirmed finance change starts a fresh read", async () => {
    const first = deferred<HistoryPage>(),
      latest = deferred<HistoryPage>();
    const list = jest
      .fn<HistorySource["list"]>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(latest.promise);
    const config = props({ list });
    let invalidate: () => void = () => {};
    config.changes = {
      subscribe: (listener) => {
        invalidate = listener;
        return () => {};
      }
    };
    const hook = renderHook(() => useHistory(config));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    act(() => invalidate());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await act(async () => latest.resolve(page([row(2)])));
    await waitFor(() =>
      expect(hook.result.current.page?.items[0]?.id).toBe(id(2))
    );
    await act(async () => first.resolve(page([row(1)])));
    expect(hook.result.current.page?.items[0]?.id).toBe(id(2));
  });
  it("retains loaded context after a failed page and retries the same cursor", async () => {
    const first = page([row(4, { note: "Newer entry" }), row(3)], {
      nextCursor: historyKey(row(3))
    });
    const list = jest
      .fn<HistorySource["list"]>()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page([row(2), row(1, { note: "Oldest entry" })]));
    render(<HistoryScreen {...props({ list })} {...historyActions} />);
    await press("Load older transactions");
    expect(await screen.findByText("History needs attention")).toBeVisible();
    expect(screen.getByText("Newer entry")).toBeVisible();
    await press("Try again");
    expect(await screen.findByText("Oldest entry")).toBeVisible();
    expect(screen.getByText("Newer entry")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Refresh history" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Load older transactions" })
    ).toBeNull();
    expect(screen.queryByText("End of matching history.")).toBeNull();
    expect(list.mock.calls[1]?.[1]).toEqual({ after: first.nextCursor });
    expect(list.mock.calls[2]?.[1]).toEqual({ after: first.nextCursor });
  });
  it("consumes a saved-record handoff without reloading away from its highlighted page", async () => {
    const focus: HistoryFocus = { id: id(1), kind: "transaction" };
    const focused = page([row(1)], {
      focusedKey: historyKey(row(1)),
      adjustments: ["Date range adjusted to include the saved record."]
    });
    const list = jest.fn<HistorySource["list"]>().mockResolvedValue(focused),
      config = props({ list }),
      consumed = jest.fn();
    const hook = renderHook(
      (selection: { focus?: HistoryFocus }) =>
        useHistory({ ...config, ...selection, onFocusConsumed: consumed }),
      { initialProps: { focus } as { focus?: HistoryFocus } }
    );
    await waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
    hook.rerender({});
    await act(async () => {});
    expect(list).toHaveBeenCalledTimes(1);
    expect(hook.result.current.page?.focusedKey).toBe(historyKey(row(1)));
  });
  it("does not read protected finance until the screen is active and setup is ready", async () => {
    const list = jest.fn<HistorySource["list"]>().mockResolvedValue(page([])),
      config = props({ list });
    const hook = renderHook(
      (ready: boolean) => useHistory({ ...config, ready }),
      { initialProps: false }
    );
    expect(list).not.toHaveBeenCalled();
    hook.rerender(true);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  });
});
