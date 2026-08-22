import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { loadEnv } from "./config/env.js";
import { HttpError } from "./lib/errors.js";
import corsPlugin from "./plugins/cors.js";
import sessionPlugin from "./plugins/session.js";
import dbPlugin from "./plugins/db.js";
import minioPlugin from "./plugins/minio.js";
import aiPlugin from "./plugins/ai.js";
import multipartPlugin from "./plugins/multipart.js";
import pushPlugin from "./plugins/push.js";
import notificationsPlugin from "./plugins/notifications.js";
import healthRoute from "./routes/health.js";
import authRoutes from "./routes/auth/index.js";
import documentsRoutes from "./routes/documents/index.js";
import tagsRoutes from "./routes/tags/index.js";
import sendersRoutes from "./routes/senders/index.js";
import chatRoutes from "./routes/chat/index.js";
import documentTypesRoutes from "./routes/document-types/index.js";
import usersRoutes from "./routes/users/index.js";
import imapSettingsRoutes from "./routes/imap-settings/index.js";
import apiKeysRoutes from "./routes/api-keys/index.js";
import adminRoutes from "./routes/admin/index.js";
import pushRoutes from "./routes/push/index.js";
import notificationSettingsRoutes from "./routes/notification-settings/index.js";
import pushPublicRoutes from "./routes/push/public.js";
import v1DocumentsRoute from "./routes/v1/documents.js";
import imapIngestRoute from "./routes/internal/imap-ingest.js";

export async function buildApp() {
  const env = loadEnv();
  const fastify = Fastify({ logger: true });

  fastify.decorate("env", env);

  await fastify.register(corsPlugin);
  await fastify.register(sessionPlugin);
  await fastify.register(dbPlugin);
  await fastify.register(minioPlugin);
  await fastify.register(aiPlugin);
  await fastify.register(multipartPlugin);
  await fastify.register(notificationsPlugin);
  await fastify.register(pushPlugin);
  // Generous global default (normal browser usage never gets close); the
  // external API and IMAP test-connection routes set their own stricter
  // per-route limits via `config.rateLimit` since those are the actual
  // attack surfaces once this app is reachable from the internet.
  //
  // Every request reaches this backend via the frontend's own server-side
  // proxy (it's never exposed publicly - see frontend's catch-all route
  // handler), so `request.ip` alone would always be the frontend container's
  // one internal IP, making the limit apply to *all* users combined instead
  // of per-client. The proxy forwards the real client IP via CF-Connecting-IP
  // (set by Cloudflare in production) / X-Forwarded-For; fall back to
  // request.ip for direct/local access where neither header is present.
  await fastify.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: (request) =>
      (request.headers["cf-connecting-ip"] as string) ||
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.ip,
  });

  // Registered before any routes: Fastify captures the active error handler
  // into each route's context at the time that route is declared, so routes
  // registered later (including inside nested plugins) inherit this handler
  // only if it is set first.
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    // Fastify itself and its plugins (rate-limit, multipart body-too-large,
    // schema validation, ...) throw plain errors carrying a `statusCode` -
    // without this, a legitimate 429/413/etc. would get masked as a
    // confusing generic 500.
    if (error instanceof Error && "statusCode" in error) {
      const statusCode = (error as { statusCode?: unknown }).statusCode;
      if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
        return reply.code(statusCode).send({ error: error.message });
      }
    }
    fastify.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  });

  fastify.get("/health", async () => ({ status: "ok" }));

  await fastify.register(healthRoute, { prefix: "/api" });
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.register(documentsRoutes, { prefix: "/api/documents" });
  await fastify.register(tagsRoutes, { prefix: "/api/tags" });
  await fastify.register(sendersRoutes, { prefix: "/api/senders" });
  await fastify.register(chatRoutes, { prefix: "/api/chat" });
  await fastify.register(documentTypesRoutes, { prefix: "/api/document-types" });
  await fastify.register(usersRoutes, { prefix: "/api/users" });
  await fastify.register(imapSettingsRoutes, { prefix: "/api/imap-settings" });
  await fastify.register(apiKeysRoutes, { prefix: "/api/api-keys" });
  await fastify.register(adminRoutes, { prefix: "/api/admin" });
  await fastify.register(pushPublicRoutes, { prefix: "/api/push" });
  await fastify.register(pushRoutes, { prefix: "/api/push" });
  await fastify.register(notificationSettingsRoutes, { prefix: "/api/notification-settings" });
  await fastify.register(v1DocumentsRoute, { prefix: "/api/v1" });
  await fastify.register(imapIngestRoute, { prefix: "/api/internal" });

  return fastify;
}
