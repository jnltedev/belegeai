import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "../../db/schema/index.js";
import { BadRequestError } from "../../lib/errors.js";
import { issueResetLink } from "../../lib/password-reset.js";

const inviteBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: z.enum(["admin", "member"]).default("member"),
});

// Invitation rather than account creation: the admin never sees or chooses a
// password. The row is created without one - password_hash stays null, and
// login rejects that - and the person sets their own via a one-time link.
//
// SMTP is deliberately not required. When mail is off (or broken) the link
// comes back in the response for the admin to pass on by hand, so a small
// deployment can add people without ever standing up a mail server.
export default async function createUserRoute(fastify: FastifyInstance) {
  fastify.post("/", async (request, reply) => {
    const parsed = inviteBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { email, name, role } = parsed.data;

    const existing = await fastify.db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });
    if (existing) {
      throw new BadRequestError("An account with this email already exists");
    }

    const [created] = await fastify.db
      .insert(users)
      .values({ email: email.toLowerCase(), name, role })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt });

    let invite;
    try {
      invite = await issueResetLink(fastify, created, "invite");
    } catch (err) {
      // Only reached if the token itself could not be stored - without one
      // the account can never be activated, so it is rolled back by hand.
      await fastify.db.delete(users).where(eq(users.id, created.id));
      throw new BadRequestError(
        `The invitation could not be created, so the account was not created either: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }

    return reply.code(201).send({
      user: created,
      // The link is withheld once it has actually been mailed: it is a
      // credential, and there is no reason to put it on a second screen.
      invite: {
        mailed: invite.mailed,
        mailError: invite.mailError,
        link: invite.mailed ? undefined : invite.link,
      },
    });
  });
}
