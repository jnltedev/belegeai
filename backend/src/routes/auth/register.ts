import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { users } from "../../db/schema/index.js";
import type { SessionUser } from "../../types/session.js";

const registerBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
});

export default async function registerRoute(fastify: FastifyInstance) {
  fastify.post("/register", async (request, reply) => {
    if (fastify.env.AUTH_MODE !== "local") {
      return reply.code(501).send({ error: "Registration is disabled: AUTH_MODE is set to sso" });
    }

    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { email, name, password } = parsed.data;

    const existing = await fastify.db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });
    if (existing) {
      return reply.code(409).send({ error: "An account with this email already exists" });
    }

    // Open only until the deployment has an owner. This route exists to
    // create the very first administrator during setup; from then on people
    // arrive by invitation, and leaving it open would let anyone who can
    // reach the app grant themselves an account.
    const [{ count }] = await fastify.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    if (count > 0) {
      return reply.code(403).send({ error: "Registration is closed - ask an administrator for an invitation" });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const [created] = await fastify.db
      .insert(users)
      .values({ email: email.toLowerCase(), name, role: "admin", passwordHash })
      .returning();

    const sessionUser: SessionUser = {
      id: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
      language: fastify.env.DEFAULT_LANGUAGE,
    };
    request.session.set("user", sessionUser);

    return reply.code(201).send({ user: sessionUser });
  });
}
