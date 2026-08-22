import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/auth-guard.js";
import listDocumentTypesRoute from "./list.js";
import createDocumentTypeRoute from "./create.js";
import suggestDocumentTypeRoute from "./suggest.js";
import updateDocumentTypeRoute from "./update.js";
import deleteDocumentTypeRoute from "./delete.js";

export default async function documentTypesRoutes(fastify: FastifyInstance) {
  // Reading types is needed by every upload (dynamic form rendering), so
  // only require plain auth here; mutation routes add their own admin gate.
  fastify.addHook("onRequest", requireAuth);

  await fastify.register(listDocumentTypesRoute);
  await fastify.register(createDocumentTypeRoute);
  await fastify.register(suggestDocumentTypeRoute);
  await fastify.register(updateDocumentTypeRoute);
  await fastify.register(deleteDocumentTypeRoute);
}
