import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { documents, documentTags } from "../../db/schema/index.js";
import { NotFoundError } from "../../lib/errors.js";
import { deleteTagIfOrphaned } from "../../lib/tags.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export default async function deleteRoute(fastify: FastifyInstance) {
  fastify.delete("/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid document id" });
    }

    const doc = await fastify.db.query.documents.findFirst({
      where: eq(documents.id, params.data.id),
    });
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    // Captured before deletion - the cascade below removes these join rows
    // automatically, but the tag rows themselves need an explicit orphan
    // check afterward.
    const tagLinks = await fastify.db
      .select({ tagId: documentTags.tagId })
      .from(documentTags)
      .where(eq(documentTags.documentId, doc.id));

    await fastify.db.delete(documents).where(eq(documents.id, doc.id));

    for (const { tagId } of tagLinks) {
      await deleteTagIfOrphaned(fastify.db, tagId);
    }

    // Content-addressed storage means the same file_key can legitimately be
    // shared by more than one document row (identical file content uploaded
    // under different metadata) - only remove the MinIO object once nothing
    // else references it, so we never delete an original still in use.
    // The row above is already gone, so any remaining match is a distinct document.
    const stillReferenced = await fastify.db.query.documents.findFirst({
      where: eq(documents.fileKey, doc.fileKey),
    });
    if (!stillReferenced) {
      await fastify.storage.deleteObject(doc.fileKey).catch((err) => {
        fastify.log.warn({ err, fileKey: doc.fileKey }, "Failed to delete orphaned object from storage");
      });
    }

    return reply.code(204).send();
  });
}
