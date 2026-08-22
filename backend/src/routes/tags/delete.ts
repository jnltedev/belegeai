import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { tags } from "../../db/schema/index.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export default async function deleteTagRoute(fastify: FastifyInstance) {
  fastify.delete("/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new BadRequestError("Invalid tag id");

    // document_tags rows cascade automatically (onDelete: "cascade" on the
    // tag_id foreign key) - no manual cleanup needed.
    const [deleted] = await fastify.db.delete(tags).where(eq(tags.id, params.data.id)).returning();
    if (!deleted) throw new NotFoundError("Tag not found");

    return reply.code(204).send();
  });
}
