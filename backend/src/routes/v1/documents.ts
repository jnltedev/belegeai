import type { FastifyInstance } from "fastify";
import { BadRequestError } from "../../lib/errors.js";
import { requireApiKey } from "../../lib/api-auth-guard.js";
import { ingestFile } from "../../lib/ingest.js";

// Deliberately minimal: file upload only, no admin/management surface (see
// Phase 4 spec - "Scope minimal halten"). Auto-creates the document(s) with
// review_status="pending"; a human confirms/discards later via the Import-
// Warteschlange, same as an IMAP-ingested document.
export default async function v1DocumentsRoute(fastify: FastifyInstance) {
  fastify.post(
    "/documents",
    {
      onRequest: requireApiKey,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const part = await request.file();
      if (!part) {
        throw new BadRequestError("No file uploaded");
      }
      const buffer = await part.toBuffer();
      const { document, attachments } = await ingestFile(fastify, buffer, part.filename, "api", request.apiKeyId);

      return reply.code(201).send({
        document: { id: document.id, title: document.title, reviewStatus: document.reviewStatus },
        attachments: attachments.map((a) => ({ id: a.id, title: a.title, reviewStatus: a.reviewStatus })),
      });
    },
  );
}
