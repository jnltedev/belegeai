export type AiProviderName = "gemini" | "openai" | "anthropic" | "ollama";

/// What each provider gets when AI_MODEL / AI_EMBEDDING_MODEL are left empty.
///
/// Anthropic has no embedding endpoint, which is not an oversight here: with
/// no embedding model the chat widget quietly drops its semantic-search tier
/// and answers from full-text and trigram retrieval instead. Everything else
/// works unchanged.
export const PROVIDER_DEFAULTS: Record<AiProviderName, { model: string; embeddingModel: string }> = {
  gemini: { model: "gemini-flash-latest", embeddingModel: "gemini-embedding-001" },
  openai: { model: "gpt-4.1", embeddingModel: "text-embedding-3-small" },
  anthropic: { model: "claude-opus-5", embeddingModel: "" },
  // A vision-capable model by default so photographed receipts work without
  // further configuration, and an embedding model that outputs exactly the
  // 768 dimensions this archive stores. Both have to be pulled on the Ollama
  // server first: `ollama pull qwen3-vl:8b && ollama pull nomic-embed-text`.
  ollama: { model: "qwen3-vl:8b", embeddingModel: "nomic-embed-text" },
};
