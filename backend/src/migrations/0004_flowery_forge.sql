CREATE TABLE "document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "document_type_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Seed document types. "Unbekannt" is the deliberate fallback for content
-- the AI has no confident classification signal for (fields intentionally
-- empty - no fabricated sender/date/amount for e.g. a bare logo image).
INSERT INTO "document_types" ("name", "icon", "color", "keywords", "fields") VALUES
('Rechnung', 'Receipt', '#2563eb', ARRAY['rechnung','invoice','zahlung','rechnungsbetrag','zu zahlen'], '[{"key":"sender","label":"Absender","type":"text"},{"key":"date","label":"Datum","type":"date"},{"key":"amount","label":"Betrag","type":"currency"}]'::jsonb),
('Finanzamt', 'Landmark', '#d97706', ARRAY['finanzamt','steuer','steuerbescheid','steuererklärung'], '[{"key":"sender","label":"Absender","type":"text"},{"key":"date","label":"Datum","type":"date"},{"key":"amount","label":"Betrag","type":"currency"}]'::jsonb),
('Versicherung', 'ShieldCheck', '#7c3aed', ARRAY['versicherung','police','versicherungsschein','schadensfall'], '[{"key":"sender","label":"Absender","type":"text"},{"key":"date","label":"Datum","type":"date"},{"key":"amount","label":"Betrag","type":"currency"}]'::jsonb),
('Behörde', 'Building2', '#4f46e5', ARRAY['behörde','amt','bescheid','verwaltung','antrag'], '[{"key":"sender","label":"Absender","type":"text"},{"key":"date","label":"Datum","type":"date"}]'::jsonb),
('E-Mail', 'Mail', '#0891b2', ARRAY[]::text[], '[{"key":"sender","label":"Absender","type":"text"},{"key":"date","label":"Datum","type":"date"}]'::jsonb),
('Unbekannt', 'FileQuestion', '#64748b', ARRAY[]::text[], '[]'::jsonb);
--> statement-breakpoint

-- Backfill document_type_id from the old doc_type text column (case-
-- insensitive match against the seed names above), defaulting to
-- "Unbekannt" for anything that doesn't match (including NULL).
UPDATE "documents" d
SET "document_type_id" = COALESCE(
  (SELECT id FROM "document_types" dt WHERE lower(dt.name) = lower(d.doc_type)),
  (SELECT id FROM "document_types" WHERE name = 'Unbekannt')
);
--> statement-breakpoint

-- Backfill metadata jsonb from the old sender/doc_date/amount/currency
-- columns before they're dropped in the next migration. Preserves the raw
-- values even where the assigned type's own field schema wouldn't normally
-- ask for them, rather than silently discarding real historical data.
UPDATE "documents" d
SET "metadata" = jsonb_strip_nulls(
  jsonb_build_object(
    'sender', d.sender,
    'date', to_char(d.doc_date, 'YYYY-MM-DD'),
    'amount', CASE WHEN d.amount IS NOT NULL THEN jsonb_build_object('amount', d.amount::text, 'currency', d.currency) ELSE NULL END
  )
)
WHERE d.sender IS NOT NULL OR d.doc_date IS NOT NULL OR d.amount IS NOT NULL;