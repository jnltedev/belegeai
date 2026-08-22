"use client";

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { Download, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/client";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailContent {
  sender: string | null;
  recipient: string | null;
  subject: string | null;
  date: string | null;
  textBody: string | null;
  htmlBody: string | null;
}

function AddressField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <dt className="w-16 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-foreground">
        {EMAIL_PATTERN.test(value) ? (
          <a href={`mailto:${value}`} className="text-accent hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

// Sanitized (defense-in-depth) HTML, rendered inside a sandboxed iframe with
// no allow-scripts/allow-same-origin - even a sanitizer gap couldn't run
// script from an email's content, since the browser refuses to execute any
// script inside a sandbox lacking that permission, full stop.
function HtmlBody({ html, frameTitle }: { html: string; frameTitle: string }) {
  const clean = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: false });
  // Emails frequently hard-code pixel widths (a fixed-width outer table is
  // the standard email-layout technique) - without forcing everything back
  // to max-width:100%, that content overflows the iframe and gets its own
  // horizontal scrollbar instead of shrinking to the panel's actual width,
  // the same "responsive email" reset trick used by most mail clients.
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"><style>html,body{max-width:100%;overflow-x:hidden;}body{font-family:system-ui,sans-serif;margin:0;padding:12px;color:#111;word-wrap:break-word;}*{max-width:100%;box-sizing:border-box;}table{width:auto!important;}img{height:auto;}pre{white-space:pre-wrap;word-break:break-word;}</style></head><body>${clean}</body></html>`;
  return (
    <iframe
      title={frameTitle}
      srcDoc={srcDoc}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      className="h-full w-full border-0 bg-white"
    />
  );
}

export function EmailViewer({
  documentId,
  subject,
  downloadUrl,
}: {
  documentId: string;
  subject: string;
  downloadUrl: string;
}) {
  const { t, locale } = useTranslation();
  const [content, setContent] = useState<EmailContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent(null);
    setError(null);
    api
      .get<EmailContent>(`/api/documents/${documentId}/email-content`)
      .then(setContent)
      .catch(() => setError(t("emailViewer.loadError")));
  }, [documentId, t]);

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="shrink-0 border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 truncate text-base font-semibold text-foreground">{content?.subject ?? subject}</h2>
          <a
            href={downloadUrl}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            {t("emailViewer.original")}
          </a>
        </div>
        {content && (
          <dl className="mt-3 flex flex-col gap-1.5">
            <AddressField label={t("emailViewer.from")} value={content.sender} />
            <AddressField label={t("emailViewer.to")} value={content.recipient} />
            {content.date && (
              <div className="flex gap-2 text-sm">
                <dt className="w-16 shrink-0 text-muted">{t("emailViewer.date")}</dt>
                <dd className="text-foreground">
                  {new Date(content.date).toLocaleString(locale === "en" ? "en-US" : "de-DE", {
                    timeZone: "Europe/Berlin",
                  })}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {!content && !error && (
          <div className="flex h-full items-center justify-center text-muted">
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} />
          </div>
        )}
        {error && <p className="p-4 text-sm text-danger">{error}</p>}
        {content?.htmlBody ? (
          <HtmlBody html={content.htmlBody} frameTitle={t("emailViewer.contentTitle")} />
        ) : content?.textBody ? (
          <pre className="whitespace-pre-wrap p-4 font-sans text-sm text-foreground">{content.textBody}</pre>
        ) : content ? (
          <p className="p-4 text-sm text-muted">{t("emailViewer.noTextContent")}</p>
        ) : null}
      </div>
    </div>
  );
}
