import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireInternalIngestSecret } from "../../lib/api-auth-guard.js";
import { ingestFile } from "../../lib/ingest.js";

const bodySchema = z.object({
  filename: z.string().min(1).max(300),
  // Raw RFC822 bytes, base64-encoded - one .eml per message, exactly what a
  // manual .eml upload would receive, so it runs through the identical
  // parsing/attachment-extraction path.
  contentBase64: z.string().min(1),
});

// Not part of the documented public API (see routes/v1) - this exists only
// for the ingest-worker container to hand off mail it already fetched over
// IMAP, authenticated with a fixed shared secret rather than a per-caller key.
export default async function imapIngestRoute(fastify: FastifyInstance) {
  fastify.post(
    "/imap",
    {
      onRequest: requireInternalIngestSecret,
      // A whole email (base64, ~1.37x inflation) can carry several
      // attachments each up to MAX_UPLOAD_MB - well past Fastify's 1MB
      // default JSON body limit.
      bodyLimit: fastify.env.MAX_UPLOAD_MB * 1024 * 1024 * 6,
    },
    async (request, reply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const buffer = Buffer.from(parsed.data.contentBase64, "base64");
      const { document, attachments } = await ingestFile(fastify, buffer, parsed.data.filename, "imap");

      return reply.code(201).send({
        document: { id: document.id, title: document.title },
        attachments: attachments.map((a) => ({ id: a.id, title: a.title })),
      });
    },
  );
}
