import type { AiProvider, DocumentTypeFieldOption, ExtractionSuggestion } from "./types.js";

export class NoopProvider implements AiProvider {
  async extractDocument(): Promise<ExtractionSuggestion | null> {
    return null;
  }

  async suggestDocumentType(): Promise<{ keywords: string[]; fields: DocumentTypeFieldOption[] } | null> {
    return null;
  }

  async answerQuestion(): Promise<{ answer: string; usedTitles: string[] }> {
    return {
      answer: "Die KI-Assistenz ist nicht konfiguriert. Bitte GEMINI_API_KEY in der .env hinterlegen und den Backend-Container neu starten.",
      usedTitles: [],
    };
  }

  async embedText(): Promise<number[] | null> {
    return null;
  }

  async condenseQuestion(question: string): Promise<string> {
    return question;
  }
}
