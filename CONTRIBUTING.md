# Contributing

Thanks for considering it. This is a small project, so the rules are short.

## Before you start

Open an issue first for anything substantial. It costs you a message and can
save you an evening: some things are deliberately out of scope, and others
are already half-built on a branch.

Small fixes, typos and translation corrections need no discussion. Just send
the pull request.

## Getting set up

```bash
git clone https://github.com/jnltedev/belegeai.git
cd belegeai
cp .env.example .env
```

Fill in the three secrets `.env.example` asks for, then start the two
services that carry state and run the applications yourself:

```bash
docker compose up -d postgres minio
cd backend  && npm install && npm run db:migrate && npm run dev
cd frontend && npm install && npm run dev
```

An AI key is optional. Without one the archive works manually, which is
enough for most changes.

## The three services

| Directory | What it is |
| --- | --- |
| `backend` | Fastify API, Drizzle ORM, all business logic. Never exposed publicly. |
| `frontend` | Next.js. The only service reachable from outside; proxies `/api/*` to the backend. |
| `ingest-worker` | Polls configured IMAP mailboxes and hands attachments to the backend. |

## What is expected of a change

**It builds.** `npm run build` in every package you touched. There is no
test suite yet, so the compiler and your own manual check are the whole
safety net.

**Text is translated.** Every user-visible string goes through the
translation files. `frontend/src/lib/i18n/messages/de.json` and `en.json`
must always hold the same set of keys. Placeholders use two braces:
`{{name}}`, not `{name}`.

**Schema changes ship with a migration.** Generate it into
`backend/src/migrations` and add it to the journal. A change that only edits
the Drizzle schema will work on your machine and break on everyone else's.

**Comments explain why, not what.** The code says what it does. A comment
earns its place by recording the reason a choice was made, especially when
the obvious alternative was rejected for a concrete reason.

**No long dashes.** Use a normal hyphen, a comma or a new sentence.

## Reporting problems

Use the issue templates. They ask for the version, how you deploy and which
AI provider you use, because those three decide whether a problem can be
reproduced at all.

Security vulnerabilities do not belong in the issue tracker. See
[SECURITY.md](SECURITY.md).

## License

Contributions are accepted under the [AGPL-3.0](LICENSE), the same license
the project itself uses.
