import type { ChatMessage } from "./ai/types.js";

// The conversation history replayed into the model each turn is capped at
// this many input tokens - independent of how many messages a session has
// accumulated in the DB (all of them stay visible in the UI; only what
// actually gets sent to the model is bounded). Does NOT cover the retrieved
// document context, which has its own separate bound (see MAX_CONTEXT_DOCS
// in routes/chat/ask.ts).
export const MAX_HISTORY_INPUT_TOKENS = 10_000;

// No exact tokenizer call - ~4 chars/token is a standard, good-enough
// heuristic for German/English mixed text, used only to bound context size,
// not for precise billing.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Keeps the most recent messages that fit within the token budget, dropping
// older ones from the front - a sliding window, same convention as most
// chat UIs' context truncation.
export function trimHistoryToTokenBudget(
  history: ChatMessage[],
  maxTokens: number = MAX_HISTORY_INPUT_TOKENS,
): ChatMessage[] {
  let used = 0;
  const kept: ChatMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(history[i].content);
    if (used + tokens > maxTokens) break;
    used += tokens;
    kept.unshift(history[i]);
  }
  return kept;
}
