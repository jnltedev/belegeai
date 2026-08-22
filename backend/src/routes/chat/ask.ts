import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { chatMessages, chatSessions, documentEmbeddings, documents } from "../../db/schema/index.js";
import type { ChatMessage } from "../../lib/ai/types.js";
import { currentUser } from "../../lib/auth-guard.js";
import { NotFoundError } from "../../lib/errors.js";
import { trimHistoryToTokenBudget } from "../../lib/chat-tokens.js";

// A session's title is auto-derived from its first question (the user can
// rename anytime via PATCH /sessions/:id) - truncated so a long question
// doesn't blow out the sessions-list UI.
const MAX_AUTO_TITLE_CHARS = 60;

// Bounds on what gets fed to the model. Three retrieval tiers (FTS,
// trigram, embedding) run in parallel and get merged/deduped, so each tier
// is capped lower than the final total.
//
// These used to be 12 / 20 / 4000, which meant a prompt of roughly 80k
// characters - around 24k tokens - for *every* question, however simple,
// because nothing here depended on how well a document actually matched.
// The numbers below cut that to roughly a fifth while keeping every tier
// represented; see MAX_EMBEDDING_DISTANCE and interleave() for the two
// changes that make the smaller budget safe.
const TIER_LIMIT = 8;
const MAX_CONTEXT_DOCS = 8;
const MAX_TEXT_CHARS_PER_DOC = 2000;
const TRIGRAM_SIMILARITY_THRESHOLD = 0.3;

// Cosine distance ceiling for the semantic tier. Without one, that tier
// always returned its full quota: it ranks by distance and takes the top N,
// so a question about a tax letter still dragged in the nearest insurance
// policy and bank statement simply because something had to be nearest.
// Deliberately generous. A question and a document are different kinds of
// text, so even a correct match sits further apart than two similar
// documents would; too tight a ceiling silences the tier completely and
// nothing says so. It only has to exclude the plainly unrelated - keeping
// the tier honest is what interleave() and the word filter are for.
const MAX_EMBEDDING_DISTANCE = 0.8;

const askBody = z.object({
  sessionId: z.string().uuid(),
  question: z.string().min(1).max(2000),
});

// websearch_to_tsquery() has a sharp edge with natural-language questions:
// given a hyphenated word like "Telekom-Rechnung", it doesn't just search
// for "telekom" and "rechnung" - it additionally REQUIRES them adjacent in
// that exact order via the <-> "immediately followed by" operator, ANDed
// together with every other word in the sentence. A real question ("Wie
// hoch war meine letzte Telekom-Rechnung?") almost never satisfies that,
// so it silently returns zero matches even when the words individually
// appear all over the relevant documents.
//
// Building our own OR-of-terms tsquery avoids both traps: no phrase
// adjacency requirement, and no requirement that EVERY word in the
// question (including "wie", "war", "meine", ...) appear in a document -
// ts_rank still ranks documents matching more terms higher, so precision
// isn't lost, but a document only missing an incidental word is no longer
// excluded entirely.
function extractQuestionWords(question: string): string[] {
  return question
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 2);
}

function buildSearchTsQuery(words: string[]): string | null {
  if (words.length === 0) return null;
  return words.join(" | ");
}

// A word that appears in most of the archive says nothing about which
// document is wanted. "Wann hab ich meinen letzten Steuerbescheid erhalten?"
// used to retrieve eight documents that had nothing in common except the
// word "erhalten", because ranking by an OR of every word ranks by whichever
// document happened to use the commonest one most often.
//
// Measured against the archive rather than taken from a stopword list: that
// covers both languages at once, catches ordinary verbs no stopword list
// contains, and adapts to what this particular archive is full of.
const MAX_DOCUMENT_FREQUENCY = 0.4;

