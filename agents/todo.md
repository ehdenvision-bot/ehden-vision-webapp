# TODO

Full migration plan, in execution order. Each phase is meant to be pickable up independently —
read `agents/decisions.md`'s 2026-08-25 entries first for the *why* behind the architecture
below; this file is the *what*, concretely.

## Architecture (read before touching any phase below)

- **Templates**: served straight from `Webapp Files/*.html` (never copied into `app/`) via an
  Express render engine reusing `tools/local-preview/server.js`'s `resolveIncludes()`
  (`include_()` tag resolution). One template source, zero drift from the live GAS app.
- **Per-request data**: `app/src/pages.js` (new) reimplements `Pages.js`'s `doGet()` exactly —
  same `data` object shape, same public-page list, same routing table — sourced from Postgres
  instead of Sheets/CacheService. Injected into templates via the existing
  `<?!= JSON.stringify(data || {}) ?>` tag (already in `ClientLib.html`, becomes `APP_DATA`
  client-side) — don't reinvent this contract, it's already there.
- **RPC, not REST**: a generic `POST /rpc/:fn` dispatcher against a registry
  (`app/src/rpc/registry.js`) of Node async functions named and signatured identically to their
  Apps Script originals (`gsListProjects(token)`, `gsLoginWithEmailPassword(email, password)`,
  ...). Client-side, a `google.script.run` shim (replaces `tools/local-preview`'s no-op stub,
  same chainable `.withSuccessHandler/.withFailureHandler/.withUserObject` shape) forwards
  `google.script.run.<fn>(...args)` to `POST /rpc/<fn>` with the args array and calls the
  matching handler on response. Session token travels as a plain argument (client already does
  this via `localStorage.sessionToken` — see `ClientLib.html`), not a cookie.
- **Per module, the actual porting recipe**:
  1. Read the module's `*_Code.js` end-to-end for real column/table layout — don't guess.
  2. Grep the module's `*_Scripts_*.html` for `google.script.run\.` to get the true
     client-callable surface (the function list in `agents/decisions.md` is a rough census from
     top-level declarations, not this — some are internal helpers, confirm per module).
  3. Model/extend the Postgres schema for that module's sheet(s) (migration file, same header-
     comment-with-column-mapping convention as the existing `app/migrations/*.js`).
  4. Port each public function 1:1 into `app/src/rpc/registry.js` (or a per-module file it
     requires), preserving behavior — including existing bugs/quirks, unless a bug is found and
     fixed per `CLAUDE.md`'s "fix bugs when you find them," in which case say so explicitly.
  5. Verify against the real page through the proxy in a real browser, not just `curl` — the
     proxy-prefix bug class from earlier today is invisible to `curl`-against-localhost.

## ✅ Phase 0 — Foundation — done 2026-08-25

- [x] `app/src/render.js`: `resolveIncludes()` ported, pointed at `Webapp Files/` directly.
- [x] `app/src/pages.js`: `doGet()` reimplemented — full routing table, public-page allowlist,
  `data` object shape. `DEV_MODE` defaults `false` (env var `DEV_MODE=true` to opt in locally).
- [x] `app/src/rpc/dispatch.js` + `app/src/rpc/registry.js`: generic `POST /rpc/:fn` dispatcher,
  error shape verified (`{message}` on throw → client shim raises `Error(message)`).
- [x] Client shim in `render.js` (`GOOGLE_SCRIPT_RUN_SHIM`): real `google.script.run`, calling
  `/rpc/<fn>`.
- [x] `gsLoginWithEmailPassword`, `gsLogout`, `gsListProjects` re-homed into
  `app/src/rpc/registry.js`. Old cookie/REST routes (`app/src/routes/`) deleted.
- [x] `app/src/server.js` rewired: `/rpc` + `/` (pages) only, no static frontend serving.
- [x] **Verified end-to-end through the real proxy in the user's actual browser**: literal
  `Login.html` renders (background photo, SweetAlert2, real Tailwind tokens — confirmed
  matching the real app, not the retired React version), login succeeds, lands on
  `ProjectPortfolio.html` with real seeded project data.
- [x] **Bug found and fixed during verification**: `getSession()` passed a malformed token
  straight into a `uuid`-typed Postgres column, leaking a raw `invalid input syntax for type
  uuid` error instead of the correct "Session expirée" message. Fixed with a UUID-shape guard in
  `app/src/session.js` before querying — see that file's comment.

## Phase 1 — Auth & portfolio pages (in progress)

Already have the backend logic (Phase 0 re-homes it) — this phase is mostly template wiring:
- [x] Login — verified end-to-end through the real proxy (Phase 0).
- [x] ProjectPortfolio — verified end-to-end through the real proxy (Phase 0). Photo/thumbnail
  lookup still explicitly skipped — see the file/photo storage item below.
- [ ] Reset, ResetRequest — templates not yet wired; `gsRequestPasswordReset`/`gsResetPassword`
  still need real implementations (password reset was never ported, only scaffolded as a DB
  table).
- [ ] SupportLogin, Support — not yet wired, functions not yet identified/read.
- [ ] ProjectDashboard + ProjectDashboardMobile — read `Projects_Code.js`/whatever backs the
  dashboard specifically (not yet identified — check what `?page=project-dashboard` actually
  needs beyond what `gsListProjects` provides).

## ✅ Phase 2 — Locataires — done 2026-08-25, verified through the real proxy in a real browser

