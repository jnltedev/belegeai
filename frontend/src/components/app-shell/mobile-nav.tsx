"use client";

import { useEffect, useState } from "react";
import { Archive, Menu, X } from "lucide-react";
import { NavLinks } from "./nav-items";
import { useTranslation } from "@/lib/i18n/client";

// Everything reachable from the desktop sidebar, reachable here too - the
// sidebar is hidden below md, this is its only mobile equivalent.
export function MobileNav({ isAdmin, logoUrl }: { isAdmin: boolean; logoUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("mobileNav.open")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground"
      >
        <Menu className="h-5 w-5" strokeWidth={2} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("mobileNav.dialogLabel")}
        className={`fixed left-0 top-0 z-50 flex h-full w-64 max-w-[80vw] flex-col bg-surface-2 shadow-elevated transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between gap-2.5 px-4">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Archive className="h-4.5 w-4.5" strokeWidth={2.25} />
              </div>
            )}
            <span className="text-sm font-semibold tracking-tight">Belege-Archiv</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("mobileNav.close")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
          <NavLinks isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
        </nav>
      </div>
    </div>
  );
}