async function selectDistinctiveWords(fastify: FastifyInstance, words: string[]): Promise<string[]> {
  // Even a one-word question goes through this: if that word is "erhalten",
  // skipping the check would reproduce exactly the result this exists to
  // prevent. The fallback below keeps such a question working.
  if (words.length === 0) return words;

  const [{ total }] = await fastify.db
    .select({ total: sql<number>`count(*)::int` })
    .from(documents)
    .where(eq(documents.reviewStatus, "confirmed"));
  if (!total) return words;

  // Built as ARRAY[$1, $2, ...] on purpose: interpolating the JS array
  // directly makes Drizzle emit a row constructor, ($1, $2, $3)::text[],
  // which Postgres rejects outright.
  const result = await fastify.db.execute<{ word: string; lexemes: number; hits: number }>(sql`
    SELECT q.word,
           numnode(plainto_tsquery('german', q.word)) AS lexemes,
           (SELECT count(*)::int
              FROM documents d
             WHERE d.review_status = 'confirmed'
               AND d.search_vector @@ plainto_tsquery('german', q.word)) AS hits
      FROM unnest(ARRAY[${sql.join(words.map((word) => sql`${word}`), sql`, `)}]::text[]) AS q(word)
  `);

  const ceiling = total * MAX_DOCUMENT_FREQUENCY;
  const distinctive = result.rows
    .filter((row) => {
      // Postgres already knows which words carry no meaning: a stopword
      // reduces to an empty tsquery. Checked separately from the hit count,
      // because a stopword scores zero hits and would otherwise pass the
      // rarity test as if it were the rarest word in the question - which is
      // how the pronoun in "meinen letzten Steuerbescheid" ended up matching
      // a document called "Organspende-Register_Mein-Eintrag".
      if (row.lexemes === 0) return false;
      // Zero hits is kept deliberately: a German compound like
      // "Steuerbescheid" matches no document through full text (the stemmer
      // does not split it) yet is the one word the question is actually
      // about - the trigram tier exists precisely to resolve it.
      return row.hits === 0 || row.hits <= ceiling;
    })
    .map((row) => row.word);

  // Every word common: keep them all rather than searching for nothing.
  return distinctive.length > 0 ? distinctive : words;
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "amount" in (value as Record<string, unknown>)) {
    const v = value as { amount?: string; currency?: string | null };
    return v.amount ? `${v.amount} ${v.currency ?? ""}`.trim() : "";
  }
  return String(value);
}

type ContextDoc = Awaited<ReturnType<typeof fetchBySearch>>[number];

function buildDocContext(doc: ContextDoc): string {
  const type = doc.documentType;
  const fieldsText = type
    ? type.fields
        .map((f) => {
          const formatted = formatMetadataValue((doc.metadata as Record<string, unknown>)[f.key]);
          return formatted ? `${f.label}: ${formatted}` : null;
        })
        .filter((v): v is string => v !== null)
        .join(", ")
    : "";
  const tags = doc.documentTags.map((dt) => dt.tag.name).join(", ");
  const text = (doc.ocrText ?? "").slice(0, MAX_TEXT_CHARS_PER_DOC);

  const lines = [
    `Titel: ${doc.title}`,
    `Typ: ${type?.name ?? "kein Typ"}`,
    `Hinzugefügt: ${doc.createdAt.toISOString().slice(0, 10)}`,
  ];
  if (fieldsText) lines.push(`Felder: ${fieldsText}`);
  if (tags) lines.push(`Tags: ${tags}`);
  if (text) lines.push(`Inhalt:\n${text}`);
  return lines.join("\n");
}

async function fetchBySearch(fastify: FastifyInstance, words: string[]) {
  const tsQueryInput = buildSearchTsQuery(words);
  if (!tsQueryInput) return [];

  return fastify.db.query.documents.findMany({
    where: and(
      eq(documents.reviewStatus, "confirmed"),
      sql`documents.search_vector @@ to_tsquery('german', ${tsQueryInput})`,
    ),
    orderBy: [sql`ts_rank(documents.search_vector, to_tsquery('german', ${tsQueryInput})) desc`],
    limit: TIER_LIMIT,
    with: {
      documentType: true,
      documentTags: { with: { tag: true } },
    },
  });
}

