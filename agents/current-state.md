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
migrated to Node.js + Express + PostgreSQL (Prisma), developed locally in this sandbox.

- Legacy source: `extracted/Web APP/` (unzipped client export) —
  `extracted/Web APP/WepAPP.json` is the raw clasp export;
  `extracted/Web APP/apps-script-src/` is that same export flattened to plain `.js`/`.html`
  files for reading; the 11 `.xlsx` files are point-in-time snapshots of the live Sheets.
- New app: `app/` — plain Express app (no monorepo/build step), Prisma ORM, vanilla-JS frontend
  served as static files from `app/public/`. See `app/README.md` for setup, `app/TODO.md` for
  the phase-by-phase migration plan (this file is the narrative; `app/TODO.md` is the checklist —
  keep both in sync when either changes).

## What's built (2026-08-21 session)

1. **Analysis**: parsed the Apps Script export (routing, auth model, all 11 server modules) and
   the 11 xlsx schema files via two parallel forked subagents, condensed into `app/TODO.md`
   Phase 0 and used to design `app/prisma/schema.prisma` (~25 models).
2. **Local dev stack, working end to end**: Postgres 17 installed natively (no Docker daemon in
   this sandbox), migrated (`app/prisma/migrations/20260821093802_init`), seeded
   (`admin@example.com` / `changeme123`, 11 roles matching the legacy Permissions sheet).
3. **API**: Express + JWT (httpOnly cookie) auth with a `canEdit` role gate mirroring the legacy
   `assertCanEdit_`. Routes: auth, projects, buildings/units, reserves, EDL (notes + photo upload
   + dynamic work-fields), users/roles admin, activity/error logs.
4. **Scheduling engine**: domino-shift reschedule + two-phase analyze/execute task-type deletion,
   ported from the legacy `Planing_Code.js` via a scoped `codex exec` task run in an isolated git
   worktree (branch `codex/schedule-domino-shift`), reviewed and merged into `master`.
5. **Two real schema/route bugs found and fixed** by actually running end-to-end curl tests
   (not just `node --check`): `projects.routes.js` and `reserves.routes.js` still referenced
   fields from an early draft schema (`address`, `title`, `priority`, `assigneeId`, a direct
   `projectId` on `Reserve`) that don't exist in the final `schema.prisma`. Rewritten to match.
6. **Frontend v1**: a minimal built-in frontend at `app/public/` — plain HTML/CSS/vanilla JS, no
   build step, no framework, served directly by Express as static files, same-origin
   cookie-based auth (no separate token handling needed). Covers Projects, Buildings/Units,
   Reserves, EDL notes, Users (read-only), Logs.
7. **Frontend restyled to match the legacy app's actual design system** (not guessed): a forked
   subagent read the legacy HTML/CSS (`ClientLib.html`, `Header.html`, `Sidebar.html`,
   `Login.html`, `ProjectDashboard.html`, etc.) and extracted the real design system — Tailwind
   utility classes + Google Fonts (Inter, Material Symbols Outlined), brand name "Ehden Vision",
   primary blue `#0d59f2` / corporate blue `#004595`, sidebar (280px) + header (64px) admin
   shell, status chips (`chip-active`/`chip-blocked`/`chip-ended`/`chip-archived`). Ported into
   `app/public/style.css`/`index.html`/`app.js` as plain CSS custom properties (the legacy app
   has no `:root` variable block — it's all inline Tailwind config, consolidated here).
8. **Access documented** in `app/README.md`: local dev URL/credentials, and an explicit
   placeholder (not fabricated credentials) for the intended production host,
   `michel.optima-tech.info`.

## Sandbox-specific facts learned this session

See `CLAUDE.md`'s "sandbox-specific gotchas" section — no Docker daemon, `node --watch` doesn't
reliably detect file changes here, `pkill -f` is unreliable (kill by PID instead), server must
bind `0.0.0.0` for the sandbox's external proxy to reach it.

## Not yet done

See `app/TODO.md` for the full list. Highest-value next items: `UserProjectAccess` enforcement
(any authenticated user can currently read any project), Configurations CRUD, EDL photo
upload/work-fields/scheduling wired into the frontend, and a decision on whether this vanilla-JS
frontend is the long-term answer or a placeholder for a real SPA.
