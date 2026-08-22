import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, FileCode } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { UserManagement } from "@/components/admin/user-management";
import { DocumentTypeManagement } from "@/components/admin/document-type-management";
import { ImapMailboxSettings } from "@/components/admin/imap-mailbox-settings";
import { ApiKeyManagement } from "@/components/admin/api-key-management";
import { PushProxySettings } from "@/components/admin/push-proxy-settings";
import { NotificationSettings } from "@/components/admin/notification-settings";
import { Button } from "@/components/ui/button";
import { resolveLocale } from "@/lib/i18n/resolve-locale";
import { translate } from "@/lib/i18n/dictionaries";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/documents");
  const locale = await resolveLocale();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{translate(locale, "adminPage.title")}</h1>
          <p className="mt-1 text-sm text-muted">{translate(locale, "adminPage.subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/admin/api-docs">
            <Button variant="secondary">
              <FileCode className="h-3.5 w-3.5" strokeWidth={2} />
              {translate(locale, "adminPage.apiDocs")}
            </Button>
          </Link>
          <Link href="/admin/stats">
            <Button variant="secondary">
              <BarChart3 className="h-3.5 w-3.5" strokeWidth={2} />
              {translate(locale, "adminPage.stats")}
            </Button>
          </Link>
        </div>
      </div>

      <Suspense>
        <div className="mt-6 flex flex-col gap-6">
          <UserManagement currentUserId={user.id} />
          <DocumentTypeManagement />
          <ImapMailboxSettings />
          <NotificationSettings />
          <PushProxySettings />
          <ApiKeyManagement />
        </div>
      </Suspense>
    </div>
  );
}
