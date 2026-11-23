import { expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react-native";
import { AccountManagement } from "../src/account-management";
import {
  createApiAccountSource,
  createDemoFinanceSources,
  parseOpeningBalance,
  type AccountSource
} from "../src/account-data";
import { createTransport, type FetchRequest } from "../src/auth/transport";
import { accounts, accountId, deferred, response } from "./auth-fixtures";
import { createDemoCategorySource } from "../src/category-data";
import { ClientFailure } from "../src/auth/transport";
import { AppState } from "react-native";
import { localDate } from "../src/entry-data";
import { chooseAccountOpeningDate } from "./date-picker-fixtures";

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name }));
  });
}

it("parses signed opening amounts exactly without creating an income posting", () => {
  expect(parseOpeningBalance("", "CAD")).toBe(0);
  expect(parseOpeningBalance("-12.34", "CAD")).toBe(-1234);
  expect(parseOpeningBalance("-1", "JPY")).toBe(-1);
  expect(parseOpeningBalance("1.001", "KWD")).toBe(1001);
  for (const value of ["1e2", "1.001", "21474836.48", "NaN"])
    expect(() => parseOpeningBalance(value, "CAD")).toThrow();
});

it("uses canonical account paths and rejects nonadvancing pagination", async () => {
  const row = (await accounts.list()).find((row) => row.id === accountId())!;
  const fetcher = jest
    .fn<FetchRequest>()
    .mockResolvedValue(response({ items: [row], nextCursor: row.id }));
  const source = createApiAccountSource(
    createTransport("https://api.example.invalid", fetcher)
  );
  await expect(source.list()).rejects.toMatchObject({ kind: "protocol" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]?.[0]).toContain("/v1/accounts?");
});

it("creates a named account, selects its default and confirms archival while preserving its baseline", async () => {
  const row = (await accounts.list()).find(
    (row) => row.id === accountId("CAD")
  )!;
  const create = jest.fn<AccountSource["create"]>().mockResolvedValue(row);
  const get = jest.fn<AccountSource["get"]>(accounts.get);
  const archive = jest
    .fn<AccountSource["archive"]>()
    .mockResolvedValue({ ...row, archivedAt: "2026-11-03T00:00:00Z" });
  const onDefault = jest
    .fn<(id: string | null) => Promise<void>>()
    .mockResolvedValue(undefined);
  const list = jest
    .fn<AccountSource["list"]>()
    .mockResolvedValueOnce([])
    .mockResolvedValue([row]);
  render(
    <AccountManagement
      source={{ ...accounts, list, create, archive, get }}
      currency="CAD"
      defaultAccountId={null}
      onDefault={onDefault}
    />
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add Account" })).toBeEnabled()
  );
  expect(screen.queryByLabelText("Account name")).toBeNull();
  await press("Add Account");
  fireEvent.changeText(screen.getByLabelText("Account name"), "Cancel this");
  await chooseAccountOpeningDate("2024-03-10");
  await press("Cancel");
  expect(create).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Account name")).toBeNull();
  await press("Add Account");
  expect(screen.getByLabelText("Account name")).toHaveProp("value", "");
  expect(
    screen.getByRole("button", { name: "Choose account opening date" })
  ).toHaveProp("accessibilityHint", localDate());
  expect(screen.queryByText(/To record older cash transactions/)).toBeNull();
  await press("Opening date help");
  expect(screen.getByText(/To record older cash transactions/)).toBeVisible();
  fireEvent(screen.getByRole("button", { name: "Opening date help" }), "blur");
  expect(screen.queryByText("Financial accounts")).toBeNull();
  expect(screen.queryByText("No financial accounts yet")).toBeNull();
  expect(screen.queryByRole("button", { name: "Reload accounts" })).toBeNull();
  expect(screen.queryByText(/No bank connection is created/)).toBeNull();
  const accountHelp = screen.getByRole("button", { name: "Add account help" });
  fireEvent(accountHelp, "hoverIn");
  expect(
    screen.getByText(/No bank connection is created.*Currency is CAD/)
  ).toBeVisible();
  fireEvent(accountHelp, "hoverOut");
  expect(screen.queryByText(/No bank connection is created/)).toBeNull();
  await press("Opening balance (optional) help");
  expect(screen.getByText(/Your starting balance, not income/)).toBeVisible();
  fireEvent(
    screen.getByRole("button", { name: "Opening balance (optional) help" }),
    "blur"
  );
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  fireEvent.press(screen.getByRole("combobox", { name: "Account type" }));
  fireEvent.press(screen.getByRole("radio", { name: "Credit" }));
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(
    screen.getByRole("combobox", { name: "Account type" })
  ).toHaveAccessibilityValue({ text: "Credit" });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("Account name"), "My cash");
    fireEvent.changeText(
      screen.getByLabelText("Opening balance (optional)"),
      "-12.34"
    );
  });
  await chooseAccountOpeningDate("2024-02-29");
  await press("Create account");
  expect(create).toHaveBeenCalledWith({
    name: "My cash",
    type: "credit",
    currency: "CAD",
    openingBalanceMinor: -1234,
    openingDate: "2024-02-29"
  });
  expect(screen.queryByLabelText("Account name")).toBeNull();
  expect(screen.queryByText(`Opening date: ${row.openingDate}`)).toBeNull();
  for (const [label, tooltip] of [
    [`View balance for ${row.name}`, "View balance"],
    [`Edit ${row.name}`, `Edit ${row.name}`],
    [`Use ${row.name} as default`, `Use ${row.name} as default`],
    [`Archive ${row.name}`, `Archive ${row.name}`]
  ] as const) {
    const action = screen.getByRole("button", { name: label });
    fireEvent(action, "longPress");
    expect(screen.getByText(tooltip)).toBeVisible();
    // Releasing a long press previews its label without executing its action.
    fireEvent.press(action);
  }
  expect(get).not.toHaveBeenCalled();
  expect(onDefault).not.toHaveBeenCalled();
  expect(archive).not.toHaveBeenCalled();
  expect(screen.queryByRole("header", { name: "Edit account" })).toBeNull();
  const eye = screen.getByRole("button", {
    name: `View balance for ${row.name}`
  });
  fireEvent(eye, "hoverIn");
  expect(screen.getByText("View balance")).toBeVisible();
  fireEvent(eye, "hoverOut");
  expect(screen.queryByText("View balance")).toBeNull();
  await press("Use Test CAD as default");
  expect(onDefault).toHaveBeenCalledWith(row.id);
  await press("Archive Test CAD");
  expect(archive).not.toHaveBeenCalled();
  await press("Archive");
  expect(archive).toHaveBeenCalledWith(row.id);
});

