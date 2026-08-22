import type { FastifyInstance } from "fastify";
import { documents, documentTags, documentTypes as documentTypesTable, senders, type DocumentTypeField } from "../db/schema/index.js";
import type { DocumentTypeOption, ExtractionSuggestion } from "./ai/types.js";
import { parseEmail, isEmailMimetype } from "./email-ingest/index.js";
import { detectMimetype } from "../plugins/minio.js";
import { findOrCreateTag } from "./tags.js";
import { ensureSenderFromMetadata } from "./senders.js";
import { generateAndStoreEmbedding } from "./embeddings.js";
import { sha256Hex } from "./hash.js";
import { BadRequestError } from "./errors.js";

interface AvailableType {
  id: string;
  name: string;
  keywords: string[];
  fields: DocumentTypeField[];
}

function toOption(type: AvailableType): DocumentTypeOption {
  return { name: type.name, keywords: type.keywords, fields: type.fields };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Extensions we ever actually produce/accept (see DOCUMENT_MIME_TYPES /
// EML_MIMETYPE / MSG_MIMETYPE) - a filename must end in one of these,
// however it's separated, to have that suffix stripped for a title.
const KNOWN_EXTENSIONS = ["pdf", "png", "jpe?g", "tiff?", "webp", "eml", "msg"];
const EXTENSION_PATTERN = new RegExp(`[._](?:${KNOWN_EXTENSIONS.join("|")})$`, "i");

// Strips a trailing extension for use as a title. Some mail clients/MIME
// encoders hand us attachment filenames with the extension separated by "_"
// instead of "." (e.g. "Anlage_1_pdf") - normalize that case too, rather
// than leaving a mangled "_pdf" suffix on the title.
function titleFromFilename(filename: string): string {
  return filename.replace(EXTENSION_PATTERN, "");
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

function resolveDocumentTypeId(types: AvailableType[], raw: ExtractionSuggestion | null): string | null {
  if (!raw) return null;
  return types.find((t) => t.name.toLowerCase() === raw.documentTypeName.toLowerCase())?.id ?? null;
}

// Keeps only the metadata keys the resolved type actually declares - same
// filtering rule the manual-upload metadata form applies client-side.
function metadataFromSuggestion(
  types: AvailableType[],
  documentTypeId: string | null,
  raw: ExtractionSuggestion | null,
): Record<string, unknown> {
  if (!raw || !documentTypeId) return {};
  const type = types.find((t) => t.id === documentTypeId);
  if (!type) return {};
  const metadata: Record<string, unknown> = {};
  for (const field of type.fields) {
    const value = raw.fieldValues[field.key];
    if (value !== undefined && value !== null && value !== "") metadata[field.key] = value;
  }
  return metadata;
}

async function resolveTagIds(fastify: FastifyInstance, names: string[]): Promise<string[]> {
  const tags = await Promise.all(names.map((name) => findOrCreateTag(fastify.db, name)));
  return tags.map((t) => t.id);
}

type Document = typeof documents.$inferSelect;

export interface IngestResult {
  document: Document;
  attachments: Document[];
}

type IngestSource = "imap" | "api";

// How many levels of nested mail get opened. The message that arrived is
// level 0, so 3 unpacks a forward of a forward of a forward. Deeper than that
// a mail is still filed - with its real subject and sender - just not taken
// apart, because losing it silently would be worse than an unopened envelope.
const MAX_EMAIL_DEPTH = 3;

// Ceiling on documents produced by one incoming message. Every PDF costs a
// synchronous AI extraction, so a long forwarding chain with a dozen repeated
// attachments could otherwise stall the worker for minutes and spend real
// money doing it. Reaching the limit is logged, never silent.
const MAX_DOCUMENTS_PER_INGEST = 25;

/// State carried through one incoming message's tree.
interface IngestWalk {
  types: AvailableType[];
  knownSenders: string[];
  source: IngestSource;
  apiKeyId?: string;
  /// Content hashes already turned into a document during this walk.
  /// Forwarding chains re-attach the same invoice at every hop, and without
  /// this you get one row per hop for identical bytes.
  seenFileKeys: Set<string>;
  created: Document[];
  truncated: boolean;
}

// Auto-creates documents with no human confirming the AI suggestion first -
// used by IMAP polling and the external REST API. Rows start life with
// review_status="pending" (except mails, whose metadata comes from headers
// rather than a guess) so they surface in the Import-Warteschlange until a
// human confirms or discards them.
export async function ingestFile(
  fastify: FastifyInstance,
  buffer: Buffer,
  filename: string,
  source: IngestSource,
  apiKeyId?: string,
): Promise<IngestResult> {
  const types = await fastify.db.select().from(documentTypesTable);
  const knownSenders = (await fastify.db.select({ name: senders.name }).from(senders)).map((s) => s.name);

  // Identified before anything is stored: a carrier mail that turns out to be
  // a pure envelope never gets written to object storage at all.
  const mimetype = await detectMimetype(buffer, filename);

  if (!isEmailMimetype(mimetype)) {
    const stored = await fastify.storage.putObjectHashed(buffer, filename);
    const raw = await extractSuggestion(fastify, buffer, stored.mimetype, types, knownSenders);
    const document = await createPendingDocument(fastify, {
      title: titleFromFilename(filename),
      fileKey: stored.fileKey,
      mimetype: stored.mimetype,
      sizeBytes: stored.sizeBytes,
      source,
      types,
      raw,
      apiKeyId,
    });
    void generateAndStoreEmbedding(fastify, document.id);
    notifyImport(fastify, source, document.id);
    return { document, attachments: [] };
  }

  const walk: IngestWalk = {
    types,
    knownSenders,
    source,
    apiKeyId,
    seenFileKeys: new Set(),
    created: [],
    truncated: false,
  };

  await ingestMail(fastify, walk, { buffer, filename, mimetype, depth: 0 });

  if (walk.truncated) {
    fastify.log.warn(
      { filename, limit: MAX_DOCUMENTS_PER_INGEST },
      "Ingest stopped at the per-message document limit; some attachments were not imported",
    );
  }

  if (walk.created.length === 0) {
    throw new BadRequestError("Nothing in this message could be imported");
  }

  // Shape kept for the callers: the first thing created is the headline, the
  // rest are its companions. With the carrier dropped that headline is the
  // first real attachment, which is what a reader cares about anyway.
  const [document, ...attachments] = walk.created;
  notifyImport(fastify, source, document.id);
  return { document, attachments };
}

// Fire-and-forget, and only from this file: everything that reaches here
// arrived on its own via IMAP or the external API. Documents a person filed
// from the app go through routes/documents/create.ts instead, which
// deliberately sends nothing - being notified about what you just did
// yourself is noise, not news.
function notifyImport(fastify: FastifyInstance, source: IngestSource, documentId: string): void {
  void fastify.push
    .notifyImport({ source, documentId })
    .catch((err) => fastify.log.warn({ err }, "Push notification for import failed"));

  // Chat and email channels carry the same fact in words. Still no title or
  // filename - someone reading a Discord channel should learn that a document
  // arrived, not what it says.
  const wording =
    source === "imap"
      ? "A document was imported by email and is waiting for review."
      : "A document was uploaded via the API and is waiting for review.";
  void fastify.notifications
    .broadcast(wording)
    .catch((err) => fastify.log.warn({ err }, "Notification broadcast for import failed"));
}

interface MailNode {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  depth: number;
  parentDocumentId?: string;
  /// False once the nesting limit is reached: the mail is still filed, its
  /// own attachments simply stay packed.
  openAttachments?: boolean;
}

/// Processes one mail and everything hanging off it.
///
/// The message that arrived (depth 0) is treated as a transport envelope: it
/// is only filed if it produced nothing else, so forwarding an invoice leaves
/// the invoice behind rather than the covering note. A mail found *inside*
/// one is the opposite - it is the thing somebody meant to keep, so it is
/// always filed.
async function ingestMail(fastify: FastifyInstance, walk: IngestWalk, node: MailNode): Promise<void> {
  let parsed: Awaited<ReturnType<typeof parseEmail>>;
  try {
    parsed = await parseEmail(node.buffer, node.mimetype);
  } catch (err) {
    fastify.log.warn({ err, filename: node.filename }, "Could not parse a nested message; skipping it");
    return;
  }

  const isCarrier = node.depth === 0;
  let mailDocument: Document | undefined;

  if (!isCarrier) {
    mailDocument = await createMailDocument(fastify, walk, parsed, node);
    if (!mailDocument) return;
  }

  const attachmentParentId = mailDocument?.id ?? node.parentDocumentId;
  const createdBefore = walk.created.length;
  const attachments = node.openAttachments === false ? [] : parsed.attachments;

  for (const attachment of attachments) {
    if (walk.created.length >= MAX_DOCUMENTS_PER_INGEST) {
      walk.truncated = true;
      break;
    }
    try {
      await ingestAttachment(fastify, walk, attachment, node.depth, attachmentParentId);
    } catch (err) {
      // One unreadable attachment must not cost us its siblings.
      fastify.log.warn({ err, filename: attachment.filename }, "Skipping an attachment that could not be ingested");
    }
  }

  // The envelope is kept only when it carried nothing - otherwise a plain
  // forwarded note would vanish without a trace, which is the one failure
  // nobody would notice.
  if (isCarrier && walk.created.length === createdBefore) {
    await createMailDocument(fastify, walk, parsed, node);
  }
}

async function ingestAttachment(
  fastify: FastifyInstance,
  walk: IngestWalk,
  attachment: { filename: string; mimetype: string; buffer: Buffer },
  parentDepth: number,
  parentDocumentId?: string,
): Promise<void> {
  // For nested messages the MIME structure is authoritative and byte sniffing
  // is useless: a forwarded mail arrives as message/rfc822 with no filename at
  // all, and plain RFC822 has no magic bytes. Trusting detection here is what
  // made every forwarded-as-attachment mail disappear without a trace.
  if (isEmailMimetype(attachment.mimetype)) {
    const depth = parentDepth + 1;
    const atLimit = depth > MAX_EMAIL_DEPTH;
    if (atLimit) {
      fastify.log.info(
        { filename: attachment.filename, depth },
        "Nesting limit reached; filing this message without opening it further",
      );
    }
    await ingestMail(fastify, walk, {
      buffer: attachment.buffer,
      filename: attachment.filename,
      mimetype: attachment.mimetype,
      depth,
      parentDocumentId,
      // Still filed, with its real subject and sender - only its own
      // attachments stay packed. Dropping it outright would lose the message
      // somebody actually forwarded.
      openAttachments: !atLimit,
    });
    return;
  }

  let mimetype: string;
  try {
    mimetype = await detectMimetype(attachment.buffer, attachment.filename);
  } catch {
    return; // not a type this archive accepts - skip silently, as before
  }

  // Image attachments on an email are almost always signature logos or
  // tracking pixels, not real documents - never surface them as their own
  // attachment document, and never spend an AI call on them.
  if (mimetype.startsWith("image/")) return;

  const fileKey = sha256Hex(attachment.buffer);
  if (walk.seenFileKeys.has(fileKey)) return;

  const stored = await fastify.storage.putObjectHashed(attachment.buffer, attachment.filename);
  const raw = await extractSuggestion(fastify, attachment.buffer, stored.mimetype, walk.types, walk.knownSenders);
  const document = await createPendingDocument(fastify, {
    title: titleFromFilename(attachment.filename),
    fileKey: stored.fileKey,
    mimetype: stored.mimetype,
    sizeBytes: stored.sizeBytes,
    source: walk.source,
    types: walk.types,
    raw,
    parentDocumentId,
    apiKeyId: walk.apiKeyId,
  });

  walk.seenFileKeys.add(stored.fileKey);
  walk.created.push(document);
  void generateAndStoreEmbedding(fastify, document.id);
}

/// A mail row. Confirmed rather than pending because everything on it comes
/// from headers - there is no AI guess for a human to check.
async function createMailDocument(
  fastify: FastifyInstance,
  walk: IngestWalk,
  parsed: Awaited<ReturnType<typeof parseEmail>>,
  node: MailNode,
): Promise<Document | undefined> {
  if (walk.created.length >= MAX_DOCUMENTS_PER_INGEST) {
    walk.truncated = true;
    return undefined;
  }

  const fileKey = sha256Hex(node.buffer);
  if (walk.seenFileKeys.has(fileKey)) return undefined;

  const emailType = walk.types.find((t) => t.name === "E-Mail");
  const metadata: Record<string, unknown> = {};
  if (parsed.sender) metadata.sender = parsed.sender;
  if (parsed.recipient) metadata.recipient = parsed.recipient;
  if (parsed.date) metadata.date = parsed.date.slice(0, 10);
  await ensureSenderFromMetadata(fastify.db, metadata);

  // The mimetype comes from the MIME structure, not the bytes: a nested
  // message has no magic bytes and often no filename either.
  const stored = await fastify.storage.putObjectHashed(node.buffer, node.filename, node.mimetype);
  const [document] = await fastify.db
    .insert(documents)
    .values({
      title: parsed.subject ?? titleFromFilename(node.filename),
      documentTypeId: emailType?.id ?? null,
      metadata,
      fileKey: stored.fileKey,
      mimetype: stored.mimetype,
      fileSizeBytes: stored.sizeBytes,
      ocrText: parsed.textBody ?? (parsed.htmlBody ? stripHtml(parsed.htmlBody) : null),
      source: walk.source,
      reviewStatus: "confirmed",
      parentDocumentId: node.parentDocumentId,
      apiKeyId: walk.apiKeyId,
    })
    .returning();

  walk.seenFileKeys.add(stored.fileKey);
  walk.created.push(document);
  void generateAndStoreEmbedding(fastify, document.id);
  return document;
}

async function createPendingDocument(
  fastify: FastifyInstance,
  opts: {
    title: string;
    fileKey: string;
    mimetype: string;
    sizeBytes: number;
    source: IngestSource;
    types: AvailableType[];
    raw: ExtractionSuggestion | null;
    parentDocumentId?: string;
    apiKeyId?: string;
  },
): Promise<Document> {
  const documentTypeId = resolveDocumentTypeId(opts.types, opts.raw);
  const metadata = metadataFromSuggestion(opts.types, documentTypeId, opts.raw);
  const tagIds = await resolveTagIds(fastify, opts.raw?.suggestedTags ?? []);
  // Deliberately NOT ensureSenderFromMetadata here: this document is still
  // "pending" review, and the AI-suggested sender is just that - a
  // suggestion. Auto-creating it immediately as its own sender entity would
  // make it exactly-match itself by the time a human opens the review
  // panel, permanently hiding the "similar existing senders" suggestions
  // the SenderPicker shows for exactly this situation. The sender only
  // becomes real once a human confirms (see routes/documents/update.ts).

  return fastify.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(documents)
      .values({
        title: opts.title,
        documentTypeId,
        metadata,
        fileKey: opts.fileKey,
        mimetype: opts.mimetype,
        fileSizeBytes: opts.sizeBytes,
        ocrText: opts.raw?.fullText ?? undefined,
        source: opts.source,
        reviewStatus: "pending",
        pendingAiSuggestion: (opts.raw as unknown as Record<string, unknown>) ?? null,
        parentDocumentId: opts.parentDocumentId,
        apiKeyId: opts.apiKeyId,
      })
      .returning();

    if (tagIds.length > 0) {
      await tx.insert(documentTags).values(tagIds.map((tagId) => ({ documentId: created.id, tagId })));
    }

    return created;
  });
}
