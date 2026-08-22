import "fastify";
import type { Env } from "../config/env.js";
import type { Database } from "../db/client.js";
import type { Storage } from "../plugins/minio.js";
import type { AiProvider } from "../lib/ai/types.js";
import type { PushService } from "../plugins/push.js";
import type { NotificationService } from "../plugins/notifications.js";

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
    db: Database;
    storage: Storage;
    ai: AiProvider;
    push: PushService;
    notifications: NotificationService;
  }
  interface FastifyRequest {
    // Set by requireApiKey once the Bearer token has been verified -
    // available to route handlers under /api/v1/* so they can record which
    // key ingested a document.
    apiKeyId?: string;
  }
}
