import type { FastifyInstance } from "fastify";
import { asc, sql } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schema/index.js";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});

export default async function listUsersRoute(fastify: FastifyInstance) {
  fastify.get("/", async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    const params = query.success ? query.data : { page: 1, pageSize: 15 };

    const [{ count }] = await fastify.db.select({ count: sql<number>`count(*)::int` }).from(users);

    const rows = await fastify.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);
    return reply.send({ users: rows, total: count });
  });
}