it("requires a successful account read before enabling mutations", async () => {
  const list = jest
    .fn<AccountSource["list"]>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue([]);
  render(
    <AccountManagement
      source={{ ...accounts, list }}
      currency="CAD"
      defaultAccountId={null}
      onDefault={async () => {}}
    />
  );
  await screen.findByText(
    "Accounts could not be loaded. Try again before making changes."
  );
  expect(screen.getByRole("button", { name: "Add Account" })).toBeDisabled();
  await press("Try again");
  expect(screen.getByRole("button", { name: "Add Account" })).toBeEnabled();
});

it("edits the opening date without crossing an existing transaction or changing the opening balance", async () => {
  const categories = createDemoCategorySource({ catalog: false });
  await categories.create("Food");
  const { accounts: source, transactions } = createDemoFinanceSources(
    categories,
    () => "CAD"
  );
  const row = await source.create({
    name: "BMO Chequing",
    type: "bank",
    currency: "CAD",
    openingDate: "2024-01-01",
    openingBalanceMinor: -1234
  });
  const props = {
    source,
    currency: "CAD" as const,
    defaultAccountId: null,
    onDefault: async () => {}
  };
  const view = render(<AccountManagement {...props} />);
  await screen.findByRole("header", { name: "BMO Chequing" });
  expect(screen.queryByText("Opening balance: -12.34 CAD")).toBeNull();
  const get = jest.spyOn(source, "get");
  await press("View balance for BMO Chequing");
  expect(screen.getByText("Opening date: 2024-01-01")).toBeVisible();
  expect(screen.getByText("Opening balance: -12.34 CAD")).toBeVisible();
  expect(screen.queryByText(/cannot be edited/)).toBeNull();
  expect(
    screen.getByText(/Tracked balance as of .*: -12.34 CAD/)
  ).toBeVisible();
  expect(
    screen.getByRole("button", {
      name: "Hide balance for BMO Chequing",
      expanded: true
    })
  ).toBeVisible();
  await press("Hide balance for BMO Chequing");
  expect(screen.queryByText("Opening balance: -12.34 CAD")).toBeNull();
  expect(get).toHaveBeenCalledTimes(1);
  await press("View balance for BMO Chequing");
  view.rerender(<AccountManagement {...props} active={false} />);
  await transactions.create({
    direction: "expense",
    amountMinor: 100,
    date: "2024-02-01",
    categoryId: (await categories.list())[0]!.id,
    accountId: row.id,
    note: null,
    clientRequestId: "90000000-0000-4000-8000-000000000001"
  });
  view.rerender(<AccountManagement {...props} active />);
  await screen.findByText(/Tracked balance as of .*: -13.34 CAD/);
  await press("Edit BMO Chequing");
  expect(screen.queryByLabelText("Opening balance (optional)")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Choose account opening date" })
  ).toHaveProp("accessibilityHint", "2024-01-01");
  fireEvent.changeText(screen.getByLabelText("Account name"), "BMO Savings");
  fireEvent.press(screen.getByRole("combobox", { name: "Account type" }));
  fireEvent.press(screen.getByRole("radio", { name: "Cash" }));
  await chooseAccountOpeningDate("2024-02-02");
  await press("Save account changes");
  expect(screen.getByText(/earliest transaction or transfer/)).toBeVisible();
  expect((await source.get(row.id)).openingDate).toBe("2024-01-01");
  expect(screen.getByLabelText("Account name")).toHaveProp(
    "value",
    "BMO Savings"
  );
  await chooseAccountOpeningDate("2024-02-01");
  await press("Save account changes");
  expect(
    await screen.findByRole("header", { name: "BMO Savings" })
  ).toBeVisible();
  expect(screen.getByText("Cash · CAD · Active")).toBeVisible();
  expect(await source.get(row.id)).toMatchObject({
    openingDate: "2024-02-01",
    openingBalanceMinor: -1234,
    balanceMinor: -1334
  });
});

