# BelegeAI

A self-hosted document archive. Drop in receipts, invoices, contracts and
letters; an AI model reads each one, works out what kind of document it is,
fills in the fields, and files it. Afterwards you can search the archive in
plain language, or simply ask it questions.

Everything runs on your own machine. Documents live in your own object
storage, metadata in your own database. The only thing that ever leaves your
server is the text sent to the AI provider you configure - and if you leave
that unconfigured, nothing leaves at all and the archive works as a
well-organised manual filing cabinet.

## What it does

**Reads documents for you.** Upload a PDF or a photo and the extraction step
returns a document type, the fields that type defines, suggested tags and the
full text. You confirm or correct it; the archive learns nothing behind your
back and every suggestion stays editable.

**Fetches documents on its own.** Point it at an IMAP mailbox and attachments
are imported as they arrive, including attachments nested inside forwarded
emails. Anything imported this way waits in an import queue for you to
confirm, rather than being filed unseen.

**Answers questions.** Ask "what did I pay Telekom in August" and the chat
searches the archive three ways at once - full text, fuzzy word matching and
semantic similarity - then answers from the documents it found, citing them.

**Stays yours.** Postgres, MinIO and two Node services. No accounts anywhere
else, no telemetry, no phoning home.

## Requirements

- Docker and Docker Compose
- Roughly 2 GB of RAM
- Optionally, an API key for Google Gemini, OpenAI or Anthropic

## Getting started

```bash
git clone https://github.com/jnltedev/belegeai.git
cd belegeai
cp .env.example .env
```

Open `.env` and set at least these three:

```bash
SESSION_SECRET=$(openssl rand -hex 32)
SETTINGS_ENCRYPTION_KEY=$(openssl rand -hex 32)
INTERNAL_INGEST_SECRET=$(openssl rand -hex 32)
```

Then start it:

```bash
docker compose up -d
```

Open <http://localhost:3005> and register. **The first account becomes the
administrator, and registration closes permanently once it exists** - every
further account is created by invitation from the admin area. There is no
open sign-up to leave exposed by accident.

### Running from source instead of published images

`docker-compose.yml` pulls the images built by this repository's CI. To build
them from your checkout instead:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## Configuration

Everything lives in `.env`; `.env.example` documents each value in place.
The ones worth knowing about:

| Variable | Meaning |
| --- | --- |
| `PUBLIC_APP_URL` | The address the app is reachable at. Used for links in outgoing email. |
| `COOKIE_SECURE` | Set to `true` once TLS terminates in front of the app. |
| `AI_PROVIDER` | `gemini`, `openai` or `anthropic`. |
| `AI_API_KEY` | Leave empty to run the archive entirely manually. |
| `AI_MODEL` | Optional. Empty uses the provider's default. |
| `DEFAULT_LANGUAGE` | `en` or `de`, for logged-out pages and new accounts. |
| `LOGO_FILENAME` | A file in `./branding/`, or a full `https://` URL. |
| `IMAGE_NAMESPACE` | Docker Hub account the images are pulled from. |
| `MAX_UPLOAD_MB` | Per-file upload limit. Defaults to 25. |

Only the frontend container is meant to be reachable from outside. It proxies
every `/api/*` request to the backend over the internal Docker network, so a
reverse proxy or tunnel only ever needs to know about that one port. Postgres,
MinIO and the backend bind to `127.0.0.1` regardless of the ports you set.

### AI providers

| Provider | Extraction | Chat | Semantic search |
| --- | --- | --- | --- |
| Google Gemini | yes | yes | yes |
| OpenAI | yes | yes | yes |
| Anthropic Claude | yes | yes | no |

Anthropic publishes no embedding endpoint, so with Claude the chat falls back
to full-text and fuzzy retrieval. Everything else behaves identically.

### Notifications

Telegram, Discord and SMTP are configured in the admin area, not in `.env`,
and each can be tested from there. SMTP is also what sends invitations and
password resets - but it is optional: with no mail server configured, the
admin area shows the one-time link directly so it can be passed on by hand.

## iOS app

A native iPhone client is **in planning and arriving soon** as an additional
feature: browse and search the archive, work through the import queue, chat,
and capture receipts with the phone's document scanner straight into the same
extraction pipeline.

### Push notifications

The app can notify you when a document arrives by IMAP or API import. Apple
only accepts push notifications signed with an APNs key, and issuing one
requires a paid Apple developer account - which no self-hosted instance
should have to obtain just to receive a notification.

BelegeAI therefore offers a free push relay, so this feature is available to
everyone without any additional setup. Your instance registers with the relay
once and forwards notification requests through it. **Notification text never
reaches the relay**: only an identifier and a message key are transmitted,
and the app resolves the wording locally.

The relay is not part of this repository and is not open source. If you would
rather not use it, run your own and point your instance at it with
`APNS_PUSH_PROXY_URL`; the protocol is a plain HTTP registration and send
endpoint. Push notifications are entirely optional and nothing else depends
on them.

## Development

```bash
cd backend  && npm install && npm run dev
cd frontend && npm install && npm run dev
```

The backend expects Postgres and MinIO to be reachable; the quickest way is
to start those two from the compose file and leave the rest stopped:

```bash
docker compose up -d postgres minio
```

Database migrations live in `backend/src/migrations` and run with
`npm run db:migrate`.

## Contributing

Issues and pull requests are welcome. Please open an issue before starting
anything substantial, so nobody spends an evening on something that turns out
not to fit.

## License

[GNU Affero General Public License v3.0](LICENSE). You may run, study, modify
and redistribute this software; if you offer a modified version to others over
a network, you have to make your changes available under the same license.
