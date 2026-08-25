import { z } from "zod";
import {
  CHAT_JSON_SCHEMA,
  TYPE_SUGGESTION_JSON_SCHEMA,
  buildChatSystemPrompt,
  buildExtractionJsonSchema,
  buildExtractionPrompt,
  extractFieldValues,
  UNKNOWN_TYPE_NAME,
} from "./prompt.js";
import type {
  AiProvider,
  ChatMessage,
  DocumentTypeFieldOption,
  DocumentTypeOption,
  ExtractionSuggestion,
} from "./types.js";
import { EMBEDDING_DIMENSIONS } from "../../db/schema/document-embeddings.js";
import { extractPdfText } from "../pdf-text.js";

// Local inference is slow by nature. Extraction runs in the background here
// (see prefersBackgroundExtraction) so nobody is watching it, which is what
// makes a ceiling this generous acceptable. Chat is answered while someone
// waits, so it gets a tighter one.
const EXTRACTION_TIMEOUT_MS = 10 * 60 * 1000;
const CHAT_TIMEOUT_MS = 2 * 60 * 1000;

// Ollama defaults to a small context window and, once the prompt exceeds it,
// silently drops the beginning rather than failing. The instructions live at
// the start of the prompt, so what gets dropped is exactly what tells the
// model what to do, and the result looks like a bad model rather than a
// truncated request. Set explicitly, large enough for a chat turn (retrieved
// documents plus history) which is the widest thing sent here.
const NUM_CTX = 16_384;

// Keeps the model resident between documents. Without it the server unloads
// after five minutes and reloads several gigabytes for every single upload.
const KEEP_ALIVE = "30m";

// Extraction and classification want the same answer twice for the same
// document, not a creative one.
const TEMPERATURE = 0.1;

const chatResponseSchema = z.object({
  message: z.object({ content: z.string() }).optional(),
});

const embedResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())).optional(),
});

const rawExtractionSchema = z.object({
  document_type: z.string().optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  suggested_tags: z.array(z.string()).optional(),
  full_text: z.string().nullable().optional(),
});

const chatAnswerSchema = z.object({
  answer: z.string(),
  used_titles: z.array(z.string()).optional(),
});

const typeSuggestionSchema = z.object({
  keywords: z.array(z.string()).optional(),
  fields: z
    .array(z.object({ key: z.string(), label: z.string(), type: z.enum(["text", "date", "currency"]) }))
    .optional(),
});

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /// Base64 without a data: prefix, which is what /api/chat expects.
  images?: string[];
}

/// A local model reached over the Ollama HTTP API, on a server of the
/// operator's own.
///
/// The deliberate limitation: Ollama accepts text and images, never PDFs. A
/// PDF therefore reaches the model as its embedded text layer, and a PDF
/// without one (any scan, including the ones the iOS app assembles from
/// camera images) yields no suggestion at all. That document still gets
/// filed, it just waits in the review queue to be typed in by hand. Images
/// go straight to the model untouched, so a photographed receipt works where
/// the same receipt wrapped in a PDF does not.
export class OllamaProvider implements AiProvider {
  // Minutes per document is normal on a machine without a large GPU. Nobody
  // should sit in front of a spinner for that, so the upload route files the
  // document first and lets extraction catch up.
  readonly prefersBackgroundExtraction = true;

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly apiKey: string;
  /// Flipped once a returned vector turns out to be the wrong width. The
  /// column is a fixed vector(768), so every further call would only produce
  /// the same database error on a different document.
  private embeddingDisabled = false;

