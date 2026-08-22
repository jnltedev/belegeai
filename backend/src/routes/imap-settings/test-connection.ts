import type { FastifyInstance } from "fastify";
import { ImapFlow } from "imapflow";
import { z } from "zod";

const bodySchema = z.object({
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(993),
  username: z.string().min(1).max(255),
  // If the operator is testing an already-saved mailbox without retyping the
  // password, the caller passes the decrypted value along (resolved
  // server-side from the stored settings) instead of a fresh one - see the
  // route registration below.
  password: z.string().min(1),
  folder: z.string().min(1).max(255).default("INBOX"),
});

const CONNECT_TIMEOUT_MS = 10_000;

export default async function testImapConnectionRoute(fastify: FastifyInstance) {
  fastify.post(
    "/test-connection",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const { host, port, username, password, folder } = parsed.data;

      const client = new ImapFlow({
        host,
        port,
        secure: true,
        auth: { user: username, pass: password },
        logger: false,
      });

      try {
        await withTimeout(client.connect(), CONNECT_TIMEOUT_MS, "Zeitüberschreitung beim Verbindungsaufbau");
        const lock = await client.getMailboxLock(folder);
        lock.release();
        return reply.send({ success: true });
      } catch (err) {
        return reply.send({ success: false, error: describeImapError(err) });
      } finally {
        client.close();
      }
    },
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function describeImapError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/auth/i.test(message)) return "Anmeldung fehlgeschlagen - Benutzername oder Passwort falsch.";
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) return "Host nicht gefunden - bitte Hostnamen prüfen.";
  if (/ECONNREFUSED|ETIMEDOUT/.test(message)) return "Verbindung abgelehnt oder Zeitüberschreitung - Host/Port prüfen.";
  if (/Zeitüberschreitung/.test(message)) return message;
  if (/mailbox|folder|NONEXISTENT/i.test(message)) return "Ordner nicht gefunden - bitte Ordnernamen prüfen.";
  return `Verbindung fehlgeschlagen: ${message}`;
}
