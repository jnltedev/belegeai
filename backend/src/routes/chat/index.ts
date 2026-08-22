import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/auth-guard.js";
import askChatRoute from "./ask.js";
import listChatSessionsRoute from "./sessions-list.js";
import createChatSessionRoute from "./sessions-create.js";
import updateChatSessionRoute from "./sessions-update.js";
import deleteChatSessionRoute from "./sessions-delete.js";
import listChatSessionMessagesRoute from "./sessions-messages.js";

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", requireAuth);
  await fastify.register(askChatRoute);
  await fastify.register(listChatSessionsRoute);
  await fastify.register(createChatSessionRoute);
  await fastify.register(updateChatSessionRoute);
  await fastify.register(deleteChatSessionRoute);
  await fastify.register(listChatSessionMessagesRoute);
}
