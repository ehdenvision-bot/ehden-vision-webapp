# TODO — Chantier WebApp migration

The phase-by-phase migration checklist lives in `app/TODO.md` (it sits next to the code it
tracks, so it's less likely to drift). This file is just the short "what's actually next" view —
keep it in sync with `app/TODO.md` when either changes, don't duplicate the full detail here.

# Pending — highest value first

## 🔴 `UserProjectAccess` enforcement not wired into route queries
Any authenticated user can currently read any project's data. See
`agents/decisions.md`'s open decisions.

## 🟡 Configurations CRUD
`AppSetting` model exists, no routes yet.

## 🟡 Wire EDL photo upload / work-fields / scheduling into the frontend
All three have working API endpoints (`/api/edl/photos/*`, `/api/edl/work-*`,
`/api/schedule/*`) but no UI yet — `app/public/` currently covers Projects, Buildings/Units,
Reserves, EDL notes, Users (read-only), Logs.

## 🟡 Decide: keep extending the vanilla-JS frontend, or move to a real SPA
See `agents/decisions.md` open decisions — leaning toward continuing vanilla for now.

## 🟢 Legacy password hash migration strategy
Not blocking yet (only the dev seed user exists). Matters once Phase 3 (real data migration)
starts.

## 🟢 Confirm scope of `Rapport`/`RapportMobile`/`SettingsMobile`
Routed in the legacy app but no matching HTML exists in the export — confirm with the user
whether these are in scope before building them.

# Backlog / Someday

- Phase 3: real data migration from the live Google Sheets (not the point-in-time `.xlsb`/xlsx
  snapshots in `extracted/`)
- Phase 6: tests, input validation coverage, rate limiting review, a real `Dockerfile` for the
  app itself
