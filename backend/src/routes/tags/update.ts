import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { tags } from "../../db/schema/index.js";
import { TAG_COLOR_PALETTE } from "../../lib/tag-color.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

const paramsSchema = z.object({ id: z.string().uuid() });
const updateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.enum(TAG_COLOR_PALETTE as [string, ...string[]]).optional(),
});

export default async function updateTagRoute(fastify: FastifyInstance) {
  fastify.patch("/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new BadRequestError("Invalid tag id");
    const body = updateBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }
    if (!body.data.name && !body.data.color) {
      throw new BadRequestError("Nothing to update");
    }

    const existing = await fastify.db.query.tags.findFirst({ where: (t, { eq: eqOp }) => eqOp(t.id, params.data.id) });
    if (!existing) throw new NotFoundError("Tag not found");

    if (body.data.name) {
      const nameTaken = await fastify.db.query.tags.findFirst({
        where: (t, { and: andOp, eq: eqOp, ne }) => andOp(eqOp(t.name, body.data.name as string), ne(t.id, params.data.id)),
      });
      if (nameTaken) throw new BadRequestError("Ein Tag mit diesem Namen existiert bereits");
    }

    const [updated] = await fastify.db
      .update(tags)
      .set({ ...(body.data.name ? { name: body.data.name } : {}), ...(body.data.color ? { color: body.data.color } : {}) })
      .where(eq(tags.id, params.data.id))
      .returning();

    return reply.send({ tag: updated });
  });
}
