import type { FastifyInstance } from "fastify";
import { requireAuth } from "../lib/auth-guard.js";
import { getUpdateInfo } from "../lib/update-check.js";
import { APP_VERSION } from "../lib/version.js";

// Behind authentication: which version an instance runs is exactly what
// someone probing for a known flaw would like to read off an unauthenticated
// endpoint. /api/health stays public and deliberately says nothing about it.
//
// Also the endpoint the mobile clients will read, hence the plain shape.
export default async function versionRoute(fastify: FastifyInstance) {
  fastify.addHook("onRequest", requireAuth);

  fastify.get("/", async () => {
    const update = await getUpdateInfo(fastify);
    return {
      version: APP_VERSION,
      update: {
        available: update.updateAvailable,
        latest: update.latest,
        name: update.releaseName,
        url: update.releaseUrl,
        publishedAt: update.publishedAt,
      },
    };
  });
}
