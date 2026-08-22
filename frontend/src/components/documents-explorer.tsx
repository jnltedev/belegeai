"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Inbox, Pencil, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentTable } from "@/components/document-table";
import { FilterDropdown } from "@/components/filter-dropdown";
import { Pagination } from "@/components/ui/pagination";
import { BulkEditDialog } from "@/components/bulk-edit-dialog";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/client";
import type { DocumentRecord, DocumentType, Sender, Tag } from "@/lib/types";

const POLL_INTERVAL_MS = 3_000;
const PAGE_SIZE = 15;

function buildQueryString(params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function DocumentsExplorer({
  initialDocuments,
  initialTotal,
}: {
  initialDocuments: DocumentRecord[];
  initialTotal: number;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [documents, setDocuments] = useState(initialDocuments);
  const [total, setTotal] = useState(initialTotal);
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [allSenders, setAllSenders] = useState<Sender[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const queryStringRef = useRef(buildQueryString(searchParams));
  queryStringRef.current = buildQueryString(searchParams);
  const isFirstRender = useRef(true);

  const selectedTagIds = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
  const selectedTypeIds = searchParams.get("documentTypeId")?.split(",").filter(Boolean) ?? [];
  const selectedSenderNames = searchParams.get("sender")?.split(",").filter(Boolean) ?? [];
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const searchTerm = searchParams.get("search");
  const hasActiveFilters = Boolean(
    selectedTagIds.length > 0 ||
      selectedTypeIds.length > 0 ||
      selectedSenderNames.length > 0 ||
      dateFrom ||
      dateTo ||
      searchTerm,
  );

  useEffect(() => {
    api.get<{ tags: Tag[] }>("/api/tags").then((res) => setAllTags(res.tags));
    api.get<{ documentTypes: DocumentType[] }>("/api/document-types").then((res) => setDocumentTypes(res.documentTypes));
    api.get<{ senders: Sender[] }>("/api/senders").then((res) => setAllSenders(res.senders));
  }, []);

  async function fetchDocuments() {
    const res = await api.get<{ documents: DocumentRecord[]; total: number }>(`/api/documents${queryStringRef.current}`);
    setDocuments(res.documents);
    setTotal(res.total);
  }

  // The initial render's documents already came from the server component,
  // filtered by these exact URL params - only refetch on subsequent changes.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // A new filter/page combination invalidates whatever was selected under
    // the previous one - rows the user can no longer even see shouldn't
    // stay silently selected.
    setSelectedIds(new Set());
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Live-sync: poll while the tab is visible, pause otherwise. Only
  // re-render when the fetched list actually differs, so an unchanged
  // response never disturbs scroll position or causes a visible flash.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const res = await api.get<{ documents: DocumentRecord[]; total: number }>(
          `/api/documents${queryStringRef.current}`,
        );
        if (JSON.stringify(res.documents) !== JSON.stringify(documentsRef.current)) {
          setDocuments(res.documents);
          setTotal(res.total);
        }
      } catch {
        // transient network hiccup - next tick will retry
      }
    }

    function start() {
      if (interval) return;
      interval = setInterval(poll, POLL_INTERVAL_MS);
    }
    function stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        poll();
        start();
      } else {
        stop();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (document.visibilityState === "visible") start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    // Any filter change invalidates the current page - jump back to 1 so
    // the user never lands on a now-out-of-range page.
    if (key !== "page") params.delete("page");
    router.push(`${pathname}${buildQueryString(params)}`, { scroll: false });
  }

  function setPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    router.push(`${pathname}${buildQueryString(params)}`, { scroll: false });
  }

  function setTagIds(ids: string[]) {
    setParam("tags", ids.length > 0 ? ids.join(",") : null);
  }

  function setTypeIds(ids: string[]) {
    setParam("documentTypeId", ids.length > 0 ? ids.join(",") : null);
  }

  function setSenderNames(names: string[]) {
    setParam("sender", names.length > 0 ? names.join(",") : null);
  }

  function resetFilters() {
    router.push(pathname, { scroll: false });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const allSelected = documents.length > 0 && documents.every((d) => prev.has(d.id));
      return allSelected ? new Set() : new Set(documents.map((d) => d.id));
    });
  }

  const selectedDocuments = documents.filter((d) => selectedIds.has(d.id));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("documentsExplorer.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("documentsExplorer.archivedCount", { count: String(total) })}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/upload">
            <Button>
              <Upload className="h-3.5 w-3.5" strokeWidth={2} />
              {t("documentsExplorer.upload")}
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-card border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
          {documentTypes.length > 0 && (
            <FilterDropdown
              label={t("documentsExplorer.filterType")}
              options={documentTypes.map((t) => ({ id: t.id, label: t.name, color: t.color }))}
              selectedIds={selectedTypeIds}
              onChange={setTypeIds}
            />
          )}

          {allTags.length > 0 && (
            <FilterDropdown
              label={t("documentsExplorer.filterTags")}
              options={allTags.map((t) => ({ id: t.id, label: t.name, color: t.color }))}
              selectedIds={selectedTagIds}
              onChange={setTagIds}
            />
          )}

          {allSenders.length > 0 && (
            <FilterDropdown
              label={t("documentsExplorer.filterSender")}
              options={allSenders.map((s) => ({ id: s.name, label: s.name }))}
              selectedIds={selectedSenderNames}
              onChange={setSenderNames}
            />
          )}

          <div className="flex items-center gap-1.5 text-sm text-muted">
            <FilterDateInput value={dateFrom} onCommit={(v) => setParam("dateFrom", v)} />
            <span>{t("documentsExplorer.dateRangeTo")}</span>
            <FilterDateInput value={dateTo} onCommit={(v) => setParam("dateTo", v)} />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
            >
              <X className="h-3 w-3" strokeWidth={2} />
              {t("documentsExplorer.resetFilters")}
            </button>
          )}
        </div>

        {(selectedTypeIds.length > 0 || selectedTagIds.length > 0 || selectedSenderNames.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedSenderNames.map((name) => (
              <FilterChip
                key={name}
                label={name}
                color="#64748b"
                onRemove={() => setSenderNames(selectedSenderNames.filter((n) => n !== name))}
              />
            ))}
            {selectedTypeIds.map((id) => {
              const type = documentTypes.find((t) => t.id === id);
              if (!type) return null;
              return (
                <FilterChip
                  key={id}
                  label={type.name}
                  color={type.color}
                  onRemove={() => setTypeIds(selectedTypeIds.filter((t) => t !== id))}
                />
              );
            })}
            {selectedTagIds.map((id) => {
              const tag = allTags.find((t) => t.id === id);
              if (!tag) return null;
              return (
                <FilterChip
                  key={id}
                  label={tag.name}
                  color={tag.color}
                  onRemove={() => setTagIds(selectedTagIds.filter((t) => t !== id))}
                />
              );
            })}
          </div>
        )}
      </div>

      {documents.length === 0 ? (
        hasActiveFilters ? (
          <div className="rounded-card border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
            {t("documentsExplorer.noResultsFiltered")}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface px-6 py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Inbox className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">{t("documentsExplorer.emptyTitle")}</p>
            <p className="mt-1 max-w-xs text-sm text-muted">
              {t("documentsExplorer.emptyDescription")}
            </p>
            <Link href="/upload" className="mt-5">
              <Button>
                <Upload className="h-3.5 w-3.5" strokeWidth={2} />
                {t("documentsExplorer.uploadFirst")}
              </Button>
            </Link>
          </div>
        )
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center justify-between rounded-card border border-accent/30 bg-accent/5 px-4 py-2.5">
              <p className="text-sm font-medium text-foreground">{t("documentsExplorer.selectedCount", { count: String(selectedIds.size) })}</p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setSelectedIds(new Set())}>
                  {t("documentsExplorer.clearSelection")}
                </Button>
                <Button onClick={() => setBulkEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                  {t("common.edit")}
                </Button>
              </div>
            </div>
          )}
          <DocumentTable
            documents={documents}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}

      <BulkEditDialog
        open={bulkEditOpen}
        documents={selectedDocuments}
        documentTypes={documentTypes}
        onClose={() => setBulkEditOpen(false)}
        onSaved={() => {
          setSelectedIds(new Set());
          fetchDocuments();
        }}
      />
    </div>
  );
}

