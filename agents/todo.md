# TODO — Chantier WebApp migration

The phase-by-phase migration checklist lives in `app/TODO.md` (it sits next to the code it
tracks, so it's less likely to drift). This file is just the short "what's actually next" view —
keep it in sync with `app/TODO.md` when either changes, don't duplicate the full detail here.

# Pending — highest value first

## 🔴 Get real visual/browser confirmation of the React frontend
Built and verified via `vite build` + curl-based API testing + code review only — nothing has
actually been rendered and looked at (`claude-in-chrome` extension not connected this session).
Confirm the pages actually look and work right in a real browser before treating Phase 5 as done.

## 🔴 `UserProjectAccess` enforcement not wired into route queries
Any authenticated user can currently read any project's data. See
`agents/decisions.md`'s open decisions.

## 🟡 Task-instance status updates in Planning
`Planning.jsx`'s reschedule panel has a read-only status field — no `gsUpdateTaskStatus`
equivalent endpoint was ported. Add one when Planning gets its next pass.

## 🟡 Configurations CRUD
`AppSetting` model exists, no routes yet (distinct from the holiday-calendar settings, which
now do have routes).

## 🟢 Legacy password hash migration strategy
Not blocking yet (only the dev seed user exists). Matters once Phase 3 (real data migration)
starts.

## 🟢 Confirm scope of `Rapport`/`RapportMobile`/`SettingsMobile`
Routed in the legacy app but no matching HTML exists in the export — confirm with the user
whether these are in scope before building them.

# Backlog / Someday

- Planning's deferred sub-features (contiguity-radar reschedule, Cycles dependency editor,
  Interventions plan-pin marking) — each independently substantial, see `app/TODO.md` Phase 5
- EDL's interactive pin-on-plan-image placement (currently a plain form)
- `processProjectGeneration` (regenerating the Planning date-grid) — no endpoint yet
- Mobile page variants — deprioritized throughout, not built for any page
- Phase 3: real data migration from the live Google Sheets (not the point-in-time `.xlsb`/xlsx
  snapshots in `extracted/`)
- Phase 6: tests, input validation coverage, rate limiting review, a real `Dockerfile` for the
  app itself
