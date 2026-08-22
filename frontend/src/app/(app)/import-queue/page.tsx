import { ImportQueueList } from "@/components/import-queue-list";
import { serverFetch } from "@/lib/server-api";
import type { QueueDocument } from "@/lib/types";

export default async function ImportQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const { documents, total } = await serverFetch<{ documents: QueueDocument[]; total: number }>(
    `/api/documents/queue?page=${page ?? "1"}`,
  );

  return <ImportQueueList initialDocuments={documents} initialTotal={total} />;
}
