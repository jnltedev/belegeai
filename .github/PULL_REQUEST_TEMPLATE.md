## What this changes

<!-- One or two sentences. What behaves differently after this is merged? -->

## Why

<!-- The problem being solved. Link the issue if there is one: Fixes #123 -->

## How it was verified

<!--
What you actually ran, not what should work in theory. For example:
  - npm run build in backend and frontend
  - Uploaded a PDF and a .eml through the browser
  - Confirmed an import queue entry from an IMAP mailbox
-->

## Checklist

- [ ] `npm run build` passes in every package this touches
- [ ] User-visible text is added to both `de.json` and `en.json`
- [ ] Database changes ship with a migration in `backend/src/migrations`
- [ ] No secrets, tokens or personal documents in the diff
