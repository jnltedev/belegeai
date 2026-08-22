import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { apiKeys } from "../db/schema/index.js";
import { hashApiKey, safeCompare } from "./api-keys.js";

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

// External REST API auth (Phase 4 point 3) - a user-issued, revocable key
// from the api_keys table. Distinct from the worker's fixed shared secret
// below: these identify individual external callers, get revoked
// individually, and are what a rate limiter should key on per-caller.
export async function requireApiKey(request: FastifyRequest, reply: FastifyReply) {
  const token = bearerToken(request);
  if (!token) {
    return reply.code(401).send({ error: "Missing API key" });
  }

  const keyHash = hashApiKey(token);
  const [key] = await request.server.db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)));

  if (!key) {
    return reply.code(401).send({ error: "Invalid or revoked API key" });
  }

  request.apiKeyId = key.id;
  await request.server.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
}

// The ingest-worker's own endpoint - a single fixed shared secret (not a
// per-caller revocable key, since there's exactly one caller: our own
// worker container), compared in constant time.
export async function requireInternalIngestSecret(request: FastifyRequest, reply: FastifyReply) {
  const token = bearerToken(request);
  if (!token || !safeCompare(token, request.server.env.INTERNAL_INGEST_SECRET)) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}
