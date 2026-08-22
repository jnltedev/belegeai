import { eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { documentEmbeddings, documents } from "../db/schema/index.js";
import type { DocumentTypeField } from "../db/schema/document-types.js";

const MAX_EMBEDDING_TEXT_CHARS = 8000;

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "amount" in (value as Record<string, unknown>)) {
    const v = value as { amount?: string; currency?: string | null };
    return v.amount ? `${v.amount} ${v.currency ?? ""}`.trim() : "";
  }
  return String(value);
}

interface EmbeddingSourceDoc {
  title: string;
  metadata: Record<string, unknown>;
  ocrText: string | null;
  documentType: { name: string; fields: DocumentTypeField[] } | null;
  documentTags: { tag: { name: string } }[];
}

export function buildEmbeddingText(doc: EmbeddingSourceDoc): string {
  const type = doc.documentType;
  const fieldsText = type
    ? type.fields
        .map((f) => {
          const formatted = formatMetadataValue(doc.metadata[f.key]);
          return formatted ? `${f.label}: ${formatted}` : null;
        })
        .filter((v): v is string => v !== null)
        .join(", ")
    : "";
  const tagNames = doc.documentTags.map((dt) => dt.tag.name).join(", ");

  const lines = [`Titel: ${doc.title}`, `Typ: ${type?.name ?? "kein Typ"}`];
  if (fieldsText) lines.push(`Felder: ${fieldsText}`);
  if (tagNames) lines.push(`Tags: ${tagNames}`);
  if (doc.ocrText) lines.push(`Inhalt: ${doc.ocrText}`);
  return lines.join("\n").slice(0, MAX_EMBEDDING_TEXT_CHARS);
}

// Fire-and-forget from the caller's perspective - a failed/unconfigured
// embedding call must never break a document create/update/ingest call.
// Called at ingestion time regardless of review_status: unlike sender
// auto-creation, embedding a not-yet-confirmed document creates no visible
// named entity and carries no "wrong value became permanently real" risk,
// so there's no reason to delay it - it just means the document is already
// searchable by the time it's confirmed. The chat route itself still only
// ever retrieves confirmed documents.
export async function generateAndStoreEmbedding(fastify: FastifyInstance, documentId: string): Promise<void> {
  try {
    const doc = await fastify.db.query.documents.findFirst({
      where: eq(documents.id, documentId),
      with: { documentType: true, documentTags: { with: { tag: true } } },
    });
    if (!doc) return;

    const text = buildEmbeddingText(doc);
    const embedding = await fastify.ai.embedText(text);
    if (!embedding) return;

    await fastify.db
      .insert(documentEmbeddings)
      .values({ documentId, embedding, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: documentEmbeddings.documentId,
        set: { embedding, updatedAt: new Date() },
      });
  } catch (err) {
    fastify.log.warn({ err, documentId }, "Failed to generate/store document embedding");
  }
}

// Startup + periodic sweep (mirrors sweepOrphanedTags in lib/tags.ts) -
// catches documents created before embeddings existed, or where a prior
// embedText call failed (e.g. transient API error, or no key configured at
// the time) and never got backfilled.
export async function backfillMissingEmbeddings(fastify: FastifyInstance): Promise<number> {
  const missing = await fastify.db
    .select({ id: documents.id })
    .from(documents)
    .leftJoin(documentEmbeddings, eq(documentEmbeddings.documentId, documents.id))
    .where(isNull(documentEmbeddings.documentId));

  for (const { id } of missing) {
    await generateAndStoreEmbedding(fastify, id);
  }
  return missing.length;
}
