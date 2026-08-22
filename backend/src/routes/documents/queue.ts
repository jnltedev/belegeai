import type { FastifyInstance } from "fastify";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { documents } from "../../db/schema/index.js";

// page/pageSize are optional and only applied when `page` is actually
// present - callers that need the FULL open queue (the review panel's
// "advance to next" navigation, the sidebar badge count) keep working
// unpaginated exactly as before; only the queue list view itself opts in.
const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});

// Everything still waiting on a human in the Import-Warteschlange: any
// document auto-created with review_status="pending" - IMAP/API ingestion
// (and email attachments extracted from either). No source filter needed:
// manual uploads and email containers are always created "confirmed"
// immediately, so review_status alone is the correct criterion.
export default async function queueRoute(fastify: FastifyInstance) {
  fastify.get("/queue", async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    const params = query.success ? query.data : { pageSize: 15 };
    const where = eq(documents.reviewStatus, "pending");

    const [{ count }] = await fastify.db.select({ count: sql<number>`count(*)::int` }).from(documents).where(where);

    const rows = await fastify.db.query.documents.findMany({
      where,
      orderBy: [asc(documents.createdAt)],
      ...(params.page ? { limit: params.pageSize, offset: (params.page - 1) * params.pageSize } : {}),
      with: {
        documentType: true,
        parent: { columns: { id: true, title: true, metadata: true } },
        apiKey: { columns: { id: true, name: true } },
      },
    });

    return reply.send({ documents: rows, total: count });
  });
}
