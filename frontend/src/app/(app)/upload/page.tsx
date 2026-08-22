"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, Mail, Paperclip } from "lucide-react";
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
}

function flattenUpload(file: UploadedFile): PendingFile[] {
  const { emailAttachments, ...rest } = file;
  const parent: PendingFile = { ...rest, savedDocumentId: null };
  const children: PendingFile[] = (emailAttachments ?? []).map((att) => ({
    ...att,
    savedDocumentId: null,
    parentFileKey: file.fileKey,
  }));
  return [parent, ...children];
}

export default function UploadPage() {
  const { t } = useTranslation();
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);

  useEffect(() => {
    api.get<{ documentTypes: DocumentType[] }>("/api/document-types").then((res) => setDocumentTypes(res.documentTypes));
  }, []);

  function handleUploaded(files: UploadedFile[]) {
    setPendingFiles((prev) => [...prev, ...files.flatMap(flattenUpload)]);
  }

  function handleSaved(fileKey: string, documentId: string) {
    setPendingFiles((prev) => prev.map((f) => (f.fileKey === fileKey ? { ...f, savedDocumentId: documentId } : f)));
  }

  const topLevel = pendingFiles.filter((f) => !f.parentFileKey);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">{t("uploadPage.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("uploadPage.description")}</p>

      <div className="mt-6 flex flex-col gap-3">
        <DropzoneUpload onUploaded={handleUploaded} />
      </div>

      {topLevel.length > 0 && (
        <div className="mt-8 flex flex-col gap-6">
          {topLevel.map((file) => {
            const isEmail = EMAIL_MIMETYPES.has(file.mimetype);
            const attachments = pendingFiles.filter((f) => f.parentFileKey === file.fileKey);
            return (
              <div key={file.fileKey} className="flex flex-col gap-3">
                <PendingFileCard
                  file={file}
                  documentTypes={documentTypes}
                  icon={isEmail ? Mail : FileText}
                  onSaved={(documentId) => handleSaved(file.fileKey, documentId)}
                />
                {attachments.length > 0 && (
                  <div className="ml-6 flex flex-col gap-3 border-l-2 border-border pl-6">
                    {attachments.map((att) => (
                      <PendingFileCard
                        key={att.fileKey}
                        file={att}
                        documentTypes={documentTypes}
                        icon={Paperclip}
                        label={t("uploadPage.attachmentFrom", {
                          title: file.suggestedTitle ?? file.originalFilename,
                        })}
                        parentDocumentId={file.savedDocumentId ?? undefined}
                        onSaved={(documentId) => handleSaved(att.fileKey, documentId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PendingFileCard({
  file,
  documentTypes,
  icon: Icon,
  label,
  parentDocumentId,
  onSaved,
}: {
  file: PendingFile;
  documentTypes: DocumentType[];
  icon: typeof FileText;
  label?: string;
  parentDocumentId?: string;
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
