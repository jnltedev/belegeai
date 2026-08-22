import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { buildChatSystemPrompt, buildExtractionPrompt, buildExtractionSchema, extractFieldValues, UNKNOWN_TYPE_NAME } from "./prompt.js";
import type { AiProvider, ChatMessage, DocumentTypeFieldOption, DocumentTypeOption, ExtractionSuggestion } from "./types.js";
import { EMBEDDING_DIMENSIONS } from "../../db/schema/document-embeddings.js";

const EXTRACTION_TIMEOUT_MS = 20_000;
const CHAT_TIMEOUT_MS = 30_000;

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
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.enum(["text", "date", "currency"]),
      }),
    )
    .optional(),
});

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Gemini call timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export class GeminiProvider implements AiProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly embeddingModel: string;

  constructor(apiKey: string, model: string, embeddingModel: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
    this.embeddingModel = embeddingModel;
  }

  async extractDocument(
    buffer: Buffer,
    mimetype: string,
    documentTypes: DocumentTypeOption[],
    knownSenders: string[],
  ): Promise<ExtractionSuggestion | null> {
    const response = await withTimeout(
      this.client.models.generateContent({
        model: this.model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: mimetype, data: buffer.toString("base64") } },
              { text: buildExtractionPrompt(documentTypes, knownSenders) },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: buildExtractionSchema(documentTypes),
        },
      }),
      EXTRACTION_TIMEOUT_MS,
    );

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned an empty response");
    }

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
1. "keywords": 3 bis 8 kurze, kleingeschriebene deutsche Stichwörter, die typischerweise auf einem Beleg dieses Typs vorkommen und zur automatischen Klassifizierung genutzt werden.
2. "fields": eine sinnvolle Liste strukturierter Felder für diesen Dokumenttyp. Jedes Feld hat "key" (kurzer englischer camelCase-Bezeichner, z. B. "policyNumber"), "label" (deutsche Anzeigebezeichnung, z. B. "Versicherungsscheinnummer") und "type" (genau eines von "text", "date", "currency"). Nimm nur Felder auf, die für diesen Dokumenttyp wirklich typisch und nützlich sind - meist 2 bis 5 Felder.

Antworte ausschließlich mit JSON nach dem vorgegebenen Schema.`;

    const response = await withTimeout(
      this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              fields: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    key: { type: Type.STRING },
                    label: { type: Type.STRING },
                    type: { type: Type.STRING, format: "enum", enum: ["text", "date", "currency"] },
                  },
                  required: ["key", "label", "type"],
                },
              },
            },
            required: ["keywords", "fields"],
          },
        },
      }),
      EXTRACTION_TIMEOUT_MS,
    );

    const text = response.text;
    if (!text) return null;

    const parsed = typeSuggestionSchema.parse(JSON.parse(text));
    return {
      keywords: parsed.keywords ?? [],
      fields: parsed.fields ?? [],
    };
  }

  async answerQuestion(
    question: string,
    context: string,
    history: ChatMessage[],
  ): Promise<{ answer: string; usedTitles: string[] }> {
    const contents = [
      { role: "user", parts: [{ text: buildChatSystemPrompt(context) }] },
      {
        role: "model",
        parts: [{ text: "Verstanden. Ich antworte ausschließlich auf Basis der bereitgestellten Dokumente, als JSON." }],
      },
      ...history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      { role: "user", parts: [{ text: question }] },
    ];

    const response = await withTimeout(
      this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          // Lower temperature as a safety net against degenerate generation
          // (e.g. runaway word repetition) when the provided context is
          // sparse or off-topic. maxOutputTokens deliberately generous -
          // used_titles can include several long real-world document
          // titles (subject lines, invoice numbers, ...) on top of the
          // answer text; a tighter cap was cutting the JSON off mid-string
          // and crashing the parse below instead of actually preventing
          // rambling.
          temperature: 0.2,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING },
              used_titles: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["answer", "used_titles"],
          },
        },
      }),
      CHAT_TIMEOUT_MS,
    );

    const text = response.text;
    if (!text) return { answer: "Ich konnte dazu keine Antwort finden.", usedTitles: [] };

    // Belt-and-suspenders: even with a generous maxOutputTokens, malformed
    // JSON from the model (a truncated response, an unexpected shape) is a
    // real possibility, not a hypothetical - surfacing it as a clean "try
    // again" answer beats crashing the whole request with a raw 500.
    try {
      const parsed = chatResponseSchema.parse(JSON.parse(text));
      return { answer: parsed.answer, usedTitles: parsed.used_titles ?? [] };
    } catch {
      return {
        answer: "Bei der Antwort ist etwas schiefgelaufen. Bitte versuche es noch einmal.",
        usedTitles: [],
      };
    }
  }

  async condenseQuestion(question: string, history: ChatMessage[]): Promise<string> {
    // No history - the question is already standalone, skip the extra call.
    if (history.length === 0) return question;

    const transcript = history.map((m) => `${m.role === "user" ? "Nutzer" : "Assistent"}: ${m.content}`).join("\n");
    const prompt = `Chatverlauf eines Dokumentenarchiv-Assistenten:
${transcript}

Letzte Nutzerfrage: "${question}"

Formuliere NUR diese letzte Frage als eigenständige, vollständige Suchanfrage um, die auch ohne den obigen Verlauf verständlich ist. Löse Bezugswörter (z. B. "die", "davon", "der letzten") anhand des Verlaufs auf und ergänze das eigentliche Thema (z. B. Firma, Absender, Dokumenttyp), falls es in der letzten Frage nur implizit gemeint ist. Antworte NUR mit der umformulierten Frage, ohne Anführungszeichen und ohne weitere Erklärung.`;

    try {
      const response = await withTimeout(
        this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: { temperature: 0, maxOutputTokens: 200 },
        }),
        EXTRACTION_TIMEOUT_MS,
      );
      const text = response.text?.trim();
      return text && text.length > 0 ? text : question;
    } catch {
      return question;
    }
  }

  async embedText(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT"): Promise<number[] | null> {
    try {
      const response = await withTimeout(
        this.client.models.embedContent({
          model: this.embeddingModel,
          contents: [text],
          config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
        }),
        EXTRACTION_TIMEOUT_MS,
      );
      return response.embeddings?.[0]?.values ?? null;
    } catch {
      // Embeddings are an enhancement layered on top of keyword search, not
      // a hard dependency - a failed embedding call must never fail the
      // document save or chat turn that triggered it.
      return null;
    }
  }
}
