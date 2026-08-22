import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/auth-guard.js";
import listSendersRoute from "./list.js";
import createSenderRoute from "./create.js";
import updateSenderRoute from "./update.js";
import deleteSenderRoute from "./delete.js";

export default async function sendersRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", requireAuth);
  await fastify.register(listSendersRoute);
  await fastify.register(createSenderRoute);
  await fastify.register(updateSenderRoute);
  await fastify.register(deleteSenderRoute);
}
