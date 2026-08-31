"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, FileText, Mail, Paperclip } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DropzoneUpload, type UploadedFile } from "@/components/dropzone-upload";
import { DocumentMetadataForm } from "@/components/document-metadata-form";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/api";
import type { DocumentType } from "@/lib/types";

const EMAIL_MIMETYPES = new Set(["message/rfc822", "application/vnd.ms-outlook"]);

interface PendingFile extends UploadedFile {
  savedDocumentId: string | null;
  parentFileKey?: string;
  /// How deep in the mail this came from, for the indentation. A forwarded
  /// invoice sits at 2: your covering note contains the original mail, and
  /// the original mail contains the PDF.
  depth: number;
}

/// Flattens the whole tree depth first, so a mail found inside a mail is
/// listed under the one it actually came from rather than being dropped.
function flattenUpload(file: UploadedFile, parentFileKey?: string, depth = 0): PendingFile[] {
  const { emailAttachments, ...rest } = file;
  const self: PendingFile = { ...rest, savedDocumentId: null, parentFileKey, depth };
  const children = (emailAttachments ?? []).flatMap((att) => flattenUpload(att, file.fileKey, depth + 1));
  return [self, ...children];
}

export default function UploadPage() {
  const { t } = useTranslation();
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);

  useEffect(() => {
    api.get<{ documentTypes: DocumentType[] }>("/api/document-types").then((res) => setDocumentTypes(res.documentTypes));
  }, []);

  function handleUploaded(files: UploadedFile[]) {
    // Wrapped, not passed by reference: flatMap hands the callback an index
    // as its second argument, which flattenUpload would take for a parent key.
    setPendingFiles((prev) => [...prev, ...files.flatMap((file) => flattenUpload(file))]);
  }

  function handleSaved(fileKey: string, documentId: string) {
    setPendingFiles((prev) => prev.map((f) => (f.fileKey === fileKey ? { ...f, savedDocumentId: documentId } : f)));
  }


  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">{t("uploadPage.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("uploadPage.description")}</p>

      <div className="mt-6 flex flex-col gap-3">
        <DropzoneUpload onUploaded={handleUploaded} />
      </div>

      {pendingFiles.length > 0 && (
        <div className="mt-8 flex flex-col gap-4">
          {pendingFiles.map((file) => {
            const isEmail = EMAIL_MIMETYPES.has(file.mimetype);
            const parent = file.parentFileKey
              ? pendingFiles.find((f) => f.fileKey === file.parentFileKey)
              : undefined;

            // The row already exists on the server. Rendering the metadata
            // form here would create a second document for the same file.
            const card = file.queued ? (
              <QueuedFileCard filename={file.originalFilename} />
            ) : (
              <PendingFileCard
                file={file}
                documentTypes={documentTypes}
                icon={parent ? (isEmail ? Mail : Paperclip) : isEmail ? Mail : FileText}
                label={
                  parent
                    ? t("uploadPage.attachmentFrom", {
                        title: parent.suggestedTitle ?? parent.originalFilename,
                      })
                    : undefined
                }
                // Undefined until the parent exists, which is why saving is
                // held back below: without it the two would be filed as
                // unrelated documents and could never be linked afterwards.
                parentDocumentId={parent?.savedDocumentId ?? undefined}
                blockedByParent={parent !== undefined && parent.savedDocumentId === null}
                onSaved={(documentId) => handleSaved(file.fileKey, documentId)}
              />
            );

            return (
              <div
                key={file.fileKey}
                style={{ marginLeft: file.depth * 24 }}
                className={file.depth > 0 ? "border-l-2 border-border pl-6" : undefined}
              >
                {card}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/// Shown when the archive runs on a local model: the file is stored and
/// waiting in the review queue, and analysis catches up in the background.
function QueuedFileCard({ filename }: { filename: string }) {
  const { t } = useTranslation();
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
          <Clock className="h-4.5 w-4.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{filename}</p>
          <p className="mt-1 text-sm text-muted">{t("uploadPage.queued.description")}</p>
          <Link
            href="/import-queue"
            className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
          >
            {t("uploadPage.queued.openQueue")}
          </Link>
        </div>
      </div>
    </Card>
  );
}

function PendingFileCard({
  file,
  documentTypes,
  icon: Icon,
  label,
  parentDocumentId,
  blockedByParent,
  onSaved,
}: {
  file: PendingFile;
  documentTypes: DocumentType[];
  icon: typeof FileText;
  label?: string;
  parentDocumentId?: string;
  /// True while the email this came from is still unsaved. The form is held
  /// back rather than saved without a link, because the connection between a
  /// mail and its attachment cannot be established after the fact.
  blockedByParent?: boolean;
  onSaved: (documentId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
          <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          {label && <p className="truncate text-xs text-muted">{label}</p>}
          <p className="truncate text-sm font-medium text-foreground">{file.originalFilename}</p>
          <p className="text-xs text-muted">{(file.sizeBytes / 1024).toFixed(0)} KB</p>
        </div>
      </div>

      {file.savedDocumentId ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-accent">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
          {t("uploadPage.saved")}{" "}
          <Link href={`/documents/${file.savedDocumentId}`} className="underline underline-offset-2">
            {t("uploadPage.viewDocument")}
          </Link>
        </p>
      ) : blockedByParent ? (
        <p className="text-sm text-muted">{t("uploadPage.saveParentFirst")}</p>
      ) : (
        <DocumentMetadataForm
          file={file}
          documentTypes={documentTypes}
          parentDocumentId={parentDocumentId}
          onSaved={onSaved}
        />
      )}
    </Card>
  );
}
