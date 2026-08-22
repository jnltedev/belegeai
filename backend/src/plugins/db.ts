import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { createDb } from "../db/client.js";

export default fp(async function dbPlugin(fastify: FastifyInstance) {
  const { pool, db } = createDb(fastify.env);
  fastify.decorate("db", db);
  fastify.addHook("onClose", async () => {
    await pool.end();
  });
});
