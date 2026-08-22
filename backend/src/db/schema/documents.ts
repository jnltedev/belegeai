import { bigint, date, jsonb, pgEnum, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { documentTypes } from "./document-types.js";
import { apiKeys } from "./api-keys.js";

export const documentSourceEnum = pgEnum("document_source", ["manual", "imap", "api"]);
export const reviewStatusEnum = pgEnum("review_status", ["pending", "confirmed"]);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  documentTypeId: uuid("document_type_id").references(() => documentTypes.id),
  // Values keyed by the assigned document type's `fields` schema (see
  // document-types.ts). A field of type "currency" is stored as
  // {amount: string, currency: string}; "text"/"date" fields as plain strings.
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  // sha256 hex digest of the file content - immutable, content-addressed MinIO object key
  fileKey: text("file_key").notNull(),
  // Nullable: documents created before this column existed are lazily
  // backfilled from MinIO's stored object metadata on first read.
  mimetype: text("mimetype"),
  // Nullable: documents created before this column existed have no cached
  // size - the stats page's storage total simply skips them rather than
  // querying MinIO per-document for a backfill.
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  ocrText: text("ocr_text"),
  source: documentSourceEnum("source").notNull().default("manual"),
  // "pending" only for documents auto-created without a human confirming the
  // AI suggestion first (IMAP/API ingestion) - manual uploads go through the
  // browser review step before the row even exists, so they're always
  // created "confirmed" already.
  reviewStatus: reviewStatusEnum("review_status").notNull().default("confirmed"),
  // The raw AI suggestion as it stood right after auto-ingestion, kept only
  // until a human confirms via the review queue - at that point it becomes
  // this row's `extraction_review.suggested_json` and this column is cleared.
  // Manual uploads never populate this; their equivalent snapshot is built
  // synchronously in the browser and never needs server-side storage.
  pendingAiSuggestion: jsonb("pending_ai_suggestion").$type<Record<string, unknown> | null>(),
  retentionUntil: date("retention_until"),
  // Set only on documents extracted as attachments from an email (.eml/.msg)
  // upload - points back at that email's own document row, so the
  // "attachment belongs to this email" relationship stays visible without
  // touching either original file.
  parentDocumentId: uuid("parent_document_id").references((): AnyPgColumn => documents.id, {
    onDelete: "cascade",
  }),
  // Null for IMAP/API-ingested documents - nobody with a session uploaded them.
  // Null once the account is gone: this records who filed the document, not
  // who owns it. The archive is shared, so removing a colleague must leave
  // their uploads in place.
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  // Set only for source="api" - which caller's key ingested this, shown in
  // the Import-Warteschlange. Kept even after the key is later revoked
  // (onDelete restricted implicitly by having no cascade), since it's a
  // historical record, not a live permission.
  apiKeyId: uuid("api_key_id").references(() => apiKeys.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
