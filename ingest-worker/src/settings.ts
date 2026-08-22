import pg from "pg";
import { decrypt, keyFromHex } from "./crypto.js";
import { env } from "./env.js";

export interface MailboxSettings {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  folder: string;
  pollIntervalMinutes: number;
  allowAllSenders: boolean;
  allowedSenders: string[];
  enabled: boolean;
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

export async function loadSettings(): Promise<MailboxSettings | null> {
  const { rows } = await pool.query(
    `select id, host, port, username, password_encrypted, folder, poll_interval_minutes,
            allow_all_senders, allowed_senders, enabled
     from imap_settings limit 1`,
  );
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    host: row.host,
    port: row.port,
    username: row.username,
    password: decrypt(row.password_encrypted, keyFromHex(env.SETTINGS_ENCRYPTION_KEY)),
    folder: row.folder,
    pollIntervalMinutes: row.poll_interval_minutes,
    allowAllSenders: row.allow_all_senders,
    allowedSenders: row.allowed_senders ?? [],
    enabled: row.enabled,
  };
}

export async function recordSyncSuccess(id: string): Promise<void> {
  await pool.query(`update imap_settings set last_sync_at = now(), last_error = null where id = $1`, [id]);
}

export async function recordSyncError(id: string, message: string): Promise<void> {
  await pool.query(`update imap_settings set last_error = $2 where id = $1`, [id, message]);
}
