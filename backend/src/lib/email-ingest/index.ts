import { parseEml } from "./parse-eml.js";
import { parseMsg } from "./parse-msg.js";
import { EML_MIMETYPE, MSG_MIMETYPE } from "./types.js";
import type { ParsedEmail } from "./types.js";

export * from "./types.js";

// Single shared entrypoint used by both the manual upload path and (later)
// the IMAP ingest worker - one parser per format, not duplicated per caller.
export async function parseEmail(buffer: Buffer, mimetype: string): Promise<ParsedEmail> {
  if (mimetype === EML_MIMETYPE) return parseEml(buffer);
  if (mimetype === MSG_MIMETYPE) return parseMsg(buffer);
  throw new Error(`Unsupported email mimetype: ${mimetype}`);
}

export function isEmailMimetype(mimetype: string): boolean {
  return mimetype === EML_MIMETYPE || mimetype === MSG_MIMETYPE;
}
