import OpenAI from "openai";
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

const EXTRACTION_TIMEOUT_MS = 60_000;
const CHAT_TIMEOUT_MS = 60_000;

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

export class OpenAiProvider implements AiProvider {
  // Answers fast enough that the upload can wait for the result.
  readonly prefersBackgroundExtraction = false;

  private readonly client: OpenAI;
  private readonly model: string;
  private readonly embeddingModel: string;

  constructor(apiKey: string, model: string, embeddingModel: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.embeddingModel = embeddingModel;
  }

  /// The Responses API is used rather than Chat Completions because only it
  /// accepts file input - Chat Completions cannot take a PDF at all, which
  /// rules it out for an archive whose documents are mostly PDFs.
  private fileParts(buffer: Buffer, mimetype: string, filename: string) {
    const dataUrl = `data:${mimetype};base64,${buffer.toString("base64")}`;
    return mimetype === "application/pdf"
      ? [{ type: "input_file" as const, filename, file_data: dataUrl }]
      : [{ type: "input_image" as const, image_url: dataUrl, detail: "auto" as const }];
  }

  async extractDocument(
    buffer: Buffer,
    mimetype: string,
    documentTypes: DocumentTypeOption[],
    knownSenders: string[],
  ): Promise<ExtractionSuggestion | null> {
    const response = await this.client.responses.create(
      {
        model: this.model,
        input: [
          {
            role: "user",
            content: [
              ...this.fileParts(buffer, mimetype, "document.pdf"),
              { type: "input_text", text: buildExtractionPrompt(documentTypes, knownSenders) },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "document_extraction",
            schema: buildExtractionJsonSchema(documentTypes),
            strict: true,
          },
        },
      },
      { timeout: EXTRACTION_TIMEOUT_MS },
    );

    const text = response.output_text;
    if (!text) throw new Error("OpenAI returned an empty response");

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
      const response = await this.client.responses.create(
        {
          model: this.model,
          input: prompt,
          text: {
            format: {
              type: "json_schema",
              name: "document_type_suggestion",
              schema: TYPE_SUGGESTION_JSON_SCHEMA,
              strict: true,
            },
          },
        },
        { timeout: EXTRACTION_TIMEOUT_MS },
      );

      const text = response.output_text;
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
      const response = await this.client.responses.create(
        {
          model: this.model,
          instructions: buildChatSystemPrompt(context),
          input: [
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user" as const, content: question },
          ],
          text: {
            format: { type: "json_schema", name: "archive_answer", schema: CHAT_JSON_SCHEMA, strict: true },
          },
        },
        { timeout: CHAT_TIMEOUT_MS },
      );

      const text = response.output_text;
      if (!text) return { answer: "Ich konnte dazu keine Antwort finden.", usedTitles: [] };

      const parsed = chatResponseSchema.parse(JSON.parse(text));
      return { answer: parsed.answer, usedTitles: parsed.used_titles ?? [] };
    } catch {
      return { answer: "Bei der Antwort ist etwas schiefgelaufen. Bitte versuche es noch einmal.", usedTitles: [] };
    }
  }

  async condenseQuestion(question: string, history: ChatMessage[]): Promise<string> {
    if (history.length === 0) return question;

    const transcript = history.map((m) => `${m.role === "user" ? "Nutzer" : "Assistent"}: ${m.content}`).join("\n");
    try {
      const response = await this.client.responses.create(
        {
          model: this.model,
          input: `Chatverlauf eines Dokumentenarchiv-Assistenten:\n${transcript}\n\nLetzte Nutzerfrage: "${question}"\n\nFormuliere NUR diese letzte Frage als eigenständige, vollständige Suchanfrage um. Löse Bezugswörter anhand des Verlaufs auf. Antworte NUR mit der umformulierten Frage.`,
        },
        { timeout: EXTRACTION_TIMEOUT_MS },
      );
      const text = response.output_text?.trim();
      return text && text.length > 0 ? text : question;
    } catch {
      return question;
    }
  }

  async embedText(text: string): Promise<number[] | null> {
    if (!this.embeddingModel) return null;
    try {
      // Shortened to the archive's stored vector width. The column is a fixed
      // vector(768), so a model's native 1536 dimensions would not fit - the
      // API supports asking for fewer directly.
      const response = await this.client.embeddings.create(
        { model: this.embeddingModel, input: text, dimensions: EMBEDDING_DIMENSIONS },
        { timeout: EXTRACTION_TIMEOUT_MS },
      );
      return response.data[0]?.embedding ?? null;
    } catch {
      // Embeddings enhance keyword search rather than gate it - a failure
      // here must never fail the save or chat turn that triggered it.
      return null;
    }
  }
}
