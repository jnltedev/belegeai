import Anthropic from "@anthropic-ai/sdk";
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

// Generous compared with the Gemini provider's 20s: Claude thinks adaptively
// before answering, so a document extraction genuinely takes longer. The
// upload route waits on this call, which is why it has a ceiling at all.
const EXTRACTION_TIMEOUT_MS = 90_000;
const CHAT_TIMEOUT_MS = 90_000;
const MAX_TOKENS = 16_000;

const rawResponseSchema = z.object({
  document_type: z.string().optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  suggested_tags: z.array(z.string()).optional(),
  full_text: z.string().nullable().optional(),
});

const chatResponseSchema = z.object({
  answer: z.string(),
  used_titles: z.array(z.string()).optional(),
});

const typeSuggestionSchema = z.object({
  keywords: z.array(z.string()).optional(),
  fields: z
    .array(z.object({ key: z.string(), label: z.string(), type: z.enum(["text", "date", "currency"]) }))
    .optional(),
});

export class AnthropicProvider implements AiProvider {
  // Answers fast enough that the upload can wait for the result.
  readonly prefersBackgroundExtraction = false;

  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  /// Documents go in as a `document` block for PDFs and an `image` block for
  /// everything else - the block type has to match the media type, and a PDF
  /// sent as an image is simply rejected.
  private fileBlock(buffer: Buffer, mimetype: string): Anthropic.ContentBlockParam {
    const data = buffer.toString("base64");
    if (mimetype === "application/pdf") {
      return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
    }
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mimetype as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
        data,
      },
    };
  }

  private textOf(response: Anthropic.Message): string | null {
    // content is a discriminated union; a refusal or a pure thinking block
    // carries no text, and reading .text off those would be a type error.
    const block = response.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : null;
  }

  async extractDocument(
    buffer: Buffer,
    mimetype: string,
    documentTypes: DocumentTypeOption[],
    knownSenders: string[],
  ): Promise<ExtractionSuggestion | null> {
    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: MAX_TOKENS,
        // Extraction is transcription plus classification, not open-ended
        // reasoning - the lowest effort keeps latency and cost sane while
        // the structured output does the shaping.
        output_config: {
          effort: "low",
          // Anthropic's format object takes only a type and a schema - the
          // named-schema wrapper is an OpenAI convention.
          format: { type: "json_schema", schema: buildExtractionJsonSchema(documentTypes) },
        },
        messages: [
          {
            role: "user",
            content: [
              this.fileBlock(buffer, mimetype),
              { type: "text", text: buildExtractionPrompt(documentTypes, knownSenders) },
            ],
          },
        ],
      },
      { timeout: EXTRACTION_TIMEOUT_MS },
    );

    const text = this.textOf(response);
    if (!text) throw new Error("Claude returned an empty response");

    const parsed = rawResponseSchema.parse(JSON.parse(text));
    const documentTypeName = parsed.document_type ?? UNKNOWN_TYPE_NAME;
    const matchedType = documentTypes.find((t) => t.name.toLowerCase() === documentTypeName.toLowerCase());

    return {
      documentTypeName: matchedType ? matchedType.name : UNKNOWN_TYPE_NAME,
      fieldValues: extractFieldValues(matchedType, parsed.fields ?? {}),
      suggestedTags: parsed.suggested_tags ?? [],
      fullText: parsed.full_text ?? null,
    };
  }

  async suggestDocumentType(name: string): Promise<{ keywords: string[]; fields: DocumentTypeFieldOption[] } | null> {
    const prompt = `Ein Nutzer eines Dokumenten-Archivs für offizielle Unterlagen (Finanzamt-Post, Rechnungen, Versicherungsschreiben, Behördenbriefe u. ä.) legt einen neuen Dokumenttyp namens "${name}" an.

Schlage vor:
1. "keywords": 3 bis 8 kurze, kleingeschriebene deutsche Stichwörter, die typischerweise auf einem Beleg dieses Typs vorkommen.
2. "fields": eine sinnvolle Liste strukturierter Felder. Jedes Feld hat "key" (kurzer englischer camelCase-Bezeichner), "label" (deutsche Anzeigebezeichnung) und "type" (genau eines von "text", "date", "currency"). Meist 2 bis 5 Felder.`;

    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: MAX_TOKENS,
          output_config: {
            effort: "low",
            format: { type: "json_schema", schema: TYPE_SUGGESTION_JSON_SCHEMA },
          },
          messages: [{ role: "user", content: prompt }],
        },
        { timeout: EXTRACTION_TIMEOUT_MS },
      );

      const text = this.textOf(response);
      if (!text) return null;
      const parsed = typeSuggestionSchema.parse(JSON.parse(text));
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
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: MAX_TOKENS,
          system: buildChatSystemPrompt(context),
          output_config: {
            format: { type: "json_schema", schema: CHAT_JSON_SCHEMA },
          },
          messages: [
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user" as const, content: question },
          ],
        },
        { timeout: CHAT_TIMEOUT_MS },
      );

      const text = this.textOf(response);
      if (!text) return { answer: "Ich konnte dazu keine Antwort finden.", usedTitles: [] };

      const parsed = chatResponseSchema.parse(JSON.parse(text));
      return { answer: parsed.answer, usedTitles: parsed.used_titles ?? [] };
    } catch {
      // A chat turn needs *some* reply - a raw 500 in the widget is worse
      // than an honest "try again".
      return { answer: "Bei der Antwort ist etwas schiefgelaufen. Bitte versuche es noch einmal.", usedTitles: [] };
    }
  }

  async condenseQuestion(question: string, history: ChatMessage[]): Promise<string> {
    if (history.length === 0) return question;

    const transcript = history.map((m) => `${m.role === "user" ? "Nutzer" : "Assistent"}: ${m.content}`).join("\n");
    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 300,
          output_config: { effort: "low" },
          messages: [
            {
              role: "user",
              content: `Chatverlauf eines Dokumentenarchiv-Assistenten:\n${transcript}\n\nLetzte Nutzerfrage: "${question}"\n\nFormuliere NUR diese letzte Frage als eigenständige, vollständige Suchanfrage um. Löse Bezugswörter anhand des Verlaufs auf. Antworte NUR mit der umformulierten Frage.`,
            },
          ],
        },
        { timeout: EXTRACTION_TIMEOUT_MS },
      );
      const text = this.textOf(response)?.trim();
      return text && text.length > 0 ? text : question;
    } catch {
      return question;
    }
  }

  async embedText(): Promise<number[] | null> {
    // Anthropic has no embedding endpoint. Returning null is the documented
    // "no embeddings" path: documents simply store none, and the chat falls
    // back to its full-text and trigram retrieval tiers. Pair this provider
    // with a different embedding source only if semantic search matters.
    return null;
  }
}
