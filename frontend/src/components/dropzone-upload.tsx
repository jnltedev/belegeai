"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, FileText, Mail, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/client";
import type { ExtractionSuggestion } from "@/lib/types";

export interface UploadedFile {
  fileKey: string;
  originalFilename: string;
  sizeBytes: number;
  mimetype: string;
  suggestion?: ExtractionSuggestion | null;
  suggestedTitle?: string;
  emailAttachments?: UploadedFile[];
}

interface SelectedFile {
  file: File;
  previewUrl: string | null;
}

interface DropzoneUploadProps {
  onUploaded: (files: UploadedFile[]) => void;
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function DropzoneUpload({ onUploaded }: DropzoneUploadProps) {
  const { t } = useTranslation();
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      selectedFiles.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      setError(null);
      setUploading(true);
      setSelectedFiles(
        acceptedFiles.map((file) => ({
          file,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        })),
      );
      try {
        const formData = new FormData();
        acceptedFiles.forEach((file) => formData.append("file", file));
        const result = await api.post<{ files: UploadedFile[] }>("/api/documents/upload", formData);
        onUploaded(result.files);
        setSelectedFiles((prev) => {
          prev.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
          return [];
        });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("dropzoneUpload.uploadFailed"));
      } finally {
        setUploading(false);
      }
    },
    [onUploaded, t],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/tiff": [".tif", ".tiff"],
      "image/webp": [".webp"],
      "message/rfc822": [".eml"],
      "application/vnd.ms-outlook": [".msg"],
      // Fallback: some browsers/OSes report a generic type for .eml/.msg -
      // real validation happens server-side regardless.
      "application/octet-stream": [".eml", ".msg"],
    },
    disabled: uploading,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-6 py-14 text-center transition ${
          isDragActive ? "border-accent bg-accent/5" : "border-border bg-surface hover:bg-surface-hover"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
          <UploadCloud className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {isDragActive ? t("dropzoneUpload.dropHere") : t("dropzoneUpload.dragOrClick")}
          </p>
          <p className="mt-1 text-xs text-muted">{t("dropzoneUpload.acceptedTypes")}</p>
        </div>
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-danger">
          <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
          {error}
        </p>
      )}

      {selectedFiles.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {selectedFiles.map(({ file, previewUrl }) => (
            <div
              key={file.name + file.size}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted">
                  {/\.(eml|msg)$/i.test(file.name) ? (
                    <Mail className="h-4.5 w-4.5" strokeWidth={1.75} />
                  ) : (
                    <FileText className="h-4.5 w-4.5" strokeWidth={1.75} />
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted">{formatSize(file.size)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-accent">
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                {t("dropzoneUpload.analyzing")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
