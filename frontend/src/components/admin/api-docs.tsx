import Link from "next/link";
import { Card } from "@/components/ui/card";
import { translate } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locale";

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-2 px-3 py-2.5 font-mono text-xs text-foreground">
      {children}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm text-muted">{children}</div>
    </Card>
  );
}

const CURL_EXAMPLE = `curl -X POST https://<deine-domain>/api/v1/documents \\
  -H "Authorization: Bearer <dein-api-key>" \\
  -F "file=@rechnung.pdf"`;

const RESPONSE_EXAMPLE = `{
  "document": {
    "id": "5f2c...",
    "title": "rechnung",
    "reviewStatus": "pending"
  },
  "attachments": []
}`;

export function ApiDocs({ locale }: { locale: Locale }) {
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
  return (
    <div className="flex flex-col gap-6">
      <Section title={t("apiDocs.overview.title")}>
        <p>{t("apiDocs.overview.p1")}</p>
        <p>
          {t("apiDocs.overview.p2Before")}{" "}
          <Link href="/import-queue" className="text-accent hover:underline">
            {t("apiDocs.overview.importQueueLink")}
          </Link>
          {t("apiDocs.overview.p2After")}
        </p>
      </Section>

      <Section title={t("apiDocs.auth.title")}>
        <p>
          {t("apiDocs.auth.p1Before")} <code className="text-foreground">Authorization</code>
          {t("apiDocs.auth.p1After")}
        </p>
        <CodeBlock>{`Authorization: Bearer <dein-api-key>`}</CodeBlock>
      </Section>

      <Section title={t("apiDocs.upload.title")}>
        <p>
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-foreground">POST</span>{" "}
          <code className="text-foreground">/api/v1/documents</code>
        </p>
        <p>
          {t("apiDocs.upload.p1Before")} <code className="text-foreground">multipart/form-data</code>{" "}
          {t("apiDocs.upload.p1Mid")} <code className="text-foreground">file</code>. {t("apiDocs.upload.p1After")}
        </p>
        <CodeBlock>{CURL_EXAMPLE}</CodeBlock>
        <p className="mt-1">{t("apiDocs.upload.successResponse")}</p>
        <CodeBlock>{RESPONSE_EXAMPLE}</CodeBlock>
      </Section>

      <Section title={t("apiDocs.errors.title")}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th className="py-1.5 pr-4 font-medium">{t("apiDocs.errors.status")}</th>
                <th className="py-1.5 font-medium">{t("apiDocs.errors.meaning")}</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              <tr className="border-b border-border">
                <td className="py-1.5 pr-4 font-mono">400</td>
                <td className="py-1.5">{t("apiDocs.errors.400")}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-1.5 pr-4 font-mono">401</td>
                <td className="py-1.5">{t("apiDocs.errors.401")}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-1.5 pr-4 font-mono">413</td>
                <td className="py-1.5">{t("apiDocs.errors.413")}</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 font-mono">429</td>
                <td className="py-1.5">{t("apiDocs.errors.429")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={t("apiDocs.rateLimit.title")}>
        <p>
          {t("apiDocs.rateLimit.p1Before")} <strong className="text-foreground">{t("apiDocs.rateLimit.limit")}</strong>{" "}
          {t("apiDocs.rateLimit.p1After")}
        </p>
      </Section>
    </div>
  );
}
