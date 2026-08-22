import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { documents } from "../db/schema/index.js";

// Documents created before the `mimetype` column existed have it as null.
// Rather than a one-off migration script, backfill lazily from MinIO's
// stored object metadata the first time such a document is read, and cache
// the result on the row for next time.
export async function resolveMimetype(
  fastify: FastifyInstance,
  doc: { id: string; fileKey: string; mimetype: string | null },
): Promise<string> {
  if (doc.mimetype) return doc.mimetype;

  const contentType = await fastify.storage.getObjectContentType(doc.fileKey);
  const mimetype = contentType ?? "application/octet-stream";

  await fastify.db.update(documents).set({ mimetype }).where(eq(documents.id, doc.id));

  return mimetype;
}
