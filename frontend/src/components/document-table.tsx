"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { FileTypeBadge } from "@/components/ui/file-type-badge";
import { getDocTypeStyle } from "@/lib/doc-type";
import { formatFieldValue } from "@/lib/metadata-format";
import { useTranslation } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";
import type { DocumentRecord, Tag } from "@/lib/types";

const MOBILE_TAG_LIMIT = 2;

// Below `sm`, more than a couple of tag chips push the row (and the whole
// table) wider than the viewport - cap the visible count there and let a
// "+N" chip reveal the rest in a small popover on tap. At `sm` and up there
// is enough room, so the full list renders unconditionally (both markups
// are mounted, only one is ever visible - same technique as the sidebar's
// desktop/mobile split).
function TagCell({ tags }: { tags: Tag[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hidden = tags.slice(MOBILE_TAG_LIMIT);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <>
      <div className="hidden flex-wrap gap-1 sm:flex">
        {tags.map((tag) => (
          <Badge key={tag.id} label={tag.name} color={tag.color} />
        ))}
      </div>
      <div ref={containerRef} className="relative flex flex-wrap items-center gap-1 sm:hidden">
        {tags.slice(0, MOBILE_TAG_LIMIT).map((tag) => (
          <Badge key={tag.id} label={tag.name} color={tag.color} />
        ))}
        {hidden.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted"
          >
            +{hidden.length}
          </button>
        )}
        {open && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-full z-20 mt-1 flex w-48 flex-wrap gap-1 rounded-lg border border-border bg-surface p-2 shadow-elevated"
          >
            {hidden.map((tag) => (
              <Badge key={tag.id} label={tag.name} color={tag.color} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function firstFieldValue(doc: DocumentRecord, type: "date" | "currency" | "text" | "sender", locale: Locale) {
  const field = doc.documentType?.fields.find((f) => f.type === type);
  if (!field) return "-";
  return formatFieldValue(field, doc.metadata[field.key], locale);
}

function formatCreatedAt(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale === "de" ? "de-DE" : "en-US");
}

export function DocumentTable({
  documents,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  documents: DocumentRecord[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const allSelected = documents.length > 0 && documents.every((d) => selectedIds.has(d.id));

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label={t("documentTable.selectAll")}
                className="h-3.5 w-3.5 rounded border-border accent-accent"
              />
            </th>
            <th className="px-4 py-3 font-medium">{t("documentTable.columnDocument")}</th>
            <th className="px-4 py-3 font-medium">{t("documentTable.columnType")}</th>
            <th className="px-4 py-3 font-medium">{t("documentTable.columnDate")}</th>
            <th className="px-4 py-3 font-medium">{t("documentTable.columnTags")}</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const { icon: Icon, color } = getDocTypeStyle(doc.documentType);
            const secondary = firstFieldValue(doc, "sender", locale);
            const selected = selectedIds.has(doc.id);
            return (
              <tr
                key={doc.id}
                onClick={() => router.push(`/documents/${doc.id}`)}
                className={`group cursor-pointer border-b border-border transition last:border-0 hover:bg-surface-hover ${selected ? "bg-accent/5" : ""}`}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(doc.id)}
                    aria-label={t("documentTable.selectRow", { title: doc.title })}
                    className="h-3.5 w-3.5 rounded border-border accent-accent"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${color}1a`, color }}
                    >
                      <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground group-hover:text-accent">
                          {doc.title}
                        </span>
                        <FileTypeBadge mimetype={doc.mimetype} />
                      </div>
                      <div className="truncate text-xs text-muted">{secondary !== "-" ? secondary : "-"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{doc.documentType?.name ?? t("documentTable.unknownType")}</td>
                <td className="px-4 py-3 text-muted">{formatCreatedAt(doc.createdAt, locale)}</td>
                <td className="px-4 py-3">
                  <TagCell tags={doc.tags} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
