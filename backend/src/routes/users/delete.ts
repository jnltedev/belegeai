import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schema/index.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { currentUser } from "../../lib/auth-guard.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export default async function deleteUserRoute(fastify: FastifyInstance) {
  fastify.delete("/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid user id" });
    }

    const actor = currentUser(request);
    if (params.data.id === actor.id) {
      // Guarding the obvious mistake: an admin removing their own account
      // could leave the deployment with no way back in.
      throw new BadRequestError("You cannot delete your own account");
    }

    const target = await fastify.db.query.users.findFirst({ where: eq(users.id, params.data.id) });
    if (!target) {
      throw new NotFoundError("User not found");
    }

    // Documents survive on purpose. uploaded_by is provenance, not ownership
    // - the archive is shared, and deleting a colleague must not take their
    // uploads with them. The column is nullable and set null by the schema.
    await fastify.db.delete(users).where(eq(users.id, target.id));

    return reply.code(204).send();
  });
}
