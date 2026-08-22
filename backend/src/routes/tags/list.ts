import type { FastifyInstance } from "fastify";
import { asc, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { documentTags, tags } from "../../db/schema/index.js";

// page is optional and only applied when actually present - the tag
// picker/filter dropdown need the FULL unpaginated list for autocomplete and
// keep working exactly as before; only the tags management page opts in.
const querySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});

export default async function listTagsRoute(fastify: FastifyInstance) {
  fastify.get("/", async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    const params = query.success ? query.data : { pageSize: 15 };
    const where = params.search ? ilike(tags.name, `%${params.search}%`) : undefined;

    const [{ count }] = await fastify.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tags)
      .where(where);

    const baseQuery = fastify.db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        documentCount: sql<number>`count(${documentTags.documentId})::int`,
      })
      .from(tags)
      .leftJoin(documentTags, sql`${documentTags.tagId} = ${tags.id}`)
      .where(where)
      .groupBy(tags.id)
      .orderBy(asc(tags.name));

    const rows = params.page
      ? await baseQuery.limit(params.pageSize).offset((params.page - 1) * params.pageSize)
      : await baseQuery;

    return reply.send({ tags: rows, total: count });
  });
}
