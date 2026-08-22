import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../lib/auth-guard.js";
import getImapSettingsRoute from "./get.js";
import updateImapSettingsRoute from "./update.js";
import testImapConnectionRoute from "./test-connection.js";

export default async function imapSettingsRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", requireAdmin);

  await fastify.register(getImapSettingsRoute);
  await fastify.register(updateImapSettingsRoute);
  await fastify.register(testImapConnectionRoute);
}
