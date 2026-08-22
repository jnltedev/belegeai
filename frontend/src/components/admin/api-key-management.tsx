"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, Key, KeyRound, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { api, ApiError } from "@/lib/api";
import type { ApiKey } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

const PAGE_SIZE = 15;
const DATETIME_LOCALES: Record<Locale, string> = { de: "de-DE", en: "en-US" };

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) return "-";
  return new Date(value).toLocaleString(DATETIME_LOCALES[locale], { timeZone: "Europe/Berlin" });
}

export function ApiKeyManagement() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("apiKeysPage") ?? "1") || 1;

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  function setPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage > 1) params.set("apiKeysPage", String(nextPage));
    else params.delete("apiKeysPage");
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  async function loadKeys() {
    const res = await api.get<{ apiKeys: ApiKey[]; total: number }>(`/api/api-keys?page=${page}`);
    setKeys(res.apiKeys);
    setTotal(res.total);
    setLoading(false);
  }

  useEffect(() => {
    loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleRevoke() {
    if (!revoking) return;
    setRevokeError(null);
    setRevokeLoading(true);
    try {
      await api.delete(`/api/api-keys/${revoking.id}`);
      setRevoking(null);
      await loadKeys();
    } catch (err) {
      setRevokeError(err instanceof ApiError ? err.message : t("apiKeyManagement.revokeFailed"));
    } finally {
      setRevokeLoading(false);
    }
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <KeyRound className="h-4 w-4" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("apiKeyManagement.title")}</h2>
            <p className="mt-0.5 text-xs text-muted">{t("apiKeyManagement.totalCount", { count: total })}</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          {t("apiKeyManagement.createKey")}
        </Button>
      </div>

      {!loading && keys.length > 0 && (
        <div className="flex flex-col gap-2">
          {[...activeKeys, ...revokedKeys].map((key) => (
            <div
              key={key.id}
              className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 ${key.revokedAt ? "opacity-50" : ""}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                <Key className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{key.name}</p>
                <p className="text-xs text-muted">
                  {key.revokedAt
                    ? t("apiKeyManagement.revokedOn", { date: formatDateTime(key.revokedAt, locale) })
                    : t("apiKeyManagement.lastUsed", { date: formatDateTime(key.lastUsedAt, locale) })}
                </p>
              </div>
              {!key.revokedAt && (
                <button
                  type="button"
                  onClick={() => setRevoking(key)}
                  title={t("apiKeyManagement.revoke")}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && keys.length === 0 && <p className="text-sm text-muted">{t("apiKeyManagement.empty")}</p>}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      <CreateApiKeyDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={loadKeys} />

      <ConfirmDialog
        open={revoking !== null}
        title={t("apiKeyManagement.revokeConfirmTitle")}
        description={t("apiKeyManagement.revokeConfirmDescription", { name: revoking?.name ?? "" })}
        confirmLabel={t("apiKeyManagement.revoke")}
        loading={revokeLoading}
        onConfirm={handleRevoke}
        onCancel={() => {
          setRevoking(null);
          setRevokeError(null);
        }}
      />
      {revokeError && <p className="mt-2 text-xs text-danger">{revokeError}</p>}
    </Card>
  );
}

function CreateApiKeyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  function handleClose() {
    setName("");
    setCreatedKey(null);
    setCopied(false);
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ apiKey: { key: string } }>("/api/api-keys", { name });
      setCreatedKey(res.apiKey.key);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("apiKeyManagement.createFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} title={t("apiKeyManagement.createKeyDialogTitle")} onClose={handleClose}>
      {createdKey ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t("apiKeyManagement.keyShownOnce")}</p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap text-xs text-foreground">{createdKey}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(createdKey);
                setCopied(true);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
              title={t("apiKeyManagement.copy")}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
          {copied && <p className="text-xs text-accent">{t("apiKeyManagement.copiedToClipboard")}</p>}
          <Button type="button" onClick={handleClose} className="mt-1">
            {t("apiKeyManagement.done")}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="api-key-name">{t("apiKeyManagement.name")}</Label>
            <Input
              id="api-key-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("apiKeyManagement.namePlaceholder")}
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={saving} className="mt-1">
            {saving ? t("apiKeyManagement.creating") : t("apiKeyManagement.createKey")}
          </Button>
        </form>
      )}
    </Dialog>
  );
}
