import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../../lib/auth-guard.js";
import { BadRequestError } from "../../lib/errors.js";

const suggestBody = z.object({
  name: z.string().min(1).max(100),
});

export default async function suggestDocumentTypeRoute(fastify: FastifyInstance) {
  fastify.post("/suggest", { onRequest: requireAdmin }, async (request, reply) => {
    const parsed = suggestBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    let suggestion;
    try {
      suggestion = await fastify.ai.suggestDocumentType(parsed.data.name);
    } catch (err) {
      fastify.log.warn({ err }, "AI document-type suggestion failed");
      suggestion = null;
    }

    if (!suggestion) {
      throw new BadRequestError(
        "KI-Vorschlag nicht verfügbar (kein API-Key konfiguriert oder Anfrage fehlgeschlagen). Bitte Stichwörter und Felder manuell eintragen.",
      );
    }

    return reply.send({ suggestion });
  });
}
