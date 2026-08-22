import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // sha256 hex of the key - same one-way pattern as everything else that
  // only ever needs to be *verified*, never read back (unlike the IMAP
  // password, which the worker must decrypt to actually log in).
  keyHash: text("key_hash").notNull().unique(),
  // Nullable so removing an admin does not take working API keys with them -
  // the key belongs to the deployment, this only records who issued it.
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
