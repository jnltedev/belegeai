import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Single row, like imap_settings: one deployment notifies through one set of
// channels. Every secret is stored as AES-256-GCM ciphertext (lib/crypto.ts)
// because all three have to be replayed to a third party, unlike a password
// which only ever needs comparing.
export const notificationSettings = pgTable("notification_settings", {
  id: uuid("id").primaryKey().defaultRandom(),

  // --- SMTP: import alerts, invitations and password resets ---
  smtpEnabled: boolean("smtp_enabled").notNull().default(false),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(587),
  // Implicit TLS on connect (port 465). Port 587 upgrades via STARTTLS
  // instead, which nodemailer handles when this is false.
  smtpSecure: boolean("smtp_secure").notNull().default(false),
  smtpUsername: text("smtp_username"),
  smtpPasswordEncrypted: text("smtp_password_encrypted"),
  smtpFromAddress: text("smtp_from_address"),
  smtpFromName: text("smtp_from_name"),
  // Where import alerts go. Invitations and resets always go to the account
  // in question, so they ignore this.
  smtpNotifyRecipient: text("smtp_notify_recipient"),

  // --- Telegram ---
  telegramEnabled: boolean("telegram_enabled").notNull().default(false),
  telegramBotTokenEncrypted: text("telegram_bot_token_encrypted"),
  telegramChatId: text("telegram_chat_id"),

  // --- Discord ---
  discordEnabled: boolean("discord_enabled").notNull().default(false),
  // The webhook URL is itself the credential - anyone holding it can post to
  // the channel - so it is encrypted rather than stored in the clear.
  discordWebhookUrlEncrypted: text("discord_webhook_url_encrypted"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
