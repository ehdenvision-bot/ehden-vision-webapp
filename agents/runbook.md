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
- **Rewrite (`app/`) — local only, not deployed anywhere public yet.** Runs against a local
  Postgres 17 cluster in this sandbox (role `ehden_app` / db `ehden_vision`, password `changeme`
  — sandbox-local, not a real secret, but still don't reuse it anywhere real). `app/.env` holds
  `DATABASE_URL`/`PORT` — copy from `app/.env.example`, gitignored.
- **Credentials**: clasp's own login token lives outside this repo (`~/.clasprc.json` by
  default — never commit it). **[If the app calls other services — API keys, service accounts —
  document where those live here, and never put a real secret in this file or in chat.]**
- **`clasp` was not installed in this sandbox as of 2026-08-25** — installed globally via `npm
  install -g @google/clasp` (v3.4.0). Not yet logged in (`~/.clasprc.json` doesn't exist). Since
  this is a headless/remote sandbox, use `clasp login --no-localhost`: it prints an
  `accounts.google.com` URL to open in your real browser, then prompts you to paste the
  resulting redirect URL back into the terminal. Run this yourself (not something Claude can
  complete, since it needs your live Google auth) — use the `!` prefix in Claude Code to run it
  interactively. Confirm afterwards which account it authorized against.

## Running the app

```bash
cd "Webapp Files"

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

## Running the Node/Postgres rewrite (`app/`, 2026-08-25)

```bash
service postgresql start          # Postgres 17 cluster; `pg_lsclusters` to check status

cd app
npm install
cp .env.example .env              # only needed once
npm run migrate:up                # applies everything in app/migrations/
npm start                         # or `npm run dev` (restarts on file change)

curl http://127.0.0.1:3001/health # {"ok":true,"db":"up"} if wired up correctly
```

### Apps Script -> Node bridge (`/bridge/rpc`, added 2026-08-31)

Shared-secret-gated mount of the same RPC registry, for the "keep the app on Google Workspace,
move only the data layer to Postgres" model (see `agents/decisions.md` "Open Decisions"). Needs
`APPSCRIPT_SHARED_SECRET` in `app/.env` (generate: `openssl rand -hex 32`; sandbox `.env`
already has a throwaway value). Server-side only so far — no Apps Script client yet.

```bash
S=$(grep '^APPSCRIPT_SHARED_SECRET=' app/.env | cut -d= -f2)

# 401 without / with wrong key; 200 + JSON with the right key:
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/bridge/health
curl -s -H "X-Api-Key: $S" http://127.0.0.1:3001/bridge/health
#  -> {"ok":true,"db":"up","caller":<X-User-Email or null>,"time":...,"rpcFunctions":[...]}

# Same call shape as /rpc, secret required:
curl -s -H "X-Api-Key: $S" -H 'Content-Type: application/json' \
  -d '{"args":["<sessionToken>"]}' http://127.0.0.1:3001/bridge/rpc/gsListProjects
```

Fail-closed: while `APPSCRIPT_SHARED_SECRET` is unset, `/bridge/*` returns 503 (plain `/rpc`
and `/health` are unaffected). Every dispatched call logs `bridge rpc <fn> <email> ok|FAIL Nms`
to stdout — the only latency/quota visibility once Apps Script is calling over the internet.

**No separate frontend build step** (2026-08-25 architecture — see `agents/decisions.md`'s
second same-day entry): `app/` has no `frontend/` directory. Pages are the literal
`Webapp Files/*.html` files, read directly by `app/src/render.js` at request time — editing a
template there and reloading the page is enough, no build/restart needed for template changes.
Only `app/src/*.js` (server code — `render.js`, `pages.js`, `rpc/*`) needs a restart to pick up
changes (`npm run dev` handles that automatically via `--watch`).

**RPC, not REST**: server functions live in `app/src/rpc/registry.js`, one Node async function
per Apps Script `gs*` function, same name/signature as the original — reachable at
`POST /rpc/<fn>` with `{"args": [...]}`, matching what the `google.script.run` shim
(`app/src/render.js`) sends. See `agents/todo.md`'s "Architecture" section for the full design
and the porting recipe for each remaining module.

**Port assignment (2026-08-25)**: the rewrite runs on **3001** —
`https://michel.optima-tech.info/proxy/3001/` is the online-testing URL for `app/`.
**The `proxy/3000/` tunnel is abandoned as a testing target** (see "Local layout-only preview"
below for why — it was never meant for meaningful testing, and the proxy layer itself turned
out to have problems even for that). `app/.env`'s `PORT` should stay `3001` (`.env.example`
defaults to it) until/unless this is revisited.

**False alarm investigated and closed, 2026-08-25**: `https://michel.optima-tech.info/proxy/3001/health`
briefly returned Express's default `Cannot GET /`. Confirmed NOT a real bug: a throwaway
diagnostic listener (logging raw method/URL/headers) proved the proxy forwards subpaths
correctly (`url: "/health"` arrived intact, full Cloudflare/code-server header set present) —
the proxy is fine, and the app was confirmed healthy the whole time (`curl 127.0.0.1:3001/health`
locally never failed). Retesting with a freshly-typed URL (not from browser history/autocomplete)
returned the correct `{"ok":true,"db":"up"}` — the original failure was a stale/cached
navigation, most likely a leftover hit to `/proxy/3001/` (bare root — at the time, before the
frontend was wired up, the app genuinely had no route for it) from before the port assignment
settled. Nothing to fix; noted here so a future session doesn't reopen this as a live bug.

**Real bug, found and fixed the same day**: once the frontend was actually being served, its
`fetch("/api/...")` calls and Vite's default absolute asset base both resolved against
`https://michel.optima-tech.info`'s root instead of the `/proxy/3001/` mount — this one WAS real
(browser console showed requests to the wrong URL, and a 405 from the proxy host's own
top-level app). See `CLAUDE.md`'s "Never assume, always verify" bullet and
`agents/decisions.md` for the full writeup and fix. The lesson: `curl 127.0.0.1:3001/...`
verification never catches this class of bug — it only reproduces through the actual proxied
URL in a real browser. Don't treat a clean `curl`-against-localhost pass as proof the proxy path
works; it isn't, for anything involving absolute URLs in served HTML/JS.

End-to-end verified 2026-08-25 (see `agents/decisions.md` for what's ported): login with a
seeded user → `sessionToken` → `GET /api/auth/me` and `GET /api/projects` both succeed with
`Authorization: Bearer <token>`; wrong password → 401; missing token → 401; `POST
/api/auth/logout` then reusing the same token → 401 (session actually deleted server-side, not
just client-forgotten). Also verified the legacy `HASHv1:salt:digest` password format
(carried over from the `Utilisateurs` sheet) authenticates correctly through the same compat
verifier that will accept migrated rows — see `app/src/lib/password.js`.

## Local layout-only preview (2026-08-25)

`node tools/local-preview/server.js` (port 3000) serves the same HTML shells from
`Webapp Files/` with `include_()`/template tags resolved the same way `Pages.js`'s `render_()`
does server-side, plus a mock `APP_DATA` object and a no-op stub for `google.script.run`. **This
is layout/CSS iteration only** — no login, no data, no writes; every `google.script.run.*` call
just logs a console warning and does nothing. It deliberately does NOT reimplement any server
function against the Sheets API — that path was tried before (the abandoned `app/` Node
rewrite) and produced two copies of the same logic drifting apart. For anything functional,
`clasp push` and test against the real `/dev` or deployed URL — there is no substitute for that.

The route table in `tools/local-preview/server.js` is hand-mirrored from `Pages.js`'s
`doGet()` switch; update it there if the switch changes. It already reflects that `Rapport.html`
and `RapportMobile.html` (the `rapport` page) and `EDLMobile.html` don't exist at all — confirmed
2026-08-25, see `agents/current-state.md`.

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