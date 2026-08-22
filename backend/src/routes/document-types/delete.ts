import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { documentTypes, documents } from "../../db/schema/index.js";
import { requireAdmin } from "../../lib/auth-guard.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export default async function deleteDocumentTypeRoute(fastify: FastifyInstance) {
  fastify.delete("/:id", { onRequest: requireAdmin }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid document type id" });
    }

    const existing = await fastify.db.query.documentTypes.findFirst({ where: eq(documentTypes.id, params.data.id) });
    if (!existing) throw new NotFoundError("Document type not found");

    // No FK cascade on documents.document_type_id by design - a type still
    // assigned to documents must be reassigned/removed there first, rather
    // than silently leaving those documents with a dangling or null type.
    const inUse = await fastify.db.query.documents.findFirst({
      where: eq(documents.documentTypeId, params.data.id),
      columns: { id: true },
    });
    if (inUse) {
      throw new BadRequestError(
        `Dieser Dokumenttyp ist noch mindestens einem Dokument zugewiesen und kann nicht gelöscht werden.`,
      );
    }

    await fastify.db.delete(documentTypes).where(eq(documentTypes.id, params.data.id));
    return reply.code(204).send();
  });
}
