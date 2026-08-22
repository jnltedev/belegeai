export interface ParsedEmailAttachment {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

export interface ParsedEmail {
  sender: string | null;
  recipient: string | null;
  subject: string | null;
  date: string | null;
  textBody: string | null;
  htmlBody: string | null;
  attachments: ParsedEmailAttachment[];
}

export const EML_MIMETYPE = "message/rfc822";
export const MSG_MIMETYPE = "application/vnd.ms-outlook";
