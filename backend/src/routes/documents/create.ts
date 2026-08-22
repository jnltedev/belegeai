import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { documents, documentTags, extractionReview } from "../../db/schema/index.js";
import { currentUser } from "../../lib/auth-guard.js";
import { ensureSenderFromMetadata } from "../../lib/senders.js";
import { generateAndStoreEmbedding } from "../../lib/embeddings.js";

const aiSuggestionSchema = z
  .object({
    documentTypeId: z.string().uuid().nullable().optional(),
    documentTypeName: z.string().optional(),
    fieldValues: z.record(z.string(), z.unknown()).optional(),
    suggestedTags: z.array(z.string()).optional(),
    fullText: z.string().nullable().optional(),
  })
  .passthrough();

const createBody = z.object({
  fileKey: z.string().length(64),
  mimetype: z.string().max(100).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  title: z.string().min(1).max(300),
  documentTypeId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  tagIds: z.array(z.string().uuid()).optional().default([]),
  // Diagnostic/audit-only: whatever the upload step originally suggested for
  // this file, echoed back by the frontend. Never validated strictly and
  // never allowed to block a save.
  aiSuggestion: aiSuggestionSchema.optional(),
  // Set when this document is an attachment extracted from an already-saved
  // email document (see lib/email-ingest).
  parentDocumentId: z.string().uuid().optional(),
  // "pending" parks the document in the Import-Warteschlange instead of
  // filing it straight into the archive - the mobile client's "scan now,
  // sort it out at the desk later" path. Everything else about the request
  // is identical, so the already-computed AI suggestion is reused rather
  // than re-running extraction through lib/ingest.ts a second time.
  reviewStatus: z.enum(["confirmed", "pending"]).optional().default("confirmed"),
});

export default async function createRoute(fastify: FastifyInstance) {
  fastify.post("/", async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { tagIds, aiSuggestion, reviewStatus, ...values } = parsed.data;
    const user = currentUser(request);
    const pending = reviewStatus === "pending";

    // Deliberately skipped while pending, mirroring createPendingDocument()
    // in lib/ingest.ts: the sender here is still just an AI guess. Promoting
    // it to a real sender entity now would make it exactly-match itself by
    // the time a human opens the review panel, permanently hiding the
    // "similar existing senders" suggestions the SenderPicker exists for.
    // It becomes real when the review is confirmed (see update.ts).
    if (!pending) {
      await ensureSenderFromMetadata(fastify.db, values.metadata);
    }

    const document = await fastify.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(documents)
        .values({
          title: values.title,
          documentTypeId: values.documentTypeId,
          metadata: values.metadata,
          fileKey: values.fileKey,
          mimetype: values.mimetype,
          fileSizeBytes: values.sizeBytes,
          ocrText: aiSuggestion?.fullText ?? undefined,
          source: "manual",
          reviewStatus,
          // Only carried while pending - it's what the review panel reads to
          // prefill itself, and update.ts moves it into extraction_review
          // and clears it once a human confirms.
          pendingAiSuggestion: pending ? (aiSuggestion ?? null) : null,
          parentDocumentId: values.parentDocumentId,
          uploadedBy: user.id,
        })
        .returning();

      if (tagIds.length > 0) {
        await tx.insert(documentTags).values(tagIds.map((tagId) => ({ documentId: created.id, tagId })));
      }

      // No audit row while pending: extraction_review records a *human's*
      // decision, and nobody has reviewed this yet. update.ts writes it at
      // the moment the review panel confirms.
      if (aiSuggestion && !pending) {
        await tx.insert(extractionReview).values({
          documentId: created.id,
          suggestedJson: aiSuggestion,
          confirmedJson: {
            documentTypeId: values.documentTypeId ?? null,
            metadata: values.metadata,
            tagIds,
          },
          reviewedBy: user.id,
          reviewedAt: new Date(),
        });
      }

      return created;
    });

    // Fire-and-forget - never delay/fail the response on the embedding call.
    void generateAndStoreEmbedding(fastify, document.id);

    return reply.code(201).send({ document });
  });
}
