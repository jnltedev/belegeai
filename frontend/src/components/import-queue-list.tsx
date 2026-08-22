"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Inbox } from "lucide-react";
import { QueueTable } from "@/components/queue-table";
import { Pagination } from "@/components/ui/pagination";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/client";
import type { QueueDocument } from "@/lib/types";

const POLL_INTERVAL_MS = 3_000;
const PAGE_SIZE = 15;

export function ImportQueueList({
  initialDocuments,
  initialTotal,
}: {
  initialDocuments: QueueDocument[];
  initialTotal: number;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const [documents, setDocuments] = useState(initialDocuments);
  const [total, setTotal] = useState(initialTotal);
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const pageRef = useRef(page);
  pageRef.current = page;

  function setPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  // Re-fetch the current page whenever it changes (initial load already came
  // from the server component).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    api.get<{ documents: QueueDocument[]; total: number }>(`/api/documents/queue?page=${page}`).then((res) => {
      setDocuments(res.documents);
      setTotal(res.total);
    });
  }, [page]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const res = await api.get<{ documents: QueueDocument[]; total: number }>(
          `/api/documents/queue?page=${pageRef.current}`,
        );
        if (JSON.stringify(res.documents) !== JSON.stringify(documentsRef.current)) {
          setDocuments(res.documents);
          setTotal(res.total);
        }
      } catch {
        // transient network hiccup - next tick will retry
      }
    }

    function start() {
      if (interval) return;
      interval = setInterval(poll, POLL_INTERVAL_MS);
    }
    function stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        poll();
        start();
      } else {
        stop();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (document.visibilityState === "visible") start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{t("importQueueList.title")}</h1>
        <p className="mt-1 text-sm text-muted">
          {total === 1
            ? t("importQueueList.pendingSingular", { count: total })
            : t("importQueueList.pendingPlural", { count: total })}
        </p>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface px-6 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Inbox className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">{t("importQueueList.emptyTitle")}</p>
          <p className="mt-1 max-w-xs text-sm text-muted">{t("importQueueList.emptyDescription")}</p>
        </div>
      ) : (
        <>
          <QueueTable documents={documents} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
