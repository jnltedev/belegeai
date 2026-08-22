import type { FastifyInstance } from "fastify";
import { imapSettings } from "../../db/schema/index.js";

export default async function getImapSettingsRoute(fastify: FastifyInstance) {
  fastify.get("/", async (_request, reply) => {
    const [row] = await fastify.db.select().from(imapSettings).limit(1);
    if (!row) {
      return reply.send({ settings: null });
    }
    const { passwordEncrypted: _passwordEncrypted, ...rest } = row;
    return reply.send({ settings: { ...rest, hasPassword: true } });
  });
}
