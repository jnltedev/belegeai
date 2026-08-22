import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { imapSettings } from "../../db/schema/index.js";
import { encrypt, keyFromHex } from "../../lib/crypto.js";
import { BadRequestError } from "../../lib/errors.js";

const bodySchema = z.object({
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(993),
  username: z.string().min(1).max(255),
  // Omit (or leave blank) to keep the currently-saved password unchanged -
  // the form never receives it back, so there's nothing to resubmit unless
  // the operator is actually changing it.
  password: z.string().max(500).optional(),
  folder: z.string().min(1).max(255).default("INBOX"),
  pollIntervalMinutes: z.coerce.number().int().min(1).max(1440).default(5),
  allowAllSenders: z.boolean().default(false),
  allowedSenders: z.array(z.string().email()).default([]),
  enabled: z.boolean().default(false),
});

export default async function updateImapSettingsRoute(fastify: FastifyInstance) {
  fastify.patch("/", async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { password, ...values } = parsed.data;

    const [existing] = await fastify.db.select().from(imapSettings).limit(1);
    if (!password && !existing) {
      throw new BadRequestError("Password is required when saving the mailbox for the first time");
    }

    const key = keyFromHex(fastify.env.SETTINGS_ENCRYPTION_KEY);
    const passwordEncrypted = password ? encrypt(password, key) : (existing?.passwordEncrypted as string);

    const [saved] = existing
      ? await fastify.db
          .update(imapSettings)
          .set({ ...values, passwordEncrypted, updatedAt: new Date() })
          .where(eq(imapSettings.id, existing.id))
          .returning()
      : await fastify.db
          .insert(imapSettings)
          .values({ ...values, passwordEncrypted })
          .returning();

    const { passwordEncrypted: _passwordEncrypted, ...rest } = saved;
    return reply.send({ settings: { ...rest, hasPassword: true } });
  });
}
