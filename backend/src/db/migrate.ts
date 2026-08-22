import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { loadEnv } from "../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The official postgres image only auto-creates POSTGRES_DB on a genuinely
// empty data directory - if the volume already holds any data (e.g. a stray
// leftover volume, or a different project's data), that step is skipped
// silently and our target database would never exist. Create it ourselves,
// idempotently, via the always-present "postgres" maintenance database,
// rather than depending on that one-time image behavior.
async function ensureDatabaseExists(databaseUrl: string) {
  const target = new URL(databaseUrl);
  const dbName = target.pathname.slice(1);
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";

  const adminPool = new pg.Pool({ connectionString: adminUrl.toString() });
  try {
    const { rowCount } = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (rowCount === 0) {
      await adminPool.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    }
  } finally {
    await adminPool.end();
  }
}

export async function runMigrations(databaseUrl: string) {
  await ensureDatabaseExists(databaseUrl);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // pgvector is enabled up front so Phase 5's `embeddings` table (with a
    // `vector` column) can be added later as a plain CREATE TABLE migration,
    // with no separate environment bootstrap step required. pg_trgm backs
    // the chat widget's fuzzy/trigram search fallback (see routes/chat/ask.ts)
    // for query terms that don't share an exact stem with the archive (e.g.
    // German compound words the search dictionary can't decompose).
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: path.join(__dirname, "../migrations") });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = loadEnv();
  runMigrations(env.DATABASE_URL)
    .then(() => {
      console.log("Migrations applied successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
