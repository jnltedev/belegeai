"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Pencil, Search, Tag as TagIcon, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TAG_COLOR_PALETTE } from "@/lib/tag-colors";
import { api, ApiError } from "@/lib/api";
import type { Tag } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/client";

const PAGE_SIZE = 15;
const DEBOUNCE_MS = 300;

function ColorPicker({ current, onSelect, onClose }: { current: string; onSelect: (color: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full z-20 mt-1 grid grid-cols-5 gap-1.5 rounded-lg border border-border bg-surface p-2 shadow-elevated"
    >
      {TAG_COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onSelect(color)}
          aria-label={t("tagsManagement.chooseColor", { color })}
          className="flex h-6 w-6 items-center justify-center rounded-full transition hover:scale-110"
          style={{ backgroundColor: color }}
        >
          {color === current && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

function TagRow({ tag, onChanged, onDelete }: { tag: Tag; onChanged: () => void; onDelete: (tag: Tag) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === tag.name) {
      setName(tag.name);
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/tags/${tag.id}`, { name: trimmed });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("tagsManagement.renameFailed"));
      setName(tag.name);
    } finally {
      setSaving(false);
    }
  }

  async function saveColor(color: string) {
    setPickerOpen(false);
    try {
      await api.patch(`/api/tags/${tag.id}`, { color });
      onChanged();
    } catch {
      // transient failure - the row simply keeps its previous color
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label={t("tagsManagement.changeColor")}
          className="h-5 w-5 rounded-full ring-1 ring-inset ring-border transition hover:scale-110"
          style={{ backgroundColor: tag.color }}
        />
        {pickerOpen && <ColorPicker current={tag.color} onSelect={saveColor} onClose={() => setPickerOpen(false)} />}
      </div>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              else if (e.key === "Escape") {
                setName(tag.name);
                setEditing(false);
              }
            }}
            disabled={saving}
            className="w-full rounded-md border border-accent bg-surface px-2 py-1 text-sm text-foreground focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="group flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent"
          >
            {tag.name}
            <Pencil className="h-3 w-3 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" strokeWidth={2} />
          </button>
        )}
        {error && <p className="mt-0.5 text-xs text-danger">{error}</p>}
      </div>

      <span className="shrink-0 text-xs text-muted">
        {tag.documentCount ?? 0} {tag.documentCount === 1 ? t("tagsManagement.document") : t("tagsManagement.documents")}
      </span>

      <button
        type="button"
        onClick={() => onDelete(tag)}
        title={t("common.delete")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

export function TagsManagement() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const urlSearch = searchParams.get("search") ?? "";

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [tags, setTags] = useState<Tag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== "page") params.delete("page");
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  async function load() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (urlSearch) params.set("search", urlSearch);
    const res = await api.get<{ tags: Tag[]; total: number }>(`/api/tags?${params.toString()}`);
    setTags(res.tags);
    setTotal(res.total);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, urlSearch]);

  // Debounce the search input before it hits the URL (and thus the backend).
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== urlSearch) setParam("search", searchInput || null);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/tags/${deleting.id}`);
      setDeleting(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t("tagsManagement.deleteFailed"));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{t("tagsManagement.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("tagsManagement.subtitle", { count: total })}</p>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2} />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("tagsManagement.searchPlaceholder")}
          className="w-full rounded-lg border border-border bg-surface px-9 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {!loading && tags.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
            <TagIcon className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            {urlSearch ? t("tagsManagement.noSearchResults") : t("tagsManagement.noTagsYet")}
          </p>
        </div>
      )}

      {tags.length > 0 && (
        <Card className="p-3">
          <div className="flex flex-col gap-2">
            {tags.map((tag) => (
              <TagRow key={tag.id} tag={tag} onChanged={load} onDelete={setDeleting} />
            ))}
          </div>
        </Card>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={(p) => setParam("page", p > 1 ? String(p) : null)} />

      <ConfirmDialog
        open={deleting !== null}
        title={t("tagsManagement.deleteTitle")}
        description={t("tagsManagement.deleteDescription", { name: deleting?.name ?? "", count: deleting?.documentCount ?? 0 })}
        confirmLabel={t("common.delete")}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
      />
      {deleteError && <p className="mt-2 text-xs text-danger">{deleteError}</p>}
    </div>
  );
}
