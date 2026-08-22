"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslation } from "@/lib/i18n/client";
import { api, ApiError } from "@/lib/api";

export function DocumentDeleteButton({ documentId, title }: { documentId: string; title: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/api/documents/${documentId}`);
      router.push("/documents");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documentDeleteButton.deleteFailed"));
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        {t("common.delete")}
      </Button>

      <ConfirmDialog
        open={open}
        title={t("documentDeleteButton.confirmTitle")}
        description={t("documentDeleteButton.confirmDescription", { title })}
        confirmLabel={t("documentDeleteButton.confirmLabel")}
        loading={loading}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
      {error && <p className="mt-2 text-right text-xs text-danger">{error}</p>}
    </>
  );
}