  constructor(baseUrl: string, model: string, embeddingModel: string, apiKey = "") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.embeddingModel = embeddingModel;
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Ollama has no authentication of its own. A server exposed beyond a
    // private network is normally put behind a reverse proxy that expects a
    // bearer token, so pass one along when configured.
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  private async post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        // The body carries Ollama's own words, typically "model not found,
        // try pulling it first", which is far more useful than the status.
        const detail = await response.text().catch(() => "");
        throw new Error(`Ollama ${path} responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private async chatJson(
    messages: OllamaMessage[],
    schema: Record<string, unknown> | null,
    timeoutMs: number,
  ): Promise<string | null> {
    const payload = await this.post(
      "/api/chat",
      {
        model: this.model,
        messages,
        // A JSON schema here constrains generation itself, so the reply
        // parses without any of the "strip the markdown fence" guesswork a
        // free-form prompt would need.
        ...(schema ? { format: schema } : {}),
        stream: false,
        keep_alive: KEEP_ALIVE,
        options: { temperature: TEMPERATURE, num_ctx: NUM_CTX },
      },
      timeoutMs,
    );
    const parsed = chatResponseSchema.parse(payload);
    const content = parsed.message?.content?.trim();
    return content && content.length > 0 ? content : null;
  }

  async extractDocument(
    buffer: Buffer,
    mimetype: string,
    documentTypes: DocumentTypeOption[],
    knownSenders: string[],
  ): Promise<ExtractionSuggestion | null> {
    const instructions = buildExtractionPrompt(documentTypes, knownSenders);
    const schema = buildExtractionJsonSchema(documentTypes);

    let messages: OllamaMessage[];
    // Filled in from the text layer rather than from the model: the text is
    // already in hand, and having a local model retype several pages is the
    // slowest part of the whole call for an answer that is at best identical
    // and at worst invented.
    let knownFullText: string | null = null;

    if (mimetype === "application/pdf") {
      knownFullText = await extractPdfText(buffer);
      if (!knownFullText) {
        // No text layer, and Ollama cannot look at the PDF itself. Saying so
        // by returning null leaves the document filed for manual entry,
        // which is honest; guessing from the filename would not be.
        return null;
      }
      messages = [
        {
          role: "user",
          content: `${instructions}

Der Text des Dokuments liegt bereits vor und steht unten. Setze "full_text" auf null, es wird nicht benötigt.

Dokumenttext:
${knownFullText}`,
        },
      ];
    } else {
      messages = [
        {
          role: "user",
          content: instructions,
          images: [buffer.toString("base64")],
        },
      ];
    }

    const content = await this.chatJson(messages, schema, EXTRACTION_TIMEOUT_MS);
    if (!content) throw new Error("Ollama returned an empty response");

    const parsed = rawExtractionSchema.parse(JSON.parse(content));
    const documentTypeName = parsed.document_type ?? UNKNOWN_TYPE_NAME;
    const matchedType = documentTypes.find((t) => t.name.toLowerCase() === documentTypeName.toLowerCase());

    return {
      documentTypeName: matchedType ? matchedType.name : UNKNOWN_TYPE_NAME,
      fieldValues: extractFieldValues(matchedType, parsed.fields ?? {}),
      suggestedTags: parsed.suggested_tags ?? [],
      fullText: knownFullText ?? parsed.full_text ?? null,
    };
  }

  async suggestDocumentType(name: string): Promise<{ keywords: string[]; fields: DocumentTypeFieldOption[] } | null> {
    const prompt = `Ein Nutzer eines Dokumenten-Archivs für offizielle Unterlagen (Finanzamt-Post, Rechnungen, Versicherungsschreiben, Behördenbriefe u. ä.) legt einen neuen Dokumenttyp namens "${name}" an.

Schlage vor:
1. "keywords": 3 bis 8 kurze, kleingeschriebene deutsche Stichwörter, die typischerweise auf einem Beleg dieses Typs vorkommen.
2. "fields": eine sinnvolle Liste strukturierter Felder. Jedes Feld hat "key" (kurzer englischer camelCase-Bezeichner), "label" (deutsche Anzeigebezeichnung) und "type" (genau eines von "text", "date", "currency"). Meist 2 bis 5 Felder.`;

    try {
      const content = await this.chatJson(
        [{ role: "user", content: prompt }],
        TYPE_SUGGESTION_JSON_SCHEMA,
        CHAT_TIMEOUT_MS,
      );
      if (!content) return null;
      const parsed = typeSuggestionSchema.parse(JSON.parse(content));
      return { keywords: parsed.keywords ?? [], fields: parsed.fields ?? [] };
    } catch {
      return null;
    }
  }

  async answerQuestion(
    question: string,
    context: string,
    history: ChatMessage[],
  ): Promise<{ answer: string; usedTitles: string[] }> {
    try {
      const content = await this.chatJson(
        [
          { role: "system", content: buildChatSystemPrompt(context) },
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: question },
        ],
        CHAT_JSON_SCHEMA,
        CHAT_TIMEOUT_MS,
      );
      if (!content) return { answer: "Ich konnte dazu keine Antwort finden.", usedTitles: [] };

      const parsed = chatAnswerSchema.parse(JSON.parse(content));
      return { answer: parsed.answer, usedTitles: parsed.used_titles ?? [] };
    } catch {
      return { answer: "Bei der Antwort ist etwas schiefgelaufen. Bitte versuche es noch einmal.", usedTitles: [] };
    }
  }

  async condenseQuestion(question: string, history: ChatMessage[]): Promise<string> {
    if (history.length === 0) return question;

    const transcript = history.map((m) => `${m.role === "user" ? "Nutzer" : "Assistent"}: ${m.content}`).join("\n");
    try {
      const content = await this.chatJson(
        [
          {
            role: "user",
            content: `Chatverlauf eines Dokumentenarchiv-Assistenten:\n${transcript}\n\nLetzte Nutzerfrage: "${question}"\n\nFormuliere NUR diese letzte Frage als eigenständige, vollständige Suchanfrage um. Löse Bezugswörter anhand des Verlaufs auf. Antworte NUR mit der umformulierten Frage, ohne Anführungszeichen und ohne Erklärung.`,
          },
        ],
        null,
        CHAT_TIMEOUT_MS,
      );
      return content && content.length > 0 ? content : question;
    } catch {
      return question;
    }
  }

  async embedText(
    text: string,
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT",
  ): Promise<number[] | null> {
    if (!this.embeddingModel || this.embeddingDisabled) return null;

    try {
      const payload = await this.post(
        "/api/embed",
        { model: this.embeddingModel, input: this.prefixed(text, taskType), keep_alive: KEEP_ALIVE },
        CHAT_TIMEOUT_MS,
      );
      const embedding = embedResponseSchema.parse(payload).embeddings?.[0];
      if (!embedding) return null;

      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        // Said once and then stopped, rather than failing an insert per
        // document with a Postgres dimension error nobody can act on.
        this.embeddingDisabled = true;
        console.warn(
          `[ai] Embedding model "${this.embeddingModel}" returns ${embedding.length} dimensions, but this archive stores ${EMBEDDING_DIMENSIONS}. Semantic search stays disabled; use a ${EMBEDDING_DIMENSIONS}-dimension model such as nomic-embed-text.`,
        );
        return null;
      }
      return embedding;
    } catch {
      // Embeddings improve retrieval rather than gate it, so a failure here
      // must never break the save or the chat turn that triggered it.
      return null;
    }
  }

  /// nomic-embed-text is trained with mandatory task prefixes and loses
  /// noticeable retrieval quality without them: a stored document and the
  /// question asked about it are embedded differently on purpose. Other
  /// models have no such convention, and prefixing their input would just be
  /// two stray words at the front of every text.
  private prefixed(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): string {
    if (!this.embeddingModel.startsWith("nomic-embed")) return text;
    return taskType === "RETRIEVAL_QUERY" ? `search_query: ${text}` : `search_document: ${text}`;
  }
}
