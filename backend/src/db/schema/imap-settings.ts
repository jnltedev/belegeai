import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Single-mailbox for now - one row is enough, so no separate "which mailbox"
// foreign key exists anywhere else in the schema yet. Add a proper id-based
// relation if/when multi-mailbox support is needed.
export const imapSettings = pgTable("imap_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(993),
  username: text("username").notNull(),
  // AES-256-GCM ciphertext (iv:authTag:ciphertext, base64), never plaintext -
  // see backend/src/lib/crypto.ts. Reversible (unlike user password hashes)
  // because the worker has to actually log in with it.
  passwordEncrypted: text("password_encrypted").notNull(),
  folder: text("folder").notNull().default("INBOX"),
  pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(5),
  allowAllSenders: boolean("allow_all_senders").notNull().default(false),
  allowedSenders: text("allowed_senders").array().notNull().default([]),
  enabled: boolean("enabled").notNull().default(false),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
