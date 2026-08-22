"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocumentPreview } from "@/components/viewer/document-preview";
import { DocumentEditFields } from "@/components/document-edit-fields";
import { DocumentTagsEditor } from "@/components/document-tags-editor";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/client";
import type { DocumentRecord, DocumentType, QueueDocument } from "@/lib/types";

export function ReviewPanel({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [queue, setQueue] = useState<QueueDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [title, setTitle] = useState("");
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    Promise.all([
      api.get<{ document: DocumentRecord }>(`/api/documents/${documentId}`),
      api.get<{ documentTypes: DocumentType[] }>("/api/document-types"),
      api.get<{ documents: QueueDocument[] }>("/api/documents/queue"),
    ])
      .then(([docRes, typesRes, queueRes]) => {
        setDoc(docRes.document);
        setDocumentTypes(typesRes.documentTypes);
        setQueue(queueRes.documents);
        setTitle(docRes.document.title);
        setDocumentTypeId(docRes.document.documentTypeId ?? "");
        setFieldValues(docRes.document.metadata ?? {});
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [documentId]);

  function goToNext() {
    const remaining = queue.filter((d) => d.id !== documentId);
    if (remaining.length > 0) {
      router.push(`/import-queue/${remaining[0].id}`);
    } else {
      router.push("/import-queue");
    }
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/documents/${documentId}`, {
        title,
        documentTypeId: documentTypeId || null,
        metadata: fieldValues,
        reviewStatus: "confirmed",
      });
      goToNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("reviewPanel.confirmError"));
      setSaving(false);
    }
  }

  async function handleDiscard() {
    setDiscarding(true);
    try {
      await api.delete(`/api/documents/${documentId}`);
      setDiscardOpen(false);
      goToNext();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("reviewPanel.discardError"));
      setDiscarding(false);
    }
  }

  if (loading) return null;
  if (notFound || !doc) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-muted">{t("reviewPanel.notFound")}</p>
        <Link href="/import-queue" className="mt-2 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          {t("reviewPanel.backToQueue")}
        </Link>
      </div>
    );
  }

  const fileUrl = `/api/documents/${doc.id}/file`;
  const downloadUrl = `${fileUrl}?download=1`;
  const remainingCount = queue.filter((d) => d.id !== documentId).length;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/import-queue" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
        {t("reviewPanel.backToQueue")}
      </Link>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("reviewPanel.title")}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {remainingCount > 0
              ? t("reviewPanel.moreAfter", { count: remainingCount })
              : t("reviewPanel.lastDocument")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setDiscardOpen(true)} disabled={saving || discarding}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            {t("reviewPanel.discard")}
          </Button>
          <Button onClick={handleConfirm} disabled={saving || discarding || !title.trim()}>
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
            {saving ? t("reviewPanel.confirming") : t("common.confirm")}
          </Button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="h-[75vh] overflow-hidden">
          <DocumentPreview
            documentId={doc.id}
            fileUrl={fileUrl}
            downloadUrl={downloadUrl}
            mimetype={doc.mimetype}
            title={doc.title}
          />
        </Card>

        <Card className="p-5">
          <DocumentEditFields
            title={title}
            onTitleChange={setTitle}
            documentTypeId={documentTypeId}
            onDocumentTypeIdChange={setDocumentTypeId}
            fieldValues={fieldValues}
            onFieldValuesChange={setFieldValues}
            documentTypes={documentTypes}
            idPrefix="review-field"
          />

          <div className="mt-4">
            <DocumentTagsEditor documentId={doc.id} initialTags={doc.tags} />
          </div>

          {doc.ocrText && (
            <details className="mt-5 rounded-lg border border-border bg-surface-2 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-muted">
                {t("reviewPanel.showOcrText")}
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted">
                {doc.ocrText}
              </pre>
            </details>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={discardOpen}
        title={t("reviewPanel.discardTitle")}
        description={t("reviewPanel.discardDescription", { title: doc.title })}
        confirmLabel={t("reviewPanel.discard")}
        loading={discarding}
        onConfirm={handleDiscard}
        onCancel={() => setDiscardOpen(false)}
      />
    </div>
  );
}
