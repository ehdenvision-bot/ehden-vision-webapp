# Current State

Last updated: 2026-08-21. This file was rewritten from scratch on that date — it previously
contained unrelated content from a different project ("Mokhtar"/civil-registry SaaS) written by
a stray Codex process that happened to have its working directory pointed at this repo; see the
resolved-decisions section of `agents/decisions.md` for that incident. Nothing below predates
2026-08-21.

## Project

A construction-site-management web app (projects → buildings → units/common-areas/facades, a
per-project scheduling engine, reserves/punch-list tracking, EDL — état des lieux / move-in-out
inspections — RBAC, activity logs), branded **"Ehden Vision"**. Originally a Google Apps Script
web app backed by 7 Google Sheets spreadsheets (as DB) and Google Drive (as file storage). Being
migrated to Node.js + Express + PostgreSQL (Prisma) + React, developed locally in this sandbox.

- Legacy source: `extracted/Web APP/` (unzipped client export) —
  `extracted/Web APP/WepAPP.json` is the raw clasp export;
  `extracted/Web APP/apps-script-src/` is that same export flattened to plain `.js`/`.html`
  files for reading (all 27 HTML pages + 11 server modules read and specified this session); the
  11 `.xlsx` files are point-in-time snapshots of the live Sheets.
- New app: `app/` — Express API (`app/src/`) + a separate React frontend (`app/frontend/`, Vite +
  Tailwind v4 + React Router + TanStack Query). See `app/README.md` for setup, `app/TODO.md` for
  the phase-by-phase migration plan (this file is the narrative; `app/TODO.md` is the checklist —
  keep both in sync when either changes).

## What's built, in build order (2026-08-21 session — a single long session)

1. **Analysis**: parsed the Apps Script export (routing, auth model, all 11 server modules) and
   the 11 xlsx schema files via two parallel forked subagents, used to design
   `app/prisma/schema.prisma` (~25 models).
2. **Local dev stack, working end to end**: Postgres 17 installed natively (no Docker daemon in
   this sandbox), migrated, seeded (`admin@example.com` / `changeme123`, 11 roles matching the
   legacy Permissions sheet).
3. **Core API**: Express + JWT (httpOnly cookie) auth with a `canEdit` role gate mirroring the
   legacy `assertCanEdit_`. Routes: auth, projects, buildings/units, reserves, EDL, users/roles
   admin, activity/error logs.
4. **Scheduling engine**: domino-shift reschedule + two-phase analyze/execute task-type deletion,
   ported from the legacy `Planing_Code.js` via a scoped `codex exec` task in an isolated git
   worktree, reviewed and merged.
5. **Vanilla-JS frontend v1, then fully replaced** — see next section. The vanilla version
   (`app/public/`) no longer exists; superseded, not extended.
6. **Full React rebuild** ("read all html files and replicate them in the frontend", stack
   settled mid-task as "react + plugins" → confirmed Vite/Tailwind v4/Router/Query): all 27
   legacy HTML pages read via 5 parallel forked analyses (auth/portfolio/support/header/sidebar;
   dashboard/locataires; settings; planning; EDL) before writing any code. Pages built: Login,
   ResetRequest, Reset, SupportLogin, Support, Portfolio, Dashboard, Locataires (3-tab
   units/common-areas/facades + edit modal), Reserves, EDL (3-tab notes/travaux/réserves),
   Users, Logs, Settings (holiday calendar), Planning (scoped-down v1 Gantt). Four of these
   (EDL, Users+Logs, Settings, Planning) were built by parallel forked subagents against the
   shared, already-verified API and design conventions, then reviewed.
7. **New backend routes added to support the rebuild**: `/api/auth/reset-request` +
   `/api/auth/reset` (password reset, nodemailer-backed, anti-enumeration),
   `/api/buildings/locataires/:projectId` + contact/planning-write routes,
   `/api/schedule/{disciplines,teams,task-types,cycles,entries}` CRUD,
   `/api/settings/holidays/*` (French-holiday auto-calculation ported from
   `Settings_Code.js`'s Gauss algorithm + custom holiday CRUD), `/api/edl/work-fields` admin CRUD,
   `/api/reserves?unitId=` filter.
8. **Schema changes found necessary while building real pages** (migration
   `20260821130000_locataires_planning_and_calendar_fields`): `Unit`/`CommonArea`/`Facade` gained
   `planningStatus`/`notePublic`/`notePrivate`; `Tenant.phone` split into
   `phoneFixed`/`phoneMobile1`/`phoneMobile2` + `email2`; `CalendarException.type` replaced with
   `isFixed: Boolean` and its unique constraint widened to `[projectId, date, description]`.
9. **Two real schema/route bugs found and fixed earlier in the session** by actually running
   end-to-end curl tests (not just `node --check`): `projects.routes.js`/`reserves.routes.js`
   referenced fields from an early draft schema that no longer existed. Rewritten to match.
10. **Access documented** in `app/README.md`: local dev URLs/credentials (API :3000, frontend
    dev server :5173), and an explicit placeholder (not fabricated credentials) for the intended
    production host, `michel.optima-tech.info`.

## Deliberately deferred (not silently dropped — see `app/TODO.md` Phase 5 for the full list)

Mobile page variants; Planning's contiguity-radar reschedule strategy picker, Cycles
dependency-link editor (FS/SS + lag), and Interventions plan-pin sub-system; EDL's interactive
pin-on-plan-image placement; `processProjectGeneration` (Planning date-grid regeneration, no
endpoint exists); task-instance status updates from the Planning UI (no endpoint exists, shown
read-only with a tooltip, not silently broken); `UserProjectAccess` enforcement; a generic
`AppSetting`/Configurations CRUD (distinct from the holiday-calendar settings that do exist).

## Not visually confirmed

No browser automation tool has been available in this session (`claude-in-chrome` reports the
extension isn't connected) — every page was verified via a clean `vite build`, curl-based
end-to-end API testing, and manual code review, but never actually rendered and looked at. The
user should confirm visually before treating the frontend as fully done.

## Sandbox-specific facts learned this session

See `CLAUDE.md`'s "sandbox-specific gotchas" section — no Docker daemon, `node --watch` doesn't
reliably detect file changes here, `pkill -f` is unreliable (kill by PID instead), server must
bind `0.0.0.0` for the sandbox's external proxy to reach it, `prisma migrate dev` doesn't work
non-interactively (use `prisma migrate diff --script` + apply manually + `migrate resolve
--applied`, see `agents/runbook.md`).
