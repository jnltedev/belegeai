import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { users } from "../db/schema/index.js";

// Registered under /api (see app.ts) so it is reachable through the
// frontend's catch-all proxy, which only forwards /api/* - the bare /health
// route at the root exists for container healthchecks and is invisible from
// the outside. Native clients use this one to validate a hosted URL before
// showing a login form, hence the app marker and authMode: it distinguishes
// "this is a BelegeAI instance" from "something else answered with JSON",
// and lets a client explain up front that a server set to sso has no local
// login (routes/auth/login.ts answers 501 there).
export default async function healthRoute(fastify: FastifyInstance) {
  fastify.get("/health", async () => {
    // Registration is open only until the first account exists. Exposed here
    // so the sign-up page can say so plainly instead of offering a form that
    // is guaranteed to fail.
    const [{ count }] = await fastify.db.select({ count: sql<number>`count(*)::int` }).from(users);

    return {
      status: "ok",
      app: "belegeai",
      authMode: fastify.env.AUTH_MODE,
      registrationOpen: count === 0,
      // Lets a client show "notifications unavailable on this server" instead
      // of asking for permission it can never act on. True once an admin has
      // connected this instance to a push proxy.
      pushEnabled: await fastify.push.isConfigured(),
    };
  });
}
