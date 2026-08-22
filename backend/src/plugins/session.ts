import { createHash } from "node:crypto";
import fp from "fastify-plugin";
import secureSession from "@fastify/secure-session";
import type { FastifyInstance } from "fastify";
import type { SessionUser } from "../types/session.js";

declare module "@fastify/secure-session" {
  interface SessionData {
    user: SessionUser;
  }
}

export default fp(async function sessionPlugin(fastify: FastifyInstance) {
  fastify.register(secureSession, {
    // Derives a fixed-length 32-byte signing/encryption key from SESSION_SECRET
    // so the env var itself can be any sufficiently long passphrase.
    key: createHash("sha256").update(fastify.env.SESSION_SECRET).digest(),
    cookieName: "belege_session",
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: fastify.env.COOKIE_SAME_SITE,
      secure: fastify.env.COOKIE_SECURE,
      maxAge: 60 * 60 * 24 * 30,
    },
  });
});
