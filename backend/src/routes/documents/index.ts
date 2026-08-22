import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/auth-guard.js";
import uploadRoute from "./upload.js";
import createRoute from "./create.js";
import listRoute from "./list.js";
import queueRoute from "./queue.js";
import detailRoute from "./detail.js";
import fileRoute from "./file.js";
import emailContentRoute from "./email-content.js";
import deleteRoute from "./delete.js";
import updateRoute from "./update.js";
import documentTagsRoutes from "./tags.js";

export default async function documentsRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", requireAuth);

  await fastify.register(uploadRoute);
  await fastify.register(createRoute);
  await fastify.register(listRoute);
  await fastify.register(queueRoute);
  await fastify.register(detailRoute);
  await fastify.register(fileRoute);
  await fastify.register(emailContentRoute);
  await fastify.register(deleteRoute);
  await fastify.register(updateRoute);
  await fastify.register(documentTagsRoutes);
}
