# Agent Runbook

Read `agents/current-state.md` and `agents/decisions.md` first.

## Access

- **Live app**: a Google Apps Script project owned by / running under `ehdenvision@gmail.com`
  — a personal `@gmail.com` account, not a custom-domain Workspace account. **[Fill in: the web
  app URL if it's deployed as a web app, or how it's opened if it's bound to a Sheet/Doc/Form
  instead.]**
- **Local clone**: `Webapp Files/`, kept in sync with the live project via `clasp push` / `clasp
  pull`. The script it points at is set in `Webapp Files/.clasp.json` (`scriptId`).
- **Development account**: `michel.s.dahdah@gmail.com` (also the Claude Pro account — unrelated
  to clasp's auth; Claude Code has no Google login of its own, it just runs `clasp` under
  whatever account `~/.clasprc.json` holds). **[Confirm which account `clasp login` actually
  used.]** If it's `michel.s.dahdah@gmail.com` rather than `ehdenvision@gmail.com` directly,
  that account needs *edit* access on the script (shared by the owner) for `clasp push` to
  work — view access is enough to clone/pull but not to push.
- **No rewrite deployment exists yet.**
- **Credentials**: clasp's own login token lives outside this repo (`~/.clasprc.json` by
  default — never commit it). **[If the app calls other services — API keys, service accounts —
  document where those live here, and never put a real secret in this file or in chat.]**

## Running the app

```bash
cd Webapp Files

clasp pull           # pull down anything changed in the Apps Script web editor first
clasp push           # push local changes to the live Apps Script project
clasp open           # open the project in the Apps Script web editor
clasp deploy          # create/update a deployment, if the app is published as a web app
clasp logs --watch    # tail Cloud Logging output from the live project
```

**Don't edit both sides at once.** `clasp push` overwrites the remote project wholesale, and
`clasp pull` overwrites the local copy wholesale — if the web editor and `Webapp Files/` diverge and
you push or pull without checking first, one side's changes get silently discarded.

**[Fill in anything else specific to this project: the entry point (`doGet`/`doPost`), any
installed or simple triggers, external services it talks to.]**

## Verification pattern

**[This repo has no automated tests yet, and Apps Script doesn't have a curl-chain equivalent
the way a REST API does. Once there's a real way to verify a change actually works — exercising
the deployed web app directly, checking `clasp logs`, `clasp run <function>` against a test
function (needs its own one-time setup) — document the specific commands here. Don't leave this
as a placeholder for long: "verify with something real, not just a syntax check" was the single
most repeated lesson in the reference this file was adapted from.]**

## Claiming work — ownership tags on live todos

Not yet needed — this is a single-agent-at-a-time repo so far. Adopt an ownership-tag
convention here if that changes.