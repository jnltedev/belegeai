import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { tags } from "../db/schema/index.js";
import { colorForTagName } from "./tag-color.js";

export async function findOrCreateTag(db: Database, name: string) {
  const [tag] = await db
    .insert(tags)
    .values({ name, color: colorForTagName(name) })
    .onConflictDoNothing({ target: tags.name })
    .returning();

  if (tag) return tag;

  const existing = await db.query.tags.findFirst({ where: (t, { eq }) => eq(t.name, name) });
  if (!existing) throw new Error(`Tag "${name}" vanished between insert and lookup`);
  return existing;
}

// Called right after a tag's last association is removed (untagging a
// document, or deleting one) - deletes it immediately if nothing references
// it anymore, rather than leaving it to linger until the next sweep.
export async function deleteTagIfOrphaned(db: Database, tagId: string): Promise<void> {
  const stillUsed = await db.query.documentTags.findFirst({ where: (dt, { eq }) => eq(dt.tagId, tagId) });
  if (!stillUsed) {
    await db.delete(tags).where(eq(tags.id, tagId));
  }
}

// Backstop for edge cases the immediate cleanup above might miss (e.g. a
// crash between removing the last association and the orphan check) - run
// at boot and periodically thereafter, not relied on as the primary path.
export async function sweepOrphanedTags(db: Database): Promise<number> {
  const result = await db.execute(
    sql`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM document_tags)`,
  );
  return result.rowCount ?? 0;
}
