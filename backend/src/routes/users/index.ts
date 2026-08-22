import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../lib/auth-guard.js";
import listUsersRoute from "./list.js";
import createUserRoute from "./create.js";
import updateUserRoleRoute from "./update-role.js";
import resetUserPasswordRoute from "./reset-password.js";
import deleteUserRoute from "./delete.js";

export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", requireAdmin);

  await fastify.register(listUsersRoute);
  await fastify.register(createUserRoute);
  await fastify.register(updateUserRoleRoute);
  await fastify.register(resetUserPasswordRoute);
  await fastify.register(deleteUserRoute);
}
