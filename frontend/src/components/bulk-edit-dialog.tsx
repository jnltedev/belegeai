"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DynamicFieldInput } from "@/components/dynamic-field-input";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/client";
import type { DocumentRecord, DocumentType, DocumentTypeField } from "@/lib/types";

// Only fields present on every selected document's assigned type - showing
// a field that doesn't apply to all of them would be misleading, and the
// name/title is deliberately never included here (it's inherently per-
// document, editing it in bulk wouldn't make sense).
function commonFields(docs: DocumentRecord[], documentTypes: DocumentType[]): DocumentTypeField[] {
  const typesById = new Map(documentTypes.map((t) => [t.id, t]));
  const fieldMaps = docs.map((d) => {
    const type = d.documentTypeId ? typesById.get(d.documentTypeId) : undefined;
    return new Map((type?.fields ?? []).map((f) => [f.key, f]));
  });
  if (fieldMaps.length === 0 || fieldMaps.some((m) => m.size === 0)) return [];

  const [first, ...rest] = fieldMaps;
  const common: DocumentTypeField[] = [];
  for (const [key, field] of first) {
    if (rest.every((m) => m.has(key))) common.push(field);
  }
  return common;
}

export function BulkEditDialog({
  open,
  documents,
  documentTypes,
  onClose,
  onSaved,
}: {
  open: boolean;
  documents: DocumentRecord[];
  documentTypes: DocumentType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();

  // Only fields the admin actually touches end up as keys here - untouched
  // fields are left completely alone on every document, same "sparse patch"
  // semantics as a single-document edit, just applied across many at once.
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(() => commonFields(documents, documentTypes), [documents, documentTypes]);

  function updateField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleClose() {
    setValues({});
    setError(null);
    onClose();
  }

  async function handleSave() {
    const touchedKeys = Object.keys(values);
    if (touchedKeys.length === 0) {
      handleClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        documents.map((doc) =>
          api.patch(`/api/documents/${doc.id}`, {
            metadata: { ...doc.metadata, ...values },
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        setError(t("bulkEditDialog.updateFailed", { failed, total: documents.length }));
        setSaving(false);
        return;
      }
      setValues({});
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("bulkEditDialog.saveError"));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={t("bulkEditDialog.title", { count: documents.length })}
      onClose={handleClose}
      maxWidthClassName="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted">{t("bulkEditDialog.description")}</p>

        {fields.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
            {t("bulkEditDialog.noCommonFields")}
          </p>
        ) : (
          fields.map((field) => (
            <DynamicFieldInput
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(value) => updateField(field.key, value)}
              idPrefix="bulk-edit-field"
            />
          ))
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        {fields.length > 0 && (
          <Button onClick={handleSave} disabled={saving || Object.keys(values).length === 0}>
            {saving ? t("bulkEditDialog.saving") : t("bulkEditDialog.updateButton", { count: documents.length })}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
