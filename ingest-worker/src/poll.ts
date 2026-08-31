import { ImapFlow, type FetchMessageObject } from "imapflow";
import type { MailboxSettings } from "./settings.js";
import { ingestEmail, type IngestError } from "./backend-client.js";

// Backstop against a single runaway message blocking the mailbox forever -
// independent of MAX_UPLOAD_MB (not plumbed into this process), just large
// enough that any legitimate document-bearing email is well under it.
const MAX_RAW_MESSAGE_BYTES = 50 * 1024 * 1024;

function isSenderAllowed(settings: MailboxSettings, fromAddress: string | undefined): boolean {
  if (settings.allowAllSenders) return true;
  if (!fromAddress) return false;
  const normalized = fromAddress.toLowerCase();
  return settings.allowedSenders.some((allowed) => allowed.toLowerCase() === normalized);
}

export async function pollOnce(settings: MailboxSettings, log: (msg: string) => void): Promise<void> {
  const client = new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure: true,
    auth: { user: settings.username, pass: settings.password },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock(settings.folder);
    try {
      // Drain the fetch response fully before issuing any other IMAP
      // command (download, flag update, ...) - imapflow's fetch() streams a
      // single multi-message server response, and interleaving other
      // commands mid-stream desyncs the connection's protocol state,
      // silently truncating the iteration after the first message.
      const messages: FetchMessageObject[] = [];
      for await (const msg of client.fetch({ seen: false }, { uid: true, envelope: true })) {
        messages.push(msg);
      }

      for (const msg of messages) {
        await handleMessage(client, settings, msg, log);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

async function handleMessage(
  client: ImapFlow,
  settings: MailboxSettings,
  msg: FetchMessageObject,
  log: (msg: string) => void,
): Promise<void> {
  const fromAddress = msg.envelope?.from?.[0]?.address;

  if (!isSenderAllowed(settings, fromAddress)) {
    log(`Skipping message from disallowed sender: ${fromAddress ?? "(unknown)"}`);
    await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
    return;
  }

  const { content } = await client.download(msg.uid, undefined, { uid: true });
  const chunks: Buffer[] = [];
  for await (const chunk of content) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks);

  if (raw.length > MAX_RAW_MESSAGE_BYTES) {
    log(`Skipping oversized message (${raw.length} bytes) from ${fromAddress}`);
    await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
    return;
  }

  const filename = `${msg.envelope?.messageId ?? `msg-${msg.uid}`}.eml`.replace(/[<>]/g, "");

  try {
    await ingestEmail(filename, raw);
    await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
  } catch (err) {
    // A rejection the backend will repeat verbatim is marked read anyway.
    // Otherwise one unusable message is re-sent on every poll for as long as
    // it sits in the mailbox, which is a loop nobody notices until the log
    // is full of it.
    if ((err as IngestError).permanent) {
      log(`Message from ${fromAddress} cannot be imported, marking it read: ${(err as Error).message}`);
      await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
      return;
    }
    // Not marked \Seen - retried on the next poll cycle instead of silently
    // dropping a message just because the backend was briefly unavailable.
    log(`Ingest failed for message from ${fromAddress}, will retry next cycle: ${(err as Error).message}`);
  }
}
