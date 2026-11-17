import type { DateType } from "react-native-ui-datepicker";
import { localDate } from "./entry-data";
import { calendarDate, validDateFilter } from "./transaction-data";

export type PickerRange = {
  from: string | undefined;
  to: string | undefined;
};

export function calendarMonthRows(month: string, firstDayOfWeek = 0): number {
  const first = new Date(`${month}-01T00:00:00Z`);
  const last = new Date(first);
  last.setUTCMonth(first.getUTCMonth() + 1, 0);
  const offset = (first.getUTCDay() - firstDayOfWeek + 7) % 7;
  return Math.ceil((offset + last.getUTCDate()) / 7);
}

// Applying one selected date preserves single-day filtering without a third
// action. Empty selections are handled explicitly by Clear.
export function dateRangeForApply(range: PickerRange) {
  if (!range.from) return undefined;
  const selection = { from: range.from, to: range.to ?? range.from };
  return validDateFilter(selection) ? selection : undefined;
}

// Accounting dates have no time zone. Keep date-only strings intact and read
// the local calendar fields of the Date objects returned by the picker.
export function pickerDate(value: DateType): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const date = value.slice(0, 10);
    return calendarDate.safeParse(date).success ? date : undefined;
  }
  const date =
    typeof value === "object" && !(value instanceof Date)
      ? value.format("YYYY-MM-DD")
      : localDate(new Date(value));
  return calendarDate.safeParse(date).success ? date : undefined;
}
