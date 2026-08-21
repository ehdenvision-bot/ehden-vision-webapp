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

---

## 2026-08-21 - Full React frontend rebuild replacing the vanilla-JS v1

Status: completed

Owner/agent: Claude (main thread) + 9 forked subagents (5 sequential/parallel for legacy-page
analysis, 4 parallel for page implementation)

Files changed:

- `app/frontend/` — new React app (Vite + Tailwind v4 + React Router + TanStack Query): routing
  shell (`App.jsx`, `main.jsx`, `ProtectedRoute.jsx`, `Layout.jsx`), auth pages (`Login.jsx`,
  `ResetRequest.jsx`, `Reset.jsx`, `SupportLogin.jsx`, `Support.jsx`, `AuthCardShell.jsx`),
  `Portfolio.jsx`, `Dashboard.jsx`, `Locataires.jsx`, `Reserves.jsx`, `Edl.jsx`, `Users.jsx`,
  `Logs.jsx`, `Settings.jsx`, `Planning.jsx`, plus `lib/api.js`, `lib/AuthContext.jsx`,
  `lib/useCurrentProject.js`, `components/StatusChip.jsx`
- `app/public/` deleted entirely (superseded vanilla frontend)
- `app/src/server.js` — serves `frontend/dist` in production with SPA fallback, no longer
  serves `app/public/`
- `app/src/routes/auth.routes.js` — added `/reset-request` + `/reset`
- `app/src/routes/buildings.routes.js` — added `/locataires/:projectId` bootstrap +
  contact/planning-write routes
- `app/src/routes/edl.routes.js` — added work-field admin CRUD
- `app/src/routes/reserves.routes.js` — added `unitId` filter
- `app/src/routes/schedule.routes.js` — added disciplines/teams/task-types/cycles/entries CRUD
- `app/src/routes/settings.routes.js` (new) — holiday calendar (French-holiday Gauss calculation
  ported from `Settings_Code.js`, custom holiday CRUD)
- `app/src/lib/mailer.js` (new) — nodemailer wrapper, logs to console if SMTP unconfigured
- `app/prisma/schema.prisma` + migration `20260821130000_locataires_planning_and_calendar_fields`
  — added planning/note fields to Unit/CommonArea/Facade, split Tenant phone fields, changed
  `CalendarException.type` to `isFixed: Boolean`

Server/live-system changes:

- None beyond the running dev server (restarted after each batch of backend changes)

Verification:

- `cd app/frontend && npx vite build` — clean, 92 modules, no errors
- curl end-to-end tests of every new/changed API endpoint (reset flow, locataires bootstrap +
  contact update, disciplines CRUD, holiday calendar including a real Easter-date check for
  2026 against the actual calendar, work-field CRUD, reserves unitId filter) — all correct
- Manual code review of all 4 forked-subagent-built pages (Edl.jsx, Users.jsx, Logs.jsx,
  Settings.jsx, Planning.jsx) against their directives and the established API contracts — no
  material issues found, one unused variable removed from Planning.jsx
- Server restart + SPA-fallback routing check (unknown client route → 200 index.html, `/api/*`
  and `/uploads/*` NOT swallowed by the catch-all, static assets serve with correct
  content-type, CSP headers compatible with Google Fonts + self-hosted JS/CSS)

Notes:

- User's request evolved over the session: "full publish with frontend as is" (vanilla-JS v1) →
  "work the frontend visuals same as the webapp" (restyled to match legacy design) → "read all
  html files and replicate them in the frontend" + "frontend will be react + plugins" (full
  React rebuild). Each pivot was treated as superseding the prior approach, not layering on it —
  the vanilla frontend was deleted, not kept as a fallback, once the React version was verified.
- Delegation pattern: analysis forks (read legacy code, produce a condensed spec) were run before
  and separately from implementation forks (write React code against an already-verified
  backend + already-extracted spec) — kept each fork's job narrow and let later forks build on
  earlier forks' findings via shared conversation context (forks inherit full context) rather
  than re-deriving the same analysis multiple times.
- `prisma migrate dev` doesn't work non-interactively in this sandbox even for a trivial change —
  worked around via `prisma migrate diff --script` + manual `psql` apply + `migrate resolve
  --applied`. Documented in `agents/runbook.md`.
- Settings.html (legacy) turned out to contain an unrelated, unfinished "Workspace" feature, not
  the actual settings page — the Settings.jsx UI had to be designed fresh against
  `Settings_Code.js`'s function signatures instead of copied from legacy markup.

Next recommended action:

- Get real visual/browser confirmation from the user — no browser automation tool was available
  this session (`claude-in-chrome` extension not connected), so nothing has actually been looked
  at rendered, only verified via build success + API testing + code review
- `UserProjectAccess` enforcement is the highest-value remaining backend gap (see
  `agents/decisions.md`)
