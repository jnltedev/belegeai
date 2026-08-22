# Security policy

## Reporting a vulnerability

**Please do not open a public issue.** A document archive holds tax letters,
contracts and medical correspondence, so a flaw here is worth reporting
carefully.

Use GitHub's private vulnerability reporting instead: go to the
[Security tab](https://github.com/jnltedev/belegeai/security/advisories/new)
and open a draft advisory. It is visible only to the maintainers until a fix
is released.

Useful things to include:

- What an attacker can do, and what access they need to start
- Steps to reproduce, or a proof of concept
- The version or commit you tested
- Whether you have already published anything about it

You will get a first response within a week. If a fix is needed, you will be
told when it lands and credited in the advisory unless you would rather not
be.

## Supported versions

This is a young project with a single active line. Fixes go onto `main` and
into the `latest` images; there are no long-term maintenance branches yet.

## What is in scope

The backend, frontend and ingest worker in this repository, and the way they
are wired together in `docker-compose.yml`.

Out of scope, though still worth telling us about informally:

- The push relay, which is a separate service with its own reporting channel
- Problems that require an already-compromised host or database
- Missing hardening in a deployment that ignores the README, for example
  exposing the backend port publicly or running with `COOKIE_SECURE=false`
  behind TLS

## Things worth knowing when you look

- The frontend is the only public service. The backend, Postgres and MinIO
  bind to localhost and are reached over the internal Docker network.
- Sessions are stateless encrypted cookies. `/api/auth/me` reads the user
  snapshot from the cookie, so a role change takes effect on the next sign
  in, not immediately.
- Registration closes permanently once the first account exists. Every
  further account comes from an admin invitation.
- Settings that must be replayed to a third party (SMTP password, Telegram
  bot token, Discord webhook, IMAP password) are encrypted with
  `SETTINGS_ENCRYPTION_KEY`. Passwords and API keys are hashed one way and
  never decrypted.
- There is no per-user document scoping. Every signed-in account can read
  and edit the whole archive by design.
