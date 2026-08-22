import { buildApp } from "./app.js";
import { runMigrations } from "./db/migrate.js";
import { loadEnv } from "./config/env.js";
import { sweepOrphanedTags } from "./lib/tags.js";
import { backfillMissingEmbeddings } from "./lib/embeddings.js";

const ORPHAN_SWEEP_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4h - a backstop, not the primary cleanup path
const EMBEDDING_BACKFILL_INTERVAL_MS = 60 * 60 * 1000; // 1h - a backstop, not the primary path (ingestion/create/update generate embeddings inline)

async function main() {
  const env = loadEnv();
  await runMigrations(env.DATABASE_URL);

  const app = await buildApp();
  await app.listen({ host: "0.0.0.0", port: env.PORT });

  async function runSweep() {
    try {
      const removed = await sweepOrphanedTags(app.db);
      if (removed > 0) app.log.info({ removed }, "Swept orphaned tags");
    } catch (err) {
      app.log.warn({ err }, "Orphaned-tag sweep failed");
    }
  }
  await runSweep();
  setInterval(runSweep, ORPHAN_SWEEP_INTERVAL_MS);

  async function runEmbeddingBackfill() {
    try {
      const generated = await backfillMissingEmbeddings(app);
      if (generated > 0) app.log.info({ generated }, "Backfilled missing document embeddings");
    } catch (err) {
      app.log.warn({ err }, "Embedding backfill sweep failed");
    }
  }
  await runEmbeddingBackfill();
  setInterval(runEmbeddingBackfill, EMBEDDING_BACKFILL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
