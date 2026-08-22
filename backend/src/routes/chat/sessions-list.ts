import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { chatSessions } from "../../db/schema/index.js";
import { currentUser } from "../../lib/auth-guard.js";

// Scoped to the logged-in user only - this is what makes the session list
// follow a user across devices: any browser they log into runs the same
// query against the same rows.
export default async function listChatSessionsRoute(fastify: FastifyInstance) {
  fastify.get("/sessions", async (request, reply) => {
    const user = currentUser(request);
    const sessions = await fastify.db
      .select({
        id: chatSessions.id,
        title: chatSessions.title,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
      })
      .from(chatSessions)
      .where(eq(chatSessions.userId, user.id))
      .orderBy(desc(chatSessions.updatedAt));

    return reply.send({ sessions });
  });
}
