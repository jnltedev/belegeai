import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
import type { Env } from "../config/env.js";

export function createDb(env: Env) {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  return { pool, db: drizzle(pool, { schema }) };
}

export type Database = ReturnType<typeof createDb>["db"];
