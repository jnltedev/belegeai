import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { ApiDocs } from "@/components/admin/api-docs";
import { resolveLocale } from "@/lib/i18n/resolve-locale";
import { translate } from "@/lib/i18n/dictionaries";

export default async function AdminApiDocsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/documents");
  const locale = await resolveLocale();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        {translate(locale, "apiDocs.backToAdmin")}
      </Link>

      <h1 className="mt-4 text-xl font-semibold tracking-tight">{translate(locale, "apiDocs.title")}</h1>
      <p className="mt-1 text-sm text-muted">{translate(locale, "apiDocs.subtitle")}</p>

      <div className="mt-6">
        <ApiDocs locale={locale} />
      </div>
    </div>
  );
}
