"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Pencil, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api, ApiError } from "@/lib/api";
import type { Sender } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/client";

const PAGE_SIZE = 15;
const DEBOUNCE_MS = 300;

function SenderRow({ sender, onChanged, onDelete }: { sender: Sender; onChanged: () => void; onDelete: (sender: Sender) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sender.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === sender.name) {
      setName(sender.name);
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/senders/${sender.id}`, { name: trimmed });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("sendersManagement.renameFailed"));
      setName(sender.name);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
        <Building2 className="h-4 w-4" strokeWidth={1.75} />
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
                setName(sender.name);
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
            {sender.name}
            <Pencil className="h-3 w-3 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" strokeWidth={2} />
          </button>
        )}
        {error && <p className="mt-0.5 text-xs text-danger">{error}</p>}
      </div>

      <span className="shrink-0 text-xs text-muted">
        {sender.documentCount ?? 0} {sender.documentCount === 1 ? t("sendersManagement.document") : t("sendersManagement.documents")}
      </span>

      <button
        type="button"
        onClick={() => onDelete(sender)}
        title={t("common.delete")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

export function SendersManagement() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const urlSearch = searchParams.get("search") ?? "";

  const [searchInput, setSearchInput] = useState(urlSearch);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Sender | null>(null);
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
    const res = await api.get<{ senders: Sender[]; total: number }>(`/api/senders?${params.toString()}`);
    setSenders(res.senders);
    setTotal(res.total);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, urlSearch]);

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
      await api.delete(`/api/senders/${deleting.id}`);
      setDeleting(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t("sendersManagement.deleteFailed"));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{t("sendersManagement.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("sendersManagement.subtitle", { count: total })}</p>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2} />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("sendersManagement.searchPlaceholder")}
          className="w-full rounded-lg border border-border bg-surface px-9 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {!loading && senders.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Building2 className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            {urlSearch ? t("sendersManagement.noSearchResults") : t("sendersManagement.noSendersYet")}
          </p>
        </div>
      )}

      {senders.length > 0 && (
        <Card className="p-3">
          <div className="flex flex-col gap-2">
            {senders.map((sender) => (
              <SenderRow key={sender.id} sender={sender} onChanged={load} onDelete={setDeleting} />
            ))}
          </div>
        </Card>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={(p) => setParam("page", p > 1 ? String(p) : null)} />

      <ConfirmDialog
        open={deleting !== null}
        title={t("sendersManagement.deleteTitle")}
        description={t("sendersManagement.deleteDescription", { name: deleting?.name ?? "" })}
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
