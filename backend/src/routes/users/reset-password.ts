import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schema/index.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { issueResetLink } from "../../lib/password-reset.js";

const paramsSchema = z.object({ id: z.string().uuid() });

// An admin-triggered reset. The admin never sets the password themselves -
// they only cause a one-time link to be issued for the person concerned, and
// mailed to them when SMTP is configured.
export default async function resetUserPasswordRoute(fastify: FastifyInstance) {
  fastify.post("/:id/reset-password", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid user id" });
    }

    const target = await fastify.db.query.users.findFirst({ where: eq(users.id, params.data.id) });
    if (!target) {
      throw new NotFoundError("User not found");
    }

    let issued;
    try {
      issued = await issueResetLink(fastify, target, "reset");
    } catch (err) {
      throw new BadRequestError(
        `The reset link could not be created: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }

    // Without SMTP the link comes back for the admin to hand over directly,
    // rather than the reset being refused outright.
    return reply.send({
      mailed: issued.mailed,
      mailError: issued.mailError,
      link: issued.mailed ? undefined : issued.link,
    });
  });
}
