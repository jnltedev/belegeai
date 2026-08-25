import type { FastifyInstance } from "fastify";
import { BadRequestError } from "../../lib/errors.js";
import type { DocumentTypeOption, ExtractionSuggestion } from "../../lib/ai/types.js";
import { parseEmail, isEmailMimetype } from "../../lib/email-ingest/index.js";
import { ingestFile } from "../../lib/ingest.js";
import { currentUser } from "../../lib/auth-guard.js";
import { DOCUMENT_MIME_TYPES } from "../../plugins/minio.js";
import { documentTypes as documentTypesTable, senders, type DocumentTypeField } from "../../db/schema/index.js";

interface UploadSuggestion {
  documentTypeId: string | null;
  documentTypeName: string;
  fieldValues: Record<string, unknown>;
  suggestedTags: string[];
  fullText: string | null;
}

interface UploadResult {
  fileKey: string;
  originalFilename: string;
  sizeBytes: number;
  mimetype: string;
  suggestion: UploadSuggestion | null;
  suggestedTitle?: string;
  emailAttachments?: UploadResult[];
  /// Set when the file was filed straight into the review queue instead of
  /// being analysed while the browser waited. The client must then skip its
  /// metadata form: the row already exists, and filling one in would create
  /// a second one for the same file.
  queued?: boolean;
}

interface AvailableType {
  id: string;
  name: string;
  keywords: string[];
  fields: DocumentTypeField[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function toOption(type: AvailableType): DocumentTypeOption {
  return { name: type.name, keywords: type.keywords, fields: type.fields };
}

function resolveSuggestion(
  types: AvailableType[],
  raw: ExtractionSuggestion | null,
): UploadSuggestion | null {
  if (!raw) return null;
  const matched = types.find((t) => t.name.toLowerCase() === raw.documentTypeName.toLowerCase());
  return {
    documentTypeId: matched?.id ?? null,
    documentTypeName: matched?.name ?? raw.documentTypeName,
    fieldValues: raw.fieldValues,
    suggestedTags: raw.suggestedTags,
    fullText: raw.fullText,
  };
}

async function extractSuggestion(
  fastify: FastifyInstance,
  buffer: Buffer,
  mimetype: string,
  types: AvailableType[],
  knownSenders: string[],
): Promise<ExtractionSuggestion | null> {
  try {
    return await fastify.ai.extractDocument(buffer, mimetype, types.map(toOption), knownSenders);
  } catch (err) {
    fastify.log.warn({ err }, "AI extraction failed; falling back to manual entry");
    return null;
  }
}

async function processEmailAttachments(
  fastify: FastifyInstance,
  attachments: Array<{ filename: string; buffer: Buffer }>,
  types: AvailableType[],
  knownSenders: string[],
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  for (const attachment of attachments) {
    let stored;
    try {
      stored = await fastify.storage.putObjectHashed(attachment.buffer, attachment.filename);
    } catch {
      continue; // not a PDF/image (or another unsupported type) - skip silently
    }
    if (!DOCUMENT_MIME_TYPES.has(stored.mimetype)) continue;
    // Image attachments on an email are almost always signature logos or
    // tracking pixels, not real documents - never surface them as their own
    // attachment document, and never spend an AI call on them.
    if (stored.mimetype.startsWith("image/")) continue;

    const raw = await extractSuggestion(fastify, attachment.buffer, stored.mimetype, types, knownSenders);
    results.push({
      fileKey: stored.fileKey,
      originalFilename: attachment.filename,
      sizeBytes: stored.sizeBytes,
      mimetype: stored.mimetype,
      suggestion: resolveSuggestion(types, raw),
    });
  }
  return results;
}

export default async function uploadRoute(fastify: FastifyInstance) {
  fastify.post("/upload", async (request, reply) => {
    const types = await fastify.db.select().from(documentTypesTable);
    const knownSenders = (await fastify.db.select({ name: senders.name }).from(senders)).map((s) => s.name);
    const emailType = types.find((t) => t.name === "E-Mail");

    const parts = request.files();
    const results: UploadResult[] = [];
    // Minutes per document on a local model, so the browser is not kept
    // waiting for one. See AiProvider.prefersBackgroundExtraction.
    const defer = fastify.ai.prefersBackgroundExtraction;
    const user = currentUser(request);

    for await (const part of parts) {
      const buffer = await part.toBuffer();
      const stored = await fastify.storage.putObjectHashed(buffer, part.filename);

      if (defer) {
        // Stored above rather than left entirely to the background job, so an
        // unsupported file type or a broken object store is still reported
        // now, while the user is looking at the upload screen.
        //
        // ingestFile does the rest: it unpacks emails, files attachments with
        // their parent link, extracts, and embeds. Exactly the path a mailbox
        // takes, which is why nothing here needs to be rebuilt. It stores the
        // file once more, which costs one redundant write and no duplicate
        // row: object keys are content hashes.
        void ingestFile(fastify, buffer, part.filename, "manual", undefined, user.id).catch((err) => {
          fastify.log.warn({ err, filename: part.filename }, "Background ingest of an upload failed");
        });

        results.push({
          fileKey: stored.fileKey,
          originalFilename: part.filename,
          sizeBytes: stored.sizeBytes,
          mimetype: stored.mimetype,
          suggestion: null,
          queued: true,
        });
        continue;
      }

      if (isEmailMimetype(stored.mimetype)) {
        const parsed = await parseEmail(buffer, stored.mimetype);
        const fieldValues: Record<string, unknown> = {};
        if (parsed.sender) fieldValues.sender = parsed.sender;
        if (parsed.recipient) fieldValues.recipient = parsed.recipient;
        if (parsed.date) fieldValues.date = parsed.date.slice(0, 10);

        const emailAttachments = await processEmailAttachments(fastify, parsed.attachments, types, knownSenders);

        results.push({
          fileKey: stored.fileKey,
          originalFilename: part.filename,
          sizeBytes: stored.sizeBytes,
          mimetype: stored.mimetype,
          suggestion: {
            documentTypeId: emailType?.id ?? null,
            documentTypeName: "E-Mail",
            fieldValues,
            suggestedTags: [],
            fullText: parsed.textBody ?? (parsed.htmlBody ? stripHtml(parsed.htmlBody) : null),
          },
          suggestedTitle: parsed.subject ?? undefined,
          emailAttachments,
        });
        continue;
      }

      // Files are already durably stored above; extraction is best-effort and
      // must never fail the upload itself.
      const raw = await extractSuggestion(fastify, buffer, stored.mimetype, types, knownSenders);
      results.push({
        fileKey: stored.fileKey,
        originalFilename: part.filename,
        sizeBytes: stored.sizeBytes,
        mimetype: stored.mimetype,
        suggestion: resolveSuggestion(types, raw),
      });
    }

    if (results.length === 0) {
      throw new BadRequestError("No files were uploaded");
    }

    return reply.code(201).send({ files: results });
  });
}