it("refreshes accounts automatically when the app returns to the foreground", async () => {
  const listener = jest.mocked(AppState.addEventListener);
  const before = listener.mock.calls.length;
  const row = (await accounts.list())[0]!;
  const list = jest.fn<AccountSource["list"]>().mockResolvedValue([row]);
  render(
    <AccountManagement
      source={{ ...accounts, list }}
      currency={row.currency}
      defaultAccountId={null}
      onDefault={async () => {}}
    />
  );
  await screen.findByRole("header", { name: row.name });
  list.mockResolvedValue([{ ...row, name: "Updated elsewhere" }]);
  const foreground = listener.mock.calls
    .slice(before)
    .find(([event]) => event === "change")?.[1];
  expect(foreground).toBeDefined();
  await act(async () => {
    foreground?.("active");
  });
  expect(
    await screen.findByRole("header", { name: "Updated elsewhere" })
  ).toBeVisible();
  expect(list).toHaveBeenCalledTimes(2);
});

it("limits defaults to active compatible accounts and preserves archived details", async () => {
  const categories = createDemoCategorySource({ catalog: false });
  let currency: "CAD" | "USD" = "CAD";
  const { accounts: source } = createDemoFinanceSources(
    categories,
    () => currency
  );
  const cad = await source.create({
    name: "Cash",
    type: "cash",
    currency,
    openingDate: "2024-01-01",
    openingBalanceMinor: 0
  });
  currency = "USD";
  await source.create({
    name: "CIBC",
    type: "bank",
    currency,
    openingDate: "2024-01-01",
    openingBalanceMinor: 0
  });
  const onDefault = jest
    .fn<(id: string | null) => Promise<void>>()
    .mockResolvedValue(undefined);
  const view = render(
    <AccountManagement
      source={source}
      currency="CAD"
      defaultAccountId={cad.id}
      onDefault={onDefault}
    />
  );
  await screen.findByRole("header", { name: "Cash" });
  expect(
    screen.getByRole("button", { name: "Use Cash as default", selected: true })
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Use CIBC as default" })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Clear default account" })
  ).toBeNull();
  await press("Add Account");
  expect(screen.getAllByRole("header").at(-1)).toHaveTextContent("Add account");
  expect(screen.getByRole("button", { name: "Create account" })).toBeVisible();
  await press("Archive Cash");
  expect(screen.getByRole("header", { name: "Archive Cash?" })).toBeVisible();
  expect(screen.queryByLabelText("Account name")).toBeNull();
  expect(
    screen.getByText(
      "Future entries cannot select this account. Historical transactions and balances are preserved."
    )
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Edit Cash" })).toBeNull();
  await press("Cancel");
  await press("Edit Cash");
  expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  expect(screen.getByLabelText("Account name")).toHaveProp("value", "Cash");
  await press("Add Account");
  expect(
    screen.queryByRole("button", { name: "Save account changes" })
  ).toBeNull();
  expect(screen.getByLabelText("Account name")).toHaveProp("value", "");
  await press("Archive Cash");
  await press("Cancel");
  expect((await source.get(cad.id)).archivedAt).toBeNull();
  await press("Archive Cash");
  await press("Archive");
  expect(onDefault).toHaveBeenLastCalledWith(null);
  view.rerender(
    <AccountManagement
      source={source}
      currency="CAD"
      defaultAccountId={null}
      onDefault={onDefault}
    />
  );
  expect(
    screen.queryByRole("button", { name: "Use Cash as default" })
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit Cash" })).toBeNull();
  expect(screen.getAllByRole("header")[0]).toHaveTextContent("CIBC");
  expect(screen.getAllByRole("header")[1]).toHaveTextContent("Cash");
  await press("View balance for Cash");
  expect(screen.getByText(/^Archived: \d{4}-\d{2}-\d{2}$/)).toBeVisible();
  expect(screen.getByText(/Tracked balance as of .*: 0.00 CAD/)).toBeVisible();
});

