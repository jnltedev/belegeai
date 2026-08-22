"use client";

import { useRouter } from "next/navigation";
import { Mail, Key } from "lucide-react";
import { FileTypeBadge } from "@/components/ui/file-type-badge";
import { getDocTypeStyle } from "@/lib/doc-type";
import { useTranslation } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";
import type { QueueDocument } from "@/lib/types";

const DATETIME_LOCALES: Record<Locale, string> = { de: "de-DE", en: "en-US" };

function formatDateTime(value: string, locale: Locale) {
  return new Date(value).toLocaleString(DATETIME_LOCALES[locale], { timeZone: "Europe/Berlin" });
}

function sourceLabel(doc: QueueDocument): { icon: typeof Mail; text: string } {
  if (doc.source === "api") {
    return { icon: Key, text: doc.apiKey?.name ?? "API" };
  }
  const sender = (doc.parent?.metadata.sender as string | undefined) ?? (doc.metadata.sender as string | undefined);
  return { icon: Mail, text: sender ?? "IMAP" };
}

export function QueueTable({ documents }: { documents: QueueDocument[] }) {
  const router = useRouter();
  const { t, locale } = useTranslation();

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">{t("queueTable.document")}</th>
            <th className="px-4 py-3 font-medium">{t("queueTable.aiSuggestedType")}</th>
            <th className="px-4 py-3 font-medium">{t("documentDetail.sourceLabel")}</th>
            <th className="px-4 py-3 font-medium">{t("queueTable.received")}</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const { icon: TypeIcon, color } = getDocTypeStyle(doc.documentType);
            const { icon: SourceIcon, text: sourceText } = sourceLabel(doc);
            return (
              <tr
                key={doc.id}
                onClick={() => router.push(`/import-queue/${doc.id}`)}
                className="group cursor-pointer border-b border-border transition last:border-0 hover:bg-surface-hover"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${color}1a`, color }}
                    >
                      <TypeIcon className="h-4.5 w-4.5" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground group-hover:text-accent">
                          {doc.title}
                        </span>
                        <FileTypeBadge mimetype={doc.mimetype} />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{doc.documentType?.name ?? t("documentDetail.unknown")}</td>
                <td className="px-4 py-3 text-muted">
                  <span className="flex items-center gap-1.5">
                    <SourceIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    <span className="truncate">{sourceText}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{formatDateTime(doc.createdAt, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
