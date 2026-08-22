import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// An invite and a forgotten password are the same mechanism with different
// wording: both hand someone a one-time link that lets them set a password.
// Keeping them in one table means one expiry rule and one consumption path.
export const resetPurposeEnum = pgEnum("reset_purpose", ["invite", "reset"]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Only the sha256 of the token is stored. The plaintext exists in the email
  // and nowhere else, so a database dump cannot be used to take over accounts.
  tokenHash: text("token_hash").notNull().unique(),
  purpose: resetPurposeEnum("purpose").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Set the moment a token is redeemed; a used token is never accepted again.
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
