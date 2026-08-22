import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { documents, senders } from "../../db/schema/index.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export default async function deleteSenderRoute(fastify: FastifyInstance) {
  fastify.delete("/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new BadRequestError("Invalid sender id");

    const existing = await fastify.db.query.senders.findFirst({ where: eq(senders.id, params.data.id) });
    if (!existing) throw new NotFoundError("Sender not found");

    const inUse = await fastify.db.query.documents.findFirst({
      where: sql`${documents.metadata}->>'sender' = ${existing.name}`,
      columns: { id: true },
    });
    if (inUse) {
      throw new BadRequestError(
        "Dieser Sender ist noch mindestens einem Dokument zugewiesen und kann nicht gelöscht werden.",
      );
    }

    await fastify.db.delete(senders).where(eq(senders.id, params.data.id));
    return reply.code(204).send();
  });
}
