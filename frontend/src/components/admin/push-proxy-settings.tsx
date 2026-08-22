"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

const DATETIME_LOCALES: Record<Locale, string> = { de: "de-DE", en: "en-US" };

interface ProxyStatus {
  connected: boolean;
  /// Whether the deployment points at a proxy at all. The address itself is
  /// never sent to the browser - it is set with PUSH_PROXY_URL, not here.
  configured: boolean;
  instanceId?: string;
  deviceCount?: number;
  lastNotifiedAt?: string | null;
  bundleId?: string;
  error?: string;
}

export function PushProxySettings() {
  const { t, locale } = useTranslation();
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<ProxyStatus>("/api/push/status"));
    } catch {
      setStatus({ connected: false, configured: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.post<ProxyStatus>("/api/push/enroll", {}));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("pushProxy.connectError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    try {
      await api.delete("/api/push/enroll");
      setStatus({ connected: false, configured: status?.configured ?? false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("pushProxy.disconnectError"));
    } finally {
      setBusy(false);
    }
  }

  const enrolled = Boolean(status?.instanceId);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-4">
        <BellRing className="h-4 w-4 text-muted" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold">{t("pushProxy.title")}</h2>
      </div>

      <p className="mb-4 text-sm text-muted">{t("pushProxy.description")}</p>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted" />
      ) : enrolled ? (
        <div className="flex flex-col gap-4">
          <div
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
              status?.connected ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"
            }`}
          >
            {status?.connected ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
            )}
            <div>
              <p className="font-medium">
                {status?.connected ? t("pushProxy.connected") : t("pushProxy.disconnected")}
              </p>
              {!status?.connected && status?.error && <p className="mt-0.5 text-xs">{status.error}</p>}
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Detail label={t("pushProxy.instanceId")} value={status?.instanceId ?? "-"} mono />
            <Detail
              label={t("pushProxy.devices")}
              value={status?.connected ? String(status.deviceCount ?? 0) : "-"}
            />
            <Detail
              label={t("pushProxy.lastNotification")}
              value={
                status?.connected && status.lastNotifiedAt
                  ? new Date(status.lastNotifiedAt).toLocaleString(DATETIME_LOCALES[locale])
                  : "-"
              }
            />
          </dl>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={load} disabled={busy}>
              {t("pushProxy.recheck")}
            </Button>
            <Button variant="secondary" onClick={handleDisconnect} disabled={busy}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("pushProxy.disconnect")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {!status?.configured ? (
            <p className="rounded-lg bg-surface-hover px-3 py-2 text-sm text-muted">
              {t("pushProxy.notConfigured")}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">{t("pushProxy.connectHint")}</p>

              {error && <p className="text-sm text-danger">{error}</p>}

              <div>
                <Button onClick={handleConnect} disabled={busy}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("pushProxy.connect")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
