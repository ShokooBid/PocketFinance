import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest
} from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react-native";
import { Dimensions, StyleSheet } from "react-native";
import DateTimePicker from "react-native-ui-datepicker";
import { ReportsScreen } from "../src/reports-screen";
import type { Report, ReportSource } from "../src/report-data";
import { deferred } from "./auth-fixtures";

const fixture: Report = {
  income: {
    totalMinor: 10000,
    rows: [
      {
        id: "salary",
        name: "Salary",
        amountMinor: 10000,
        children: []
      }
    ]
  },
  expenses: {
    totalMinor: 3000,
    rows: [
      {
        id: "food",
        name: "Food & Drinks",
        amountMinor: 3000,
        children: [
          {
            id: "direct",
            name: "General · Food & Drinks",
            amountMinor: 1000,
            children: []
          },
          {
            id: "groceries",
            name: "Groceries",
            amountMinor: 2000,
            children: []
          }
        ]
      }
    ]
  }
};
function harness() {
  let invalidate = () => {};
  const unsubscribe = jest.fn();
  const load = jest.fn<ReportSource["load"]>().mockResolvedValue(fixture);
  const source: ReportSource = {
    load,
    subscribe: (listener) => {
      invalidate = listener;
      return unsubscribe;
    }
  };
  return { source, load, unsubscribe, invalidate: () => invalidate() };
}
async function press(name: string | RegExp) {
  await act(async () => fireEvent.press(screen.getByRole("button", { name })));
}
async function edit(from: string, to?: string) {
  await act(async () =>
    fireEvent(screen.UNSAFE_getByType(DateTimePicker), "change", {
      startDate: from,
      endDate: to
    })
  );
}
beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 17, 16) });
});
afterEach(() => {
  jest.useRealTimers();
});

