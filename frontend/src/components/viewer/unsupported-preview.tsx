"use client";

import { FileWarning, Download } from "lucide-react";
import { useTranslation } from "@/lib/i18n/client";

export function UnsupportedPreview({ downloadUrl }: { downloadUrl: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-hover p-4 text-center">
      <FileWarning className="h-8 w-8 text-muted" strokeWidth={1.5} />
      <div>
        <p className="text-sm font-medium text-foreground">{t("unsupportedPreview.noPreview")}</p>
        <p className="mt-1 text-xs text-muted">{t("unsupportedPreview.downloadHint")}</p>
      </div>
      <a
        href={downloadUrl}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition hover:bg-accent-hover"
      >
        <Download className="h-3.5 w-3.5" strokeWidth={2} />
        {t("unsupportedPreview.download")}
      </a>
    </div>
  );
}
