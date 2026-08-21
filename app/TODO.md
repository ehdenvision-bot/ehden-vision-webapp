# Migration TODO — Apps Script + Sheets → Node.js + PostgreSQL

Source app: Google Apps Script web app (clasp export, extracted to plain
files at `../extracted/Web APP/apps-script-src/`), data stored in 7 Google
Sheets spreadsheets (11 exported xlsx snapshots in `../extracted/Web APP/`),
photos/plans in Google Drive. Domain: construction-site management —
projects → buildings → units/common-areas/facades, a per-project
scheduling engine (disciplines/teams/task types/cycles), reserves
(punch-list, with autocontrole/reserve kinds), EDL (état des lieux /
move-in-out inspections, incl. a dynamic "Config Travaux" form-field
system), role-based access, activity + error + permission-audit logs.

Local dev: Postgres 17 installed natively (no Docker daemon available in
this sandbox — `docker-compose.yml` is kept for environments that do have
one). DB `chantier` / role `chantier`, see `.env`.

## Phase 0 — Analysis — DONE
- [x] Route table from `doGet` in `Pages.js`: query-param routed
      (`?page=X&view=desktop|mobile&session=TOKEN`), single entry point.
      ⚠️ Source has `DEV_MODE = true` hardcoded, bypassing auth entirely —
      must NOT be ported.
- [x] Auth: custom `HASHv1:<saltHex>:<hashHex>` SHA-256 password hashing
      (not bcrypt) in `Login_Code.js`; sessions are opaque tokens in
      `CacheService` (in-memory, 6h TTL) — ephemeral, not DB-backed.
      `assertCanEdit_(token, projectId)` gates every mutation: role must be
      admin/directeur/collaborateur AND `project.status === 'active'`.
      → ported as `requireAuth` + `requireCanEdit` in `app/src/middleware/auth.js`.
- [x] Sheet columns for all 11 workbooks → captured in `prisma/schema.prisma`.
- [x] Drive folder layout: `01- Plans/` (plan images, resolved by naming
      convention), project logos named `<projectId>.<ext>` in the root
      folder, EDL photos uploaded base64 → Drive file + a row in
      `EDL Photos`. → mapped to local `uploads/` + `filePath` columns
      (`PlanAsset`, `EdlPhoto`).
- [x] Email: `MailApp`/Gmail scopes used for password-reset only → SMTP via
      nodemailer, see `.env.example`.
- [x] No other external API calls found.
- [ ] Two routed pages have no matching HTML in this export (`Rapport`,
      `SettingsMobile`, `EDLMobile`) — confirm with the user whether these
      are in-scope before building them.

## Phase 1 — Local dev environment — WORKING END TO END
- [x] `app/` skeleton: Express API, Prisma
- [x] Postgres running natively on :5432 (`chantier`/`chantier`)
- [x] `npx prisma migrate dev` applied (`prisma/migrations/20260821093802_init`)
- [x] `npm run db:seed` (creates `admin@example.com` / `changeme123`, seeds
      the 11 roles found in `05- Permissions.xlsx`)
- [x] Verified: `/health`, `POST /api/auth/login`, `/api/auth/me`,
      `/api/projects`, `/api/users`, `/api/logs`, `/api/buildings` all
      round-trip correctly against Postgres.

## Phase 2 — Data model — v1 IN `prisma/schema.prisma`, review before real migration
Covers: AppSetting, Role/User/Session/PasswordResetToken, Project/
UserProjectAccess, Building/Unit/Tenant/UnitTypeRoomConfig/CommonArea(Type)/
Facade(Type), Discipline/Team/TaskType/TaskCycle/CalendarException,
Reserve, EdlNote/EdlPhoto/WorkFieldDefinition/WorkFieldValue, ActivityLog/
ErrorLog/PermissionAuditLog, PlanAsset.

- [x] Biggest modeling call made: the source "Planning"/"Recap"/"Notes"/
      "Avancement" sheets are wide date-grid tables (~450 day-columns).
      Normalized here into `ScheduleEntry` (one row per unit×task×date) and
      `TaskProgress` (one row per unit×task with target/completion dates,
      notes, status) instead of replicating the wide-sheet shape.
- [ ] `WorkFieldValue`/`WorkFieldDefinition` is EAV-style (driven by
      `Config Travaux`) — fine for v1, revisit if it gets unwieldy.
