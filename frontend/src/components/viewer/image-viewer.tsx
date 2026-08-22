"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, Download, ExternalLink, AlertCircle } from "lucide-react";
import { ToolbarButton } from "./toolbar-button";
import { useTranslation } from "@/lib/i18n/client";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

interface ImageViewerProps {
  fileUrl: string;
  downloadUrl: string;
  title: string;
}

type Status = "loading" | "ready" | "error";

export function ImageViewer({ fileUrl, downloadUrl, title }: ImageViewerProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("loading");
  const [scale, setScale] = useState(1);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-2">
        <div className="flex items-center gap-1">
          <ToolbarButton
            label={t("imageViewer.zoomOut")}
            disabled={status !== "ready" || scale <= MIN_SCALE}
            onClick={() => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
          >
            <ZoomOut className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
          <span className="w-10 text-center font-mono text-xs text-muted">{Math.round(scale * 100)}%</span>
          <ToolbarButton
            label={t("imageViewer.zoomIn")}
            disabled={status !== "ready" || scale >= MAX_SCALE}
            onClick={() => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
          >
            <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
        </div>

        <div className="flex items-center gap-1">
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
            title={t("imageViewer.openInNewTab")}
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
          <a
            href={downloadUrl}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
            title={t("imageViewer.download")}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto bg-surface-hover p-4">
        {status === "loading" && (
          <div className="h-[80%] w-[60%] max-w-md animate-pulse rounded-md bg-surface-2" />
        )}
        {status === "error" && (
          <div className="flex flex-col items-center gap-2 text-center text-sm text-muted">
            <AlertCircle className="h-6 w-6" strokeWidth={1.75} />
            <p>{t("imageViewer.previewUnavailable")}</p>
            <a href={downloadUrl} className="font-medium text-accent hover:underline">
              {t("imageViewer.downloadOriginal")}
            </a>
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileUrl}
          alt={title}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
          style={{ transform: `scale(${scale})` }}
          className={`max-h-full max-w-full origin-center rounded-md shadow-elevated transition-transform ${
            status === "ready" ? "" : "hidden"
          }`}
        />
      </div>
    </div>
  );
}
