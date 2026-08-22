import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, ne, and } from "drizzle-orm";
import { documentTypes } from "../../db/schema/index.js";
import { requireAdmin } from "../../lib/auth-guard.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { documentTypeFieldSchema } from "./field-schema.js";
import { enforceSenderField } from "../../lib/document-type-fields.js";

const paramsSchema = z.object({ id: z.string().uuid() });

const updateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().min(1).max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  // Sent as the complete keyword/field list to save - the client is
  // responsible for building this list (add/remove/rename all happen in
  // the form before submit); removing a field here only stops it from
  // being asked for or displayed going forward. Existing documents' stored
  // metadata under that field's key is untouched.
  keywords: z.array(z.string()).optional(),
  fields: z.array(documentTypeFieldSchema).optional(),
});

export default async function updateDocumentTypeRoute(fastify: FastifyInstance) {
  fastify.patch("/:id", { onRequest: requireAdmin }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid document type id" });
    }
    const body = updateBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const existing = await fastify.db.query.documentTypes.findFirst({ where: eq(documentTypes.id, params.data.id) });
    if (!existing) {
      throw new NotFoundError("Document type not found");
    }

    if (body.data.name && body.data.name !== existing.name) {
      const nameTaken = await fastify.db.query.documentTypes.findFirst({
        where: and(eq(documentTypes.name, body.data.name), ne(documentTypes.id, existing.id)),
      });
      if (nameTaken) {
        throw new BadRequestError(`A document type named "${body.data.name}" already exists`);
      }
    }

    const [updated] = await fastify.db
      .update(documentTypes)
      .set({
        ...body.data,
        ...(body.data.fields ? { fields: enforceSenderField(body.data.fields) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(documentTypes.id, existing.id))
      .returning();

    return reply.send({ documentType: updated });
  });
}
