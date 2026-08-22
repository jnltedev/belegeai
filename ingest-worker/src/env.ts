function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  SETTINGS_ENCRYPTION_KEY: required("SETTINGS_ENCRYPTION_KEY"),
  INTERNAL_INGEST_SECRET: required("INTERNAL_INGEST_SECRET"),
  BACKEND_INTERNAL_URL: process.env.BACKEND_INTERNAL_URL ?? "http://backend:4000",
  // How often to re-check whether the mailbox is enabled at all, while
  // disabled - independent of the configured poll interval, which only
  // applies once enabled.
  DISABLED_RECHECK_MS: 30_000,
};
