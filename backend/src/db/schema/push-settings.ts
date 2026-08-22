import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Single row, same shape of decision as imap_settings: one instance connects
// to at most one push proxy, so an id-based relation would be ceremony.
export const pushSettings = pgTable("push_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Origin of the proxy, e.g. https://push.example.com - no trailing slash.
  proxyUrl: text("proxy_url").notNull(),
  instanceId: text("instance_id").notNull(),
  // AES-256-GCM ciphertext (see lib/crypto.ts). Reversible because every
  // notification has to present it as a bearer token; the proxy only ever
  // stores its hash.
  instanceTokenEncrypted: text("instance_token_encrypted").notNull(),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  // Result of the last reachability check, so the admin screen can say what
  // is wrong instead of just "not connected".
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  lastError: text("last_error"),
});