describe("Overview Reports", () => {
  it("selects Reports, immediately loads the inclusive current month and expands categories without reloading", async () => {
    const h = harness();
    render(<ReportsScreen source={h.source} currency="USD" />);
    expect(
      screen.getByRole("tab", { name: "Reports", selected: true })
    ).toBeVisible();
    expect(screen.getByRole("tab", { name: "Charts" })).toBeDisabled();
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(h.load).toHaveBeenCalledWith({
      from: "2026-11-01",
      to: "2026-11-30",
      currency: "USD"
    });
    expect(
      screen.getAllByRole("button", { name: /^Date range:/ })
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", {
        name: "Date range: 2026-11-01 – 2026-11-30"
      })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /^(From|To) date:/ })
    ).toBeNull();
    const heading = await screen.findByRole("header", {
      name: "Expenses. USD -30.00."
    });
    expect(within(heading).getByText("Expenses")).toBeVisible();
    expect(within(heading).getByText("USD -30.00")).toBeVisible();
    expect(screen.queryByText("Groceries")).toBeNull();
    await press(/^Food & Drinks\./);
    expect(
      screen.getByRole("button", { name: /^Food & Drinks\./, expanded: true })
    ).toBeVisible();
    expect(screen.getByText("Groceries")).toBeVisible();
    expect(screen.getByText("General · Food & Drinks")).toBeVisible();
    expect(
      screen.getByLabelText("General · Food & Drinks. USD -10.00.")
    ).toBeVisible();
    expect(screen.queryByText(/%|^—$/)).toBeNull();
    await press(/^Food & Drinks\./);
    expect(screen.queryByText("Groceries")).toBeNull();
    expect(h.load).toHaveBeenCalledTimes(1);
  });
  it("keeps full labels and moves totals below them when space is tight", async () => {
    const original = {
      window: Dimensions.get("window"),
      screen: Dimensions.get("screen")
    };
    Dimensions.set({
      window: { width: 390, height: 800, scale: 1, fontScale: 1 }
    });
    try {
      const h = harness();
      const row = fixture.expenses.rows[0]!;
      const label = "Groceries and household essentials";
      h.load.mockResolvedValue({
        ...fixture,
        expenses: {
          ...fixture.expenses,
          rows: [
            {
              ...row,
              children: row.children.map((child) =>
                child.id === "groceries" ? { ...child, name: label } : child
              )
            }
          ]
        }
      });
      render(<ReportsScreen source={h.source} currency="CAD" />);
      const options = { name: "Expenses. CAD -30.00." };
      const heading = await screen.findByRole("header", options);
      expect(StyleSheet.flatten(heading.props.style)).toMatchObject({
        flexDirection: "row"
      });

      act(() =>
        Dimensions.set({
          window: { width: 320, height: 800, scale: 1, fontScale: 1.5 }
        })
      );
      expect(
        StyleSheet.flatten(screen.getByRole("header", options).props.style)
      ).toMatchObject({ flexDirection: "column" });
      await press(/^Food & Drinks\./);
      const child = screen.getByLabelText(`${label}. CAD -20.00.`);
      expect(within(child).getByText(label)).toBeVisible();
      expect(within(child).getByText("CAD -20.00")).toBeVisible();
      expect(h.load).toHaveBeenCalledTimes(1);
    } finally {
      act(() => Dimensions.set(original));
    }
  });
  it("uses History's calendar Apply/Clear actions, discards dismissed drafts and applies a single day", async () => {
    const h = harness();
    const view = render(<ReportsScreen source={h.source} currency="USD" />);
    await screen.findByText("Salary");
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    await press(/^Date range:/);
    expect(screen.UNSAFE_getByType(DateTimePicker).props).toMatchObject({
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      max: 366
    });
    expect(screen.getAllByRole("button", { name: "Apply" })).toHaveLength(1);
    expect(
      within(screen.getByLabelText("Date range picker")).getByRole("button", {
        name: "Apply"
      })
    ).toBeVisible();
    expect(
      within(screen.getByLabelText("Date range picker")).getByRole("button", {
        name: "Clear"
      })
    ).toBeVisible();
    await edit("2024-02-29");
    expect(
      screen.getByRole("button", {
        name: "Date range: 2026-11-01 – 2026-11-30"
      })
    ).toBeVisible();
    expect(h.load).toHaveBeenCalledTimes(1);
    await press(/^Date range:/);
    expect(
      screen.getByRole("button", {
        name: "Date range: 2026-11-01 – 2026-11-30"
      })
    ).toBeVisible();
    expect(h.load).toHaveBeenCalledTimes(1);
    await press(/^Date range:/);
    expect(screen.UNSAFE_getByType(DateTimePicker).props.startDate).toBe(
      "2026-11-01"
    );
    await edit("2024-02-29");
    await press("Apply");
    await waitFor(() => expect(h.load).toHaveBeenCalledTimes(2));
    expect(h.load).toHaveBeenLastCalledWith({
      from: "2024-02-29",
      to: "2024-02-29",
      currency: "USD"
    });
    expect(screen.queryByLabelText("Date range picker")).toBeNull();
    view.rerender(<ReportsScreen source={h.source} currency="USD" />);
    expect(h.load).toHaveBeenCalledTimes(2);
    await press(/^Date range:/);
    await edit("2024-01-01", "2025-01-02");
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    await act(async () =>
      fireEvent(
        screen.getByLabelText("Date range picker"),
        "accessibilityEscape"
      )
    );
    expect(
      screen.getByRole("button", {
        name: "Date range: 2024-02-29 – 2024-02-29"
      })
    ).toBeVisible();
    await press(/^Date range:/);
    await press("Clear");
    await waitFor(() => expect(h.load).toHaveBeenCalledTimes(3));
    expect(h.load).toHaveBeenLastCalledWith({
      from: undefined,
      to: undefined,
      currency: "USD"
    });
    expect(
      screen.getByRole("button", { name: "Date range: All dates" })
    ).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /^Date range:/ })
    ).toHaveLength(1);
    expect(screen.queryByLabelText("Date range picker")).toBeNull();
    await press(/^Date range:/);
    expect(screen.UNSAFE_getByType(DateTimePicker).props).toMatchObject({
      startDate: undefined,
      endDate: undefined
    });
  });
  it("refreshes after changes, retains applied dates/expansion and rejects stale responses, errors and sources", async () => {
    const h = harness();
    const old = deferred<Report>();
    h.load.mockReturnValueOnce(old.promise);
    const view = render(<ReportsScreen source={h.source} currency="USD" />);
    await act(async () => h.invalidate());
    await screen.findByText("Salary");
    await act(async () => old.reject(new Error("private old error")));
    expect(screen.queryByRole("alert")).toBeNull();
    await press(/^Food & Drinks\./);
    await press(/^Date range:/);
    await edit("2026-11-02", "2026-11-05");
    await press("Apply");
    await screen.findByText("Groceries");
    await act(async () => h.invalidate());
    await screen.findByText("Groceries");
    expect(h.load).toHaveBeenLastCalledWith({
      from: "2026-11-02",
      to: "2026-11-05",
      currency: "USD"
    });
    const pending = deferred<Report>();
    h.load.mockReturnValueOnce(pending.promise);
    await act(async () => h.invalidate());
    const other = harness();
    other.load.mockResolvedValue({
      ...fixture,
      income: { totalMinor: 0, rows: [] }
    });
    view.rerender(<ReportsScreen source={other.source} currency="JPY" />);
    await screen.findByRole("header", { name: /Income\. JPY 0\./ });
    await act(async () => pending.resolve(fixture));
    expect(screen.queryByText("Salary")).toBeNull();
    expect(h.unsubscribe).toHaveBeenCalled();
  });
  it("shows safe errors with retry and empty reports", async () => {
    const h = harness();
    h.load.mockRejectedValueOnce(new Error("private amount 99999"));
    h.load.mockResolvedValue({
      ...fixture,
      income: {
        totalMinor: 0,
        rows: [
          {
            id: "uncategorized",
            name: "Uncategorized income",
            amountMinor: 0,
            children: []
          }
        ]
      },
      expenses: {
        totalMinor: 0,
        rows: [
          {
            id: "uncategorized",
            name: "Uncategorized expenses",
            amountMinor: 0,
            children: []
          }
        ]
      }
    });
    render(<ReportsScreen source={h.source} currency="USD" demo />);
    expect(screen.getByLabelText(/^Loading reports\./)).toBeVisible();
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByText(/99999/)).toBeNull();
    await press("Try again");
    expect(await screen.findByText("No income in this period.")).toBeVisible();
    expect(screen.getByText("No expenses in this period.")).toBeVisible();
    expect(screen.queryByText("Uncategorized income")).toBeNull();
    expect(screen.queryByText("Uncategorized expenses")).toBeNull();
    expect(screen.getByText(/Demo ·/)).toBeVisible();
  });
  it("shows empty messages independently and removes the currency banner, refresh control and comparison note", async () => {
    const h = harness();
    h.load.mockResolvedValue({
      ...fixture,
      income: {
        totalMinor: 0,
        rows: fixture.income.rows.map((row) => ({ ...row, amountMinor: 0 }))
      }
    });
    render(<ReportsScreen source={h.source} currency="CAD" />);
    expect(await screen.findByText("No income in this period.")).toBeVisible();
    expect(screen.getByText("Food & Drinks")).toBeVisible();
    expect(screen.queryByText("No expenses in this period.")).toBeNull();
    expect(screen.queryByText(/One currency at a time/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Refresh reports" })
    ).toBeNull();
    expect(screen.queryByText(/Compared with|A dash means/)).toBeNull();
  });
});
