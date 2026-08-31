import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireInternalIngestSecret } from "../../lib/api-auth-guard.js";
import { ingestFile } from "../../lib/ingest.js";
import { BadRequestError } from "../../lib/errors.js";

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

      let result;
      try {
        result = await ingestFile(fastify, buffer, parsed.data.filename, "imap");
      } catch (err) {
        // A mail with nothing attached is the everyday case, not a failure:
        // the message itself is never filed, so there is simply nothing to
        // import. Answering 200 lets the worker mark it read and move on;
        // anything else and it would retry the same empty mail on every
        // poll, forever.
        if (err instanceof BadRequestError) {
          fastify.log.info({ filename: parsed.data.filename, reason: err.message }, "Nothing to import from a message");
          return reply.code(200).send({ imported: 0, reason: err.message });
        }
        throw err;
      }

      return reply.code(201).send({
        imported: 1 + result.attachments.length,
        document: { id: result.document.id, title: result.document.title },
        attachments: result.attachments.map((a) => ({ id: a.id, title: a.title })),
      });
    },
  );
}
