import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireAdmin, currentUser } from "../../lib/auth-guard.js";

const registerBody = z.object({
  token: z.string().regex(/^[0-9a-f]{64,200}$/i),
  environment: z.enum(["sandbox", "production"]),
  // Whether this device wants to hear about IMAP/API imports. Per device, so
  // someone with a phone and an iPad can decide separately.
  notifyImports: z.boolean().default(true),
});

export default async function pushRoutes(fastify: FastifyInstance) {
  // Device registration is for any signed-in user; managing the proxy
  // connection is an operator concern and admin-only (guarded per route).
  fastify.addHook("onRequest", requireAuth);

  fastify.post("/devices", async (request, reply) => {
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const user = currentUser(request);

    // The user id is what the proxy stores as an opaque reference. It is a
    // UUID with no personal data in it, and is meaningless outside this
    // instance - the proxy only ever compares it for equality.
    await fastify.push.registerDevice({
      token: parsed.data.token.toLowerCase(),
      environment: parsed.data.environment,
      userRef: user.id,
      notifyImports: parsed.data.notifyImports,
    });

    return reply.code(204).send();
  });

  fastify.delete("/devices/:token", async (request, reply) => {
    const params = z.object({ token: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid token" });
    }
    await fastify.push.unregisterDevice(params.data.token.toLowerCase());
    return reply.code(204).send();
  });

  // --- Proxy connection (admin) ---

  fastify.get("/status", { onRequest: requireAdmin }, async (_request, reply) => {
    return reply.send(await fastify.push.status());
  });

  // No body: the proxy address comes from configuration, the identity from
  // this instance's own public URL, and the credential from proving control
  // of that URL. There is nothing for an operator to supply.
  fastify.post("/enroll", { onRequest: requireAdmin }, async (_request, reply) => {
    try {
      await fastify.push.enroll();
    } catch (err) {
      // Surfaced verbatim: "cannot reach the challenge endpoint" and
      // "challenge did not match" need very different fixes, and hiding
      // which is which wastes the operator's time.
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Enrollment failed" });
    }

    return reply.send(await fastify.push.status());
  });

  fastify.delete("/enroll", { onRequest: requireAdmin }, async (_request, reply) => {
    await fastify.push.disconnect();
    return reply.code(204).send();
  });
}