it("announces loading, retains invalid values and reports name conflicts without echoing server details", async () => {
  const pending = deferred<Awaited<ReturnType<AccountSource["list"]>>>();
  const create = jest
    .fn<AccountSource["create"]>()
    .mockRejectedValue(new ClientFailure("conflict", "ACCOUNT_NAME_CONFLICT"));
  render(
    <AccountManagement
      source={{ ...accounts, list: () => pending.promise, create }}
      currency="CAD"
      defaultAccountId={null}
      onDefault={async () => {}}
    />
  );
  expect(
    screen.getByLabelText(/Loading accounts or confirming a change\./)
  ).toHaveProp("accessibilityState", { busy: true });
  expect(screen.getByRole("button", { name: "Add Account" })).toBeDisabled();
  await act(async () => {
    pending.resolve([]);
  });
  await press("Add Account");
  await press("Create account");
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeVisible();
  fireEvent.changeText(screen.getByLabelText("Account name"), "BMO Savings");
  await press("Create account");
  expect(
    screen.getByText(/An active account already uses that name/)
  ).toBeVisible();
  expect(screen.getByLabelText("Account name")).toHaveProp(
    "value",
    "BMO Savings"
  );
});

it("distinguishes a confirmed create followed by a failed refresh from an uncertain write", async () => {
  const row = (await accounts.list())[0]!;
  const list = jest
    .fn<AccountSource["list"]>()
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue([row]);
  const create = jest.fn<AccountSource["create"]>().mockResolvedValue(row);
  render(
    <AccountManagement
      source={{ ...accounts, list, create }}
      currency="CAD"
      defaultAccountId={null}
      onDefault={async () => {}}
    />
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add Account" })).toBeEnabled()
  );
  await press("Add Account");
  fireEvent.changeText(screen.getByLabelText("Account name"), "Cash");
  await press("Create account");
  expect(
    screen.getByText(
      "Accounts could not be loaded. Try again before making changes."
    )
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Add Account" })).toBeDisabled();
  expect(
    screen.queryByRole("button", {
      name: "I reviewed accounts; enable changes"
    })
  ).toBeNull();
  expect(list).toHaveBeenCalledTimes(3);
  await press("Try again");
  expect(create).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText("Account name")).toBeNull();
  expect(screen.getByRole("button", { name: "Add Account" })).toBeEnabled();
});

