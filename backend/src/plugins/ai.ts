import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { AiProvider } from "../lib/ai/types.js";
import { PROVIDER_DEFAULTS } from "../lib/ai/defaults.js";
import { NoopProvider } from "../lib/ai/noop-provider.js";
import { GeminiProvider } from "../lib/ai/gemini-provider.js";
import { OpenAiProvider } from "../lib/ai/openai-provider.js";
import { AnthropicProvider } from "../lib/ai/anthropic-provider.js";
import { OllamaProvider } from "../lib/ai/ollama-provider.js";

export default fp(async function aiPlugin(fastify: FastifyInstance) {
  const env = fastify.env;

  // What counts as "configured" differs by provider: a local Ollama server
  // needs no key, so requiring one would make the provider impossible to
  // switch on. Either way, not configured is a supported mode rather than a
  // failure - the archive then works exactly as it did before extraction
  // existed, with every upload filled in by hand.
  const missing =
    env.AI_PROVIDER === "ollama"
      ? env.AI_BASE_URL.length === 0
        ? "AI_BASE_URL"
        : null
      : env.AI_API_KEY.length === 0
        ? "AI_API_KEY"
        : null;

  if (missing) {
    fastify.log.warn(`${missing} not set - AI extraction disabled, uploads remain fully manual.`);
    fastify.decorate("ai", new NoopProvider());
    return;
  }

  const defaults = PROVIDER_DEFAULTS[env.AI_PROVIDER];
  const model = env.AI_MODEL || defaults.model;
  const embeddingModel = env.AI_EMBEDDING_MODEL || defaults.embeddingModel;

  let provider: AiProvider;
  switch (env.AI_PROVIDER) {
    case "openai":
      provider = new OpenAiProvider(env.AI_API_KEY, model, embeddingModel);
      break;
    case "anthropic":
      provider = new AnthropicProvider(env.AI_API_KEY, model);
      if (embeddingModel) {
        // Said out loud because the setting looks like it works: Anthropic
        // publishes no embedding endpoint, so semantic search stays off and
        // the chat answers from full-text and trigram retrieval instead.
        fastify.log.warn(
          "AI_EMBEDDING_MODEL is set but the anthropic provider has no embedding endpoint - semantic search stays disabled.",
        );
      }
      break;
    case "ollama":
      provider = new OllamaProvider(env.AI_BASE_URL, model, embeddingModel, env.AI_API_KEY);
      break;
    default:
      provider = new GeminiProvider(env.AI_API_KEY, model, embeddingModel);
  }

  fastify.log.info(
    { provider: env.AI_PROVIDER, model, ...(env.AI_PROVIDER === "ollama" ? { baseUrl: env.AI_BASE_URL } : {}) },
    "AI provider ready",
  );
  fastify.decorate("ai", provider);
});
