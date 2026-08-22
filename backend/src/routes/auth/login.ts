import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "../../db/schema/index.js";
import type { SessionUser } from "../../types/session.js";

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default async function loginRoute(fastify: FastifyInstance) {
  fastify.post("/login", async (request, reply) => {
    if (fastify.env.AUTH_MODE !== "local") {
      return reply.code(501).send({ error: "Local login is disabled: AUTH_MODE is set to sso" });
    }

    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const user = await fastify.db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });
    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    await fastify.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      language: (user.language as "de" | "en" | null) ?? fastify.env.DEFAULT_LANGUAGE,
    };
    request.session.set("user", sessionUser);

    return reply.send({ user: sessionUser });
  });
}
