import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, ne, sql } from "drizzle-orm";
import { users } from "../../db/schema/index.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ role: z.enum(["admin", "member"]) });

export default async function updateUserRoleRoute(fastify: FastifyInstance) {
  fastify.patch("/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = bodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "Invalid request" });
    }

    const target = await fastify.db.query.users.findFirst({ where: eq(users.id, params.data.id) });
    if (!target) {
      throw new NotFoundError("User not found");
    }

    if (target.role === "admin" && body.data.role === "member") {
      const [{ count }] = await fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "admin"), ne(users.id, target.id)));
      if (count === 0) {
        throw new BadRequestError("Cannot remove admin role from the last remaining admin");
      }
    }

    const [updated] = await fastify.db
      .update(users)
      .set({ role: body.data.role })
      .where(eq(users.id, target.id))
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt });

    return reply.send({ user: updated });
  });
}
