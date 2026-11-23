import { useState } from "react";
import { Body, Button } from "./ui";
import { currencyExponents, type Currency } from "./transaction-data";

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
  return (
    <>
      <Body>
        Choose the currency you will use for your accounts and transactions.
      </Body>
      <Body>This choice is permanent. Review it before confirming.</Body>
      {(Object.keys(currencyExponents) as Currency[]).map((currency) => (
        <Button
          key={currency}
          label={`Choose currency ${currency}`}
          selected={currency === selected}
          disabled={disabled}
          onPress={() => setSelected(currency)}
        />
      ))}
      <Button
        label={`Confirm ${selected} permanently`}
        variant="primary"
        disabled={disabled}
        onPress={() => void onConfirm(selected)}
      />
    </>
  );
}
