"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

const POLL_INTERVAL_MS = 3_000;

// Shared between the desktop sidebar and the mobile nav menu - both are
// mounted simultaneously (one just CSS-hidden depending on viewport), so a
// single poll loop here avoids running it twice in parallel.
export function useQueueCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const res = await api.get<{ documents: unknown[] }>("/api/documents/queue");
        setCount(res.documents.length);
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
    poll();
    if (document.visibilityState === "visible") start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return count;
}
