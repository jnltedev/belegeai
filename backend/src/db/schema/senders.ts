import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Known sender names, kept in sync with documents.metadata.sender (a plain
// string, not a foreign key - see lib/senders.ts) so the "sender" field on
// every document type can offer autocomplete suggestions and a dedicated
// management page can rename/delete them.
// Uniqueness on name is case-insensitive (see the hand-written
// "senders_name_lower_unique" index in the migration that dropped this
// column's old case-sensitive unique() constraint) - "Hypovereinsbank" and
// "HypoVereinsbank" must never both exist as separate sender rows. Not
// modeled as a plain drizzle unique() since that only supports exact-value
// constraints, not an expression like lower(name).
export const senders = pgTable("senders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
