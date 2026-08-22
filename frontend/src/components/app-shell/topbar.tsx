"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogOut, Moon, Sun, ChevronDown, Search, Languages } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { MobileNav } from "./mobile-nav";
import { ACTIVE_CHAT_SESSION_KEY } from "@/components/chat-widget";
import { api } from "@/lib/api";
import type { SessionUser } from "@/lib/session";
import { useTranslation } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

const LANGUAGE_LABELS: Record<Locale, string> = { de: "Deutsch", en: "English" };

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Topbar({ user, isAdmin, logoUrl }: { user: SessionUser; isAdmin: boolean; logoUrl: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(pathname === "/documents" ? (searchParams.get("search") ?? "") : "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Never while the user is typing in it. applySearch() navigates, and the
    // route echoes back through searchParams a moment later - by then more
    // characters have usually arrived, and writing the older URL value back
    // over them is what swallowed them ("20.03.2026" ending up "2003.2026").
    if (searchRef.current !== null && document.activeElement === searchRef.current) return;
    setQuery(pathname === "/documents" ? (searchParams.get("search") ?? "") : "");
  }, [pathname, searchParams]);

  function applySearch(value: string) {
    const params = new URLSearchParams(pathname === "/documents" ? searchParams.toString() : "");
    if (value) params.set("search", value);
    else params.delete("search");
    const qs = params.toString();
    router.push(qs ? `/documents?${qs}` : "/documents");
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applySearch(value), 300);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applySearch(query);
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    await api.post("/api/auth/logout");
    // A shared browser profile shouldn't resume the previous account's chat
    // session on the next login - the messages themselves stay server-side
    // either way, this only clears the "which session was active" pointer.
    try {
      localStorage.removeItem(ACTIVE_CHAT_SESSION_KEY);
    } catch {
      // ignore
    }
    router.push("/login");
    router.refresh();
  }

  async function handleLanguageChange(language: Locale) {
    if (language === user.language || languageSaving) return;
    setLanguageSaving(true);
    try {
      await api.patch("/api/auth/language", { language });
      // Server components (including this layout's own session read) need a
      // fresh render to pick up the new language - client components under
      // LocaleProvider then re-render automatically via its updated prop.
      router.refresh();
    } finally {
      setLanguageSaving(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface px-4 md:gap-4 md:px-6">
      <MobileNav isAdmin={isAdmin} logoUrl={logoUrl} />
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" strokeWidth={2} />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder={t("topbar.searchPlaceholder")}
            className="w-full rounded-lg border border-border bg-surface-2 py-1.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </form>
      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-surface-hover"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
            {initials(user.name)}
          </div>
          <ChevronDown className={`h-3.5 w-3.5 text-muted transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-2 w-56 rounded-card border border-border bg-surface py-1.5 shadow-elevated"
          >
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted">{user.email}</p>
              </div>
            </div>

            <div className="my-1.5 h-px bg-border" />

            <div className="px-3 py-1.5">
              <p className="mb-1.5 flex items-center gap-2.5 text-sm text-foreground">
                <Languages className="h-4 w-4 text-muted" strokeWidth={2} />
                {t("topbar.userMenu.language")}
              </p>
              <div className="flex gap-1.5 pl-7">
                {(Object.keys(LANGUAGE_LABELS) as Locale[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    role="menuitemradio"
                    aria-checked={user.language === lang}
                    disabled={languageSaving}
                    onClick={() => handleLanguageChange(lang)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      user.language === lang
                        ? "border-accent bg-accent/10 font-medium text-accent"
                        : "border-border text-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    {LANGUAGE_LABELS[lang]}
                  </button>
                ))}
              </div>
            </div>

            <div className="my-1.5 h-px bg-border" />

            <button
              type="button"
              role="menuitem"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition hover:bg-surface-hover"
            >
              {isDark ? <Sun className="h-4 w-4 text-muted" strokeWidth={2} /> : <Moon className="h-4 w-4 text-muted" strokeWidth={2} />}
              {isDark ? t("topbar.userMenu.lightTheme") : t("topbar.userMenu.darkTheme")}
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition hover:bg-surface-hover"
            >
              <LogOut className="h-4 w-4 text-muted" strokeWidth={2} />
              {t("topbar.userMenu.logout")}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