it("requires explicit review after an uncertain account write", async () => {
  const rows = await accounts.list();
  const pending = deferred<typeof rows>();
  const list = jest
    .fn<AccountSource["list"]>()
    .mockResolvedValueOnce(rows)
    .mockReturnValueOnce(pending.promise);
  const create = jest
    .fn<AccountSource["create"]>()
    .mockRejectedValue(new ClientFailure("network"));
  render(
    <AccountManagement
      source={{ ...accounts, create, list }}
      currency="CAD"
      defaultAccountId={null}
      onDefault={async () => {}}
    />
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add Account" })).toBeEnabled()
  );
  await press("Add Account");
  fireEvent.changeText(screen.getByLabelText("Account name"), "Cash");
  await press("Create account");
  expect(
    screen.getByRole("button", { name: "I reviewed accounts; enable changes" })
  ).toBeDisabled();
  expect(list).toHaveBeenCalledTimes(2);
  await act(async () => {
    pending.resolve(rows);
  });
  expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
  await press("I reviewed accounts; enable changes");
  expect(create).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
});

it("reports a failed default change and recovers from an unavailable detail read", async () => {
  const row = (await accounts.list())[0]!;
  const onDefault = jest
    .fn<(id: string | null) => Promise<void>>()
    .mockRejectedValue(new ClientFailure("validation", "INVALID_ACCOUNT"));
  const get = jest
    .fn<AccountSource["get"]>()
    .mockRejectedValueOnce(new ClientFailure("unavailable"))
    .mockResolvedValue({
      ...row,
      asOf: row.openingDate,
      balanceMinor: row.openingBalanceMinor
    });
  render(
    <AccountManagement
      source={{ ...accounts, get }}
      currency={row.currency}
      defaultAccountId={null}
      onDefault={onDefault}
    />
  );
  await screen.findByRole("header", { name: row.name });
  await press(`Use ${row.name} as default`);
  expect(
    screen.getByText(
      "Choose an active account in the configured currency as the default."
    )
  ).toBeVisible();
  expect(screen.queryByText(`${row.name} is the default account.`)).toBeNull();
  await press(`View balance for ${row.name}`);
  expect(screen.getByText("Tracked balance unavailable")).toBeVisible();
  await press("Try again");
  expect(screen.queryByText("Tracked balance unavailable")).toBeNull();
  expect(screen.getByText(/Tracked balance as of/)).toBeVisible();
});

it("queues a focus refresh when an older balance read is still pending", async () => {
  const row = (await accounts.list())[0]!;
  const oldRead = deferred<Awaited<ReturnType<AccountSource["get"]>>>();
  const get = jest
    .fn<AccountSource["get"]>()
    .mockReturnValueOnce(oldRead.promise)
    .mockResolvedValue({ ...row, asOf: row.openingDate, balanceMinor: 200 });
  const props = {
    source: { ...accounts, get },
    currency: row.currency,
    defaultAccountId: null,
    onDefault: async () => {}
  };
  const view = render(<AccountManagement {...props} />);
  await screen.findByRole("header", { name: row.name });
  await press(`View balance for ${row.name}`);
  view.rerender(<AccountManagement {...props} active={false} />);
  view.rerender(<AccountManagement {...props} active />);
  await act(async () => {
    oldRead.resolve({ ...row, asOf: row.openingDate, balanceMinor: 100 });
  });
  await screen.findByText(/Tracked balance as of .*: 2.00 CAD/);
  expect(get).toHaveBeenCalledTimes(2);
});

it("hides details immediately during a pending read and keeps late balances hidden", async () => {
  const row = (await accounts.list())[0]!;
  const pending = deferred<Awaited<ReturnType<AccountSource["get"]>>>();
  const get = jest.fn<AccountSource["get"]>().mockReturnValue(pending.promise);
  render(
    <AccountManagement
      source={{ ...accounts, get }}
      currency={row.currency}
      defaultAccountId={null}
      onDefault={async () => {}}
    />
  );
  await screen.findByRole("header", { name: row.name });
  await press(`View balance for ${row.name}`);
  expect(screen.getByText(`Opening date: ${row.openingDate}`)).toBeVisible();
  await press(`Hide balance for ${row.name}`);
  expect(screen.queryByText(`Opening date: ${row.openingDate}`)).toBeNull();
  await act(async () => {
    pending.resolve({ ...row, asOf: row.openingDate, balanceMinor: 123456 });
  });
  expect(screen.queryByText(/Tracked balance as of/)).toBeNull();
  expect(
    screen.getByRole("button", {
      name: `View balance for ${row.name}`,
      expanded: false
    })
  ).toBeEnabled();
  expect(get).toHaveBeenCalledTimes(1);
});
