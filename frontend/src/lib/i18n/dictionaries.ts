import de from "./messages/de.json";
import en from "./messages/en.json";
import type { Locale } from "./locale";

export const dictionaries: Record<Locale, Record<string, string>> = { de, en };

// Used by both server components (called directly with an explicit locale)
// and the client hook in client.tsx (which binds locale via context) - one
// implementation, two call shapes, so there's never a formatting mismatch
// between server- and client-rendered text for the same key.
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let template = dictionaries[locale][key];
  if (template === undefined) {
    // Missing translation shouldn't surface a raw key to the user - fall
    // back to German (the app's original language, so it's always fully
    // populated) rather than showing "chatWidget.send" in the UI.
    template = dictionaries.de[key] ?? key;
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] missing key "${key}" for locale "${locale}"`);
    }
  }
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ""));
}
