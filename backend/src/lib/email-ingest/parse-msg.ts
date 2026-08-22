import { createRequire } from "node:module";
import type { FieldsData } from "@kenjiuno/msgreader";
import type { ParsedEmail } from "./types.js";

// This package's CJS default export doesn't interop cleanly through NodeNext
// ESM type resolution - require() it directly instead, which matches Node's
// actual runtime resolution exactly.
const require = createRequire(import.meta.url);
const MsgReader: typeof import("@kenjiuno/msgreader").default = require("@kenjiuno/msgreader").default;

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export async function parseMsg(buffer: Buffer): Promise<ParsedEmail> {
  const reader = new MsgReader(toArrayBuffer(buffer));
  const data = reader.getFileData();

  // Plain address only (not "Name <address>"), matching parse-eml.ts - falls
  // back to the display name only on the rare message with no address at all.
  const sender = data.senderEmail ?? data.senderName ?? null;
  const firstRecipient = data.recipients?.[0];
  const recipient = firstRecipient?.smtpAddress ?? firstRecipient?.email ?? firstRecipient?.name ?? null;

  const attachments = (data.attachments ?? []).flatMap((attachmentMeta: FieldsData, index: number) => {
    const filename = attachmentMeta.fileName ?? attachmentMeta.fileNameShort ?? `attachment-${index}`;
    try {
      const attachmentData = reader.getAttachment(attachmentMeta);
      return [
        {
          filename,
          mimetype: "application/octet-stream",
          buffer: Buffer.from(attachmentData.content),
        },
      ];
    } catch {
      return [];
    }
  });

  return {
    sender,
    recipient,
    subject: data.subject ?? null,
    date: data.messageDeliveryTime ? new Date(data.messageDeliveryTime).toISOString() : null,
    textBody: data.body ?? null,
    htmlBody: data.bodyHtml ?? null,
    attachments,
  };
}
