import { pgTable, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { documents } from "./documents.js";

// gemini-embedding-001 defaults to 3072 dims but supports a configurable
// outputDimensionality (see gemini-provider.ts's embedText) - 768 keeps
// storage/query cost down while still being one of the model's officially
// supported truncation sizes. Change here + there together if ever revised.
export const EMBEDDING_DIMENSIONS = 768;

// One row per document (not chunked - this archive's documents are short
// enough, invoices/letters rather than long reports, that a single
// embedding over title+fields+OCR text is enough). No ANN index (ivfflat/
// hnsw) yet: those need a meaningful number of rows to train against, and
// at this app's realistic scale a full scan over the embedding column is
// already fast - add one if the archive grows into the thousands.
export const documentEmbeddings = pgTable("document_embeddings", {
  documentId: uuid("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