- [ ] `Tenant` is split out from `Unit` (source mixed both in one
      "Locataires" row) — confirm whether tenant history (not just current)
      matters, `isCurrent` flag is there but unused so far.
- [ ] Legacy password hashes: `User.legacyPasswordHash` field exists but no
      verifier/migration-on-login flow implemented yet.

## Phase 3 — Data migration (not started)
- [ ] Script to export each of the 7 live Google Sheets to CSV/JSON (Sheets
      API) — the 11 xlsx files in `extracted/` are a point-in-time snapshot,
      re-pull fresh before the real cutover
- [ ] ETL script (Node) → Postgres via Prisma; keep an old-ID → new-UUID
      mapping table during migration
- [ ] Migrate Drive photos → `uploads/` (or S3), preserve categories,
      populate `PlanAsset`/`EdlPhoto`

## Phase 4 — API surface
- [x] Auth (login/logout/me) — JWT httpOnly cookie + bcrypt
- [x] Projects CRUD
- [x] Reserves CRUD
- [x] Buildings + Units CRUD (read + create)
- [x] EDL notes, EDL photo upload (multer → local `uploads/`), work-field
      definitions + values
- [x] Users + roles admin (list/create/update, admin-only)
- [x] Logs: activity log + error log, read/filterable
- [x] Scheduling engine (`/api/schedule`): domino-shift reschedule, two-phase
      analyze/execute task-type deletion — ported from `Planing_Code.js` via
      a scoped Codex task in an isolated worktree, reviewed, and merged.
- [x] Fixed: `projects.routes.js` and `reserves.routes.js` originally
      referenced stale fields from an early schema draft (`address`,
      `title`, `priority`, `assigneeId`, direct `projectId` on `Reserve`)
      that don't exist in the final `schema.prisma` — caught via manual
      end-to-end curl testing, not caught by `node --check` (syntax-only).
      Rewrote both to match the real schema; `Reserve` is now filtered by
      project via `unit/commonArea/facade → building → projectId`, and a
      `code` is auto-generated on create (`genCode()`) since the legacy
      `A-L-000001`/`R-L-000001` sequence numbering wasn't ported.
- [ ] Configurations (dropdown lists / app settings) CRUD
- [ ] `UserProjectAccess` enforcement (currently any authenticated user can
      read any project — source app scoped by `Access` sheet, not yet
      wired into route queries)
- [ ] Two-phase analyze/execute pattern for reserve/unit deletions
      elsewhere too, if used beyond scheduling (check `Planing_Code.js`
      more broadly)
- [ ] Cascading interventions/EDL correction workflow from `EDL_Code.js`
      (`gsCorrectIntervention*`) not yet ported

## Phase 5 — Frontend
- [x] v1 shipped "as is": a minimal built-in frontend at `app/public/`
      (plain HTML/CSS/vanilla JS, no build step, no framework), served
      directly by Express as static files at `/`. Covers: login, Projects
      (list/create), Buildings/Units (list/create), Reserves (list,
      filter by project), EDL notes (view/edit per unit), Users (admin
      read-only list), Logs (activity feed). Auth uses the same
      httpOnly-cookie session as the API (`credentials: "same-origin"`
      fetch calls) — no separate token handling needed since it's
      same-origin. UI gates edit forms on `currentUser.canEdit` and hides
      the Users tab for non-Admins.
- [ ] Not yet in the UI: EDL photo upload, work-fields, scheduling
      (`/api/schedule`), user create/edit forms, project edit/delete,
      reserve create/edit beyond the basic list, error-log viewer.
- [ ] This is intentionally not a 1:1 recreation of the legacy pages
      (login/reset, project portfolio + dashboard, mobile views,
      planning UI) — revisit whether a real SPA (React/Vite) is worth it
      once the API surface is more complete, or keep extending this
      vanilla version.

## Phase 6 — Hardening
- [ ] Input validation on all routes (express-validator is a dependency,
      only used on `/auth/login` so far)
- [ ] Rate limiting / review helmet config
- [ ] Tests (none yet — at least cover auth + the schedule engine once
      merged, since that's the highest-risk ported logic)
- [ ] `Dockerfile` for the app itself (docker-compose currently only
      defines Postgres/Adminer, and wasn't actually usable in this sandbox
      — no Docker daemon — so it's unverified; native Postgres install was
      used instead for local dev)
- [ ] CI (lint/test) — optional
