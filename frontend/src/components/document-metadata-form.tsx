"use client";

import { useEffect, useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DynamicFieldInput } from "@/components/dynamic-field-input";
import { TagPicker } from "@/components/tag-picker";
import { useTranslation } from "@/lib/i18n/client";
import { api, ApiError } from "@/lib/api";
import type { UploadedFile } from "@/components/dropzone-upload";
import type { DocumentType, Tag } from "@/lib/types";

interface DocumentMetadataFormProps {
  file: UploadedFile;
  documentTypes: DocumentType[];
  parentDocumentId?: string;
  onSaved: (documentId: string) => void;
}

// Extensions we ever actually accept - a filename must end in one of these,
// however it's separated, to have that suffix stripped for a title. Some
// mail clients/MIME encoders hand us attachment filenames with the
// extension separated by "_" instead of "." (e.g. "Anlage_1_pdf") -
// normalize that case too, rather than leaving a mangled suffix on the title.
const KNOWN_EXTENSIONS = ["pdf", "png", "jpe?g", "tiff?", "webp", "eml", "msg"];
const EXTENSION_PATTERN = new RegExp(`[._](?:${KNOWN_EXTENSIONS.join("|")})$`, "i");

function titleFromFilename(filename: string) {
  return filename.replace(EXTENSION_PATTERN, "");
}

export function DocumentMetadataForm({ file, documentTypes, parentDocumentId, onSaved }: DocumentMetadataFormProps) {
  const { t } = useTranslation();
  const suggestion = file.suggestion ?? null;

  const [title, setTitle] = useState(file.suggestedTitle ?? titleFromFilename(file.originalFilename));
  const [documentTypeId, setDocumentTypeId] = useState(suggestion?.documentTypeId ?? "");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>(suggestion?.fieldValues ?? {});
  const [tags, setTags] = useState<Tag[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = documentTypes.find((t) => t.id === documentTypeId) ?? null;

  // AI-suggested tag names aren't real tags yet - resolve (find-or-create)
  // each once on mount so the picker starts pre-filled with real, colored
  // chips instead of juggling not-yet-persisted placeholders.
  useEffect(() => {
    const names = suggestion?.suggestedTags ?? [];
    if (names.length === 0) return;
    Promise.all(names.map((name) => api.post<{ tag: Tag }>("/api/tags", { name }).then((res) => res.tag))).then(
      setTags,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField(key: string, value: unknown) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreateTag(name: string): Promise<Tag> {
    const res = await api.post<{ tag: Tag }>("/api/tags", { name });
    return res.tag;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const tagIds = tags.map((t) => t.id);

      // Only send values for fields the selected type actually declares.
      const metadata: Record<string, unknown> = {};
      if (selectedType) {
        for (const field of selectedType.fields) {
          const value = fieldValues[field.key];
          if (field.type === "currency") {
            const v = value as { amount?: string; currency?: string } | undefined;
            if (v?.amount) metadata[field.key] = { amount: v.amount, currency: v.currency || "EUR" };
          } else if (typeof value === "string" && value.trim().length > 0) {
            metadata[field.key] = value;
          }
        }
      }

      const { document } = await api.post<{ document: { id: string } }>("/api/documents", {
        fileKey: file.fileKey,
        mimetype: file.mimetype,
        sizeBytes: file.sizeBytes,
        title,
        documentTypeId: documentTypeId || undefined,
        metadata,
        tagIds,
        aiSuggestion: suggestion ?? undefined,
        parentDocumentId,
      });

      onSaved(document.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documentMetadataForm.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {suggestion && (
        <div className="sm:col-span-2">
          <Badge label={t("documentMetadataForm.aiSuggestionBadge")} />
        </div>
      )}

      <div className="sm:col-span-2">
        <Label htmlFor={`title-${file.fileKey}`}>{t("documentMetadataForm.titleLabel")}</Label>
        <Input id={`title-${file.fileKey}`} required value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <Label htmlFor={`docType-${file.fileKey}`}>{t("documentMetadataForm.documentTypeLabel")}</Label>
        <select
          id={`docType-${file.fileKey}`}
          value={documentTypeId}
          onChange={(e) => setDocumentTypeId(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">{t("documentMetadataForm.selectPlaceholder")}</option>
          {documentTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {selectedType?.fields.map((field) => (
        <DynamicFieldInput
          key={field.key}
          field={field}
          value={fieldValues[field.key]}
          onChange={(value) => updateField(field.key, value)}
          idPrefix={`field-${file.fileKey}`}
        />
      ))}

      <div className="sm:col-span-2">
        <Label>{t("documentMetadataForm.tagsLabel")}</Label>
        <TagPicker value={tags} onChange={setTags} onCreateTag={handleCreateTag} />
      </div>

      {suggestion?.fullText && (
        <details className="sm:col-span-2 rounded-lg border border-border bg-surface-hover px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-muted">
            {t("documentMetadataForm.showOcrText")}
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted">{suggestion.fullText}</pre>
        </details>
      )}

      {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}

      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? t("documentMetadataForm.saving") : t("documentMetadataForm.submitLabel")}
        </Button>
      </div>
    </form>
  );
}
