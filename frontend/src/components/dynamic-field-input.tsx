"use client";

import { Input, Label } from "@/components/ui/input";
import { SenderPicker } from "@/components/sender-picker";
import { useTranslation } from "@/lib/i18n/client";
import type { DocumentTypeField } from "@/lib/types";

interface CurrencyValue {
  amount: string;
  currency: string;
}

function isCurrencyValue(value: unknown): value is CurrencyValue {
  return typeof value === "object" && value !== null && "amount" in value;
}

interface DynamicFieldInputProps {
  field: DocumentTypeField;
  value: unknown;
  onChange: (value: unknown) => void;
  idPrefix: string;
}

export function DynamicFieldInput({ field, value, onChange, idPrefix }: DynamicFieldInputProps) {
  const { t } = useTranslation();
  const id = `${idPrefix}-${field.key}`;

  if (field.type === "currency") {
    const current = isCurrencyValue(value) ? value : { amount: "", currency: "EUR" };
    return (
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor={id}>{field.label}</Label>
          <Input
            id={id}
            type="number"
            step="0.01"
            value={current.amount}
            onChange={(e) => onChange({ ...current, amount: e.target.value })}
          />
        </div>
        <div className="w-20">
          <Label htmlFor={`${id}-currency`}>{t("dynamicFieldInput.currencyLabel")}</Label>
          <Input
            id={`${id}-currency`}
            value={current.currency}
            onChange={(e) => onChange({ ...current, currency: e.target.value })}
          />
        </div>
      </div>
    );
  }

  if (field.type === "sender") {
    return (
      <div>
        <Label htmlFor={id}>{field.label}</Label>
        <SenderPicker value={typeof value === "string" ? value : ""} onChange={onChange} />
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div>
        <Label htmlFor={id}>{field.label}</Label>
        <Input
          id={id}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor={id}>{field.label}</Label>
      <Input id={id} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
