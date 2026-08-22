ALTER TABLE "senders" DROP CONSTRAINT "senders_name_unique";
--> statement-breakpoint
-- Merge senders that only differ by case (e.g. "Hypovereinsbank" vs.
-- "HypoVereinsbank"), created before this uniqueness was enforced
-- case-insensitively. Keeps the oldest row per case-insensitive group as
-- canonical, repoints every document referencing a duplicate's exact
-- casing to the canonical name, then drops the duplicate sender rows.
DO $$
DECLARE
  grp RECORD;
  canonical RECORD;
BEGIN
  FOR grp IN
    SELECT lower(name) AS lname
    FROM senders
    GROUP BY lower(name)
    HAVING count(*) > 1
  LOOP
    SELECT * INTO canonical
    FROM senders
    WHERE lower(name) = grp.lname
    ORDER BY created_at ASC
    LIMIT 1;

    UPDATE documents
    SET metadata = jsonb_set(metadata, '{sender}', to_jsonb(canonical.name::text))
    WHERE lower(metadata->>'sender') = grp.lname
      AND metadata->>'sender' IS DISTINCT FROM canonical.name;

    DELETE FROM senders
    WHERE lower(name) = grp.lname
      AND id <> canonical.id;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "senders_name_lower_unique" ON "senders" (lower("name"));