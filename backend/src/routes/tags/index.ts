import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/auth-guard.js";
import listTagsRoute from "./list.js";
import createTagRoute from "./create.js";
import updateTagRoute from "./update.js";
import deleteTagRoute from "./delete.js";

export default async function tagsRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", requireAuth);
  await fastify.register(listTagsRoute);
  await fastify.register(createTagRoute);
  await fastify.register(updateTagRoute);
  await fastify.register(deleteTagRoute);
}
