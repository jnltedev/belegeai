import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { chatSessions } from "../../db/schema/index.js";
import { currentUser } from "../../lib/auth-guard.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

const paramsSchema = z.object({ id: z.string().uuid() });
const updateBody = z.object({ title: z.string().trim().min(1).max(120) });

export default async function updateChatSessionRoute(fastify: FastifyInstance) {
  fastify.patch("/sessions/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new BadRequestError("Invalid session id");
    const body = updateBody.safeParse(request.body);
    if (!body.success) throw new BadRequestError("Invalid title");

    const user = currentUser(request);
    // Ownership is enforced directly in the WHERE clause - a session
    // belonging to another user simply doesn't match, and returns 404
    // rather than 403, so existence isn't leaked either.
    const [updated] = await fastify.db
      .update(chatSessions)
      .set({ title: body.data.title })
      .where(and(eq(chatSessions.id, params.data.id), eq(chatSessions.userId, user.id)))
      .returning({
        id: chatSessions.id,
        title: chatSessions.title,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
      });
    if (!updated) throw new NotFoundError("Chat session not found");

    return reply.send({ session: updated });
  });
}
