import type { FastifyInstance } from "fastify";

// Deliberately unauthenticated, and registered apart from the rest of
// /api/push so it sits outside that router's requireAuth hook.
//
// This is how the push proxy confirms that whoever asked to enroll actually
// controls this domain: it fetches the nonce back from here. Serving it needs
// no session, because the nonce is what proves the claim - and it only exists
// for the seconds between the two enrollment calls, so there is no standing
// value to leak.
export default async function pushPublicRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/challenge",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      const challenge = fastify.push.pendingChallenge();
      if (!challenge) {
        return reply.code(404).send({ error: "No enrollment in progress" });
      }
      return reply.send({ challenge });
    },
  );
}
