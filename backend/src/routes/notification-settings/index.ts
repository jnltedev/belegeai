import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { notificationSettings } from "../../db/schema/index.js";
import { requireAdmin } from "../../lib/auth-guard.js";
import { BadRequestError } from "../../lib/errors.js";
import { decrypt, encrypt, keyFromHex } from "../../lib/crypto.js";

// A browser form has no way to express "null": a field the admin never
// touched arrives as "". Rejecting that would fail the *entire* request over
// an untouched SMTP field, taking the Telegram and Discord parts of the same
// form down with it - which is exactly why nothing could be saved before.
// Empty therefore means "not set" and is stored as NULL.
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value?.trim() || null));

const optionalEmail = optionalText(320).refine(
  (value) => value == null || z.string().email().safeParse(value).success,
  { message: "must be a valid email address, or left empty" },
);

// Secrets are write-only over the API: they go in, they never come back out.
// An empty string means "leave what is stored alone", so an admin can edit
// the host without retyping the password.
const updateBody = z.object({
  smtpEnabled: z.boolean().optional(),
  smtpHost: optionalText(300),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUsername: optionalText(300),
  smtpPassword: z.string().max(500).optional(),
  smtpFromAddress: optionalEmail,
  smtpFromName: optionalText(200),
  smtpNotifyRecipient: optionalEmail,

  telegramEnabled: z.boolean().optional(),
  telegramBotToken: z.string().max(300).optional(),
  telegramChatId: optionalText(100),

  discordEnabled: z.boolean().optional(),
  discordWebhookUrl: optionalText(500),
});

const testBody = z.object({ channel: z.enum(["smtp", "telegram", "discord"]) });

export default async function notificationSettingsRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", requireAdmin);
  const encryptionKey = keyFromHex(fastify.env.SETTINGS_ENCRYPTION_KEY);

  fastify.get("/", async (_request, reply) => {
    const [row] = await fastify.db.select().from(notificationSettings).limit(1);
    if (!row) {
      return reply.send({ settings: null });
    }

    // Passwords and the bot token stay write-only: the form only needs to
    // know one exists to show "unchanged", and nothing is gained by putting
    // them back on a screen.
    //
    // The Discord webhook is returned in full. It is a credential too, but
    // this route is admin-only, and an admin who cannot see which channel is
    // wired up has no way to check or correct it - the same reason the SMTP
    // host and Telegram chat id have always been visible.
    const { smtpPasswordEncrypted, telegramBotTokenEncrypted, discordWebhookUrlEncrypted, ...rest } = row;

    let discordWebhookUrl: string | null = null;
    if (discordWebhookUrlEncrypted) {
      try {
        discordWebhookUrl = decrypt(discordWebhookUrlEncrypted, encryptionKey);
      } catch {
        // A rotated SETTINGS_ENCRYPTION_KEY leaves old ciphertext unreadable.
        // Showing an empty field is right: the stored value is unusable and
        // has to be entered again anyway.
        fastify.log.warn("The stored Discord webhook could not be decrypted - re-enter it in the admin area.");
      }
    }

    return reply.send({
      settings: {
        ...rest,
        hasSmtpPassword: Boolean(smtpPasswordEncrypted),
        hasTelegramBotToken: Boolean(telegramBotTokenEncrypted),
        discordWebhookUrl,
      },
    });
  });

  fastify.patch("/", async (request, reply) => {
    const parsed = updateBody.safeParse(request.body);
    if (!parsed.success) {
      // A flattened Zod object would reach the browser as a bare "Bad
      // Request" (lib/api.ts only forwards string errors), which is how a
      // rejected save managed to look like a save that simply did nothing.
      const message = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      return reply.code(400).send({ error: message });
    }
    const input = parsed.data;

    const values: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "smtpEnabled", "smtpHost", "smtpPort", "smtpSecure", "smtpUsername",
      "smtpFromAddress", "smtpFromName", "smtpNotifyRecipient",
      "telegramEnabled", "telegramChatId", "discordEnabled",
    ] as const) {
      if (input[key] !== undefined) values[key] = input[key];
    }
    // Write-only secrets: an empty string means "leave what is stored
    // alone", so the host can be edited without retyping the password.
    if (input.smtpPassword) values.smtpPasswordEncrypted = encrypt(input.smtpPassword, encryptionKey);
    if (input.telegramBotToken) values.telegramBotTokenEncrypted = encrypt(input.telegramBotToken, encryptionKey);
    // The webhook is shown in the form, so what comes back is the whole
    // truth: clearing the field has to clear the stored value, or a channel
    // could never be disconnected again.
    if (input.discordWebhookUrl !== undefined) {
      values.discordWebhookUrlEncrypted = input.discordWebhookUrl
        ? encrypt(input.discordWebhookUrl, encryptionKey)
        : null;
    }

    const [existing] = await fastify.db.select({ id: notificationSettings.id }).from(notificationSettings).limit(1);
    if (existing) {
      await fastify.db.update(notificationSettings).set(values).where(eq(notificationSettings.id, existing.id));
    } else {
      await fastify.db.insert(notificationSettings).values(values);
    }

    return reply.code(204).send();
  });

  // Deliberately reports the provider's own words. "Chat not found" or
  // "535 authentication failed" tell an admin exactly what to fix; a generic
  // "test failed" starts a guessing game.
  fastify.post("/test", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = testBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Unknown channel" });
    }
    try {
      await fastify.notifications.test(parsed.data.channel);
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : "The test message could not be sent");
    }
    return reply.code(204).send();
  });
}
