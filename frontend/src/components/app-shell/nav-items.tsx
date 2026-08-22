"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Files, Upload, ShieldCheck, Inbox, Tag, Building2 } from "lucide-react";
import { useQueueCount } from "@/lib/use-queue-count";
import { useTranslation } from "@/lib/i18n/client";

export const NAV_ITEMS = [
  { href: "/documents", labelKey: "nav.documents", icon: Files },
  { href: "/import-queue", labelKey: "nav.importQueue", icon: Inbox },
  { href: "/upload", labelKey: "nav.upload", icon: Upload },
  { href: "/tags", labelKey: "nav.tags", icon: Tag },
  { href: "/senders", labelKey: "nav.senders", icon: Building2 },
];

// The actual nav links, shared by the desktop sidebar and the mobile menu -
// same items, same active/badge state, so the two can never drift apart.
export function NavLinks({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const queueCount = useQueueCount();
  const { t } = useTranslation();
  const items = isAdmin ? [...NAV_ITEMS, { href: "/admin", labelKey: "nav.admin", icon: ShieldCheck }] : NAV_ITEMS;

  return (
    <>
      {items.map((item) => {
        const active = pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
              active ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" />}
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="flex-1">{t(item.labelKey)}</span>
            {item.href === "/import-queue" && queueCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground">
                {queueCount}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );
}
