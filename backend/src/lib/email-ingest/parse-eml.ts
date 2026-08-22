import { simpleParser } from "mailparser";
import type { ParsedEmail } from "./types.js";

export async function parseEml(buffer: Buffer): Promise<ParsedEmail> {
  const mail = await simpleParser(buffer);

  // Plain address only (not "Name <address>") - stored as-is in metadata and
  // rendered as a mailto: link, where a display name would just be noise.
  const sender = mail.from?.value?.[0]?.address ?? null;
  const toField = Array.isArray(mail.to) ? mail.to[0] : mail.to;
  const recipient = toField?.value?.[0]?.address ?? null;

  return {
    sender,
    recipient,
    subject: mail.subject ?? null,
    date: mail.date ? mail.date.toISOString() : null,
    textBody: mail.text ?? null,
    htmlBody: mail.html || null,
    attachments: mail.attachments.map((att) => ({
      filename: att.filename ?? "attachment",
      mimetype: att.contentType,
      buffer: att.content,
    })),
  };
}
