"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { ZoomIn, ZoomOut, Download, Printer, ExternalLink, AlertCircle } from "lucide-react";
import { ToolbarButton, ToolbarDivider } from "./toolbar-button";
import { useTranslation } from "@/lib/i18n/client";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;
const PAGE_GAP = 16;
const CONTAINER_PADDING = 32;

interface PdfViewerProps {
  fileUrl: string;
  downloadUrl: string;
  title: string;
}

type Status = "loading" | "ready" | "error";

export function PdfViewer({ fileUrl, downloadUrl, title }: PdfViewerProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const pageProxiesRef = useRef<Map<number, PDFPageProxy>>(new Map());
  const canvasElsRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageContainerElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderTasksRef = useRef<Map<number, RenderTask>>(new Map());
  const renderedAtScaleRef = useRef<Map<number, number>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibilityRatiosRef = useRef<Map<number, number>>(new Map());

  const [status, setStatus] = useState<Status>("loading");
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomFactor, setZoomFactor] = useState(1);

  const fitScale = naturalSize && containerWidth > 0 ? (containerWidth - CONTAINER_PADDING) / naturalSize.width : 1;
  const scale = Math.max(0.1, fitScale * zoomFactor);

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setNumPages(0);
    setCurrentPage(1);
    setNaturalSize(null);
    pageProxiesRef.current.clear();
    renderedAtScaleRef.current.clear();

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        // Without these, pdf.js silently falls back to no-op stubs for
        // non-embedded fonts and JBIG2/OpenJPEG-compressed images - exactly
        // the compression scanned/faxed documents commonly use - instead of
        // actually rendering them, plus a wall of repeated console warnings.
        const doc = await pdfjsLib.getDocument({
          url: fileUrl,
          withCredentials: true,
          cMapUrl: "/pdf-cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdf-standard-fonts/",
          wasmUrl: "/pdf-wasm/",
        }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        const firstPage = await doc.getPage(1);
        if (cancelled) return;
        pageProxiesRef.current.set(1, firstPage);
        const viewport = firstPage.getViewport({ scale: 1 });
        setNaturalSize({ width: viewport.width, height: viewport.height });
        setNumPages(doc.numPages);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      renderTasksRef.current.forEach((task) => task.cancel());
      renderTasksRef.current.clear();
      pdfDocRef.current?.cleanup().catch(() => {});
      pdfDocRef.current = null;
    };
  }, [fileUrl]);

  // Track available width.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const renderPage = useCallback(
    async (pageNumber: number, atScale: number) => {
      const doc = pdfDocRef.current;
      const canvas = canvasElsRef.current.get(pageNumber);
      if (!doc || !canvas || atScale <= 0) return;

      renderTasksRef.current.get(pageNumber)?.cancel();

      let page = pageProxiesRef.current.get(pageNumber);
      if (!page) {
        page = await doc.getPage(pageNumber);
        pageProxiesRef.current.set(pageNumber, page);
      }

      const viewport = page.getViewport({ scale: atScale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const task = page.render({ canvas, viewport });
      renderTasksRef.current.set(pageNumber, task);
      try {
        await task.promise;
        renderedAtScaleRef.current.set(pageNumber, atScale);
      } catch {
        // Cancelled by a subsequent render - expected.
      }
    },
    [],
  );

  // (Re-)render every currently visible page whenever the target scale changes.
  useEffect(() => {
    if (status !== "ready" || scale <= 0) return;
    visiblePages.forEach((pageNumber) => {
      if (renderedAtScaleRef.current.get(pageNumber) !== scale) {
        renderPage(pageNumber, scale);
      }
    });
  }, [status, scale, visiblePages, renderPage]);

  // Observe which pages are on screen, for lazy rendering and the page indicator.
  useEffect(() => {
    if (status !== "ready" || numPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const pageNumber = Number((entry.target as HTMLElement).dataset.page);
            if (entry.isIntersecting) next.add(pageNumber);
            else next.delete(pageNumber);
            visibilityRatiosRef.current.set(pageNumber, entry.isIntersecting ? entry.intersectionRatio : 0);
          }

          // Whichever page occupies the most of the visible viewport "wins"
          // the page-number indicator, not merely the first one peeking in.
          let bestPage: number | null = null;
          let bestRatio = 0;
          next.forEach((pageNumber) => {
            const ratio = visibilityRatiosRef.current.get(pageNumber) ?? 0;
            if (bestPage === null || ratio > bestRatio) {
              bestPage = pageNumber;
              bestRatio = ratio;
            }
          });
          if (bestPage !== null) setCurrentPage(bestPage);

          return next;
        });
      },
      { root: scrollRef.current, rootMargin: "200px 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    observerRef.current = observer;

    pageContainerElsRef.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [status, numPages]);

  function registerPageContainer(pageNumber: number, el: HTMLDivElement | null) {
    if (el) {
      pageContainerElsRef.current.set(pageNumber, el);
      observerRef.current?.observe(el);
    } else {
      pageContainerElsRef.current.delete(pageNumber);
    }
  }

  function handlePrint() {
    printFrameRef.current?.contentWindow?.print();
  }

  const pageHeight = naturalSize ? naturalSize.height * scale : 0;
  const pageWidth = naturalSize ? naturalSize.width * scale : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-2">
        <span className="min-w-[5.5rem] text-center font-mono text-xs text-muted">
          {status === "ready"
            ? t("pdfViewer.pageIndicator", { current: currentPage, total: numPages })
            : "-"}
        </span>

        <div className="flex items-center gap-1">
          <ToolbarButton
            label={t("pdfViewer.zoomOut")}
            disabled={status !== "ready" || zoomFactor <= MIN_ZOOM}
            onClick={() => setZoomFactor((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
          >
            <ZoomOut className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
          <span className="w-10 text-center font-mono text-xs text-muted">{Math.round(zoomFactor * 100)}%</span>
          <ToolbarButton
            label={t("pdfViewer.zoomIn")}
            disabled={status !== "ready" || zoomFactor >= MAX_ZOOM}
            onClick={() => setZoomFactor((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
          >
            <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton label={t("pdfViewer.print")} disabled={status !== "ready"} onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
            title={t("pdfViewer.openInNewTab")}
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
          <a
            href={downloadUrl}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
            title={t("pdfViewer.download")}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto bg-surface-hover">
        {status === "loading" && (
          <div className="flex h-full items-center justify-center p-4">
            <div className="h-[80%] w-[60%] max-w-md animate-pulse rounded-md bg-surface-2" />
          </div>
        )}
        {status === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted">
            <AlertCircle className="h-6 w-6" strokeWidth={1.75} />
            <p>{t("pdfViewer.previewUnavailable")}</p>
            <a href={downloadUrl} className="font-medium text-accent hover:underline">
              {t("pdfViewer.downloadOriginal")}
            </a>
          </div>
        )}
        {status === "ready" && (
          <div className="flex flex-col items-center py-4" style={{ gap: PAGE_GAP }}>
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => (
              <div
                key={pageNumber}
                data-page={pageNumber}
                ref={(el) => registerPageContainer(pageNumber, el)}
                className="shrink-0 bg-white shadow-elevated"
                style={{ width: pageWidth || undefined, height: pageHeight || undefined }}
              >
                <canvas
                  ref={(el) => {
                    if (el) canvasElsRef.current.set(pageNumber, el);
                    else canvasElsRef.current.delete(pageNumber);
                  }}
                  className="block"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <iframe
        ref={printFrameRef}
        src={fileUrl}
        title={t("pdfViewer.printFrameTitle", { title })}
        className="hidden"
      />
    </div>
  );
}
