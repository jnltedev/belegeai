"use client";

import { FileText, HardDrive, Tag, Inbox, Users, Mail, Key } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { AdminStats } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

const SOURCE_LABEL_KEYS: Record<string, string> = {
  manual: "statsDashboard.sourceManual",
  imap: "statsDashboard.sourceImap",
  api: "statsDashboard.sourceApi",
};

const DATETIME_LOCALES: Record<Locale, string> = { de: "de-DE", en: "en-US" };

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) return "-";
  return new Date(value).toLocaleString(DATETIME_LOCALES[locale], { timeZone: "Europe/Berlin" });
}

function StatTile({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon className="h-4.5 w-4.5" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-foreground">{value}</p>
          <p className="text-xs text-muted">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function BarList({ items }: { items: { label: string; color: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-muted">{item.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(item.count / max) * 100}%`, backgroundColor: item.color }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-medium text-foreground">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export function StatsDashboard({ initialStats }: { initialStats: AdminStats }) {
  const stats = initialStats;
  const { t, locale } = useTranslation();

  const sourceLabel = (source: string) => {
    const key = SOURCE_LABEL_KEYS[source];
    return key ? t(key) : source;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile icon={FileText} label={t("statsDashboard.documents")} value={stats.totalDocuments} />
        <StatTile icon={HardDrive} label={t("statsDashboard.storageUsed")} value={formatBytes(stats.totalStorageBytes)} />
        <StatTile icon={Tag} label={t("statsDashboard.tags")} value={stats.totalTags} />
        <StatTile icon={Inbox} label={t("statsDashboard.pendingImports")} value={stats.pendingImportCount} />
        <StatTile icon={Users} label={t("statsDashboard.users")} value={stats.totalUsers} />
        <StatTile
          icon={Key}
          label={t("statsDashboard.lastApiImport")}
          value={<span className="text-sm">{formatDateTime(stats.lastApiImportAt, locale)}</span>}
        />
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted" strokeWidth={2} />
          <p className="text-sm font-medium text-foreground">{t("statsDashboard.lastImapSync")}</p>
        </div>
        <p className="mt-1 text-sm text-muted">{formatDateTime(stats.lastImapSyncAt, locale)}</p>
        {stats.oldestPendingAgeDays !== null && (
          <p className="mt-3 text-xs text-muted">
            {t("statsDashboard.oldestPending", {
              days: stats.oldestPendingAgeDays,
              unit: stats.oldestPendingAgeDays === 1 ? t("statsDashboard.day") : t("statsDashboard.days"),
            })}
          </p>
        )}
      </Card>

      {stats.documentsByType.length > 0 && (
        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold text-foreground">{t("statsDashboard.byDocumentType")}</p>
          <BarList items={stats.documentsByType.map((t) => ({ label: t.name, color: t.color, count: t.count }))} />
        </Card>
      )}

      {stats.documentsBySource.length > 0 && (
        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold text-foreground">{t("statsDashboard.bySourceChannel")}</p>
          <BarList
            items={stats.documentsBySource.map((s) => ({
              label: sourceLabel(s.source),
              color: "#0d9488",
              count: s.count,
            }))}
          />
        </Card>
      )}

      {stats.topTags.length > 0 && (
        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold text-foreground">{t("statsDashboard.topTags")}</p>
          <BarList items={stats.topTags.map((t) => ({ label: t.name, color: t.color, count: t.count }))} />
        </Card>
      )}
    </div>
  );
}