// How long a date field is left alone after the last keystroke before its
// value reaches the URL.
const DATE_COMMIT_DELAY_MS = 500;

/// A date filter that owns its value while it is being filled in.
///
/// Bound straight to the URL it was unusable: a half-typed date reads as an
/// empty value, so every keystroke pushed a route, refetched the list and
/// re-rendered the field underneath the cursor. Add the three-second poll
/// re-rendering the same component and the segments being typed into ended
/// up cleared or jumped over.
///
/// Nothing outside can disturb the field now: the URL is written only once
/// typing has settled, and an incoming value is only adopted while the user
/// is somewhere else.
function FilterDateInput({ value, onCommit }: { value: string; onCommit: (value: string | null) => void }) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFocused = () => inputRef.current !== null && document.activeElement === inputRef.current;

  useEffect(() => {
    if (isFocused()) return;
    setDraft(value);
  }, [value]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  function commit(next: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    // A half-typed year is a perfectly valid date: after the first digit of
    // 2026 the field already reads 0002-03-26. Committing that would apply a
    // nonsense filter and, worse, feed it straight back into the field.
    if (next && !/^\d{4}-/.test(next)) return;
    if (next && Number(next.slice(0, 4)) < 1000) return;
    if ((next || null) !== (value || null)) onCommit(next || null);
  }

  return (
    <input
      ref={inputRef}
      type="date"
      value={draft}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => commit(next), DATE_COMMIT_DELAY_MS);
      }}
      // Leaving the field applies it at once rather than after the delay.
      onBlur={() => commit(draft)}
      className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
    />
  );
}

function FilterChip({ label, color, onRemove }: { label: string; color: string; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ borderColor: `${color}55`, backgroundColor: `${color}1a`, color }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("documentsExplorer.removeFilterChip", { label })}
        className="rounded-full hover:opacity-60"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </span>
  );
}
