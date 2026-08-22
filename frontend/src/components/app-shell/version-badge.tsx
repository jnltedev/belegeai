"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface VersionInfo {
  version: string;
  update: {
    available: boolean;
    latest: string | null;
    name: string | null;
    url: string | null;
    publishedAt: string | null;
  };
}

/// Reads the running version once per mount. The backend caches the GitHub
/// lookup behind it, so this stays a local call.
export function useVersion(): VersionInfo | null {
  const [info, setInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<VersionInfo>("/api/version")
      .then((res) => {
        if (!cancelled) setInfo(res);
      })
      .catch(() => {
        // Signed-out pages get a 401 here. The footer simply shows no
        // version rather than an error nobody can act on.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}

export function VersionBadge() {
  const info = useVersion();
  if (!info) return null;
  return <span className="tabular-nums">v{info.version}</span>;
}
