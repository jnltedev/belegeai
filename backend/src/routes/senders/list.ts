import type { FastifyInstance } from "fastify";
import { asc, sql } from "drizzle-orm";
import { z } from "zod";
import { senders } from "../../db/schema/index.js";

// page is optional and only applied when actually present - the SenderPicker
// field autocomplete and the documents filter need the FULL unpaginated
// list and keep working exactly as before; only the senders management page
// opts in, same convention as tags.
const querySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});

export default async function listSendersRoute(fastify: FastifyInstance) {
  fastify.get("/", async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    const params = query.success ? query.data : { pageSize: 15 };
    // Bidirectional containment - covers both directions of AI/OCR variance
    // (e.g. an extracted "Telekom" should still surface an existing
    // "Telekom Deutschland GmbH", and vice versa) with plain SQL, no fuzzy-
    // matching extension needed.
    const where = params.search
      ? sql`(${senders.name} ILIKE ${`%${params.search}%`} OR ${params.search} ILIKE '%' || ${senders.name} || '%')`
      : undefined;

    const [{ count }] = await fastify.db
      .select({ count: sql<number>`count(*)::int` })
      .from(senders)
      .where(where);

    const baseQuery = fastify.db
      .select({
        id: senders.id,
        name: senders.name,
        // Sender is a plain metadata string, not a foreign key - a
        // correlated subquery is the only way to get a per-sender count.
        documentCount: sql<number>`(SELECT count(*) FROM documents WHERE documents.metadata->>'sender' = ${senders.name})::int`,
      })
      .from(senders)
      .where(where)
      .orderBy(asc(senders.name));

    const rows = params.page
      ? await baseQuery.limit(params.pageSize).offset((params.page - 1) * params.pageSize)
      : await baseQuery;

    return reply.send({ senders: rows, total: count });
  });
}
