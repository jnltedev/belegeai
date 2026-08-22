import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { passwordResetTokens, users } from "../db/schema/index.js";
import { inviteMail, resetMail } from "./notifications/templates.js";

// Long enough that guessing is hopeless, short enough that the whole link
// survives a mail client's line wrapping.
const TOKEN_BYTES = 32;
export const TOKEN_TTL_HOURS = 48;

export type ResetPurpose = "invite" | "reset";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedLink {
  link: string;
  /// False when SMTP is switched off, or configured but unreachable. The
  /// caller is expected to show `link` to the admin in that case so they can
  /// pass it on themselves - email must never be a hard requirement for
  /// getting someone into the archive.
  mailed: boolean;
  mailError?: string;
}

/// Issues a one-time link and, when email is configured, mails it.
///
/// Any earlier unused token for the same person is retired first: sending a
/// second invitation must not leave the first one working, or revoking access
/// becomes guesswork.
export async function issueResetLink(
  fastify: FastifyInstance,
  user: { id: string; email: string; name: string },
  purpose: ResetPurpose,
): Promise<IssuedLink> {
  await fastify.db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  await fastify.db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    purpose,
    expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000),
  });

  const base = fastify.env.FRONTEND_ORIGIN.replace(/\/+$/, "");
  const link = `${base}/set-password?token=${token}`;
  const appName = "BelegeAI";
  const mail = purpose === "invite"
    ? inviteMail(appName, user.name, link, TOKEN_TTL_HOURS)
    : resetMail(appName, user.name, link, TOKEN_TTL_HOURS);

  if (!(await fastify.notifications.mailAvailable())) {
    return { link, mailed: false };
  }

  try {
    await fastify.notifications.sendMail({
      to: user.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  } catch (err) {
    // The token is already valid, so a failed send is not fatal - hand the
    // link back and let the admin deliver it by other means.
    fastify.log.warn({ err, purpose }, "Could not send the password link");
    return { link, mailed: false, mailError: err instanceof Error ? err.message : "unknown error" };
  }

  return { link, mailed: true };
}

/// Resolves a token to its user, or null when it is unknown, already used or
/// expired. Callers must not distinguish between those three: telling an
/// attacker *why* a token failed is a hint they do not need.
export async function resolveToken(fastify: FastifyInstance, token: string) {
  const [row] = await fastify.db
    .select({
      id: passwordResetTokens.id,
      purpose: passwordResetTokens.purpose,
      userId: users.id,
      email: users.email,
      name: users.name,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    );
  return row ?? null;
}
