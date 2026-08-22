import { env } from "./env.js";
import { loadSettings, recordSyncSuccess, recordSyncError } from "./settings.js";
import { pollOnce } from "./poll.js";

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Defensive backstop only - poll.ts's fetch-then-process ordering already
// prevents the IMAP protocol desync that could hang a cycle indefinitely,
// but a stalled cycle here would otherwise stall the whole recursive
// schedule below forever, silently.
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error(`Poll cycle timed out after ${ms}ms`)), ms)),
  ]);
}

// Recursive setTimeout rather than setInterval: each cycle re-reads
// poll_interval_minutes fresh from the DB and schedules the next run from
// there, so a change made in the admin UI takes effect on the very next
// cycle with no restart, and cycles can never overlap.
async function runCycle(): Promise<void> {
  let settings;
  try {
    settings = await loadSettings();
  } catch (err) {
    log(`Failed to load settings from DB, retrying shortly: ${(err as Error).message}`);
    setTimeout(runCycle, env.DISABLED_RECHECK_MS);
    return;
  }

  if (!settings || !settings.enabled) {
    setTimeout(runCycle, env.DISABLED_RECHECK_MS);
    return;
  }

  try {
    await withTimeout(pollOnce(settings, log), POLL_TIMEOUT_MS);
    await recordSyncSuccess(settings.id);
  } catch (err) {
    const message = (err as Error).message;
    log(`Poll cycle failed: ${message}`);
    // Worker must never crash on an IMAP/network error - just record it and
    // try again next cycle.
    await recordSyncError(settings.id, message).catch(() => {});
  }

  setTimeout(runCycle, settings.pollIntervalMinutes * 60_000);
}

log("ingest-worker starting");
runCycle().catch((err) => {
  // Only a truly unexpected bug (not IMAP/network/DB errors, which are
  // already caught inside runCycle) should ever reach here.
  console.error("Fatal error in ingest-worker:", err);
  process.exit(1);
});
