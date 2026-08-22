import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionUser } from "../types/session.js";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = request.session.get("user");
  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = request.session.get("user");
  if (!user) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  if (user.role !== "admin") {
    reply.code(403).send({ error: "Admin access required" });
  }
}

export function currentUser(request: FastifyRequest): SessionUser {
  const user = request.session.get("user");
  if (!user) {
    throw new Error("currentUser() called outside an authenticated route");
  }
  return user;
}
