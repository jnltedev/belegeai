import { Suspense } from "react";
import { DocumentsExplorer } from "@/components/documents-explorer";
import { serverFetch } from "@/lib/server-api";
import type { DocumentRecord } from "@/lib/types";

type SearchParams = Record<string, string | string[] | undefined>;

function toQueryString(searchParams: SearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string" && value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const { documents, total } = await serverFetch<{ documents: DocumentRecord[]; total: number }>(
    `/api/documents${toQueryString(resolvedSearchParams)}`,
  );

  return (
    <Suspense>
      <DocumentsExplorer initialDocuments={documents} initialTotal={total} />
    </Suspense>
  );
}
