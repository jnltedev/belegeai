import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { documentTypes } from "../../db/schema/index.js";
import { requireAdmin } from "../../lib/auth-guard.js";
import { BadRequestError } from "../../lib/errors.js";
import { documentTypeFieldSchema } from "./field-schema.js";
import { enforceSenderField } from "../../lib/document-type-fields.js";

const createBody = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/),
  keywords: z.array(z.string()).default([]),
  fields: z.array(documentTypeFieldSchema).default([]),
});

export default async function createDocumentTypeRoute(fastify: FastifyInstance) {
  fastify.post("/", { onRequest: requireAdmin }, async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const existing = await fastify.db.query.documentTypes.findFirst({
      where: (dt, { eq }) => eq(dt.name, parsed.data.name),
    });
    if (existing) {
      throw new BadRequestError(`A document type named "${parsed.data.name}" already exists`);
    }

    const [created] = await fastify.db
      .insert(documentTypes)
      .values({ ...parsed.data, fields: enforceSenderField(parsed.data.fields) })
      .returning();
    return reply.code(201).send({ documentType: created });
  });
}
