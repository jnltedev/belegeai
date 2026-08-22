import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { chatSessions } from "../../db/schema/index.js";
import { currentUser } from "../../lib/auth-guard.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export default async function deleteChatSessionRoute(fastify: FastifyInstance) {
  fastify.delete("/sessions/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new BadRequestError("Invalid session id");

    const user = currentUser(request);
    // chat_messages rows cascade automatically (onDelete: "cascade" on the
    // session_id foreign key) - no manual cleanup needed.
    const [deleted] = await fastify.db
      .delete(chatSessions)
      .where(and(eq(chatSessions.id, params.data.id), eq(chatSessions.userId, user.id)))
      .returning();
    if (!deleted) throw new NotFoundError("Chat session not found");

    return reply.code(204).send();
  });
}
