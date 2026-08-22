import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../lib/auth-guard.js";
import statsRoute from "./stats.js";

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", requireAdmin);
  await fastify.register(statsRoute);
}
