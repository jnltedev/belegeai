"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/client";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // null while unknown - the form stays hidden until we know, so it never
  // flashes up on a deployment where sign-up is long since closed.
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .get<{ registrationOpen?: boolean }>("/api/health")
      .then((res) => setOpen(res.registrationOpen ?? false))
      .catch(() => setOpen(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/auth/register", { name, email, password });
      router.push("/documents");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("register.error.generic"));
    } finally {
      setLoading(false);
    }
  }

  if (open === null) {
    return <Card className="w-full max-w-sm p-6" />;
  }

  if (!open) {
    return (
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-1 text-lg font-semibold">{t("register.closedTitle")}</h1>
        <p className="mb-6 text-sm text-muted">{t("register.closedBody")}</p>
        <Link href="/login" className="text-sm font-medium text-accent hover:underline">
          {t("register.backToLogin")}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="mb-1 text-lg font-semibold">{t("register.title")}</h1>
      <p className="mb-6 text-sm text-muted">{t("register.subtitle")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="name">{t("register.nameLabel")}</Label>
          <Input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="email">{t("register.emailLabel")}</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">{t("register.passwordLabel")}</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted">{t("register.passwordHint")}</p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button type="submit" disabled={loading} className="mt-2 w-full">
          {loading ? t("register.submitting") : t("register.submit")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {t("register.hasAccount")}{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t("register.loginLink")}
        </Link>
      </p>
    </Card>
  );
}
