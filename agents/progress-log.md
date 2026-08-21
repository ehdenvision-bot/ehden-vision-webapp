# Progress Log

This file was rewritten from scratch on 2026-08-21 — see `agents/decisions.md`'s resolved
"Stray, unrelated Codex process" entry for why. Nothing below predates that date.

---

## 2026-08-21 - Repo scaffolding: analysis, Node.js/Postgres scaffold, git init

Status: completed

Owner/agent: Claude (main thread) + 2 parallel forked subagents (Apps Script structure analysis,
xlsx schema analysis)

Files changed:

- `app/` — full Express + Prisma scaffold (`package.json`, `docker-compose.yml`, `.env.example`,
  `prisma/schema.prisma`, `src/server.js`, `src/lib/prisma.js`, `src/middleware/*`,
  `src/routes/{auth,projects,reserves}.routes.js`)
- `extracted/Web APP/apps-script-src/` — 39 files, the clasp export flattened to plain
  `.js`/`.html` for reading
- Git initialized at repo root; first commit `e37fa14`

Server/live-system changes:

- Postgres 17 installed natively (`apt-get install postgresql`) — no Docker daemon in this
  sandbox
- `chantier` role/db created

Verification:

- Command: `npx prisma migrate dev --name init && npm run db:seed && node src/server.js`
- Result: `/health` → `{"ok":true}`; `POST /api/auth/login` → valid JWT + httpOnly cookie for
  the seeded `admin@example.com`

Notes:

- Chose Postgres-native-install over Docker Compose after discovering no Docker daemon is
  reachable in this sandbox

Next recommended action:

- Flesh out remaining CRUD routes (buildings, EDL, users, logs)

---

## 2026-08-21 - Remaining API routes + scheduling engine ported via Codex worktree

Status: completed

Owner/agent: Claude (main thread) + `codex exec` in an isolated git worktree

Files changed:

- `app/src/routes/{buildings,edl,users,logs}.routes.js`, `app/src/middleware/upload.js`
- `app/src/services/schedule.service.js`, `app/src/routes/schedule.routes.js` (ported from
  `Planing_Code.js` by a scoped, sandboxed-bypass Codex task on branch
  `codex/schedule-domino-shift`, reviewed diff-only against its own parent commit before merging)

Server/live-system changes:

- None beyond the running dev server (restarted after each route addition)

Verification:

- Command: curl smoke tests against every new route (`/api/buildings`, `/api/users`,
  `/api/logs`, `/api/schedule/task-types/:id/deletion-impact`) after login
- Result: all round-tripped correctly against Postgres; merge conflict in `routes/index.js`
  (both branches added imports) resolved by hand, re-verified after merge

Notes:

- The Codex task's actual diff against its own parent commit was clean (3 files, +255 lines) —
  a `git diff master --stat` looked alarming (showed unrelated files as "deleted") only because
  the worktree branched before those files existed on `master`; always diff against the branch's
  own parent, not the current `master`, when reviewing worktree-isolated work

Next recommended action:

- End-to-end curl test of a full create-project → create-building → create-unit → create-reserve
  flow, since that had not been done yet with real chained IDs

---

## 2026-08-21 - Two real schema/route bugs found while building the frontend

Status: completed

Owner/agent: Claude (main thread)

Files changed:

- `app/src/routes/projects.routes.js`, `app/src/routes/reserves.routes.js`

Server/live-system changes:

- None (bug fix, no schema change)

Verification:

- Command: full curl chain — login → create project → create building → create unit → create
  reserve → list reserves filtered by project
- Result: both routes failed with Prisma "Unknown argument" errors on the first real end-to-end
  run (fields left over from an early schema draft: `address`, `title`, `priority`,
  `assigneeId`, a direct `projectId` on `Reserve`). Rewritten to match the real
  `schema.prisma`; re-ran the same chain, all 201/200

Notes:

- `node --check` (syntax-only) had passed on both files earlier and gave false confidence —
  Prisma's field validation is a runtime error, only caught by actually calling the endpoint.
  Documented in `CLAUDE.md`'s "Never assume, always verify" bullet as a concrete example.

Next recommended action:

- Audit `buildings.routes.js`/`edl.routes.js`/`users.routes.js`/`logs.routes.js` the same way
  (spot-checked at the time and they matched, but only `projects`/`reserves` got a full
  create→read round-trip before this)

---

## 2026-08-21 - Minimal built-in frontend shipped ("as is"), then restyled to match the legacy app

Status: completed

Owner/agent: Claude (main thread) + 1 forked subagent (legacy design-system extraction)

Files changed:

- `app/public/{index.html,style.css,app.js}` (new, then rewritten once)
- `app/public/assets/logo.png` (copied from `extracted/Web APP/04- Projects Photos/Logo.png`)
- `app/src/routes/auth.routes.js` (added `canEdit`/`isClientRole`/`role` to `/me` and `/login`
  responses so the UI can gate edit forms and the Users nav item)
- `app/src/server.js` (serve `app/public/` as static files at `/`, replacing the earlier
  JSON status placeholder)

Server/live-system changes:

- None beyond the running dev server

Verification:

- Command: curl checks on `/`, `/style.css`, `/app.js`, `/assets/logo.png` (all 200), plus the
  full login → create-project → create-building → create-unit → create-reserve → EDL-note chain
  the frontend depends on
- Result: all pass. Could not visually confirm rendering in an actual browser — no browser
  automation tool was available this session (`claude-in-chrome` skill reported the extension
  isn't connected) — told the user explicitly rather than claiming a visual check that didn't
  happen

Notes:

- First pass used a generic dark-theme design (not requested — just a reasonable default). User
  asked to match the legacy app's actual visuals instead. A forked subagent read the legacy
  HTML/CSS and extracted the real design system (brand "Ehden Vision", primary blue `#0d59f2`,
  corporate blue `#004595`, Inter font, Material Symbols icons, sidebar+header shell, status
  chips) rather than guessing from memory — see `agents/current-state.md` for the summary.
- `pkill -f "node src/server.js"` kept returning exit 144 and appeared to kill more than
  intended (possibly matching its own invoking shell's command line, which contains the same
  string). Switched to `ps aux | grep "[n]ode src/server.js"` + `kill <pid>`, which worked
  cleanly (exit 143 = SIGTERM, as expected). Documented in `CLAUDE.md`.

Next recommended action:

- Get actual visual/browser confirmation from the user (or a working browser tool) rather than
  relying on curl+code-review alone
- Wire EDL photo upload, work-fields, and the scheduling engine into the frontend (currently
  API-only)
