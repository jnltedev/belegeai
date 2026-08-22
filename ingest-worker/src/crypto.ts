import { createDecipheriv } from "node:crypto";

// Mirrors backend/src/lib/crypto.ts's `decrypt`/`keyFromHex` exactly - kept
// as a small standalone copy rather than a shared package, since there's no
// workspace tooling in this repo and this is the only piece the worker
// actually needs (it never encrypts anything itself). Keep in sync if the
// backend's algorithm ever changes.
const ALGORITHM = "aes-256-gcm";

export function decrypt(payload: string, key: Buffer): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function keyFromHex(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}
