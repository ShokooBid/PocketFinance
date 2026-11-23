import { act, fireEvent, screen } from "@testing-library/react-native";
import DateTimePicker from "react-native-ui-datepicker";

// Exercise the library's public selection callback in longer finance flows.
// The date-picker tests separately exercise its real calendar buttons.
async function chooseSingleDate(label: string, date: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: label }));
  });
  await act(async () => {
    fireEvent(screen.UNSAFE_getByType(DateTimePicker), "change", {
      date: new Date(`${date}T12:00:00`)
    });
  });
}

export function chooseTransactionDate(date: string) {
  return chooseSingleDate("Choose transaction date", date);
}

export function chooseAccountOpeningDate(date: string) {
  return chooseSingleDate("Choose account opening date", date);
}

export async function chooseDateRange(from: string, to: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: /^Date range:/ }));
  });
  await act(async () => {
    fireEvent(screen.UNSAFE_getByType(DateTimePicker), "change", {
      startDate: new Date(`${from}T12:00:00`),
      endDate: new Date(`${to}T12:00:00`)
    });
  });
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Apply" }));
  });
}