// Catches what FTS misses on unbroken German compound words (e.g.
// "Telekomrechnung" vs. a title/sender containing "Telekom") - the German
// stemmer doesn't decompose compounds, but pg_trgm's word_similarity finds
// the best-matching substring of comparable length regardless of word
// boundaries, so a compound word still fuzzy-matches the real word it
// contains.
async function fetchByTrigram(fastify: FastifyInstance, words: string[]) {
  if (words.length === 0) return [];

  const perWordScores = words.map(
    (word) =>
      sql`word_similarity(${word}, documents.title), word_similarity(${word}, coalesce(documents.metadata->>'sender', ''))`,
  );
  const bestScore = sql`greatest(${sql.join(perWordScores, sql`, `)})`;

  return fastify.db.query.documents.findMany({
    where: and(eq(documents.reviewStatus, "confirmed"), sql`${bestScore} > ${TRIGRAM_SIMILARITY_THRESHOLD}`),
    // Without this the limit picked an arbitrary subset of the matches: asked
    // for the last tax assessment, this tier matched both "Bescheid 2025"
    // (0.47 against "Steuerbescheid") and an unrelated document, and returned
    // the unrelated one. Best match first is the whole point of the tier.
    orderBy: [sql`${bestScore} desc`],
    limit: TIER_LIMIT,
    with: {
      documentType: true,
      documentTags: { with: { tag: true } },
    },
  });
}

