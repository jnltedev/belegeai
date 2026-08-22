import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { documents, documentTags } from "../../db/schema/index.js";

const querySchema = z.object({
  // Comma-separated tag ids - documents must have ALL of them (AND, not OR),
  // for narrowing a search by combining tags rather than broadening it.
  tags: z.string().optional(),
  // Comma-separated type ids - OR semantics (a document has exactly one
  // type, so "match any of these" is the only sensible combination, unlike
  // tags above).
  documentTypeId: z.string().optional(),
  // Comma-separated sender names - OR semantics, same reasoning as
  // documentTypeId above (a document has at most one sender value).
  sender: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});

export default async function listRoute(fastify: FastifyInstance) {
  fastify.get("/", async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    const params = query.success ? query.data : { page: 1, pageSize: 15 };
    const tagIds = params.tags ? params.tags.split(",").filter(Boolean) : [];

    let matchingDocumentIds: string[] | null = null;
    if (tagIds.length > 0) {
      const rows = await fastify.db
        .select({ documentId: documentTags.documentId })
        .from(documentTags)
        .where(inArray(documentTags.tagId, tagIds))
        .groupBy(documentTags.documentId)
        .having(sql`count(distinct ${documentTags.tagId}) = ${tagIds.length}`);
      matchingDocumentIds = rows.map((r) => r.documentId);
      if (matchingDocumentIds.length === 0) {
        return reply.send({ documents: [], total: 0 });
      }
    }

    const conditions = [eq(documents.reviewStatus, "confirmed")];
    if (matchingDocumentIds) conditions.push(inArray(documents.id, matchingDocumentIds));
    const documentTypeIds = params.documentTypeId ? params.documentTypeId.split(",").filter(Boolean) : [];
    if (documentTypeIds.length > 0) conditions.push(inArray(documents.documentTypeId, documentTypeIds));
    const senderNames = params.sender ? params.sender.split(",").filter(Boolean) : [];
    if (senderNames.length > 0) {
      const senderList = sql.join(
        senderNames.map((name) => sql`${name}`),
        sql`, `,
      );
      conditions.push(sql`${documents.metadata}->>'sender' IN (${senderList})`);
    }
    if (params.dateFrom) conditions.push(gte(documents.createdAt, new Date(params.dateFrom)));
    if (params.dateTo) {
      // Exclusive upper bound at the start of the next day, so the end date
      // itself is fully included regardless of time-of-day granularity.
      const end = new Date(params.dateTo);
      end.setDate(end.getDate() + 1);
      conditions.push(lt(documents.createdAt, end));
    }
    if (params.search) {
      conditions.push(sql`documents.search_vector @@ websearch_to_tsquery('german', ${params.search})`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count }] = await fastify.db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(where);

    const rows = await fastify.db.query.documents.findMany({
      where,
      orderBy: params.search
        ? [sql`ts_rank(documents.search_vector, websearch_to_tsquery('german', ${params.search})) desc`]
        : [desc(documents.createdAt)],
      limit: params.pageSize,
      offset: (params.page - 1) * params.pageSize,
      with: {
        documentTags: { with: { tag: true } },
        documentType: true,
      },
    });

    const result = rows.map(({ documentTags: dts, ...doc }) => ({
      ...doc,
      tags: dts.map((dt) => dt.tag),
    }));

    return reply.send({ documents: result, total: count });
  });
}
