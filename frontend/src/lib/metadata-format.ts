import type { DocumentTypeField } from "@/lib/types";
import type { Locale } from "@/lib/i18n/locale";

const NUMBER_LOCALES: Record<Locale, string> = { de: "de-DE", en: "en-US" };

export function formatFieldValue(field: DocumentTypeField, value: unknown, locale: Locale): string {
  if (value === null || value === undefined) return "-";

  if (field.type === "currency") {
    const v = value as { amount?: string; currency?: string | null };
    if (!v?.amount) return "-";
    return new Intl.NumberFormat(NUMBER_LOCALES[locale], { style: "currency", currency: v.currency ?? "EUR" }).format(
      Number(v.amount),
    );
  }

  if (field.type === "date") {
    if (typeof value !== "string" || !value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(NUMBER_LOCALES[locale]);
  }

  return typeof value === "string" ? value : String(value);
}
