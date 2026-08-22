import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { chatMessages, chatSessions } from "../../db/schema/index.js";
import { currentUser } from "../../lib/auth-guard.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

const paramsSchema = z.object({ id: z.string().uuid() });

// Full message history for one session - used both on initial session
// switch and when the same account opens the app on another device (the
// session list alone only carries titles/timestamps, not the messages).
export default async function listChatSessionMessagesRoute(fastify: FastifyInstance) {
  fastify.get("/sessions/:id/messages", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new BadRequestError("Invalid session id");

    const user = currentUser(request);
    const session = await fastify.db.query.chatSessions.findFirst({
      where: and(eq(chatSessions.id, params.data.id), eq(chatSessions.userId, user.id)),
    });
    if (!session) throw new NotFoundError("Chat session not found");

    const messages = await fastify.db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        sources: chatMessages.sources,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, session.id))
      .orderBy(asc(chatMessages.createdAt));

    return reply.send({ messages });
  });
}
