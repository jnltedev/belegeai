import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { notificationSettings } from "../db/schema/index.js";
import { decrypt, keyFromHex } from "../lib/crypto.js";
import { sendDiscord, sendMail, sendTelegram, type Mail, type SmtpConfig } from "../lib/notifications/channels.js";

export type NotificationChannel = "smtp" | "telegram" | "discord";

export interface ChannelResult {
  channel: NotificationChannel;
  ok: boolean;
  error?: string;
}

export interface NotificationService {
  /// Whether outbound mail is configured at all. Invitations and password
  /// resets are pointless without it, so the admin screen says so up front
  /// rather than letting someone invite into a void.
  mailAvailable(): Promise<boolean>;
  sendMail(mail: Mail): Promise<void>;
  /// Fans a short message out to every enabled channel. Never throws: a
  /// broken webhook must not fail the ingestion that triggered it.
  broadcast(message: string): Promise<ChannelResult[]>;
  /// Same delivery path as broadcast, but surfaces failures - the admin
  /// screen's "send a test" needs the reason, not a swallowed error.
  test(channel: NotificationChannel): Promise<void>;
}

export default fp(async function notificationsPlugin(fastify: FastifyInstance) {
  const encryptionKey = keyFromHex(fastify.env.SETTINGS_ENCRYPTION_KEY);

  async function settings() {
    const [row] = await fastify.db.select().from(notificationSettings).limit(1);
    return row ?? null;
  }

  function reveal(ciphertext: string | null): string | null {
    if (!ciphertext) return null;
    try {
      return decrypt(ciphertext, encryptionKey);
    } catch {
      // A rotated SETTINGS_ENCRYPTION_KEY makes old ciphertext unreadable.
      // Treating that as "not configured" is better than crashing every
      // notification until someone re-enters the secret.
      fastify.log.warn("A stored notification secret could not be decrypted - re-enter it in the admin area.");
      return null;
    }
  }

  function smtpConfig(row: Awaited<ReturnType<typeof settings>>): SmtpConfig | null {
    if (!row?.smtpEnabled || !row.smtpHost || !row.smtpFromAddress) return null;
    return {
      host: row.smtpHost,
      port: row.smtpPort ?? 587,
      secure: row.smtpSecure,
      username: row.smtpUsername,
      password: reveal(row.smtpPasswordEncrypted),
      fromAddress: row.smtpFromAddress,
      fromName: row.smtpFromName,
    };
  }

  const service: NotificationService = {
    async mailAvailable() {
      return smtpConfig(await settings()) !== null;
    },

    async sendMail(mail) {
      const config = smtpConfig(await settings());
      if (!config) {
        throw new Error("Email is not configured - set up SMTP in the admin area first");
      }
      await sendMail(config, mail);
    },

    async broadcast(message) {
      const row = await settings();
      if (!row) return [];

      const attempts: Array<Promise<ChannelResult>> = [];

      const config = smtpConfig(row);
      if (config && row.smtpNotifyRecipient) {
        attempts.push(
          sendMail(config, { to: row.smtpNotifyRecipient, subject: "New document imported", text: message })
            .then(() => ({ channel: "smtp" as const, ok: true }))
            .catch((err: unknown) => ({ channel: "smtp" as const, ok: false, error: String(err) })),
        );
      }

      const botToken = row.telegramEnabled ? reveal(row.telegramBotTokenEncrypted) : null;
      if (botToken && row.telegramChatId) {
        attempts.push(
          sendTelegram(botToken, row.telegramChatId, message)
            .then(() => ({ channel: "telegram" as const, ok: true }))
            .catch((err: unknown) => ({ channel: "telegram" as const, ok: false, error: String(err) })),
        );
      }

      const webhook = row.discordEnabled ? reveal(row.discordWebhookUrlEncrypted) : null;
      if (webhook) {
        attempts.push(
          sendDiscord(webhook, message)
            .then(() => ({ channel: "discord" as const, ok: true }))
            .catch((err: unknown) => ({ channel: "discord" as const, ok: false, error: String(err) })),
        );
      }

      const results = await Promise.all(attempts);
      for (const result of results.filter((r) => !r.ok)) {
        fastify.log.warn({ channel: result.channel, error: result.error }, "Notification channel failed");
      }
      return results;
    },

    async test(channel) {
      const row = await settings();
      const message = "Test message from your document archive.";

      if (channel === "smtp") {
        const config = smtpConfig(row);
        if (!config) throw new Error("SMTP is not enabled or incompletely configured");
        const recipient = row?.smtpNotifyRecipient || config.fromAddress;
        await sendMail(config, { to: recipient, subject: "Test message", text: message });
        return;
      }

      if (channel === "telegram") {
        const botToken = row?.telegramEnabled ? reveal(row.telegramBotTokenEncrypted) : null;
        if (!botToken || !row?.telegramChatId) throw new Error("Telegram is not enabled or incompletely configured");
        await sendTelegram(botToken, row.telegramChatId, message);
        return;
      }

      const webhook = row?.discordEnabled ? reveal(row.discordWebhookUrlEncrypted) : null;
      if (!webhook) throw new Error("Discord is not enabled or incompletely configured");
      await sendDiscord(webhook, message);
    },
  };

  fastify.decorate("notifications", service);
});
