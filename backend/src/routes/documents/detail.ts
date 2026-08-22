import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { documents } from "../../db/schema/index.js";
import { NotFoundError } from "../../lib/errors.js";
import { resolveMimetype } from "../../lib/resolve-mimetype.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export default async function detailRoute(fastify: FastifyInstance) {
  fastify.get("/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid document id" });
    }

    const doc = await fastify.db.query.documents.findFirst({
      where: eq(documents.id, params.data.id),
      with: {
        documentTags: { with: { tag: true } },
        documentType: true,
        parent: { columns: { id: true, title: true } },
        // Only confirmed children - an unconfirmed attachment hasn't been
        // reviewed yet and shouldn't be reachable as if it were already
        // part of the archive, just because its email container happens to
        // be confirmed. It's still visible, just via the Import-
        // Warteschlange (see pendingChildrenCount below) instead of here.
        children: {
          columns: { id: true, title: true },
          where: (child, { eq: eqOp }) => eqOp(child.reviewStatus, "confirmed"),
          with: { documentType: { columns: { name: true, icon: true, color: true } } },
        },
      },
    });

    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    const pendingChildren = await fastify.db.query.documents.findMany({
      where: and(eq(documents.parentDocumentId, doc.id), eq(documents.reviewStatus, "pending")),
      columns: { id: true },
    });

    const mimetype = await resolveMimetype(fastify, doc);
    const { documentTags, ...rest } = doc;
    return reply.send({
      document: {
        ...rest,
        mimetype,
        tags: documentTags.map((dt) => dt.tag),
        pendingChildrenCount: pendingChildren.length,
      },
    });
  });
}
