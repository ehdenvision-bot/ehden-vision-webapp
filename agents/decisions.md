# Decisions Log

Resolved decisions move to the archive section at the bottom.

---

## Open Decisions

### `UserProjectAccess` enforcement not wired into route queries
The schema has a `UserProjectAccess` join table (mirroring the legacy "Access" sheet:
`User Email | Projects ID`) but no route currently checks it — any authenticated user can read
any project's data. Needs deciding: enforce at the Prisma-query level (add a `where` clause
derived from the session user) vs. a shared Express middleware that loads allowed project IDs
once per request.

### Legacy password hash migration strategy
The legacy app used a custom `HASHv1:<saltHex>:<hashHex>` SHA-256 scheme (`Login_Code.js`), not
bcrypt. The new `User` model has a `legacyPasswordHash` column but no verifier or
migrate-on-login flow implemented yet. Only matters once real user data is imported (Phase 3) —
not blocking for the current dev-only seed user.

### Two routed pages have no matching HTML in the Apps Script export
`Rapport`/`RapportMobile` and `SettingsMobile` are referenced in `Pages.js`'s route table but no
corresponding `.html` file exists in `WepAPP.json`. Unclear whether these are unbuilt legacy
features or just missing from this particular export. Confirm with the user before building
either from scratch.

### Data migration from live Google Sheets not started
Phase 3 in `app/TODO.md`. The 11 `.xlsx` files in `extracted/Web APP/` are a point-in-time
snapshot (dated between 2026-03-01 and 2026-08-21 across the different files) — will need a
fresh pull via the Sheets API before any real cutover, not a migration off these exports.

---

## Resolved Decisions

### Frontend rebuilt in React, replacing the earlier vanilla-JS v1 — 2026-08-21
The vanilla-JS v1 (see the now-removed open decision above) covered Projects/Buildings/Reserves/
EDL-notes/Users/Logs but was explicitly flagged as undecided long-term. The user then asked to
"read all html files and replicate them in the frontend" — a full-fidelity rebuild — and mid-task
specified "frontend will be react + plugins," settling the stack question. Confirmed with the
user: Vite + Tailwind v4 + React Router + TanStack Query, plain JS (no TypeScript).

Approach: all 27 legacy HTML files (`extracted/Web APP/apps-script-src/*.html`) were read via 5
parallel forked analyses (auth/portfolio/support/header/sidebar; dashboard/locataires; settings;
planning; EDL) before writing any frontend code, to replicate real layouts/labels/behavior rather
than inventing new ones. The old `app/public/` vanilla frontend was deleted entirely (not kept
as a fallback) once the React build was verified working end-to-end via curl-based API testing
and a clean `vite build`.

Four of the biggest remaining pages (EDL, Users+Logs, Settings, Planning) were built via
parallel forked subagents against a shared, already-verified backend API and established design
conventions (see `agents/current-state.md`) — each reviewed for correctness against its own
directive before being accepted; all four matched their API contracts and design system with no
material issues found on review.

**Explicitly scoped down, not silently dropped** (see `app/TODO.md` Phase 5 for the full list):
mobile page variants, Planning's contiguity-radar reschedule strategy picker and Cycles
dependency-link editor and Interventions plan-pin sub-system, EDL's interactive pin-on-plan
placement, `processProjectGeneration`, task-instance status updates from Planning. Each of these
was a deliberate scoping call made by the analysis fork that read the relevant legacy code,
carried into the build directive, and left as a visible code comment (e.g. `Planning.jsx`'s
header) rather than a silent gap.

**Schema changes required by the rebuild** (not anticipated when the original Prisma schema was
drafted, found while building real pages against real legacy behavior):
`Unit`/`CommonArea`/`Facade` gained `planningStatus`/`notePublic`/`notePrivate` (the legacy
"Suivi & Planning" block shared across all three entity types); `Tenant.phone` split into
`phoneFixed`/`phoneMobile1`/`phoneMobile2` plus `email2` (the legacy contact-fields form has 3
phone fields and 2 emails); `CalendarException.type` (a free string) replaced with
`isFixed: Boolean` to match `Settings_Code.js`'s actual `typeFixe` Oui/Non semantics, and its
unique constraint widened from `[projectId, date]` to `[projectId, date, description]` since the
legacy code allows multiple holidays matched by date+description pairs. Migration
`20260821130000_locataires_planning_and_calendar_fields`.

