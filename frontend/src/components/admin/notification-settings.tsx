"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/client";

type Channel = "smtp" | "telegram" | "discord";

interface Settings {
  smtpEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUsername: string | null;
  smtpFromAddress: string | null;
  smtpFromName: string | null;
  smtpNotifyRecipient: string | null;
  telegramEnabled: boolean;
  telegramChatId: string | null;
  discordEnabled: boolean;
  // Shown in full, unlike the password and bot token: an admin needs to see
  // which channel is wired up to be able to check or correct it.
  discordWebhookUrl: string | null;
  hasSmtpPassword: boolean;
  hasTelegramBotToken: boolean;
}

const EMPTY: Settings = {
  smtpEnabled: false,
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUsername: "",
  smtpFromAddress: "",
  smtpFromName: "",
  smtpNotifyRecipient: "",
  telegramEnabled: false,
  telegramChatId: "",
  discordEnabled: false,
  discordWebhookUrl: "",
  hasSmtpPassword: false,
  hasTelegramBotToken: false,
};

export function NotificationSettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Secrets are never sent back by the API, so these stay empty unless
  // someone types a replacement - an empty field means "keep what is stored".
  const [smtpPassword, setSmtpPassword] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");

  const [testing, setTesting] = useState<Channel | null>(null);
  const [testResult, setTestResult] = useState<{ channel: Channel; ok: boolean; error?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ settings: Settings | null }>("/api/notification-settings");
      if (res.settings) setSettings({ ...EMPTY, ...res.settings });
    } catch {
      // A missing row is the normal starting state, not an error worth showing.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.patch("/api/notification-settings", {
        ...settings,
        ...(smtpPassword ? { smtpPassword } : {}),
        ...(telegramBotToken ? { telegramBotToken } : {}),
      });
      setSmtpPassword("");
      setTelegramBotToken("");
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("notificationSettings.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(channel: Channel) {
    setTesting(channel);
    setTestResult(null);
    try {
      await api.post("/api/notification-settings/test", { channel });
      setTestResult({ channel, ok: true });
    } catch (err) {
      // The provider's own words: "chat not found" or "authentication failed"
      // tell an admin what to fix, where "test failed" starts a guessing game.
      setTestResult({ channel, ok: false, error: err instanceof ApiError ? err.message : undefined });
    } finally {
      setTesting(null);
    }
  }

  function TestButton({ channel }: { channel: Channel }) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => handleTest(channel)} disabled={testing !== null || saving}>
          {testing === channel && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("notificationSettings.sendTest")}
        </Button>
        {testResult?.channel === channel && (
          <span className={`flex items-start gap-1 text-xs ${testResult.ok ? "text-accent" : "text-danger"}`}>
            {testResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            {testResult.ok ? t("notificationSettings.testSent") : testResult.error}
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-4">
        <Bell className="h-4 w-4 text-muted" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold">{t("notificationSettings.title")}</h2>
      </div>

      <p className="mb-5 text-sm text-muted">{t("notificationSettings.description")}</p>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted" />
      ) : (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <Toggle
              checked={settings.smtpEnabled}
              onChange={(v) => update("smtpEnabled", v)}
              label={t("notificationSettings.email")}
              description={t("notificationSettings.emailHint")}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="smtp-host">{t("notificationSettings.host")}</Label>
                <Input id="smtp-host" value={settings.smtpHost ?? ""} onChange={(e) => update("smtpHost", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="smtp-port">{t("notificationSettings.port")}</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={settings.smtpPort ?? 587}
                  onChange={(e) => update("smtpPort", Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="smtp-user">{t("notificationSettings.username")}</Label>
                <Input id="smtp-user" value={settings.smtpUsername ?? ""} onChange={(e) => update("smtpUsername", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="smtp-pass">{t("notificationSettings.password")}</Label>
                <Input
                  id="smtp-pass"
                  type="password"
                  autoComplete="new-password"
                  placeholder={settings.hasSmtpPassword ? t("notificationSettings.unchanged") : ""}
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="smtp-from">{t("notificationSettings.fromAddress")}</Label>
                <Input id="smtp-from" type="email" value={settings.smtpFromAddress ?? ""} onChange={(e) => update("smtpFromAddress", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="smtp-from-name">{t("notificationSettings.fromName")}</Label>
                <Input id="smtp-from-name" value={settings.smtpFromName ?? ""} onChange={(e) => update("smtpFromName", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="smtp-notify">{t("notificationSettings.notifyRecipient")}</Label>
                <Input id="smtp-notify" type="email" value={settings.smtpNotifyRecipient ?? ""} onChange={(e) => update("smtpNotifyRecipient", e.target.value)} />
                <p className="mt-1 text-xs text-muted">{t("notificationSettings.notifyRecipientHint")}</p>
              </div>
              <div className="sm:col-span-2">
                <Toggle
                  checked={settings.smtpSecure}
                  onChange={(v) => update("smtpSecure", v)}
                  label={t("notificationSettings.implicitTls")}
                  description={t("notificationSettings.implicitTlsHint")}
                />
              </div>
            </div>
            <TestButton channel="smtp" />
          </section>

          <section className="flex flex-col gap-3 border-t border-border pt-5">
            <Toggle
              checked={settings.telegramEnabled}
              onChange={(v) => update("telegramEnabled", v)}
              label="Telegram"
              description={t("notificationSettings.telegramHint")}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="tg-token">{t("notificationSettings.botToken")}</Label>
                <Input
                  id="tg-token"
                  type="password"
                  autoComplete="off"
                  placeholder={settings.hasTelegramBotToken ? t("notificationSettings.unchanged") : ""}
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="tg-chat">{t("notificationSettings.chatId")}</Label>
                <Input id="tg-chat" value={settings.telegramChatId ?? ""} onChange={(e) => update("telegramChatId", e.target.value)} />
              </div>
            </div>
            <TestButton channel="telegram" />
          </section>

          <section className="flex flex-col gap-3 border-t border-border pt-5">
            <Toggle
              checked={settings.discordEnabled}
              onChange={(v) => update("discordEnabled", v)}
              label="Discord"
              description={t("notificationSettings.discordHint")}
            />
            <div>
              <Label htmlFor="dc-hook">{t("notificationSettings.webhookUrl")}</Label>
              <Input
                id="dc-hook"
                autoComplete="off"
                placeholder="https://discord.com/api/webhooks/…"
                value={settings.discordWebhookUrl ?? ""}
                onChange={(e) => update("discordWebhookUrl", e.target.value)}
              />
            </div>
            <TestButton channel="discord" />
          </section>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex items-center gap-3 border-t border-border pt-5">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("common.save")}
            </Button>
            {saved && <span className="text-sm text-accent">{t("notificationSettings.saved")}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
