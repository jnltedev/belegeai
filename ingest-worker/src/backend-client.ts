import { env } from "./env.js";

export async function ingestEmail(filename: string, raw: Buffer): Promise<void> {
  const res = await fetch(`${env.BACKEND_INTERNAL_URL}/api/internal/imap`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.INTERNAL_INGEST_SECRET}`,
    },
    body: JSON.stringify({ filename, contentBase64: raw.toString("base64") }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error = new Error(`Backend rejected ingest (${res.status}): ${body}`) as IngestError;
    // A 4xx is the backend's considered judgement about this message, and
    // sending the identical bytes again cannot change it. Only a transport
    // problem or a 5xx is worth another attempt.
    error.permanent = res.status >= 400 && res.status < 500;
    throw error;
  }
}

export interface IngestError extends Error {
  /// True when retrying would only produce the same answer.
  permanent?: boolean;
}
