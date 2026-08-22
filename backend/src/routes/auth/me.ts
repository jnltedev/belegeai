import type { FastifyInstance } from "fastify";

export default async function meRoute(fastify: FastifyInstance) {
  fastify.get("/me", async (request, reply) => {
    const user = request.session.get("user");
    if (!user) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    // Sessions issued before the language feature shipped won't carry it -
    // self-heal in place rather than forcing a re-login.
    if (!user.language) {
      const healed = { ...user, language: fastify.env.DEFAULT_LANGUAGE };
      request.session.set("user", healed);
      return reply.send({ user: healed, authMode: fastify.env.AUTH_MODE });
    }
    return reply.send({ user, authMode: fastify.env.AUTH_MODE });
  });
}
