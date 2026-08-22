import type { FastifyInstance } from "fastify";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { senders } from "../../db/schema/index.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";

const paramsSchema = z.object({ id: z.string().uuid() });
const updateBody = z.object({ name: z.string().min(1).max(200) });

export default async function updateSenderRoute(fastify: FastifyInstance) {
  fastify.patch("/:id", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) throw new BadRequestError("Invalid sender id");
    const body = updateBody.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const existing = await fastify.db.query.senders.findFirst({ where: eq(senders.id, params.data.id) });
    if (!existing) throw new NotFoundError("Sender not found");

    const trimmed = body.data.name.trim();
    if (trimmed !== existing.name) {
      // Case-insensitive - renaming to a name that already exists under
      // different casing must be rejected the same as an exact match (see
      // the case-insensitive unique index on senders.name).
      const nameTaken = await fastify.db.query.senders.findFirst({
        where: and(sql`lower(${senders.name}) = lower(${trimmed})`, ne(senders.id, existing.id)),
      });
      if (nameTaken) throw new BadRequestError("Ein Sender mit diesem Namen existiert bereits");
    }

    const updated = await fastify.db.transaction(async (tx) => {
      const [row] = await tx.update(senders).set({ name: trimmed }).where(eq(senders.id, existing.id)).returning();
      // Sender is stored as a plain metadata string on each document, not a
      // foreign key - without this, renaming here would silently orphan
      // every already-tagged document from its (renamed) sender entity.
      if (trimmed !== existing.name) {
        await tx.execute(
          sql`UPDATE documents SET metadata = jsonb_set(metadata, '{sender}', to_jsonb(${trimmed}::text)) WHERE metadata->>'sender' = ${existing.name}`,
        );
      }
      return row;
    });

    return reply.send({ sender: updated });
  });
}