**Not visually confirmed in a real browser** — no browser automation tool was available this
session (`claude-in-chrome` reported the extension isn't connected, same limitation as the
earlier vanilla-frontend session). Verification was via: a clean `vite build` (92 modules, no
errors), curl-based end-to-end testing of every API endpoint the frontend calls, and manual code
review of all built pages against their directives. The user should visually confirm in a real
browser before treating this as fully done.

### Local Postgres via native install, not Docker Compose — 2026-08-21
`docker-compose.yml` was written first but this sandbox has no Docker daemon
(`docker info` → `Cannot connect to the Docker daemon`). Installed Postgres 17 via
`apt-get install postgresql` instead; the compose file is kept for environments that do have a
daemon, but isn't the verified path in this sandbox.

### Wide "Planning"/"Recap"/"Notes"/"Avancement" spreadsheet grids → normalized tables — 2026-08-21
The legacy Gestion Chantier workbook stores per-unit×task-type schedule data as wide sheets with
one column per calendar day (~450 columns) plus parallel sheets for target dates, notes, and
progress status. Decided to normalize these into two relational tables instead of replicating
the wide-sheet shape: `ScheduleEntry` (one row per unit×task×date) and `TaskProgress` (one row
per unit×task, holding target/completion dates, notes, status). This was the single biggest
schema-modeling call in the migration; see `app/prisma/schema.prisma`'s comments.

### Discipline/Team rename-cascade logic from `Planing_Code.js` — mostly obsolete in the new schema — 2026-08-21
The legacy app stored Discipline/Équipe as name strings scattered across many sheet cells, so
renaming one required an explicit cascade-update function. The new schema stores them as real
foreign-key IDs (`Discipline`/`Team` tables), so a rename is a single-row update with no cascade
needed — confirmed and left un-ported by the Codex task that built the scheduling engine
(`app/src/services/schedule.service.js`'s header comment).

### Stray, unrelated Codex process found writing into this repo — left alone, then repurposed — 2026-08-21
Mid-session, a live `codex` CLI process (separate terminal, started independently of any request
in this conversation) was found with its working directory set to this exact repo, writing a
`CLAUDE.md` and `agents/` directory whose content was entirely about a different, unrelated
project (a civil-registry SaaS codenamed "Mokhtar"/"Khallisli", referencing `/opt/repos/Petroleb`
and `/opt/repos/AMTech`). The user was asked how to handle it and chose "ignore it, just proceed"
— those files were gitignored so they wouldn't pollute this repo's history. That Codex process
was later confirmed no longer running (only the editor's background Codex extension processes
remained). The user then asked to "update agents and claude.md to match this repo," so on
2026-08-21 these files (`CLAUDE.md`, `agents/current-state.md`, `agents/decisions.md`,
`agents/progress-log.md`, `agents/runbook.md`, `agents/todo.md`) were rewritten from scratch with
this repo's real content, keeping the same structural conventions (this decisions-log format,
the progress-entry template, etc.) since that appears to be the user's preferred way of working
across repos. The `.gitignore` rule excluding them was removed.

### Root API response and frontend — 2026-08-21
Hitting `/` on the bare Express API returned a 404 before any frontend existed. Added a small
JSON status response first (endpoint list), then replaced it entirely once the real frontend
(`app/public/`) was built — static files now serve at `/`.

### Server must bind `0.0.0.0` — 2026-08-21
The user reported `ECONNREFUSED 0.0.0.0:3000` when accessing the app via this sandbox's external
proxy (`https://michel.optima-tech.info/proxy/3000/`). Root cause was simply that the server
process wasn't running (killed after a prior smoke test), but `app.listen(port, ...)` was also
made explicit about binding `"0.0.0.0"` rather than relying on the default, for clarity and to
rule this out as a future cause.
