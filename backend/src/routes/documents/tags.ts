import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { documents, documentTags, tags } from "../../db/schema/index.js";
import { NotFoundError } from "../../lib/errors.js";
import { colorForTagName } from "../../lib/tag-color.js";
import { deleteTagIfOrphaned } from "../../lib/tags.js";

const paramsSchema = z.object({ id: z.string().uuid() });
const removeParamsSchema = z.object({ id: z.string().uuid(), tagId: z.string().uuid() });
const addBodySchema = z.object({
  tagId: z.string().uuid().optional(),
  name: z.string().min(1).max(100).optional(),
});

export default async function documentTagsRoutes(fastify: FastifyInstance) {
  fastify.post("/:id/tags", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = addBodySchema.safeParse(request.body);
    if (!params.success || !body.success || (!body.data.tagId && !body.data.name)) {
      return reply.code(400).send({ error: "Provide either tagId or name" });
    }

    const doc = await fastify.db.query.documents.findFirst({ where: eq(documents.id, params.data.id) });
    if (!doc) throw new NotFoundError("Document not found");

    let tagId = body.data.tagId;
    if (!tagId && body.data.name) {
      const [created] = await fastify.db
        .insert(tags)
        .values({ name: body.data.name, color: colorForTagName(body.data.name) })
        .onConflictDoNothing({ target: tags.name })
        .returning();
      if (created) {
        tagId = created.id;
      } else {
        const existing = await fastify.db.query.tags.findFirst({ where: eq(tags.name, body.data.name) });
        tagId = existing?.id;
      }
    }
    if (!tagId) {
      return reply.code(400).send({ error: "Tag not found" });
    }

    await fastify.db.insert(documentTags).values({ documentId: doc.id, tagId }).onConflictDoNothing();

    const tag = await fastify.db.query.tags.findFirst({ where: eq(tags.id, tagId) });
    return reply.code(201).send({ tag });
  });

  fastify.delete("/:id/tags/:tagId", async (request, reply) => {
    const params = removeParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid request" });
    }

    await fastify.db
      .delete(documentTags)
      .where(and(eq(documentTags.documentId, params.data.id), eq(documentTags.tagId, params.data.tagId)));
    await deleteTagIfOrphaned(fastify.db, params.data.tagId);

    return reply.code(204).send();
  });
}
