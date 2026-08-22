# ingest-worker

Standalone IMAP mailbox poller. Reads mailbox config directly from the
`imap_settings` table (re-read every cycle, so changes in the admin UI take
effect without a restart), fetches unseen messages, and hands each raw
`.eml` off to the backend's `POST /api/internal/imap` - the same email-
parsing/attachment-extraction path used for a manual `.eml` upload, just
invoked over HTTP instead of a direct function call (no shared code between
this process and `backend/`).

Messages from senders not on the mailbox's allowlist (unless "allow all
senders" is enabled) are marked read and skipped, never ingested. A message
is only marked `\Seen` after the backend accepts it - a transient failure
gets retried on the next poll cycle instead of silently dropping the email.
