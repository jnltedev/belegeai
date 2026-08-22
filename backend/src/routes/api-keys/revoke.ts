import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { apiKeys } from "../../db/schema/index.js";
import { NotFoundError } from "../../lib/errors.js";

export default async function revokeApiKeyRoute(fastify: FastifyInstance) {
  fastify.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const [updated] = await fastify.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning();

    if (!updated) throw new NotFoundError("API key not found");
    return reply.code(204).send();
  });
}
