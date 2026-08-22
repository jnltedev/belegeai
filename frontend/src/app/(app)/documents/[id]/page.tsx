import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles, Paperclip, Mail, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FileTypeBadge } from "@/components/ui/file-type-badge";
import { DocumentDeleteButton } from "@/components/document-delete-button";
import { DocumentEditButton } from "@/components/document-edit-button";
import { DocumentTagsEditor } from "@/components/document-tags-editor";
import { DocumentPreview } from "@/components/viewer/document-preview";
import { getDocTypeStyle } from "@/lib/doc-type";
import { formatFieldValue } from "@/lib/metadata-format";
import { serverFetch } from "@/lib/server-api";
import { resolveLocale } from "@/lib/i18n/resolve-locale";
import { translate } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locale";
import type { DocumentRecord, DocumentTypeField } from "@/lib/types";

const DATE_LOCALES: Record<Locale, string> = { de: "de-DE", en: "en-US" };

function formatDate(value: string, locale: Locale) {
  return new Date(value).toLocaleDateString(DATE_LOCALES[locale]);
}

function sourceLabel(locale: Locale, source: DocumentRecord["source"]): string {
  return translate(locale, `documentDetail.source.${source}`);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The "sender" key is a convention shared across the app (search-vector
// weighting, IMAP allowlist, filter/queue display) - special-cased here so
// it's a clickable mailto: link instead of plain text, same as any other
// email address in the app would be.
function renderFieldValue(field: DocumentTypeField, value: unknown, locale: Locale) {
  const formatted = formatFieldValue(field, value, locale);
  if (field.key === "sender" && typeof value === "string" && EMAIL_PATTERN.test(value)) {
    return (
      <a href={`mailto:${value}`} className="text-accent hover:underline">
        {formatted}
      </a>
    );
  }
  return formatted;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await resolveLocale();

  const data = await serverFetch<{ document: DocumentRecord }>(`/api/documents/${id}`).catch(() => null);
  if (!data) notFound();
  const { document } = data;

  const fileUrl = `/api/documents/${document.id}/file`;
  const downloadUrl = `${fileUrl}?download=1`;
  const { icon: TypeIcon, color: typeColor } = getDocTypeStyle(document.documentType);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/documents" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        {translate(locale, "documentDetail.backToDocuments")}
      </Link>

      <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${typeColor}1a`, color: typeColor }}
          >
            <TypeIcon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-tight">{document.title}</h1>
              <FileTypeBadge mimetype={document.mimetype} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              {document.ocrText && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                  <Sparkles className="h-3 w-3" strokeWidth={2} />
                  {translate(locale, "documentDetail.aiDetected")}
                </span>
              )}
              {document.parent && (
                <Link
                  href={`/documents/${document.parent.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
                >
                  <Mail className="h-3 w-3" strokeWidth={2} />
                  {translate(locale, "documentDetail.attachmentFrom", { title: document.parent.title })}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DocumentEditButton document={document} />
          <DocumentDeleteButton documentId={document.id} title={document.title} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="h-[70vh] overflow-hidden lg:col-span-3">
          <DocumentPreview
            documentId={document.id}
            fileUrl={fileUrl}
            downloadUrl={downloadUrl}
            mimetype={document.mimetype}
            title={document.title}
          />
        </Card>

        <Card className="p-5 lg:col-span-2">
          <dl className="flex flex-col">
            <MetaRow
              label={translate(locale, "documentDetail.documentType")}
              value={document.documentType?.name ?? translate(locale, "documentDetail.unknown")}
            />
            {document.documentType?.fields.map((field) => (
              <MetaRow key={field.key} label={field.label} value={renderFieldValue(field, document.metadata[field.key], locale)} />
            ))}
            <MetaRow label={translate(locale, "documentDetail.sourceLabel")} value={sourceLabel(locale, document.source)} />
            <MetaRow label={translate(locale, "documentDetail.added")} value={formatDate(document.createdAt, locale)} />
          </dl>

          <div className="mt-4">
            <DocumentTagsEditor documentId={document.id} initialTags={document.tags} />
          </div>

          {document.ocrText && (
            <details className="mt-5 rounded-lg border border-border bg-surface-2 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-muted">
                {translate(locale, "documentDetail.showOcrText")}
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted">
                {document.ocrText}
              </pre>
            </details>
          )}

          {(document.children.length > 0 || document.pendingChildrenCount > 0) && (
            <div className="mt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {translate(locale, "documentDetail.attachmentsCount", { count: document.children.length })}
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {document.children.map((child) => (
                  <Link
                    key={child.id}
                    href={`/documents/${child.id}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground transition hover:bg-surface-hover"
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2} />
                    <span className="truncate">{child.title}</span>
                  </Link>
                ))}
                {document.pendingChildrenCount > 0 && (
                  <Link
                    href="/import-queue"
                    className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-accent"
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    {translate(
                      locale,
                      document.pendingChildrenCount === 1
                        ? "documentDetail.pendingAttachmentSingular"
                        : "documentDetail.pendingAttachmentPlural",
                      { count: document.pendingChildrenCount },
                    )}
                  </Link>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
