ALTER TABLE "documents" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('german', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('german', coalesce("metadata"->>'sender', '')), 'B') ||
  setweight(to_tsvector('german', coalesce("ocr_text", '')), 'C')
) STORED;
--> statement-breakpoint
CREATE INDEX "documents_search_vector_idx" ON "documents" USING GIN ("search_vector");
