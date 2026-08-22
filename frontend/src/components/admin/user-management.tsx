"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, Trash2, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { api, ApiError } from "@/lib/api";
import type { AdminUser } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

const PAGE_SIZE = 15;
const DATE_LOCALES: Record<Locale, string> = { de: "de-DE", en: "en-US" };

function formatDate(value: string | null, locale: Locale) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(DATE_LOCALES[locale]);
}

interface IssuedLink {
  mailed: boolean;
  mailError?: string;
  link?: string;
}

// Shown whenever the server could not mail a one-time link itself - with
// SMTP switched off that is the normal path, not an error, so the link is
// simply handed to the admin to pass on.
function LinkFallback({ link, mailError }: { link: string; mailError?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions). The
      // link stays selectable on screen, so there is nothing to recover from.
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-xs font-medium text-foreground">
        {mailError ? t("userManagement.linkMailFailed", { error: mailError }) : t("userManagement.linkNoSmtp")}
      </p>
      <p className="mt-1 text-xs text-muted">{t("userManagement.linkHint")}</p>

      {/* The button sits inside the field rather than beside it: a long
          token already fills the row, and a labelled button next to it left
          the link itself with almost no width. */}
      <div className="relative mt-2">
        <code className="block select-all overflow-x-auto whitespace-nowrap rounded-md border border-border bg-surface py-2 pl-3 pr-11 text-xs text-foreground">
          {link}
        </code>
        <button
          type="button"
          onClick={copy}
          title={copied ? t("userManagement.copied") : t("userManagement.copyLink")}
          aria-label={copied ? t("userManagement.copied") : t("userManagement.copyLink")}
          // Opaque background, not transparent: the link scrolls underneath
          // it, and translucent would let text show through the icon.
          className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function UserManagement({ currentUserId }: { currentUserId: string }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("usersPage") ?? "1") || 1;

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<AdminUser | null>(null);
  const [resetLink, setResetLink] = useState<IssuedLink | null>(null);

  async function handleResetPassword(user: AdminUser) {
    setBusyUserId(user.id);
    setRoleError(null);
    setNotice(null);
    setResetLink(null);
    try {
      const issued = await api.post<IssuedLink>(`/api/users/${user.id}/reset-password`, {});
      if (issued.mailed) {
        setNotice(t("userManagement.resetSent", { email: user.email }));
      } else if (issued.link) {
        setResetLink(issued);
      }
    } catch (err) {
      setRoleError(err instanceof ApiError ? err.message : t("userManagement.resetFailed"));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleDelete(user: AdminUser) {
    setBusyUserId(user.id);
    setRoleError(null);
    setNotice(null);
    try {
      await api.delete(`/api/users/${user.id}`);
      setPendingDeletion(null);
      loadUsers();
    } catch (err) {
      setRoleError(err instanceof ApiError ? err.message : t("userManagement.deleteFailed"));
    } finally {
      setBusyUserId(null);
    }
  }

  function setPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage > 1) params.set("usersPage", String(nextPage));
    else params.delete("usersPage");
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  async function loadUsers() {
    const res = await api.get<{ users: AdminUser[]; total: number }>(`/api/users?page=${page}`);
    setUsers(res.users);
    setTotal(res.total);
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleRoleChange(id: string, role: "admin" | "member") {
    setRoleError(null);
    try {
      await api.patch(`/api/users/${id}`, { role });
      await loadUsers();
    } catch (err) {
      setRoleError(err instanceof ApiError ? err.message : t("userManagement.roleChangeError"));
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("userManagement.title")}</h2>
          <p className="mt-0.5 text-xs text-muted">{t("userManagement.accountsCount", { count: total })}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
          {t("userManagement.inviteUser")}
        </Button>
      </div>

      {roleError && <p className="mb-3 text-xs text-danger">{roleError}</p>}

      {!loading && (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t("userManagement.name")}</th>
                <th className="px-3 py-2 font-medium">{t("userManagement.email")}</th>
                <th className="px-3 py-2 font-medium">{t("userManagement.role")}</th>
                <th className="px-3 py-2 font-medium">{t("userManagement.lastLogin")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{u.name}</td>
                  <td className="px-3 py-2 text-muted">{u.email}</td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      disabled={u.id === currentUserId}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as "admin" | "member")}
                      className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground disabled:opacity-50"
                    >
                      <option value="member">{t("userManagement.roleMember")}</option>
                      <option value="admin">{t("userManagement.roleAdmin")}</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-muted">{formatDate(u.lastLoginAt, locale)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {busyUserId === u.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
                      <button
                        type="button"
                        onClick={() => handleResetPassword(u)}
                        disabled={busyUserId !== null}
                        title={t("userManagement.resetPassword")}
                        aria-label={t("userManagement.resetPassword")}
                        className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
                      >
                        <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeletion(u)}
                        // An admin deleting themselves could lock the whole
                        // deployment out; the server refuses it too.
                        disabled={u.id === currentUserId || busyUserId !== null}
                        title={t("userManagement.deleteUser")}
                        aria-label={t("userManagement.deleteUser")}
                        className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />

      {notice && <p className="mt-3 text-sm text-accent">{notice}</p>}

      {resetLink?.link && (
        <div className="mt-3">
          <LinkFallback link={resetLink.link} mailError={resetLink.mailError} />
        </div>
      )}

      <InviteUserDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={loadUsers} />

      <ConfirmDialog
        open={pendingDeletion !== null}
        title={t("userManagement.deleteTitle")}
        description={t("userManagement.deleteDescription", { name: pendingDeletion?.name ?? "" })}
        confirmLabel={t("userManagement.deleteUser")}
        loading={busyUserId === pendingDeletion?.id}
        onConfirm={() => pendingDeletion && handleDelete(pendingDeletion)}
        onCancel={() => setPendingDeletion(null)}
      />
    </Card>
  );
}

function InviteUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the server could not mail the invitation. The dialog then stays
  // open showing the link - closing it would throw away the only copy.
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const { t } = useTranslation();

  function reset() {
    setName("");
    setEmail("");
    setRole("member");
    setIssued(null);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ invite: IssuedLink }>("/api/users", { name, email, role });
      onCreated();
      if (!res.invite.mailed && res.invite.link) {
        setIssued(res.invite);
        return;
      }
      handleClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("userManagement.inviteFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (issued?.link) {
    return (
      <Dialog open={open} title={t("userManagement.inviteUser")} onClose={handleClose}>
        <div className="flex flex-col gap-3">
          <LinkFallback link={issued.link} mailError={issued.mailError} />
          <Button onClick={handleClose}>{t("common.close")}</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} title={t("userManagement.inviteUser")} onClose={handleClose}>
      <p className="mb-4 text-xs text-muted">{t("userManagement.inviteDescription")}</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <Label htmlFor="invite-name">{t("userManagement.name")}</Label>
          <Input id="invite-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="invite-email">{t("userManagement.email")}</Label>
          <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="invite-role">{t("userManagement.role")}</Label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "member")}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="member">{t("userManagement.roleMember")}</option>
            <option value="admin">{t("userManagement.roleAdmin")}</option>
          </select>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={saving} className="mt-1">
          {saving ? t("userManagement.sending") : t("userManagement.sendInvite")}
        </Button>
      </form>
    </Dialog>
  );
}