Confirmed client-callable surface (grepped `Locataires_Scripts.html`/`LocatairesMobile.html`):
`getLocatairesPageData`, `updateLocataireData`, `updatePlanningOnlyData` — all three ported into
`app/src/rpc/locataires.js` and verified via `curl` against `/rpc/*` (read, write, formatting
fidelity — nom uppercase, prenom proper-case, phone spacing all match the original exactly,
error messages match, planning-notes view-routing confirmed for both the default and explicit
`communs` paths). Schema: `app/migrations/*create-locataires.js` (`locataires`,
`parties_communes`, `facades`, `config_facades`, `planning_notes` — the last one is
deliberately scoped to just what this module needs, Phase 5 will extend the Planning
spreadsheet's data model further, not duplicate it).

- [x] `getLocatairesPageData(token)` — reads all 4 Bâtiments-spreadsheet sheets + merged
  planning notes.
- [x] `updateLocataireData(token, projectId, payload)` — writes contact fields + planning note,
  `assertCanEdit`-gated (ported to `app/src/security.js`, shared across future write-ops).
- [x] `updatePlanningOnlyData(token, projectId, view, payload)` — writes planning note only,
  explicit view routing (communs/facades/default).
- [x] Verified in the user's actual browser through the real proxy: Locataires page renders
  and shows the seeded tenant correctly.

## ✅ Phase 3 — Settings — done 2026-08-25, verified via curl (not yet browser-checked)

Confirmed client-callable surface by grep (Settings.html only — `getPlanningMeta`/
`getPlanningChunk`/`getTaskSettings` are dead code, not ported). All 9 real functions ported
into `app/src/rpc/settings.js` and verified via `curl`: `getSettingsState`,
`processProjectGeneration` (grid creation, correct dates, data-loss-prevention guard confirmed
to actually block), `getHolidaysFromSheet`, `updateHolidaysInSheet`, `insertCustomHoliday`,
`deleteHolidayFromSheet`, `updateCustomHoliday`, `updateSingleHolidayStatus`,
`gsCheckTasksOnDates`. Schema: `app/migrations/*create-settings.js`.

- **Two real bugs found and fixed** — see `agents/decisions.md`'s matching entry for the full
  writeup: (1) the original's `'Planning Commun'`/`'Planning Communs'` naming mismatch (fixed to
  the consistent spelling, not preserved — a typo, not intended behavior); (2) a timezone bug
  introduced by the port itself during this session, caught by verification before it shipped
  (`app/src/db.js`'s date type parser, `app/src/server.js`'s `TZ=UTC` lock).
- `?page=settings&view=mobile` remains a known-missing route (`SettingsMobile.html` doesn't
  exist in the original either) — preserved as-is, not invented.
- [ ] **Not yet done**: not checked in a real browser through the proxy yet (Settings.html
  confirmed to render via `curl` → 200 only).

## Phase 4 — EDL (38 functions — the 6-layer Workspace)

`EDL_Code.js`. Only EDL, Travaux, and Réserves layers are implemented in the original — Élec,
Sanit, Formulaires are intentional stubs (`EDL_Scripts_4.html`), don't over-build those. Includes
photo upload (`uploadEDLPhoto`, base64-encoded) — same file/photo storage decision as Phase 1
applies here too, resolve it once, not per-phase. `?page=edl&view=mobile` is a known-missing
route in the original (`EDLMobile.html` doesn't exist) — preserve, don't invent.

## Phase 5 — Planning + Planning Mobile (69 functions combined — largest phase, split further when started)

`Planing_Code.js` (yes, misspelled, that's the real filename) + `Planning_Mobile_Code.js`.
Tasks, disciplines, équipes, cycles, drag/shift domino cascade, interventions. Largest single
chunk of the migration — break this phase into its own sub-list (task CRUD, discipline/équipe
CRUD, cycle CRUD, the domino-shift engine, mobile variants) once it's actually started; don't
try to plan it in full detail this far ahead of touching it.

## Phase 6 — Universal log (Logs.js, 3 public functions + private helpers)

`gsWriteUniversalLog`, `gsWriteErrorLog`, `gsGetUniversalLog`. Real server-side security
boundary (Public/Private visibility, recursive `priv*`-key stripping for client sessions) — port
exactly, don't loosen it. Straightforward once the `Logs_<module>` table shape is modeled.

## Cross-cutting, resolve once (not per-phase)

- 🟡 **File/photo storage** — Drive folder in the original (project thumbnails, EDL photos).
  Needs one real decision (S3-compatible bucket? local disk + reverse proxy? read from Drive via
  API?) applied everywhere it's needed, not re-decided per phase.
- 🟡 **Known-missing routes in the original** (`rapport` entirely, `EDLMobile.html`,
  `SettingsMobile.html`) and **dead sidebar links** (`passage`, `sous-traitants`, `avancement`,
  `opr`, `synoptiques`, `quitus`, `reclamations`, `satisfaction`, `plans`, `documents` — no case
  in `doGet`'s switch at all) — preserve these gaps faithfully in the migration rather than
  silently filling or silently carrying them as dead links; if the user wants any of these
  actually built, that's new scope, not migration.
- 🔴 **`DEV_MODE`** — folded into Phase 0 above, default `false` in the rewrite regardless of
  the live app's current `true`.
- 🟡 **Browser-served vs Apps Script-hosted** — `/bridge/rpc` (added 2026-08-31) makes the
  "keep the app on Google Workspace, Postgres just for data" model possible server-side. Which
  model is the target is unresolved — see `agents/decisions.md` "Open Decisions". If the bridge
  model is chosen, each phase's port also needs: a one-time sheet->Postgres importer and
  forwarding the module's client-callable `*_Code.js` functions to a `callApi_` helper in
  `Webapp Files/`. Blocked on that decision + a public HTTPS host for `app/`.

*(This list should track `agents/decisions.md`'s open decisions and whatever's actually next —
don't pad it out for its own sake.)*

# Backlog / Someday

*(Empty for now.)*
