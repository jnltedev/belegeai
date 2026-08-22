"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getIcon, ICON_NAMES } from "@/lib/icon-registry";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/client";
import type { DocumentType, DocumentTypeField } from "@/lib/types";

const COLOR_PALETTE = ["#2563eb", "#7c3aed", "#db2777", "#d97706", "#059669", "#0891b2", "#dc2626", "#4f46e5"];

const DEFAULT_SENDER_FIELD: DocumentTypeField = { key: "sender", type: "sender", label: "Absender" };

function emptyField(): DocumentTypeField {
  return { key: "", label: "", type: "text" };
}

// Every document type always has a "sender" field, first in the list - the
// backend enforces this too (this is just so the UI reflects it immediately
// instead of only after a round-trip save). Keeps whatever label already
// existed rather than resetting it.
function ensureSenderField(fields: DocumentTypeField[]): DocumentTypeField[] {
  const existing = fields.find((f) => f.key === "sender");
  const rest = fields.filter((f) => f.key !== "sender");
  const senderField: DocumentTypeField = existing
    ? { key: "sender", type: "sender", label: existing.label }
    : DEFAULT_SENDER_FIELD;
  return [senderField, ...rest];
}

export function DocumentTypeManagement() {
  const { t } = useTranslation();
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingType, setEditingType] = useState<DocumentType | null>(null);
  const [deletingType, setDeletingType] = useState<DocumentType | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function loadTypes() {
    const res = await api.get<{ documentTypes: DocumentType[] }>("/api/document-types");
    setTypes(res.documentTypes);
    setLoading(false);
  }

  useEffect(() => {
    loadTypes();
  }, []);

  async function handleDelete() {
    if (!deletingType) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/document-types/${deletingType.id}`);
      setDeletingType(null);
      await loadTypes();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t("documentTypeManagement.deleteFailed"));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("documentTypeManagement.title")}</h2>
          <p className="mt-0.5 text-xs text-muted">{t("documentTypeManagement.typesCount", { count: types.length })}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          {t("documentTypeManagement.newType")}
        </Button>
      </div>

      {!loading && (
        <div className="flex flex-col gap-2">
          {types.map((docType) => {
            const Icon = getIcon(docType.icon);
            return (
              <div key={docType.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${docType.color}1a`, color: docType.color }}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{docType.name}</p>
                  <p className="truncate text-xs text-muted">
                    {docType.fields.length > 0
                      ? docType.fields.map((f) => f.label).join(", ")
                      : t("documentTypeManagement.noStructuredFields")}
                  </p>
                </div>
                {docType.keywords.length > 0 && (
                  <div className="hidden max-w-[35%] flex-wrap justify-end gap-1 lg:flex">
                    {docType.keywords.slice(0, 4).map((k) => (
                      <Badge key={k} label={k} color={docType.color} />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setEditingType(docType)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
                  title={t("common.edit")}
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeletingType(docType);
                    setDeleteError(null);
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
                  title={t("common.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <DocumentTypeFormDialog open={createOpen} onClose={() => setCreateOpen(false)} onSaved={loadTypes} />
      <DocumentTypeFormDialog
        open={editingType !== null}
        existingType={editingType}
        onClose={() => setEditingType(null)}
        onSaved={loadTypes}
      />

      <ConfirmDialog
        open={deletingType !== null}
        title={t("documentTypeManagement.deleteConfirmTitle")}
        description={t("documentTypeManagement.deleteConfirmDescription", { name: deletingType?.name ?? "" })}
        confirmLabel={t("common.delete")}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeletingType(null);
          setDeleteError(null);
        }}
      />
      {deleteError && <p className="mt-2 text-xs text-danger">{deleteError}</p>}
    </Card>
  );
}

function DocumentTypeFormDialog({
  open,
  existingType,
  onClose,
  onSaved,
}: {
  open: boolean;
  existingType?: DocumentType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEditing = !!existingType;
  const [step, setStep] = useState<"name" | "review">(isEditing ? "review" : "name");
  const [name, setName] = useState(existingType?.name ?? "");
  const [icon, setIcon] = useState(existingType?.icon ?? ICON_NAMES[0]);
  const [color, setColor] = useState(existingType?.color ?? COLOR_PALETTE[0]);
  const [keywords, setKeywords] = useState(existingType?.keywords.join(", ") ?? "");
  const [fields, setFields] = useState<DocumentTypeField[]>(ensureSenderField(existingType?.fields ?? []));
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed form state whenever the dialog is (re)opened for a given type -
  // this dialog instance is reused across different "Bearbeiten" clicks.
  useEffect(() => {
    if (!open) return;
    setStep(isEditing ? "review" : "name");
    setName(existingType?.name ?? "");
    setIcon(existingType?.icon ?? ICON_NAMES[0]);
    setColor(existingType?.color ?? COLOR_PALETTE[0]);
    setKeywords(existingType?.keywords.join(", ") ?? "");
    setFields(ensureSenderField(existingType?.fields ?? []));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingType?.id]);

  async function handleGenerateSuggestion() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await api.post<{ suggestion: { keywords: string[]; fields: DocumentTypeField[] } }>(
        "/api/document-types/suggest",
        { name },
      );
      setKeywords(res.suggestion.keywords.join(", "));
      setFields(ensureSenderField(res.suggestion.fields));
      setStep("review");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documentTypeManagement.suggestionFailed"));
      setFields(ensureSenderField([]));
      setStep("review");
    } finally {
      setSuggesting(false);
    }
  }

  function skipToManual() {
    setFields(ensureSenderField([]));
    setStep("review");
  }

  function updateField(index: number, patch: Partial<DocumentTypeField>) {
    setFields((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f;
        // The sender field's key/type are locked - only its label is
        // renamable, regardless of what patch is applied here.
        if (f.key === "sender") return { ...f, label: patch.label ?? f.label };
        return { ...f, ...patch };
      }),
    );
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((f, i) => i !== index || f.key === "sender"));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const cleanFields = fields.filter((f) => f.key.trim() && f.label.trim());
      const payload = {
        name,
        icon,
        color,
        keywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        fields: cleanFields,
      };
      if (isEditing && existingType) {
        await api.patch(`/api/document-types/${existingType.id}`, payload);
      } else {
        await api.post("/api/document-types", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documentTypeManagement.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={
        isEditing
          ? t("documentTypeManagement.editDialogTitle", { name: existingType?.name ?? "" })
          : t("documentTypeManagement.newType")
      }
      onClose={onClose}
      maxWidthClassName="max-w-lg"
    >
      {step === "name" && (
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="new-type-name">{t("documentTypeManagement.nameLabel")}</Label>
            <Input
              id="new-type-name"
              placeholder={t("documentTypeManagement.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="mt-1 flex gap-2">
            <Button onClick={handleGenerateSuggestion} disabled={!name.trim() || suggesting}>
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              {suggesting ? t("documentTypeManagement.generating") : t("documentTypeManagement.generateSuggestion")}
            </Button>
            <Button variant="secondary" onClick={skipToManual} disabled={!name.trim()}>
              {t("documentTypeManagement.createManually")}
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          {isEditing && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              {t("documentTypeManagement.editFieldsHint")}
            </p>
          )}

          <div>
            <Label>{t("documentTypeManagement.nameLabel")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label>{t("documentTypeManagement.iconLabel")}</Label>
              <select
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {ICON_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("documentTypeManagement.colorLabel")}</Label>
              <div className="flex gap-1.5 pt-2">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={c}
                    className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="new-type-keywords">{t("documentTypeManagement.keywordsLabel")}</Label>
            <Input id="new-type-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label>{t("documentTypeManagement.fieldsLabel")}</Label>
              <button
                type="button"
                onClick={() => setFields((prev) => [...prev, emptyField()])}
                className="text-xs font-medium text-accent hover:underline"
              >
                {t("documentTypeManagement.addField")}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {fields.map((field, i) => {
                const isSenderField = field.key === "sender";
                return (
                  <div key={i} className="flex items-center gap-2">
                    {isSenderField ? (
                      <div className="flex flex-1 items-center rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
                        sender
                      </div>
                    ) : (
                      <Input
                        placeholder={t("documentTypeManagement.keyPlaceholder")}
                        value={field.key}
                        onChange={(e) => updateField(i, { key: e.target.value })}
                        className="flex-1"
                      />
                    )}
                    <Input
                      placeholder={t("documentTypeManagement.labelPlaceholder")}
                      value={field.label}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                      className="flex-1"
                    />
                    {isSenderField ? (
                      <div className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-muted">
                        {t("documentTypeManagement.senderFieldType")}
                      </div>
                    ) : (
                      <select
                        value={field.type}
                        onChange={(e) => updateField(i, { type: e.target.value as DocumentTypeField["type"] })}
                        className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      >
                        <option value="text">{t("documentTypeManagement.fieldType.text")}</option>
                        <option value="date">{t("documentTypeManagement.fieldType.date")}</option>
                        <option value="currency">{t("documentTypeManagement.fieldType.currency")}</option>
                      </select>
                    )}
                    {isSenderField ? (
                      <div
                        className="h-8 w-8 shrink-0"
                        title={t("documentTypeManagement.senderFieldLockedTooltip")}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeField(i)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted">{t("documentTypeManagement.senderFieldHint")}</p>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? t("documentTypeManagement.saving") : isEditing ? t("common.save") : t("documentTypeManagement.apply")}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
