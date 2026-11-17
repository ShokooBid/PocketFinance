import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, {
  useDefaultStyles,
  type CalendarDay
} from "react-native-ui-datepicker";
import {
  calendarMonthRows,
  dateRangeForApply,
  pickerDate,
  type PickerRange
} from "./date-picker-data";
import { theme } from "./theme";
import { Button } from "./ui";

type PickerProps = ComponentProps<typeof DateTimePicker>;
type PickerSelection = Parameters<NonNullable<PickerProps["onChange"]>>[0];

// The library does not notify onMonthChange when its arrow buttons are used.
// Observe the month actually rendered so sizing also follows arrows and years.
function VisibleCalendarMonth({
  month,
  onChange,
  children
}: {
  month: string;
  onChange: (month: string) => void;
  children: ReactNode;
}) {
  useLayoutEffect(() => onChange(month), [month, onChange]);
  return children;
}

export function DatePicker({
  children,
  ...props
}: PickerProps & { children?: ReactNode }) {
  const defaults = useDefaultStyles("light");
  const fitMonth =
    props.mode === "range" && props.containerHeight === undefined;
  const [visibleMonth, setVisibleMonth] = useState(() =>
    (pickerDate(props.startDate) ?? pickerDate(new Date())!).slice(0, 7)
  );
  const weekdaysHeight = props.hideWeekdays ? 0 : (props.weekdaysHeight ?? 25);
  const monthHeight =
    weekdaysHeight +
    calendarMonthRows(visibleMonth, props.firstDayOfWeek) * theme.touchTarget;
  const current = useRef(props);
  current.current = props;
  // The library retains its initial selection callback. Forward to the latest
  // draft/disabled state while the inline calendar stays mounted.
  const onChange = useCallback((selection: PickerSelection) => {
    const latest = current.current;
    if (latest.mode === "single" && "date" in selection)
      latest.onChange?.(selection);
    else if (latest.mode === "range" && "startDate" in selection)
      latest.onChange?.(selection);
    else if (latest.mode === "multiple" && "dates" in selection)
      latest.onChange?.(selection);
  }, []);
  const calendarStyles = {
    ...defaults,
    // Navigation icons follow the system scheme independently of
    // useDefaultStyles("light"). Keep them visible on our white surface.
    button_prev: styles.navigationButton,
    button_next: styles.navigationButton,
    button_prev_image: styles.navigationIcon,
    button_next_image: styles.navigationIcon,
    ...(fitMonth && {
      days: { ...defaults.days, height: "auto" as const },
      day_cell: { ...defaults.day_cell, minHeight: theme.touchTarget }
    }),
    selected: { backgroundColor: theme.color.primary, borderRadius: 12 },
    selected_label: { color: theme.color.onPrimary },
    range_fill: { backgroundColor: theme.color.primarySoft },
    range_start_label: { color: theme.color.onPrimary },
    range_end_label: { color: theme.color.onPrimary },
    today: { borderColor: theme.color.primary, borderWidth: 1 },
    today_label: { color: theme.color.primary }
  };
  function renderDay(day: CalendarDay) {
    const label = props.components?.Day ? (
      props.components.Day(day)
    ) : (
      <Text
        style={[
          calendarStyles.day_label,
          day.isToday && calendarStyles.today_label,
          !day.isCurrentMonth && calendarStyles.outside_label,
          day.isSelected && calendarStyles.selected_label,
          day.isDisabled && calendarStyles.disabled_label,
          day.inMiddle && calendarStyles.range_middle_label,
          day.rangeStart && calendarStyles.range_start_label,
          day.rangeEnd && calendarStyles.range_end_label
        ]}
      >
        {day.text}
      </Text>
    );
    // The library's dayOfMonth includes the grid's leading empty cells.
    const month =
      day.isCurrentMonth && day.number === 1
        ? pickerDate(day.date)?.slice(0, 7)
        : undefined;
    return month ? (
      <VisibleCalendarMonth month={month} onChange={setVisibleMonth}>
        {label}
      </VisibleCalendarMonth>
    ) : (
      label
    );
  }
  return (
    <View style={styles.calendar}>
      <DateTimePicker
        {...props}
        {...(fitMonth && { containerHeight: monthHeight })}
        onChange={onChange}
        styles={calendarStyles}
        components={{
          ...props.components,
          ...(fitMonth && { Day: renderDay })
        }}
      />
      {children}
    </View>
  );
}

export function SingleDateField({
  value,
  onChange,
  disabled = false,
  renderTrigger
}: {
  value: string;
  onChange: (date: string) => void;
  disabled?: boolean;
  renderTrigger?: (toggle: () => void, expanded: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggle = () => {
    if (!disabled) setOpen((current) => !current);
  };
  return (
    <>
      {renderTrigger ? (
        renderTrigger(toggle, open)
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose transaction date"
          accessibilityHint={value}
          accessibilityState={{ disabled, expanded: open }}
          disabled={disabled}
          onPress={toggle}
          style={styles.trigger}
        >
          <Text style={styles.label}>Date: {value}</Text>
        </Pressable>
      )}
      {open && (
        <DatePicker
          mode="single"
          date={value}
          onChange={({ date }) => {
            const next = pickerDate(date);
            if (!disabled && next) {
              onChange(next);
              setOpen(false);
            }
          }}
        />
      )}
    </>
  );
}

export function RangeDatePicker({
  from,
  to,
  disabled,
  onChange,
  onClose
}: {
  from: string | undefined;
  to: string | undefined;
  disabled: boolean;
  onChange: (range: PickerRange) => void;
  onClose: () => void;
}) {
  const [range, setRange] = useState({ from, to });
  const selection = dateRangeForApply(range);
  function select(next: PickerRange) {
    if (disabled) return;
    onChange(next);
    onClose();
  }
  return (
    <View
      accessibilityLabel="Date range picker"
      onAccessibilityEscape={onClose}
    >
      <DatePicker
        mode="range"
        startDate={range.from}
        endDate={range.to}
        allowRangeReset
        max={366}
        onChange={({ startDate, endDate }) => {
          if (disabled) return;
          setRange({ from: pickerDate(startDate), to: pickerDate(endDate) });
        }}
      >
        <View style={styles.rangeActions}>
          <View style={styles.rangeAction}>
            <Button
              label="Clear"
              hint="Remove the date filter and show all dates"
              variant="outline"
              size="compact"
              disabled={disabled}
              onPress={() => select({ from: undefined, to: undefined })}
            />
          </View>
          <View style={styles.rangeAction}>
            <Button
              label="Apply"
              hint={
                range.from && !range.to
                  ? "Apply the selected day, or choose another date for a range"
                  : "Apply the selected date range"
              }
              variant="primary"
              size="compact"
              disabled={disabled || !selection}
              onPress={() => {
                if (selection) select(selection);
              }}
            />
          </View>
        </View>
      </DatePicker>
    </View>
  );
}

const styles = StyleSheet.create({
  navigationButton: {
    minWidth: theme.touchTarget,
    minHeight: theme.touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: theme.color.primarySoft
  },
  navigationIcon: { width: 20, height: 20, tintColor: theme.color.primary },
  rangeActions: {
    flexDirection: "row",
    gap: 8
  },
  rangeAction: { flex: 1, minWidth: 0, paddingVertical: 4 },
  calendar: {
    padding: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.color.softBorder,
    backgroundColor: theme.color.surface
  },
  trigger: {
    minHeight: theme.touchTarget,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.color.softBorder,
    backgroundColor: theme.color.primarySoft,
    justifyContent: "center"
  },
  label: { color: theme.color.text, fontSize: 16 }
});
