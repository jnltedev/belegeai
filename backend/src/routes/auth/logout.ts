import type { FastifyInstance } from "fastify";

export default async function logoutRoute(fastify: FastifyInstance) {
  fastify.post("/logout", async (request, reply) => {
    request.session.delete();
    return reply.code(204).send();
  });
}
