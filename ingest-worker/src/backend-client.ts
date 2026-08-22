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
    throw new Error(`Backend rejected ingest (${res.status}): ${body}`);
  }
}
