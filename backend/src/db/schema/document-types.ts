import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export interface DocumentTypeField {
  key: string;
  label: string;
  // "sender" renders as an autocomplete against the senders table instead of
  // a plain text input - see lib/document-type-fields.ts for the rule that
  // every document type always has exactly one such field.
  type: "text" | "date" | "currency" | "sender";
}

export const documentTypes = pgTable("document_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  keywords: text("keywords").array().notNull().default([]),
  fields: jsonb("fields").$type<DocumentTypeField[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
