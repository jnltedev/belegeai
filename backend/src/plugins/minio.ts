import fp from "fastify-plugin";
import { Client } from "minio";
import { fileTypeFromBuffer } from "file-type";
import type { FastifyInstance } from "fastify";
import { sha256Hex } from "../lib/hash.js";
import { BadRequestError } from "../lib/errors.js";
import { EML_MIMETYPE, MSG_MIMETYPE } from "../lib/email-ingest/index.js";

// Directly uploadable/previewable document types.
export const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "image/webp",
]);

// Documents plus email containers, accepted at the top-level upload endpoint.
const ALLOWED_MIME_TYPES = new Set([...DOCUMENT_MIME_TYPES, EML_MIMETYPE, MSG_MIMETYPE]);

export interface StoredFile {
  fileKey: string;
  mimetype: string;
  sizeBytes: number;
}

export interface Storage {
  putObjectHashed(buffer: Buffer, originalFilename?: string, knownMimetype?: string): Promise<StoredFile>;
  getObjectStream(fileKey: string): Promise<NodeJS.ReadableStream>;
  getObjectContentType(fileKey: string): Promise<string | null>;
  deleteObject(fileKey: string): Promise<void>;
}


/// Identifies a file without storing it.
///
/// Split out from putObjectHashed so a caller can decide whether something
/// deserves a database row before its bytes are written. Storing first and
/// deciding afterwards leaves objects in the bucket that nothing references,
/// and the delete path only ever cleans up objects a document points at.
export async function detectMimetype(buffer: Buffer, originalFilename?: string): Promise<string> {
  // Rejected before anything else. An empty .eml passes the extension check
  // below and parses into a perfectly valid email with no subject, no sender
  // and no body, so it gets filed as a document that shows nothing and can
  // never be extracted from. Better to say the file is empty.
  if (buffer.length === 0) {
    throw new BadRequestError("The file is empty");
  }

  const detected = await fileTypeFromBuffer(buffer);
  let mimetype: string | undefined = detected?.mime;

  // Plain-text RFC822 (.eml) has no magic bytes file-type can detect -
  // fall back to the filename extension.
  if (!mimetype && originalFilename?.toLowerCase().endsWith(".eml")) {
    mimetype = EML_MIMETYPE;
  }

  // .msg is a binary OLE container. file-type sometimes recognizes it
  // specifically as application/vnd.ms-outlook, but for some real-world files
  // (verified empirically) it only detects the generic CFB envelope - fall
  // back to the extension in that case too.
  if (mimetype === "application/x-cfb" && originalFilename?.toLowerCase().endsWith(".msg")) {
    mimetype = MSG_MIMETYPE;
  }

  if (!mimetype || !ALLOWED_MIME_TYPES.has(mimetype)) {
    throw new BadRequestError("Unsupported file type. Allowed: PDF, PNG, JPEG, TIFF, WebP, EML, MSG.");
  }

  return mimetype;
}

export default fp(async function minioPlugin(fastify: FastifyInstance) {
  const env = fastify.env;
  const client = new Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });

  const exists = await client.bucketExists(env.MINIO_BUCKET).catch(() => false);
  if (!exists) {
    await client.makeBucket(env.MINIO_BUCKET);
  }

  const storage: Storage = {
    async putObjectHashed(
      buffer: Buffer,
      originalFilename?: string,
      // Supplied when the caller already knows the type from something more
      // reliable than the bytes - a nested message/rfc822 part, say, which
      // has neither magic bytes nor necessarily a filename.
      knownMimetype?: string,
    ): Promise<StoredFile> {
      const mimetype =
        knownMimetype && ALLOWED_MIME_TYPES.has(knownMimetype)
          ? knownMimetype
          : await detectMimetype(buffer, originalFilename);
      const fileKey = sha256Hex(buffer);

      // Content-addressed key: identical content already stored under this key
      // means we can skip the upload entirely (free dedup) and the original is
      // never overwritten with different bytes under the same key.
      const alreadyStored = await client
        .statObject(env.MINIO_BUCKET, fileKey)
        .then(() => true)
        .catch(() => false);

      if (!alreadyStored) {
        await client.putObject(env.MINIO_BUCKET, fileKey, buffer, buffer.length, {
          "Content-Type": mimetype,
        });
      }

      return { fileKey, mimetype, sizeBytes: buffer.length };
    },

    async getObjectStream(fileKey: string): Promise<NodeJS.ReadableStream> {
      return client.getObject(env.MINIO_BUCKET, fileKey);
    },

    async getObjectContentType(fileKey: string): Promise<string | null> {
      const stat = await client.statObject(env.MINIO_BUCKET, fileKey);
      const metaData = stat.metaData ?? {};
      return metaData["content-type"] ?? metaData["Content-Type"] ?? null;
    },

    async deleteObject(fileKey: string): Promise<void> {
      await client.removeObject(env.MINIO_BUCKET, fileKey);
    },
  };

  fastify.decorate("storage", storage);
});
