import { adjacentMonth, currentMonth, monthRange } from "./dashboard-data";
import { validDateFilter } from "./transaction-data";

export type ReportRange = { from: string; to: string };

export function initialReportRange(now = new Date()): ReportRange {
  return monthRange(currentMonth(now));
}

// UTC is used only as a calendar-day counter. Accounting date strings never
// pass through the device timezone; entry defaults use its local calendar.
export function comparisonRange(range: ReportRange): ReportRange | null {
  if (!range.from || !range.to || !validDateFilter(range)) return null;
  const month = range.from.slice(0, 7);
  const complete = monthRange(month);
  if (range.from === complete.from && range.to === complete.to) {
    const previous = adjacentMonth(month, -1);
    return previous ? monthRange(previous) : null;
  }
  const day = 86_400_000;
  const first = Date.parse(range.from);
  const length = (Date.parse(range.to) - first) / day + 1;
  const start = new Date(first - length * day).toISOString().slice(0, 10);
  const end = new Date(first - day).toISOString().slice(0, 10);
  const previous = { from: start, to: end };
  return start >= "0001-01-01" && validDateFilter(previous) ? previous : null;
}

export function percentageChange(current: number, previous: number | null) {
  return previous === null || previous === 0
    ? null
    : ((current - previous) / previous) * 100;
}

export function changeDescription(
  current: number,
  previous: number | null,
  expense: boolean
) {
  const value = percentageChange(current, previous);
  if (value === null)
    return {
      label: "—",
      description: "Comparison unavailable: no nonzero baseline",
      tone: "neutral" as const
    };
  const label = `${value >= 0 ? "+" : "−"}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  const tone =
    value === 0
      ? "neutral"
      : (expense ? value < 0 : value > 0)
        ? "good"
        : "bad";
  return {
    label,
    description: `${expense ? "Spending" : "Income"} ${value === 0 ? "unchanged" : value > 0 ? "increased" : "decreased"} by ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}% compared with the preceding period`,
    tone
  };
}
