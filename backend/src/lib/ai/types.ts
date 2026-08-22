export interface DocumentTypeFieldOption {
  key: string;
  label: string;
  // "sender" is treated identically to "text" for extraction purposes - the
  // AI just returns a string value either way; the distinct type only
  // matters for how the frontend renders/autocompletes the field.
  type: "text" | "date" | "currency" | "sender";
}

export interface DocumentTypeOption {
  name: string;
  keywords: string[];
  fields: DocumentTypeFieldOption[];
}

export interface ExtractionSuggestion {
  documentTypeName: string;
  fieldValues: Record<string, unknown>;
  suggestedTags: string[];
  fullText: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiProvider {
  // knownSenders lets extraction snap a "sender"-typed field to an existing,
  // correctly-spelled sender name instead of inventing a slightly different
  // variant every time the same real-world company shows up (different
  // capitalization, an abbreviated legal suffix, a typo) - see
  // buildExtractionPrompt in prompt.ts for how it's used.
  extractDocument(
    buffer: Buffer,
    mimetype: string,
    documentTypes: DocumentTypeOption[],
    knownSenders: string[],
  ): Promise<ExtractionSuggestion | null>;

  // Used by the admin "Dokumenttypen" screen: given just a type name (e.g.
  // "Versicherung"), suggest sensible classification keywords and fields.
  suggestDocumentType(name: string): Promise<{ keywords: string[]; fields: DocumentTypeFieldOption[] } | null>;

  // Used by the archive chat widget - `context` is a pre-built text block of
  // the retrieved candidate documents (title/type/fields/tags/OCR text,
  // assembled by the route since it needs DB access, which typically
  // includes plenty of only-loosely-matching noise since retrieval casts a
  // wide net); `history` is the conversation so far. `usedTitles` is the
  // subset of candidate titles the model says it actually drew the answer
  // from - the route uses it to only show genuinely relevant sources, not
  // the whole candidate pool. Always resolves (never null/throws) - a chat
  // turn needs *some* reply even when nothing useful was found.
  answerQuestion(
    question: string,
    context: string,
    history: ChatMessage[],
  ): Promise<{ answer: string; usedTitles: string[] }>;

  // Semantic search backing the chat widget (see lib/embeddings.ts) - turns
  // a document's text or a user's question into a vector for pgvector
  // cosine-distance search, catching relevant documents that share no
  // literal word/stem with the query (unlike the FTS/trigram retrieval
  // tiers). Resolves null (never throws) on any failure - embeddings are an
  // enhancement layered on top of keyword search, not a hard dependency of
  // ingestion or chat.
  // taskType distinguishes an asymmetric embedding pair: a stored document
  // uses "RETRIEVAL_DOCUMENT", a chat question being matched against those
  // documents uses "RETRIEVAL_QUERY" - the underlying model embeds each
  // differently to improve retrieval quality. Defaults to "RETRIEVAL_DOCUMENT".
  embedText(text: string, taskType?: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[] | null>;

  // Multi-turn follow-ups (e.g. "und die von letztem Monat?") routinely omit
  // the actual subject entirely, relying on the conversation history for
  // meaning - but the retrieval tiers (FTS/trigram/embedding) only ever see
  // the raw latest message, so a fragment like that carries almost no
  // searchable content on its own. This rewrites such a follow-up into a
  // standalone, self-contained search query using the history to resolve
  // pronouns/references, so retrieval has something real to search for. The
  // *answer* generation step still gets the original question + full
  // history unchanged - only retrieval uses the condensed form. Always
  // resolves (never throws); falls back to the original question on any
  // failure, since degraded retrieval beats a failed chat turn.
  condenseQuestion(question: string, history: ChatMessage[]): Promise<string>;
}
