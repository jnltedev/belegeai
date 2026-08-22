import fp from "fastify-plugin";
import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";

export default fp(async function corsPlugin(fastify: FastifyInstance) {
  fastify.register(cors, {
    origin: fastify.env.FRONTEND_ORIGIN,
    credentials: true,
  });
});
