import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { apiKeys, documentTags, documents, documentTypes, imapSettings, tags, users } from "../../db/schema/index.js";

export default async function statsRoute(fastify: FastifyInstance) {
  fastify.get("/stats", async (_request, reply) => {
    const db = fastify.db;

    const [
      [{ totalDocuments, totalStorageBytes }],
      [{ totalTags }],
      [{ pendingImportCount }],
      [{ totalUsers }],
      imapRow,
      [lastApiImport],
      documentsByType,
      documentsBySource,
      oldestPending,
      topTags,
    ] = await Promise.all([
      db
        .select({
          totalDocuments: sql<number>`count(*)::int`,
          totalStorageBytes: sql<number>`coalesce(sum(${documents.fileSizeBytes}), 0)::bigint`,
        })
        .from(documents),
      db.select({ totalTags: sql<number>`count(*)::int` }).from(tags),
      db
        .select({ pendingImportCount: sql<number>`count(*)::int` })
        .from(documents)
        .where(eq(documents.reviewStatus, "pending")),
      db.select({ totalUsers: sql<number>`count(*)::int` }).from(users),
      db.query.imapSettings.findFirst({ columns: { lastSyncAt: true } }),
      db
        .select({ lastApiImportAt: sql<string | null>`max(${documents.createdAt})` })
        .from(documents)
        .where(eq(documents.source, "api")),
      db
        .select({
          name: documentTypes.name,
          color: documentTypes.color,
          count: sql<number>`count(${documents.id})::int`,
        })
        .from(documentTypes)
        .leftJoin(documents, eq(documents.documentTypeId, documentTypes.id))
        .groupBy(documentTypes.id)
        .orderBy(desc(sql`count(${documents.id})`)),
      db
        .select({ source: documents.source, count: sql<number>`count(*)::int` })
        .from(documents)
        .groupBy(documents.source)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({ createdAt: documents.createdAt })
        .from(documents)
        .where(eq(documents.reviewStatus, "pending"))
        .orderBy(documents.createdAt)
        .limit(1),
      db
        .select({ name: tags.name, color: tags.color, count: sql<number>`count(${documentTags.documentId})::int` })
        .from(tags)
        .innerJoin(documentTags, eq(documentTags.tagId, tags.id))
        .groupBy(tags.id)
        .orderBy(desc(sql`count(${documentTags.documentId})`))
        .limit(5),
    ]);

    const oldestPendingAgeDays =
      oldestPending.length > 0
        ? Math.floor((Date.now() - new Date(oldestPending[0].createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;

    return reply.send({
      totalDocuments,
      totalStorageBytes: Number(totalStorageBytes),
      totalTags,
      pendingImportCount,
      totalUsers,
      lastImapSyncAt: imapRow?.lastSyncAt ?? null,
      lastApiImportAt: lastApiImport?.lastApiImportAt ?? null,
      documentsByType,
      documentsBySource,
      oldestPendingAgeDays,
      topTags,
    });
  });
}
