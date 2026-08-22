"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useTranslation } from "@/lib/i18n/client";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? t("themeToggle.switchToLight") : t("themeToggle.switchToDark")}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:bg-surface-hover hover:text-foreground"
    >
      {isDark ? <Sun className="h-4 w-4" strokeWidth={1.8} /> : <Moon className="h-4 w-4" strokeWidth={1.8} />}
    </button>
  );
}
