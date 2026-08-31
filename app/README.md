# Ehden Vision — Node.js + PostgreSQL rewrite

Parallel rewrite of the live Google Apps Script app (`../Webapp Files/`), started 2026-08-25.
**`Webapp Files/` is untouched and stays the deployed app** — this is not a cutover yet. See
`../agents/decisions.md` for the full reasoning and `../agents/todo.md` for what's not ported
yet.

## Stack

- Node.js + Express
- PostgreSQL, no ORM — plain `pg` client, `node-pg-migrate` for versioned migrations
- bcrypt for new/reset passwords; a compat verifier also accepts the legacy
  `HASHv1:salt:digest` (salted SHA-256) format carried over from the `Utilisateurs` sheet, so
  migrated rows work without a forced reset (`src/lib/password.js`)

## Setup

```bash
service postgresql start   # if not already running

npm install
cp .env.example .env       # then edit if your local Postgres differs
npm run migrate:up
npm start                  # or `npm run dev` to restart on file changes
```

`GET /health` checks the DB connection.

## Layout

```
src/
  server.js          Express app entry — /health, /rpc, /bridge/rpc, / (pages)
  db.js              pg Pool
  session.js         session-token validation (sessions table, TTL)
  security.js        assertCanEdit() — session + role + project-status write gate
  render.js          renders Webapp Files/*.html + injects the google.script.run shim
  pages.js           doGet() equivalent — ?page= routing for the browser-served model
  appscript-auth.js  X-Api-Key gate for the /bridge/rpc Apps Script bridge
  lib/password.js    hashing/verification (bcrypt + legacy HASHv1 compat)
  rpc/
    dispatch.js      POST /:fn -> registry[fn](...args), {args:[...]} in, {result}/{message} out
    registry.js      one Node fn per Apps Script gs* fn, same name/signature
    <module>.js      per-module ported functions (locataires.js, settings.js, ...)
migrations/          node-pg-migrate migrations — each file's header documents which
                     sheet/columns it was ported from, don't skip that when adding one
```

## Two ways to reach the RPC backend

Both hit the same `src/rpc/registry.js` with the same `{args:[...]}` shape; which one is the
target is an open decision (`../agents/decisions.md`).

- **`POST /rpc/<fn>`** — same-origin, unauthenticated, for the model where Node serves the
  `Webapp Files/*.html` pages and `src/render.js`'s shim replaces `google.script.run`.
- **`POST /bridge/rpc/<fn>`** — `X-Api-Key: <APPSCRIPT_SHARED_SECRET>` required, for the model
  where Google Workspace keeps hosting the Apps Script web app and its `*_Code.js` functions
  call here via `UrlFetchApp` instead of reading Sheets. `GET /bridge/health` (same header)
  reports DB status + the registry's function list. Returns 503 until the secret is set.
  See `../agents/runbook.md` for verification commands.

## What's ported

Auth (login/logout/session, role-based edit gate, project-status lock) and `users`/`projects`.
Everything else — Planning, Locataires, Bâtiments, Réserves, EDL, Logs, password reset, project
photos, the frontend — is not yet ported. See `../agents/todo.md`.
