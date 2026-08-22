import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schema/index.js";
import { requireAuth, currentUser } from "../../lib/auth-guard.js";

const updateBody = z.object({ language: z.enum(["de", "en"]) });

export default async function languageRoute(fastify: FastifyInstance) {
  fastify.patch("/language", { onRequest: requireAuth }, async (request, reply) => {
    const body = updateBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const user = currentUser(request);
    await fastify.db.update(users).set({ language: body.data.language }).where(eq(users.id, user.id));

    // Reflect the change in the live session immediately - otherwise the
    // switcher would need a re-login to actually take effect, since
    // SessionUser is a snapshot baked in at login time, not re-read from the
    // DB per request.
    const updated = { ...user, language: body.data.language };
    request.session.set("user", updated);

    return reply.send({ user: updated });
  });
}
