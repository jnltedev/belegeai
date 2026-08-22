import fp from "fastify-plugin";
import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";

export default fp(async function multipartPlugin(fastify: FastifyInstance) {
  fastify.register(multipart, {
    limits: {
      fileSize: fastify.env.MAX_UPLOAD_MB * 1024 * 1024,
      files: 20,
    },
  });
});
