import type { FastifyInstance } from "fastify";
import { BadRequestError } from "../../lib/errors.js";
import type { DocumentTypeOption, ExtractionSuggestion } from "../../lib/ai/types.js";
import { parseEmail, isEmailMimetype } from "../../lib/email-ingest/index.js";
import { ingestFile, MAX_EMAIL_DEPTH } from "../../lib/ingest.js";
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

/// The metadata an email carries in its own headers. No AI call: a mail
/// states its sender, recipient and date outright, and guessing at what it
/// already says would be both slower and worse.
function emailSuggestion(parsed: Awaited<ReturnType<typeof parseEmail>>, emailTypeId: string | null): UploadSuggestion {
  const fieldValues: Record<string, unknown> = {};
  if (parsed.sender) fieldValues.sender = parsed.sender;
  if (parsed.recipient) fieldValues.recipient = parsed.recipient;
  if (parsed.date) fieldValues.date = parsed.date.slice(0, 10);

  return {
    documentTypeId: emailTypeId,
    documentTypeName: "E-Mail",
    fieldValues,
    suggestedTags: [],
    fullText: parsed.textBody ?? (parsed.htmlBody ? stripHtml(parsed.htmlBody) : null),
  };
}

/// Walks one email's attachments, opening any email found among them.
///
/// Forwarding an invoice puts the document two levels down: your covering
/// note contains the original mail, and the original mail contains the PDF.
/// Stopping at the first level, which is what this did before, meant the
/// nested mail was dropped for not being a PDF or an image, and the PDF
/// inside it was never reached at all. The same file forwarded to a watched
/// mailbox came out right, because that path has always walked the tree.
async function processEmailAttachments(
  fastify: FastifyInstance,
  attachments: Array<{ filename: string; buffer: Buffer; mimetype?: string }>,
  types: AvailableType[],
  knownSenders: string[],
  emailTypeId: string | null,
  depth: number,
  /// Content hashes already turned into a result. A forwarding chain
  /// re-attaches the same invoice at every hop, and without this the same
  /// bytes would come back as several separate documents to fill in.
  seen: Set<string>,
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];

  for (const attachment of attachments) {
    let stored;
    try {
      // The declared type is passed along: a nested mail arrives with no
      // usable filename from some clients, and plain-text RFC822 has no
      // magic bytes to fall back on.
      stored = await fastify.storage.putObjectHashed(attachment.buffer, attachment.filename, attachment.mimetype);
    } catch {
      continue; // not a supported type, or empty - skip silently
    }
    if (seen.has(stored.fileKey)) continue;

    if (isEmailMimetype(stored.mimetype)) {
      seen.add(stored.fileKey);
      const parsed = await parseEmail(attachment.buffer, stored.mimetype);
      // Beyond the limit the mail is still filed, with its real subject and
      // sender, it is simply not taken apart. Losing it silently would be
      // worse than an unopened envelope.
      const children =
        depth >= MAX_EMAIL_DEPTH
          ? []
          : await processEmailAttachments(
              fastify,
              parsed.attachments,
              types,
              knownSenders,
              emailTypeId,
              depth + 1,
              seen,
            );

      results.push({
        fileKey: stored.fileKey,
        originalFilename: attachment.filename,
        sizeBytes: stored.sizeBytes,
        mimetype: stored.mimetype,
        suggestion: emailSuggestion(parsed, emailTypeId),
        suggestedTitle: parsed.subject ?? undefined,
        emailAttachments: children,
      });
      continue;
    }

    if (!DOCUMENT_MIME_TYPES.has(stored.mimetype)) continue;
    // Image attachments on an email are almost always signature logos or
    // tracking pixels, not real documents - never surface them as their own
    // attachment document, and never spend an AI call on them.
    if (stored.mimetype.startsWith("image/")) continue;

    seen.add(stored.fileKey);
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
        const emailAttachments = await processEmailAttachments(
          fastify,
          parsed.attachments,
          types,
          knownSenders,
          emailType?.id ?? null,
          1,
          new Set([stored.fileKey]),
        );

        results.push({
          fileKey: stored.fileKey,
          originalFilename: part.filename,
          sizeBytes: stored.sizeBytes,
          mimetype: stored.mimetype,
          suggestion: emailSuggestion(parsed, emailType?.id ?? null),
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
