import { useCallback, useEffect, useRef, useState } from "react";
import {
  currentMonth,
  dashboardFailureMessage,
  monthRange
} from "./dashboard-data";
import type { Report, ReportSource } from "./report-data";
import type { Currency } from "./transaction-data";
import type { PickerRange } from "./date-picker-data";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Report; key: string; source: ReportSource };

export function useReport(source: ReportSource, currency: Currency) {
  const [range, setRange] = useState<PickerRange>(() =>
    monthRange(currentMonth())
  );
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  const sequence = useRef(0);
  const key = `${range.from}_${range.to}_${currency}`;
  const refresh = useCallback(() => {
    sequence.current++;
    setState({ status: "loading" });
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => source.subscribe(refresh), [source, refresh]);
  useEffect(() => {
    const request = ++sequence.current;
    let cancelled = false;
    setState({ status: "loading" });
    void source.load({ ...range, currency }).then(
      (data) => {
        if (!cancelled && request === sequence.current)
          setState({ status: "ready", data, key, source });
      },
      (error: unknown) => {
        if (!cancelled && request === sequence.current)
          setState({
            status: "error",
            message: dashboardFailureMessage(error)
          });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [source, range, currency, key, revision]);
  const report =
    state.status === "ready" && state.key === key && state.source === source
      ? state.data
      : null;
  return { range, apply: setRange, report, state, refresh };
}