// Semantic tier - catches relevant documents that share no literal
// word/stem/trigram with the question at all (paraphrases, synonyms).
// Requires GEMINI_API_KEY configured; embedText resolves null otherwise, in
// which case this tier simply contributes nothing (never throws).
async function fetchByEmbedding(fastify: FastifyInstance, question: string) {
  const queryEmbedding = await fastify.ai.embedText(question, "RETRIEVAL_QUERY");
  if (!queryEmbedding) return [];

  const vectorLiteral = `[${queryEmbedding.join(",")}]`;
  const ranked = await fastify.db
    .select({ id: documents.id })
    .from(documents)
    .innerJoin(documentEmbeddings, eq(documentEmbeddings.documentId, documents.id))
    .where(
      and(
        eq(documents.reviewStatus, "confirmed"),
        // Nearest is not the same as relevant - without this the tier can
        // never return nothing, and "nothing" is the right answer to a
        // question the archive has no semantic match for.
        sql`(${documentEmbeddings.embedding} <=> ${vectorLiteral}::vector) < ${MAX_EMBEDDING_DISTANCE}`,
      ),
    )
    .orderBy(sql`${documentEmbeddings.embedding} <=> ${vectorLiteral}::vector`)
    .limit(TIER_LIMIT);

  if (ranked.length === 0) return [];

  const ids = ranked.map((r) => r.id);
  const rows = await fastify.db.query.documents.findMany({
    where: inArray(documents.id, ids),
    with: {
      documentType: true,
      documentTags: { with: { tag: true } },
    },
  });

  // findMany() via `inArray` doesn't preserve the distance-ranked order -
  // restore it so the most semantically similar documents sort first.
  const rank = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

// Merges the retrieval tiers round-robin - each tier's best hit, then each
// tier's second, and so on - dropping duplicates a document surfaced in more
// than one tier.
//
// Concatenating the tiers in order would have been simpler, and was what
// this did before. It stopped working once MAX_CONTEXT_DOCS came down: the
// keyword tier alone can fill the whole budget, so the semantic tier would
// never contribute a single document and would exist only to cost an
// embedding call. Round-robin guarantees every tier is heard while still
// putting each tier's strongest match first.
function interleave(...groups: ContextDoc[][]): ContextDoc[] {
  const seen = new Set<string>();
  const merged: ContextDoc[] = [];
  const depth = Math.max(0, ...groups.map((g) => g.length));

  for (let rank = 0; rank < depth && merged.length < MAX_CONTEXT_DOCS; rank++) {
    for (const group of groups) {
      const doc = group[rank];
      if (!doc || seen.has(doc.id)) continue;
      seen.add(doc.id);
      merged.push(doc);
      if (merged.length >= MAX_CONTEXT_DOCS) break;
    }
  }
  return merged;
}

async function fetchRecent(fastify: FastifyInstance) {
  return fastify.db.query.documents.findMany({
    where: eq(documents.reviewStatus, "confirmed"),
    orderBy: [desc(documents.createdAt)],
    limit: MAX_CONTEXT_DOCS,
    with: {
      documentType: true,
      documentTags: { with: { tag: true } },
    },
  });
}

// Authenticated users only (router-level requireAuth) - this reads across
// the whole archive regardless of who uploaded what, same access level as
// the documents list itself. Rate-limited here specifically: unlike most
// routes, every call here triggers a real (costed, several-second) Gemini
// call, so it needs its own tighter ceiling on top of the app-wide default.
export default async function askChatRoute(fastify: FastifyInstance) {
  fastify.post(
    "/ask",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = askBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const { sessionId, question } = parsed.data;
      const user = currentUser(request);

      const session = await fastify.db.query.chatSessions.findFirst({
        where: and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, user.id)),
      });
      if (!session) throw new NotFoundError("Chat session not found");

      const storedMessages = await fastify.db
        .select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(asc(chatMessages.createdAt));

      // The DB keeps every message a session has ever had (the UI can
      // scroll all of it) - only what's replayed into the model each turn
      // is bounded, via a sliding token-budget window over the most recent
      // messages.
      const history = trimHistoryToTokenBudget(storedMessages as ChatMessage[]);

      // Follow-ups often omit the actual subject ("die von August 25?"),
      // relying on the conversation history for meaning - retrieval only
      // ever sees the latest message, so it needs a standalone version of
      // the question to search on. The final answer step below still gets
      // the original question + full history unchanged.
      const retrievalQuestion = await fastify.ai.condenseQuestion(question, history);

      // Both keyword tiers work from the same filtered word list, so a word
      // dropped as uninformative cannot come back in through the other one.
      const questionWords = await selectDistinctiveWords(fastify, extractQuestionWords(retrievalQuestion));

      const [searchResults, trigramResults, embeddingResults] = await Promise.all([
        fetchBySearch(fastify, questionWords),
        fetchByTrigram(fastify, questionWords),
        fetchByEmbedding(fastify, retrievalQuestion),
      ]);

      let candidates = interleave(searchResults, trigramResults, embeddingResults);
      let usedFallback = false;
      if (candidates.length === 0) {
        usedFallback = true;
        candidates = await fetchRecent(fastify);
      }

      const context = candidates.map(buildDocContext).join("\n\n---\n\n");
      const { answer, usedTitles } = await fastify.ai.answerQuestion(question, context, history);

      // Retrieval still casts a wider net than any one answer needs, so the
      // model has every plausibly-relevant candidate to choose from, but
      // that means most of `candidates` is usually noise for any single
      // question - only show the ones the model says it actually used.
      const usedTitlesLower = new Set(usedTitles.map((t) => t.toLowerCase()));
      const sources = candidates.filter((d) => usedTitlesLower.has(d.title.toLowerCase()));
      const sourcesPayload = sources.map((d) => ({ id: d.id, title: d.title }));

      const autoTitle =
        session.title === null
          ? question.length > MAX_AUTO_TITLE_CHARS
            ? `${question.slice(0, MAX_AUTO_TITLE_CHARS).trimEnd()}…`
            : question
          : undefined;

      await fastify.db.transaction(async (tx) => {
        await tx.insert(chatMessages).values([
          { sessionId, role: "user", content: question },
          { sessionId, role: "assistant", content: answer, sources: sourcesPayload },
        ]);
        await tx
          .update(chatSessions)
          .set({ updatedAt: new Date(), ...(autoTitle !== undefined ? { title: autoTitle } : {}) })
          .where(eq(chatSessions.id, sessionId));
      });

      return reply.send({
        answer,
        sources: sourcesPayload,
        usedFallback,
        sessionTitle: autoTitle,
      });
    },
  );
}
