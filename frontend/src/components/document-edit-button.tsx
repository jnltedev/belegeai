"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DocumentEditFields } from "@/components/document-edit-fields";
import { useTranslation } from "@/lib/i18n/client";
import { api, ApiError } from "@/lib/api";
import type { DocumentRecord, DocumentType } from "@/lib/types";

export function DocumentEditButton({ document }: { document: DocumentRecord }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);

  const [title, setTitle] = useState(document.title);
  const [documentTypeId, setDocumentTypeId] = useState(document.documentTypeId ?? "");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>(document.metadata ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && documentTypes.length === 0) {
      api.get<{ documentTypes: DocumentType[] }>("/api/document-types").then((res) => setDocumentTypes(res.documentTypes));
    }
  }, [open, documentTypes.length]);

  function openDialog() {
    setTitle(document.title);
    setDocumentTypeId(document.documentTypeId ?? "");
    setFieldValues(document.metadata ?? {});
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/documents/${document.id}`, {
        title,
        documentTypeId: documentTypeId || null,
        // The full field-value map is sent, not just the currently visible
        // fields - values for fields the selected type doesn't show stay
        // preserved in case the user switches type again later.
        metadata: fieldValues,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documentEditButton.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={openDialog}>
        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
        {t("common.edit")}
      </Button>

      <Dialog open={open} title={t("documentEditButton.dialogTitle")} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4">
          <DocumentEditFields
            title={title}
            onTitleChange={setTitle}
            documentTypeId={documentTypeId}
            onDocumentTypeIdChange={setDocumentTypeId}
            fieldValues={fieldValues}
            onFieldValuesChange={setFieldValues}
            documentTypes={documentTypes}
            idPrefix="edit-field"
          />

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? t("documentEditButton.saving") : t("common.save")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
