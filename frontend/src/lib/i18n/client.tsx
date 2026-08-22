"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./locale";
import { translate } from "./dictionaries";

interface LocaleContextValue {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// `locale` always comes from a server component prop (see app/layout.tsx),
// never held in local state - a language change triggers router.refresh(),
// the server re-resolves the session's language, and this just re-renders
// with the new prop. No client-side sync logic needed.
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: (key, vars) => translate(locale, key, vars) }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useTranslation(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useTranslation() must be used within a LocaleProvider");
  return ctx;
}
