import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { documents, extractionReview } from "../../db/schema/index.js";
import { NotFoundError } from "../../lib/errors.js";
import { currentUser } from "../../lib/auth-guard.js";
import { ensureSenderFromMetadata } from "../../lib/senders.js";
import { generateAndStoreEmbedding } from "../../lib/embeddings.js";

const paramsSchema = z.object({ id: z.string().uuid() });

const updateBody = z.object({
  title: z.string().min(1).max(300).optional(),
  // null explicitly clears the type (→ "no type assigned"); undefined leaves it untouched.
  documentTypeId: z.string().uuid().nullable().optional(),
  // Sent as the full field-value set the client currently holds (including
  // values for fields hidden by the presently-selected type) - stored
  // verbatim, never pruned server-side, so switching types back and forth
  // never loses previously-entered data.
  metadata: z.record(z.string(), z.unknown()).optional(),
  // Only ever moves pending -> confirmed (the Import-Warteschlange's
  // "Bestätigen" action) - there's no path back to "pending" once a human
  // has looked at a document.
  reviewStatus: z.literal("confirmed").optional(),
});

export default async function updateRoute(fastify: FastifyInstance) {
  fastify.patch("/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid document id" });
    }
    const body = updateBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const existing = await fastify.db.query.documents.findFirst({ where: eq(documents.id, params.data.id) });
    if (!existing) {
      throw new NotFoundError("Document not found");
    }

    const { title, documentTypeId, metadata, reviewStatus } = body.data;
    const confirming = reviewStatus === "confirmed" && existing.reviewStatus === "pending";

    if (metadata !== undefined) {
      await ensureSenderFromMetadata(fastify.db, metadata);
    }

    // Both writes happen atomically - a failed extraction_review insert (e.g.
    // a stale session referencing a since-deleted user) must not leave the
    // document silently marked "confirmed" while the API call itself 500s;
    // that made a retry look like a fix when it had actually just skipped
    // the now-already-applied confirm step instead of properly redoing it.
    const updated = await fastify.db.transaction(async (tx) => {
      const [row] = await tx
        .update(documents)
        .set({
          ...(title !== undefined ? { title } : {}),
          ...(documentTypeId !== undefined ? { documentTypeId } : {}),
          ...(metadata !== undefined ? { metadata } : {}),
          ...(confirming ? { reviewStatus: "confirmed" as const, pendingAiSuggestion: null } : {}),
        })
        .where(eq(documents.id, existing.id))
        .returning();

      if (confirming) {
        const user = currentUser(request);
        await tx.insert(extractionReview).values({
          documentId: existing.id,
          suggestedJson: existing.pendingAiSuggestion ?? {},
          confirmedJson: { title: row.title, documentTypeId: row.documentTypeId, metadata: row.metadata },
          reviewedBy: user.id,
          reviewedAt: new Date(),
        });
      }

      return row;
    });

    // Re-embed on anything that changes what the document means semantically
    // - title or field values. Fire-and-forget, never blocks the response.
    if (title !== undefined || metadata !== undefined) {
      void generateAndStoreEmbedding(fastify, existing.id);
    }

    return reply.send({ document: updated });
  });
}
