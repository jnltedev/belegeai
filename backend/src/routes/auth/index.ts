import type { FastifyInstance } from "fastify";
import registerRoute from "./register.js";
import loginRoute from "./login.js";
import logoutRoute from "./logout.js";
import meRoute from "./me.js";
import languageRoute from "./language.js";
import setPasswordRoute from "./set-password.js";

export default async function authRoutes(fastify: FastifyInstance) {
  await fastify.register(registerRoute);
  await fastify.register(loginRoute);
  await fastify.register(logoutRoute);
  await fastify.register(meRoute);
  await fastify.register(languageRoute);
  await fastify.register(setPasswordRoute);
}
