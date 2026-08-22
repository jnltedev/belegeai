import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents.js";
import { users } from "./users.js";

export const extractionReview = pgTable("extraction_review", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  suggestedJson: jsonb("suggested_json").notNull(),
  confirmedJson: jsonb("confirmed_json").notNull(),
  // Nullable rather than cascading: the audit trail of *what* was confirmed
  // outlives the account. Only the name is lost, which is unavoidable once
  // the account is gone - deleting the record would lose more.
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
});
