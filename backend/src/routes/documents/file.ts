import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { documents } from "../../db/schema/index.js";
import { NotFoundError } from "../../lib/errors.js";
import { resolveMimetype } from "../../lib/resolve-mimetype.js";
import { extensionForMimetype, sanitizeFilename } from "../../lib/mimetype-extension.js";

const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({ download: z.coerce.boolean().optional() });

export default async function fileRoute(fastify: FastifyInstance) {
  fastify.get("/:id/file", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid document id" });
    }
    const query = querySchema.safeParse(request.query);

    const doc = await fastify.db.query.documents.findFirst({
      where: eq(documents.id, params.data.id),
    });
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    const mimetype = await resolveMimetype(fastify, doc);
    const stream = await fastify.storage.getObjectStream(doc.fileKey);
    reply.header("Content-Type", mimetype);

    if (query.success && query.data.download) {
      const filename = `${sanitizeFilename(doc.title)}.${extensionForMimetype(mimetype)}`;
      reply.header(
        "Content-Disposition",
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    } else {
      reply.header("Content-Disposition", `inline; filename="${doc.fileKey}"`);
    }

    return reply.send(stream);
  });
}
