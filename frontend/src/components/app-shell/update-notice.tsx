"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
import { useVersion } from "./version-badge";

// Holds the newest version that was acknowledged. Kept in the browser rather
// than the database: it is a "yes, I have seen this" for one person on one
// machine, and storing it server-side would mean a migration and a write on
// every dismissal for something nobody needs to survive a reinstall.
const DISMISSED_KEY = "belegeai.updateAcknowledged";

/// Announces a newer GitHub release once, to whoever can act on it.
///
/// Shown to administrators only. A member cannot pull a new image, and
/// nagging them about one would be an interruption they can do nothing with.
export function UpdateNotice({ isAdmin }: { isAdmin: boolean }) {
  const { t, locale } = useTranslation();
  const info = useVersion();
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  // Nothing is decided until localStorage has been read: rendering before
  // that would flash the dialog at someone who dismissed it long ago.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setAcknowledged(window.localStorage.getItem(DISMISSED_KEY));
    } catch {
      // Private browsing or blocked storage. The notice then appears once
      // per session, which is still better than not at all.
    }
    setReady(true);
  }, []);

  if (!isAdmin || !ready || !info?.update.available || !info.update.latest) return null;
  if (acknowledged === info.update.latest) return null;

  function acknowledge() {
    const latest = info?.update.latest;
    if (!latest) return;
    try {
      window.localStorage.setItem(DISMISSED_KEY, latest);
    } catch {
      // Nothing to do: the dialog closes either way.
    }
    setAcknowledged(latest);
  }

  const published = info.update.publishedAt
    ? new Date(info.update.publishedAt).toLocaleDateString(locale === "de" ? "de-DE" : "en-US")
    : null;

  return (
    <Dialog open title={t("updateNotice.title")} onClose={acknowledge}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="text-sm text-foreground">
              {t("updateNotice.body", { latest: info.update.latest, current: info.version })}
            </p>
            {published && <p className="mt-1 text-xs text-muted">{t("updateNotice.published", { date: published })}</p>}
          </div>
        </div>

        {info.update.url && (
          <a
            href={info.update.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            {t("updateNotice.viewRelease", { name: info.update.name ?? info.update.latest })}
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        )}

        <p className="text-xs text-muted">{t("updateNotice.hint")}</p>

        <Button onClick={acknowledge}>{t("updateNotice.acknowledge")}</Button>
      </div>
    </Dialog>
  );
}
