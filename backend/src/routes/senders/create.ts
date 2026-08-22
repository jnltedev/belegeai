import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { findOrCreateSender } from "../../lib/senders.js";

const createBody = z.object({
  name: z.string().min(1).max(200),
});

export default async function createSenderRoute(fastify: FastifyInstance) {
  fastify.post("/", async (request, reply) => {
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const sender = await findOrCreateSender(fastify.db, parsed.data.name);
    return reply.code(201).send({ sender });
  });
}
