"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, Plus, X, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { api, ApiError } from "@/lib/api";
import type { ImapSettings } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

const DATETIME_LOCALES: Record<Locale, string> = { de: "de-DE", en: "en-US" };

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) return "-";
  return new Date(value).toLocaleString(DATETIME_LOCALES[locale], { timeZone: "Europe/Berlin" });
}

export function ImapMailboxSettings() {
  const { t, locale } = useTranslation();
  const [settings, setSettings] = useState<ImapSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [host, setHost] = useState("");
  const [port, setPort] = useState(993);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [folder, setFolder] = useState("INBOX");
  const [pollIntervalMinutes, setPollIntervalMinutes] = useState(5);
  const [allowAllSenders, setAllowAllSenders] = useState(false);
  const [allowedSenders, setAllowedSenders] = useState<string[]>([]);
  const [senderInput, setSenderInput] = useState("");
  const [enabled, setEnabled] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    api
      .get<{ settings: ImapSettings | null }>("/api/imap-settings")
      .then((res) => {
        setSettings(res.settings);
        if (res.settings) {
          setHost(res.settings.host);
          setPort(res.settings.port);
          setUsername(res.settings.username);
          setFolder(res.settings.folder);
          setPollIntervalMinutes(res.settings.pollIntervalMinutes);
          setAllowAllSenders(res.settings.allowAllSenders);
          setAllowedSenders(res.settings.allowedSenders);
          setEnabled(res.settings.enabled);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function addSender() {
    const value = senderInput.trim();
    if (value && !allowedSenders.includes(value)) {
      setAllowedSenders((prev) => [...prev, value]);
    }
    setSenderInput("");
  }

  function removeSender(value: string) {
    setAllowedSenders((prev) => prev.filter((s) => s !== value));
  }

  async function handleTestConnection() {
    setTestResult(null);
    if (!password) {
      setTestResult({ success: false, error: t("imapSettings.passwordRequiredForTest") });
      return;
    }
    setTesting(true);
    try {
      const res = await api.post<{ success: boolean; error?: string }>("/api/imap-settings/test-connection", {
        host,
        port,
        username,
        password,
        folder,
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, error: err instanceof ApiError ? err.message : t("imapSettings.testFailed") });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    if (!settings && !password) {
      setSaveError(t("imapSettings.passwordRequiredInitial"));
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch<{ settings: ImapSettings }>("/api/imap-settings", {
        host,
        port,
        username,
        ...(password ? { password } : {}),
        folder,
        pollIntervalMinutes,
        allowAllSenders,
        allowedSenders,
        enabled,
      });
      setSettings(res.settings);
      setPassword("");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("imapSettings.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Mail className="h-4 w-4" strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("imapSettings.title")}</h2>
          <p className="mt-0.5 text-xs text-muted">{t("imapSettings.subtitle")}</p>
        </div>
      </div>

      {settings && (
        <div className="mb-4 flex flex-col gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted">
          <span>{t("imapSettings.lastSynced", { date: formatDateTime(settings.lastSyncAt, locale) })}</span>
          {settings.lastError && (
            <span className="text-danger">{t("imapSettings.lastErrorLabel", { error: settings.lastError })}</span>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="imap-host">{t("imapSettings.host")}</Label>
            <Input id="imap-host" required value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.example.com" />
          </div>
          <div>
            <Label htmlFor="imap-port">{t("imapSettings.port")}</Label>
            <Input
              id="imap-port"
              type="number"
              required
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="imap-folder">{t("imapSettings.folder")}</Label>
            <Input id="imap-folder" required value={folder} onChange={(e) => setFolder(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="imap-username">{t("imapSettings.username")}</Label>
            <Input id="imap-username" required value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="imap-password">{t("imapSettings.password")}</Label>
            <Input
              id="imap-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={settings ? t("imapSettings.passwordPlaceholderUnchanged") : ""}
            />
          </div>
          <div>
            <Label htmlFor="imap-interval">{t("imapSettings.pollInterval")}</Label>
            <Input
              id="imap-interval"
              type="number"
              min={1}
              required
              value={pollIntervalMinutes}
              onChange={(e) => setPollIntervalMinutes(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-3.5">
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label={t("imapSettings.enabledLabel")}
            description={t("imapSettings.enabledDescription")}
          />
          <div className="h-px bg-border" />
          <Toggle
            checked={allowAllSenders}
            onChange={setAllowAllSenders}
            label={t("imapSettings.allowAllSendersLabel")}
            description={t("imapSettings.allowAllSendersDescription")}
          />

          {!allowAllSenders && (
            <div>
              <Label htmlFor="imap-sender-input">{t("imapSettings.allowedSenders")}</Label>
              <div className="flex gap-2">
                <Input
                  id="imap-sender-input"
                  type="email"
                  value={senderInput}
                  onChange={(e) => setSenderInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSender();
                    }
                  }}
                  placeholder={t("imapSettings.senderPlaceholder")}
                />
                <Button type="button" variant="secondary" onClick={addSender}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                </Button>
              </div>
              {allowedSenders.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {allowedSenders.map((sender) => (
                    <span
                      key={sender}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-foreground"
                    >
                      {sender}
                      <button type="button" onClick={() => removeSender(sender)} className="hover:opacity-60">
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {testResult && (
          <p className={`flex items-center gap-1.5 text-sm ${testResult.success ? "text-accent" : "text-danger"}`}>
            {testResult.success ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            ) : (
              <XCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            )}
            {testResult.success ? t("imapSettings.testSuccess") : testResult.error}
          </p>
        )}
        {saveError && <p className="text-sm text-danger">{saveError}</p>}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? t("imapSettings.saving") : t("common.save")}
          </Button>
          <Button type="button" variant="secondary" onClick={handleTestConnection} disabled={testing}>
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
            {t("imapSettings.testConnection")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
