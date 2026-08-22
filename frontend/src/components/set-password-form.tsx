"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/client";

interface TokenInfo {
  name: string;
  email: string;
  purpose: "invite" | "reset";
}

/// Shared by invitations and password resets - the same one-time link, only
/// the wording differs. Reached without a session by definition: the whole
/// point is that the person cannot sign in yet.
export function SetPasswordForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const check = useCallback(async () => {
    if (!token) {
      setChecking(false);
      return;
    }
    try {
      setInfo(await api.get<TokenInfo>(`/api/auth/set-password/${encodeURIComponent(token)}`));
    } catch {
      setInfo(null);
    } finally {
      setChecking(false);
    }
  }, [token]);

  useEffect(() => {
    void check();
  }, [check]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== repeat) {
      setError(t("setPassword.mismatch"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/auth/set-password", { token, password });
      setDone(true);
      // Straight to the login form: signing in with the new password proves
      // it works before the person walks away.
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("setPassword.failed"));
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <Card className="w-full max-w-sm p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </Card>
    );
  }

  if (!info) {
    return (
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-1 text-lg font-semibold">{t("setPassword.invalidTitle")}</h1>
        <p className="mb-6 text-sm text-muted">{t("setPassword.invalidBody")}</p>
        <Link href="/login" className="text-sm font-medium text-accent hover:underline">
          {t("setPassword.backToLogin")}
        </Link>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="w-full max-w-sm p-6">
        <p className="flex items-center gap-2 text-sm font-medium text-accent">
          <CheckCircle2 className="h-4 w-4" />
          {t("setPassword.success")}
        </p>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="mb-1 text-lg font-semibold">
        {info.purpose === "invite" ? t("setPassword.inviteTitle") : t("setPassword.resetTitle")}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {info.purpose === "invite"
          ? t("setPassword.inviteBody", { email: info.email })
          : t("setPassword.resetBody", { email: info.email })}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="password">{t("setPassword.password")}</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="repeat">{t("setPassword.repeat")}</Label>
          <Input
            id="repeat"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button type="submit" disabled={saving} className="mt-1 w-full">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("setPassword.submit")}
        </Button>
      </form>
    </Card>
  );
}
