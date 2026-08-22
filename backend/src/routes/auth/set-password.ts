import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { passwordResetTokens, users } from "../../db/schema/index.js";
import { resolveToken } from "../../lib/password-reset.js";

const checkParams = z.object({ token: z.string().min(10).max(200) });
const setBody = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8).max(200),
});

// Unauthenticated by design: the whole point is that the person cannot log in
// yet. The token is the credential, so both routes are rate-limited and give
// away nothing about why a token failed.
export default async function setPasswordRoute(fastify: FastifyInstance) {
  fastify.get(
    "/set-password/:token",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const params = checkParams.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Invalid link" });
      }

      const resolved = await resolveToken(fastify, params.data.token);
      if (!resolved) {
        return reply.code(404).send({ error: "This link is no longer valid" });
      }

      // Only what the form needs to greet the person and pick its wording.
      return reply.send({ name: resolved.name, email: resolved.email, purpose: resolved.purpose });
    },
  );

  fastify.post(
    "/set-password",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = setBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const resolved = await resolveToken(fastify, parsed.data.token);
      if (!resolved) {
        return reply.code(404).send({ error: "This link is no longer valid" });
      }

      const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });

      // Both writes together: a password set without the token being retired
      // would leave the link reusable by anyone who saw the email.
      await fastify.db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash }).where(eq(users.id, resolved.userId));
        await tx
          .update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(eq(passwordResetTokens.id, resolved.id));
      });

      // Deliberately no session: the person signs in with the password they
      // just chose, which also proves it works before they walk away.
      return reply.code(204).send();
    },
  );
}
