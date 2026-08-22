import { sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { senders } from "../db/schema/index.js";

// Case-insensitive: "Hypovereinsbank" and "HypoVereinsbank" must resolve to
// the same sender, reusing whichever casing was stored first - enforced at
// the DB level by a unique index on lower(name) (see the migration that
// dropped the old case-sensitive unique() constraint).
export async function findOrCreateSender(db: Database, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const existing = await db.query.senders.findFirst({
    where: sql`lower(${senders.name}) = lower(${trimmed})`,
  });
  if (existing) return existing;

  try {
    const [created] = await db.insert(senders).values({ name: trimmed }).returning();
    return created;
  } catch {
    // Race: another request created a matching sender (any casing) between
    // our lookup and this insert - the unique index on lower(name) rejected
    // ours; fall back to whichever row won.
    const raceWinner = await db.query.senders.findFirst({
      where: sql`lower(${senders.name}) = lower(${trimmed})`,
    });
    if (!raceWinner) throw new Error(`Sender "${trimmed}" vanished between insert and lookup`);
    return raceWinner;
  }
}

// Best-effort: called wherever a document's metadata.sender is written
// server-side without a human going through the SenderPicker UI first (IMAP/
// API ingestion, or a raw metadata PATCH) - keeps the senders table in sync
// with whatever names actually show up on documents, same as tags.
export async function ensureSenderFromMetadata(db: Database, metadata: Record<string, unknown> | undefined) {
  const sender = metadata?.sender;
  if (typeof sender === "string" && sender.trim()) {
    await findOrCreateSender(db, sender);
  }
}
