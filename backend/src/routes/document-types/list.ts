import type { FastifyInstance } from "fastify";
import { asc } from "drizzle-orm";
import { documentTypes } from "../../db/schema/index.js";

export default async function listDocumentTypesRoute(fastify: FastifyInstance) {
  fastify.get("/", async (_request, reply) => {
    const rows = await fastify.db.select().from(documentTypes).orderBy(asc(documentTypes.name));
    return reply.send({ documentTypes: rows });
  });
}
