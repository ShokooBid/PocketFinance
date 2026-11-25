import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Body, Button, Dropdown } from "./ui";
import { theme } from "./theme";
import { currencyExponents, type Currency } from "./transaction-data";

const options = (Object.keys(currencyExponents) as Currency[]).map((value) => ({
  value,
  label: value,
  emphasized: true
}));

// Selection is local until explicit confirmation. CAD is a suggestion, never an
// implicit saved preference.
export function CurrencySelection({
  onConfirm,
  disabled
}: {
  onConfirm: (currency: Currency) => Promise<void>;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<Currency>("CAD");
  const [open, setOpen] = useState(false);
  const expanded = open && !disabled;
  const close = () => setOpen(false);
  return (
    <>
      <Body>
        Choose the currency you will use for your accounts and transactions.
      </Body>
      <Body>This choice is permanent. Review it before confirming.</Body>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel="Currency"
        accessibilityValue={{ text: selected }}
        accessibilityState={{ expanded, disabled }}
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        onAccessibilityEscape={close}
        style={[styles.control, disabled && styles.disabled]}
      >
        <Text style={styles.label}>{selected}</Text>
        <Text accessible={false} style={styles.label}>
          {expanded ? "⌃" : "⌄"}
        </Text>
      </Pressable>
      {expanded && (
        <Dropdown
          label="Supported currencies"
          options={options}
          selected={selected}
          disabled={disabled}
          onClose={close}
          onSelect={(currency) => {
            setSelected(currency);
            close();
          }}
        />
      )}
      <Button
        label={`Confirm ${selected} permanently`}
        variant="primary"
        disabled={disabled}
        onPress={() => {
          close();
          void onConfirm(selected);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  control: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: theme.touchTarget,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.pillRadius,
    backgroundColor: theme.color.surface
  },
  label: {
    color: theme.color.text,
    fontSize: theme.font.body,
    fontWeight: "700"
  },
  disabled: { opacity: 0.6 }
});
