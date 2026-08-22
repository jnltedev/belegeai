CREATE TABLE "senders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "senders_name_unique" UNIQUE("name")
);
--> statement-breakpoint
-- Every document type now always has a "sender" field. Where one already
-- exists, keep its label as-is and only upgrade its type to "sender" (so it
-- renders as the autocomplete picker) instead of adding a duplicate.
UPDATE document_types
SET fields = (
	SELECT jsonb_agg(
		CASE WHEN elem->>'key' = 'sender' THEN jsonb_set(elem, '{type}', '"sender"') ELSE elem END
	)
	FROM jsonb_array_elements(fields) AS elem
)
WHERE fields @> '[{"key":"sender"}]'::jsonb;
--> statement-breakpoint
-- Types with no sender field at all yet (e.g. "Unbekannt") get one prepended.
UPDATE document_types
SET fields = '[{"key":"sender","label":"Absender","type":"sender"}]'::jsonb || fields
WHERE NOT (fields @> '[{"key":"sender"}]'::jsonb);
--> statement-breakpoint
-- Backfill the senders table from whatever sender values already exist on
-- documents, so history shows up in the new management page immediately.
INSERT INTO senders (name)
SELECT DISTINCT metadata->>'sender' FROM documents
WHERE metadata->>'sender' IS NOT NULL AND trim(metadata->>'sender') <> ''
ON CONFLICT (name) DO NOTHING;
