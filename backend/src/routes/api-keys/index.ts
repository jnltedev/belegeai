import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../lib/auth-guard.js";
import listApiKeysRoute from "./list.js";
import createApiKeyRoute from "./create.js";
import revokeApiKeyRoute from "./revoke.js";

export default async function apiKeysRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", requireAdmin);

  await fastify.register(listApiKeysRoute);
  await fastify.register(createApiKeyRoute);
  await fastify.register(revokeApiKeyRoute);
}
