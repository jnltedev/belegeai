export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "belegeai-theme";

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}
