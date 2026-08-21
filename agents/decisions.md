# Decisions Log

Resolved decisions move to the archive section at the bottom.

---

## Open Decisions

### Frontend: keep extending the vanilla-JS build, or move to a real SPA?
Raised 2026-08-21. The user asked to "full publish with frontend as is," which was interpreted
as: ship a working frontend against the current API without a build pipeline, rather than wait
on a framework decision. Delivered as plain HTML/CSS/vanilla JS served statically from
`app/public/`, restyled to match the legacy app's actual design system (see
`agents/current-state.md`). This covers Projects/Buildings/Reserves/EDL-notes/Users/Logs but not
EDL photo upload, work-fields, or the scheduling engine. Not yet decided: whether to keep
extending this by hand, or switch to React/Vite once the API surface is more complete. Lean
toward continuing vanilla as long as it stays manageable — revisit if per-page logic starts
duplicating significantly.

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
