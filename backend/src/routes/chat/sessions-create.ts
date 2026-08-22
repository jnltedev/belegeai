import type { FastifyInstance } from "fastify";
import { chatSessions } from "../../db/schema/index.js";
import { currentUser } from "../../lib/auth-guard.js";

export default async function createChatSessionRoute(fastify: FastifyInstance) {
  fastify.post("/sessions", async (request, reply) => {
    const user = currentUser(request);
    const [session] = await fastify.db.insert(chatSessions).values({ userId: user.id }).returning({
      id: chatSessions.id,
      title: chatSessions.title,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
    });

    return reply.code(201).send({ session });
  });
}
