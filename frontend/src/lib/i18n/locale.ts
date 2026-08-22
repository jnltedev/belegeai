export type Locale = "de" | "en";

export const LOCALES: Locale[] = ["de", "en"];

export function isLocale(value: string | null | undefined): value is Locale {
  return value != null && (LOCALES as string[]).includes(value);
}
