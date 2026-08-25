import { z } from "zod";

// The project's own push proxy. Changed in one place, here, and overridable
// per deployment via APNS_PUSH_PROXY_URL.
const DEFAULT_PUSH_PROXY_URL = "https://apns-proxy.belegeai.de";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  // 32 raw bytes as 64 hex chars - used for reversible encryption of secrets
  // stored in the DB (currently just the IMAP mailbox password). Generate
  // with `openssl rand -hex 32`.
  SETTINGS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "SETTINGS_ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),
  // Shared secret the ingest-worker presents to authenticate its own
  // (non-public) ingestion endpoint - distinct from user-issued API keys,
  // since it identifies the worker itself, not an external caller.
  INTERNAL_INGEST_SECRET: z.string().min(32, "INTERNAL_INGEST_SECRET must be at least 32 characters"),
  AUTH_MODE: z.enum(["local", "sso"]).default("local"),
  OIDC_ISSUER_URL: z.string().optional().default(""),
  OIDC_CLIENT_ID: z.string().optional().default(""),
  OIDC_CLIENT_SECRET: z.string().optional().default(""),
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  MINIO_BUCKET: z.string().default("belege-documents"),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  // --- AI provider ---
  //
  // One set of variables for every provider, so switching is a matter of
  // changing AI_PROVIDER and the key rather than learning a new naming
  // scheme. Leaving AI_API_KEY empty disables extraction entirely and the
  // archive stays fully manual - a supported mode, not a broken one.
  AI_PROVIDER: z.enum(["gemini", "openai", "anthropic", "ollama"]).default("gemini"),
  AI_API_KEY: z.string().optional().default(""),
  // Where a self-hosted Ollama server can be reached, e.g.
  // http://llm.example.lan:11434. Only read by the ollama provider, which
  // needs no API key at all - for that provider this is what decides whether
  // AI is configured. AI_API_KEY stays optional there and is sent as a
  // bearer token, for a server put behind an authenticating reverse proxy.
  AI_BASE_URL: z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim().replace(/\/+$/, "")),
  // Empty means "the provider's sensible default" - see lib/ai/defaults.ts.
  AI_MODEL: z.string().optional().default(""),
  // Powers the chat widget's semantic search. Optional: Anthropic offers no
  // embedding endpoint at all, and without embeddings the chat simply falls
  // back to its full-text and trigram retrieval tiers.
  AI_EMBEDDING_MODEL: z.string().optional().default(""),

  // Superseded by the AI_* variables above and read only so an existing
  // deployment keeps working through one upgrade. Remove once .env is
  // migrated - loadEnv() logs a warning while they are still in use.
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().optional().default(""),
  GEMINI_EMBEDDING_MODEL: z.string().optional().default(""),

  // Whether to mark the session cookie `Secure` (HTTPS-only). This stack has
  // no reverse proxy / TLS termination of its own (by design, see the
  // project spec) - the browser only treats `localhost` as an implicitly
  // secure context, so a `Secure` cookie is silently dropped on every other
  // plain-HTTP host (a LAN IP, a real domain without TLS in front). Default
  // false; set true only once TLS is actually terminated in front of this
  // app (e.g. by the operator's own reverse proxy/VPN).
  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  // "lax" works for same-origin and same-site (subdomain-sharing) deployments.
  // "none" is required only when frontend and API sit on origins the browser
  // treats as cross-site (e.g. separate subdomains) - but SameSite=None
  // cookies are rejected by browsers unless Secure is also set, so that
  // combination is validated below rather than failing silently at runtime.
  COOKIE_SAME_SITE: z.enum(["lax", "none"]).default("lax"),
  // Fallback UI language for any user who hasn't explicitly picked one yet
  // (users.language is null until they choose via the navbar menu - see
  // routes/auth/language.ts). Not baked into new users' rows at creation
  // time, so changing this later still affects everyone who never chose.
  DEFAULT_LANGUAGE: z.enum(["de", "en"]).default("en"),
  // Where import notifications are forwarded. Defaults to the push proxy run
  // by this project, so a normal deployment needs no configuration at all;
  // anyone preferring to run their own sets this to their own deployment of
  // the push proxy. Deliberately not editable from the web UI - it is a
  // deployment decision, not something to fiddle with at runtime.
  // Empty counts as unset, not as "no proxy". docker compose passes
  // `${APNS_PUSH_PROXY_URL:-}` through as an empty string when the variable
  // is absent from .env, and an empty string is a *present* value as far as
  // zod is concerned - so a plain .default() would silently never apply, and
  // the admin screen would report "no push proxy configured" on a deployment
  // that never asked to override anything.
  //
  // The transform runs before the deprecated PUSH_PROXY_URL is folded in
  // below, so this cannot default while an old name is still set: the raw
  // value is re-read there instead of trusting the transformed one.
  APNS_PUSH_PROXY_URL: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed === "" ? DEFAULT_PUSH_PROXY_URL : trimmed;
    }),
  // Deprecated spelling, read only so an existing deployment keeps working.
  PUSH_PROXY_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  // Silent fallbacks are how a rename turns into "the AI just stopped
  // working" weeks later, so the deprecated names keep working *and* say so.
  const legacy: Array<[keyof Env, keyof Env]> = [
    ["GEMINI_API_KEY", "AI_API_KEY"],
    ["GEMINI_MODEL", "AI_MODEL"],
    ["GEMINI_EMBEDDING_MODEL", "AI_EMBEDDING_MODEL"],
  ];
  for (const [from, to] of legacy) {
    if (parsed.data[from] && !parsed.data[to]) {
      (parsed.data[to] as string) = parsed.data[from] as string;
      console.warn(`${from} is deprecated - rename it to ${to} in your environment.`);
    }
  }

  // Handled apart from the table above because its target is never empty:
  // the transform already substituted the project's own proxy, so "not set"
  // cannot be detected by looking at the parsed value. The raw variable is
  // the only honest signal.
  const legacyProxy = (process.env.PUSH_PROXY_URL ?? "").trim();
  if (legacyProxy && !(process.env.APNS_PUSH_PROXY_URL ?? "").trim()) {
    parsed.data.APNS_PUSH_PROXY_URL = legacyProxy;
    console.warn("PUSH_PROXY_URL is deprecated - rename it to APNS_PUSH_PROXY_URL in your environment.");
  }
  if (parsed.data.COOKIE_SAME_SITE === "none" && !parsed.data.COOKIE_SECURE) {
    console.error("Invalid environment configuration: COOKIE_SAME_SITE=none requires COOKIE_SECURE=true");
    process.exit(1);
  }
  return parsed.data;
}
