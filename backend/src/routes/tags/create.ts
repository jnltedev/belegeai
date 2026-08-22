import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { findOrCreateTag } from "../../lib/tags.js";

const createBody = z.object({
  name: z.string().min(1).max(100),
});

export default async function createTagRoute(fastify: FastifyInstance) {
  fastify.post("/", async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const tag = await findOrCreateTag(fastify.db, parsed.data.name);
    return reply.code(201).send({ tag });
  });
}
