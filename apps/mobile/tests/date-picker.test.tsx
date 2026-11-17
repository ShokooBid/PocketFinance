import { describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  within
} from "@testing-library/react-native";
import { Image, StyleSheet, useColorScheme } from "react-native";
import DateTimePicker from "react-native-ui-datepicker";
import {
  calendarMonthRows,
  dateRangeForApply,
  pickerDate
} from "../src/date-picker-data";
import { RangeDatePicker, SingleDateField } from "../src/date-picker";
import { theme } from "../src/theme";

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light")
}));

async function press(name: string) {
  await act(async () => fireEvent.press(screen.getByRole("button", { name })));
}

function expectVisibleNavigation() {
  for (const name of ["Prev", "Next"]) {
    const button = screen.getByRole("button", { name });
    expect(button).toBeEnabled();
    const icon = within(button).UNSAFE_getByType(Image);
    expect(StyleSheet.flatten(icon.props.style)).toEqual(
      expect.objectContaining({ tintColor: theme.color.primary })
    );
  }
}

describe("date picker integration", () => {
  it("counts actual weeks for four-, five- and six-row months, leap years and different week starts", () => {
    expect(calendarMonthRows("2026-02")).toBe(4);
    expect(calendarMonthRows("2026-12")).toBe(5);
    expect(calendarMonthRows("2026-08")).toBe(6);
    expect(calendarMonthRows("2024-02")).toBe(5);
    expect(calendarMonthRows("2021-02", 1)).toBe(4);
    expect(calendarMonthRows("2021-02", 0)).toBe(5);
  });

  it("fits the displayed weeks with constant day heights after arrow, month and year navigation", async () => {
    const onChange = jest.fn();
    render(
      <RangeDatePicker
        from="2026-01-10"
        to="2026-01-11"
        disabled={false}
        onChange={onChange}
        onClose={() => {}}
      />
    );
    function expectRows(count: number) {
      const calendar = screen.UNSAFE_getByType(DateTimePicker);
      expect(calendar.props.containerHeight).toBe(
        25 + count * theme.touchTarget
      );
      expect(calendar.props.styles.day_cell.minHeight).toBe(theme.touchTarget);
    }
    expectRows(5);
    await press("Next");
    expect(screen.getByRole("button", { name: "February" })).toBeTruthy();
    expectRows(4);
    await press("Next");
    expectRows(5);
    await press("March");
    await press("August");
    expect(screen.getByTestId("btn-month")).toHaveProp(
      "accessibilityLabel",
      "August"
    );
    expect(screen.getByTestId("btn-year")).toHaveProp(
      "accessibilityLabel",
      "2026"
    );
    expectRows(6);
    await press("Next");
    expectRows(5);
    await press("Prev");
    expectRows(6);
    await press("2026");
    await press("2027");
    expectRows(5);
    await press("2");
    await press("6");
    expect(onChange).not.toHaveBeenCalled();
    await press("Apply");
    expect(onChange).toHaveBeenCalledWith({
      from: "2027-08-02",
      to: "2027-08-06"
    });
  }, 15000);

  it.each(["light", "dark"] as const)(
    "shows month navigation in Add with the %s system theme and selects a date after navigating",
    async (scheme) => {
      jest.mocked(useColorScheme).mockReturnValue(scheme);
      const onChange = jest.fn();
      render(<SingleDateField value="2026-01-10" onChange={onChange} />);
      await press("Choose transaction date");
      for (const name of ["Clear", "Apply", "Cancel date selection"])
        expect(screen.queryByRole("button", { name })).toBeNull();
      expectVisibleNavigation();
      await press("Prev");
      expect(screen.getByRole("button", { name: "December" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "2025" })).toBeTruthy();
      await press("Next");
      await press("Next");
      expect(screen.getByRole("button", { name: "February" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "2026" })).toBeTruthy();
      expect(onChange).not.toHaveBeenCalled();
      await press("12");
      expect(onChange).toHaveBeenCalledWith("2026-02-12");
      expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    },
    15000
  );

  it.each(["light", "dark"] as const)(
    "shows month navigation in History with the %s system theme and selects a range across years",
    async (scheme) => {
      jest.mocked(useColorScheme).mockReturnValue(scheme);
      const onChange = jest.fn(),
        onClose = jest.fn();
      render(
        <RangeDatePicker
          from="2026-01-10"
          to="2026-01-11"
          disabled={false}
          onChange={onChange}
          onClose={onClose}
        />
      );
      expectVisibleNavigation();
      await press("Prev");
      expect(screen.getByRole("button", { name: "December" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "2025" })).toBeTruthy();
      await press("30");
      await press("Next");
      expect(screen.getByRole("button", { name: "January" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "2026" })).toBeTruthy();
      expect(onChange).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      await press("2");
      expect(onChange).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      await press("Apply");
      expect(onChange).toHaveBeenCalledWith({
        from: "2025-12-30",
        to: "2026-01-02"
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    },
    15000
  );

  it("normalizes single-day drafts and rejects invalid or overlong ranges before applying", () => {
    expect(dateRangeForApply({ from: "2026-01-10", to: undefined })).toEqual({
      from: "2026-01-10",
      to: "2026-01-10"
    });
    expect(dateRangeForApply({ from: "2025-12-30", to: "2026-01-02" })).toEqual(
      { from: "2025-12-30", to: "2026-01-02" }
    );
    for (const range of [
      { from: undefined, to: undefined },
      { from: undefined, to: "2026-01-10" },
      { from: "2026-02-30", to: undefined },
      { from: "2026-01-10", to: "2026-01-09" },
      { from: "2026-01-01", to: "2027-01-03" }
    ])
      expect(dateRangeForApply(range)).toBeUndefined();
  });

  it("requires a selection before Apply and supports applying a single day", async () => {
    const onChange = jest.fn(),
      onClose = jest.fn();
    render(
      <RangeDatePicker
        from={undefined}
        to={undefined}
        disabled={false}
        onChange={onChange}
        onClose={onClose}
      />
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    for (const name of [
      "All dates",
      "Use selected day",
      "Cancel date selection"
    ])
      expect(screen.queryByRole("button", { name })).toBeNull();
    await press("10");
    expect(onChange).not.toHaveBeenCalled();
    await press("Apply");
    const selected = onChange.mock.calls[0]?.[0];
    expect(selected).toEqual({
      from: expect.stringMatching(/^\d{4}-\d{2}-10$/),
      to: expect.stringMatching(/^\d{4}-\d{2}-10$/)
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clears the date filter and closes even with a partial draft", async () => {
    const onChange = jest.fn(),
      onClose = jest.fn();
    render(
      <RangeDatePicker
        from="2026-01-10"
        to="2026-01-11"
        disabled={false}
        onChange={onChange}
        onClose={onClose}
      />
    );
    await press("12");
    expect(onChange).not.toHaveBeenCalled();
    await press("Clear");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ from: undefined, to: undefined });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps range actions disabled while saving and applies with the latest callbacks", async () => {
    const first = jest.fn(),
      latest = jest.fn(),
      onClose = jest.fn();
    const view = render(
      <RangeDatePicker
        from="2026-01-10"
        to="2026-01-11"
        disabled={false}
        onChange={first}
        onClose={onClose}
      />
    );
    await press("12");
    view.rerender(
      <RangeDatePicker
        from="2026-01-10"
        to="2026-01-11"
        disabled
        onChange={latest}
        onClose={onClose}
      />
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    await press("16");
    await press("Apply");
    await press("Clear");
    expect(first).not.toHaveBeenCalled();
    expect(latest).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    view.rerender(
      <RangeDatePicker
        from="2026-01-10"
        to="2026-01-11"
        disabled={false}
        onChange={latest}
        onClose={onClose}
      />
    );
    await press("15");
    expect(latest).not.toHaveBeenCalled();
    await press("Apply");
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith({
      from: "2026-01-12",
      to: "2026-01-15"
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 15000);

  it("keeps calendar dates stable across local Date, timestamp and string values", () => {
    for (const date of [
      "2024-02-29",
      "2024-03-10",
      "2024-11-03",
      "2026-01-01"
    ]) {
      const local = new Date(`${date}T00:00:00`);
      expect(pickerDate(local)).toBe(date);
      expect(pickerDate(local.getTime())).toBe(date);
      expect(pickerDate(date)).toBe(date);
    }
    for (const invalid of [
      undefined,
      null,
      "",
      "2023-02-29",
      "2024-02-30",
      new Date(NaN)
    ])
      expect(pickerDate(invalid)).toBeUndefined();
  });

  it("uses the real single-date calendar, closes on selection and supports a changed edit date", async () => {
    const onChange = jest.fn();
    const view = render(
      <SingleDateField value="2024-02-10" onChange={onChange} />
    );
    await act(async () =>
      fireEvent.press(
        screen.getByRole("button", { name: "Choose transaction date" })
      )
    );
    expect(onChange).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.press(screen.getByRole("button", { name: "29" }))
    );
    expect(onChange).toHaveBeenLastCalledWith("2024-02-29");
    expect(
      screen.queryByRole("button", { name: "Cancel date selection" })
    ).toBeNull();
    view.rerender(<SingleDateField value="2024-03-10" onChange={onChange} />);
    await act(async () =>
      fireEvent.press(
        screen.getByRole("button", { name: "Choose transaction date" })
      )
    );
    await act(async () =>
      fireEvent.press(screen.getByRole("button", { name: "11" }))
    );
    expect(onChange).toHaveBeenLastCalledWith("2024-03-11");
  }, 15000);

  it("dismisses from the date field without changing the date and prevents selection while saving", async () => {
    const onChange = jest.fn();
    const view = render(
      <SingleDateField value="2024-02-10" onChange={onChange} />
    );
    await act(async () =>
      fireEvent.press(
        screen.getByRole("button", { name: "Choose transaction date" })
      )
    );
    await act(async () =>
      fireEvent.press(
        screen.getByRole("button", { name: "Choose transaction date" })
      )
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    view.rerender(
      <SingleDateField value="2024-02-10" onChange={onChange} disabled />
    );
    expect(
      screen.getByRole("button", { name: "Choose transaction date" })
    ).toBeDisabled();
  });

  it("uses the latest draft callback and disabled state while the calendar is open", async () => {
    const first = jest.fn(),
      latest = jest.fn();
    const view = render(
      <SingleDateField value="2024-02-10" onChange={first} />
    );
    await act(async () =>
      fireEvent.press(
        screen.getByRole("button", { name: "Choose transaction date" })
      )
    );
    view.rerender(<SingleDateField value="2024-02-10" onChange={latest} />);
    await act(async () =>
      fireEvent.press(screen.getByRole("button", { name: "11" }))
    );
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith("2024-02-11");
    await act(async () =>
      fireEvent.press(
        screen.getByRole("button", { name: "Choose transaction date" })
      )
    );
    view.rerender(
      <SingleDateField value="2024-02-10" onChange={latest} disabled />
    );
    await act(async () =>
      fireEvent.press(screen.getByRole("button", { name: "12" }))
    );
    expect(latest).toHaveBeenCalledTimes(1);
  }, 15000);
});
