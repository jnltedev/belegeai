import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { documents } from "../../db/schema/index.js";
import { NotFoundError, BadRequestError } from "../../lib/errors.js";
import { parseEmail, isEmailMimetype } from "../../lib/email-ingest/index.js";
import { resolveMimetype } from "../../lib/resolve-mimetype.js";

const paramsSchema = z.object({ id: z.string().uuid() });

// Re-parses the original .eml/.msg on demand rather than persisting a
// second copy of the HTML body anywhere - the original file in MinIO is
// immutable and already the source of truth, so there's nothing to keep in
// sync.
export default async function emailContentRoute(fastify: FastifyInstance) {
  fastify.get("/:id/email-content", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid document id" });
    }

    const doc = await fastify.db.query.documents.findFirst({ where: eq(documents.id, params.data.id) });
    if (!doc) {
      throw new NotFoundError("Document not found");
    }

    const mimetype = await resolveMimetype(fastify, doc);
    if (!isEmailMimetype(mimetype)) {
      throw new BadRequestError("Not an email document");
    }

    const stream = await fastify.storage.getObjectStream(doc.fileKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);

    const parsed = await parseEmail(buffer, mimetype);
    return reply.send({
      sender: parsed.sender,
      recipient: parsed.recipient,
      subject: parsed.subject,
      date: parsed.date,
      textBody: parsed.textBody,
      htmlBody: parsed.htmlBody,
    });
  });
}
