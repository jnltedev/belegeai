import type { FastifyInstance } from "fastify";
import { desc, sql } from "drizzle-orm";
import { z } from "zod";
import { apiKeys } from "../../db/schema/index.js";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});

export default async function listApiKeysRoute(fastify: FastifyInstance) {
  fastify.get("/", async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    const params = query.success ? query.data : { page: 1, pageSize: 15 };

    const [{ count }] = await fastify.db.select({ count: sql<number>`count(*)::int` }).from(apiKeys);

    const rows = await fastify.db.query.apiKeys.findMany({
      orderBy: [desc(apiKeys.createdAt)],
      limit: params.pageSize,
      offset: (params.page - 1) * params.pageSize,
      with: { createdByUser: { columns: { id: true, name: true, email: true } } },
    });
    // Never returns key_hash - the plaintext key was already shown once, at
    // creation time, and isn't recoverable after that by design.
    const result = rows.map(({ keyHash: _keyHash, ...rest }) => rest);
    return reply.send({ apiKeys: result, total: count });
  });
}
