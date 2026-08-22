"use client";

import { Input, Label } from "@/components/ui/input";
import { DynamicFieldInput } from "@/components/dynamic-field-input";
import { useTranslation } from "@/lib/i18n/client";
import type { DocumentType } from "@/lib/types";

// The editable title/type/dynamic-fields form, shared by the document-edit
// popup and the Import-Warteschlange review page (embedded inline there
// instead of in a dialog) - same fields, same behavior, two places to use them.
export function DocumentEditFields({
  title,
  onTitleChange,
  documentTypeId,
  onDocumentTypeIdChange,
  fieldValues,
  onFieldValuesChange,
  documentTypes,
  idPrefix,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  documentTypeId: string;
  onDocumentTypeIdChange: (value: string) => void;
  fieldValues: Record<string, unknown>;
  onFieldValuesChange: (values: Record<string, unknown>) => void;
  documentTypes: DocumentType[];
  idPrefix: string;
}) {
  const { t } = useTranslation();
  const selectedType = documentTypes.find((dt) => dt.id === documentTypeId) ?? null;

  function updateField(key: string, value: unknown) {
    onFieldValuesChange({ ...fieldValues, [key]: value });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label htmlFor={`${idPrefix}-title`}>{t("documentEditFields.title")}</Label>
        <Input id={`${idPrefix}-title`} required value={title} onChange={(e) => onTitleChange(e.target.value)} />
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-type`}>{t("documentEditFields.documentType")}</Label>
        <select
          id={`${idPrefix}-type`}
          value={documentTypeId}
          onChange={(e) => onDocumentTypeIdChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">{t("documentEditFields.noType")}</option>
          {documentTypes.map((dt) => (
            <option key={dt.id} value={dt.id}>
              {dt.name}
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
          idPrefix={idPrefix}
        />
      ))}
    </div>
  );
}
