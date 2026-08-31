# Current State

Last updated: 2026-08-31.

## 2026-08-31 — git remote created; Windows clone + sandbox merged; Locataires bridge (Apps Script side) started

- **Remote**: `https://github.com/ehdenvision-bot/ehden-vision-webapp.git` (private). First
  commit `e40e54f` pushed from the sandbox. This is now the single source of truth — the
  project had no commit history or off-machine backup before today.
- **Two diverged working copies were merged.** A separate Windows machine held a `clasp`-based
  working copy in a folder named `Webapp/` (this repo standardises on **`Webapp Files/`**).
  Diff: identical except the Windows copy had **newer** `EDL.html`, `EDL_Code.js`,
  `EDL_Scripts_1..4.html`, `Logs.js` (EDL-layer + Logs `Role`-column work its 491-line
  `progress-log.md` documents), plus `agents/edl-{architecture,page-spec,todo}.md`. Those
  newer files + docs were taken into `Webapp Files/` / `agents/`; the sandbox's more-developed
  `decisions.md` / `runbook.md` / `todo.md` / `CLAUDE.md` / `architecture.md` were kept.
  Full pre-merge snapshot: `../Webapp Text VB _pre-sync-backup/` on the Windows machine.
  - **⚠ Unverified against live.** `clasp` has never been logged in in either environment, so
    no copy of `Webapp Files/` is confirmed current with the deployed Apps Script project. The
    6 EDL/Logs files above are *believed* newer (they came from the clasp-based stream) but
    **run `clasp pull` and diff before any `clasp push`** — see `agents/todo.md`.
- **Locataires bridge — Apps Script side (local only, not pushed, no behaviour change):**
  - `Webapp Files/ApiClient.js` (new) — `callApi_(fnName, args)` → `POST
    {API_BASE_URL}/bridge/rpc/<fn>` with `X-Api-Key`; returns `body.result` on 2xx else throws
    `body.message`. Config from Script Properties (`API_BASE_URL`, `API_SHARED_SECRET`) read
    every call; nothing hardcoded. `apiHealthCheck_()` helper for editor testing.
  - `Webapp Files/Locataires_Code.js` — `getLocatairesPageData` / `updateLocataireData` /
    `updatePlanningOnlyData` are now flag-gated dispatchers (same client-callable names): run
    the existing `getSession_` / `assertCanEdit_` check, then route on
    `USE_API_LOCATAIRES==='true'` (unset/false → the unchanged `*_sheets_` bodies).
  - `backups/Locataires_Code.pre-api.js` — verbatim pre-refactor copy.
  - Server side (`app/src/rpc/locataires.js`, migration `...003_create-locataires.js`) is
    **already fully ported** in the sandbox build — the `app/README.md` "not ported" line is
    stale. Remaining for the trial: create Postgres tables + one-time data load, set
    `APPSCRIPT_SHARED_SECRET`, host `app/` publicly, then flip `USE_API_LOCATAIRES`.

## Project

**Ehden Vision** (working title shown in the UI/emails — confirm this is the real product
name) — a French-language construction/renovation project-management web app: tenant
("Locataires") and building info, a multi-view construction Planning/Gantt across three
sub-views (logements / parties communes / façades), a 6-layer per-lot "Workspace" (EDL = état
des lieux, Travaux, Élec, Sanit, Réserves/Autocontrôle, Formulaires), a punch-list ("Réserves")
workflow, and a universal cross-module audit log. Originally, and still also, a Google Apps
Script web app, developed and tested directly against Google Workspace. A Node.js + PostgreSQL
rewrite is now being built in parallel (started 2026-08-25 — see `agents/decisions.md`).

- **Live source: `Webapp Files/`** — a `clasp clone` of the actual deployed Apps Script project. This
  is the real, editable app right now, not a legacy or reference copy. Stays fully intact and
  deployed — the rewrite below is a parallel build, not a cutover. The user has since populated
  its real Google Sheets with actual data.
- **Rewrite: `app/`** — Node.js + Express + PostgreSQL, started 2026-08-25 (second backend
  attempt; the first, Prisma-based one was abandoned and removed earlier the same day — see
  `agents/decisions.md`). Serves on port **3001**
  (`https://michel.optima-tech.info/proxy/3001/` for online testing — **not** port 3000, see
  `agents/runbook.md`).
  - **Frontend approach reversed same day**: a recovered React SPA (commit `14ddb41`) was tried
    and retired again — it was a reinterpretation (different design tokens, missing pieces),
    not a faithful copy, and the objective is a complete, exact migration. Current approach:
    serve `Webapp Files/*.html` directly (same templates the live GAS app uses, read in place —
    zero drift), with a `google.script.run`-compatible RPC bridge replacing Apps Script's server
    calls. See `agents/decisions.md`'s second 2026-08-25 entry for the full design and
    `agents/todo.md` for the phased build-out (~165 server functions total across all modules,
    most not yet ported).
  - **Backend logic verified so far** (auth, sessions, `users`, `projects` — password hashing
    incl. legacy `HASHv1` compat, session TTL, project-status lock) is real and being re-homed
    onto the RPC bridge, not thrown away.
  - **Apps Script -> Node bridge scaffolded 2026-08-31** (`app/src/appscript-auth.js`,
    `/bridge/rpc/*` + `/bridge/health`, `X-Api-Key` gated, fail-closed): server side of the
    "keep the app on Google Workspace, move only the DB to Postgres" option. Same RPC registry
    as `/rpc`. Nothing on the Apps Script side yet, and browser-served vs Apps Script-hosted is
    an unresolved open decision — see `agents/decisions.md`.

## What's built

Read in full during the 2026-08-25 session (every `.js` server file end to end; the HTML page
shells and `ClientLib.html` read in full; the large client-script `.html` files spot-checked via
targeted grep rather than read end-to-end — see "Not yet read" below).

- **Routing**: `Pages.js`'s `doGet(e)` — one Apps Script project, one entry point, routed by a
  `?page=` query param to a top-level `render_()` template. Each page is a full HTML document
  (not a client-rendered SPA) — navigation (`navTo`/`navToWithParams` in `ClientLib.html`) does a
  full top-window redirect, carrying the session token and project context as URL params +
  `localStorage`. Desktop and Mobile are separate templates picked by `?view=mobile`.
- **Auth**: custom email/password (`Security_Code.js`) — salted SHA-256 stored in a
  `Utilisateurs` sheet (spreadsheet id in Script Property `PERMISSIONS_SPREADSHEET_ID`).
  Sessions are a UUID token in `CacheService` (6h TTL, `SESSION_CACHE_PREFIX`), validated
  server-side on every call via `getSession_()` / the write-gate `assertCanEdit_()` (session +
  role + project-status check). Password reset is an emailed one-time `CacheService` token (1h
  TTL). Roles: `admin` / `directeur` / `collaborateur` can edit; `viseur` and anything else fall
  through to a read-only "client" account (`isClient`).
- **Data storage**: several separate Google Sheets spreadsheets, referenced only by ID via
  Script Properties (no ID hardcoded in code) — `PERMISSIONS_SPREADSHEET_ID`, `PROJECT_LIST_ID`,
  `PLANNING_SPREADSHEET_ID`, `BATIMENTS_SPREADSHEET_ID`, `RESERVES_SPREADSHEET_ID`,
  `EDL_SPREADSHEET_ID`, `LOG_SPREADSHEET_ID`, plus a Drive folder `PROJECT_PHOTOS_FILE`
  (photos/plans/icons) and `COMPANY_NAME`/`COMPANY_LOGO`. All bootstrapped from a "Script
  Properties" sheet via `Import_Properties.js:importScriptProperties()` — a one-off manual
  function, not part of the request path.
- **Pages/modules implemented**: Login, Reset/ResetRequest (email flow), Support/SupportLogin,
  ProjectPortfolio (project list), ProjectDashboard, Locataires (tenant/building data grid),
  Planning (the construction schedule: tasks, disciplines, équipes, cycles, holidays, drag/shift
  with domino cascade, interventions) — all with desktop + mobile variants. The EDL "Workspace"
  shell (`EDL.html` + `EDL_Scripts_1..4.html`) hosts 6 pluggable layers via a
  `WorkspaceCore.registerLayer()` pattern: **EDL, Travaux and Réserves are implemented**;
  **Élec, Sanit and Formulaires are intentional placeholder stubs** ("à venir", in
  `EDL_Scripts_4.html`).
- **Universal log** (`Logs.js`): every module writes to its own auto-created `Logs_<module>`
  sheet via `gsWriteUniversalLog`; read back via `gsGetUniversalLog`, which enforces
  Public/Private visibility AND strips any `details` key matching `priv*` (recursively) for
  client sessions — a real server-side boundary, separate from the staff-only "Vue Client"
  preview toggle that just simulates the same filtering client-side for QA.

## Known issues / gaps found this session (2026-08-25)

- **`Pages.js:17` — `DEV_MODE = true`.** Every request is silently given a hardcoded admin
  session (`michel.s.dahdah@gmail.com`), bypassing all real login. Flagged in the file itself as
  "MUST BE false BEFORE PRODUCTION" — worth a deliberate decision before this URL is shared with
  anyone else, not just left as-is.
- **`Settings.html` had the wrong content — FIXED 2026-08-25.** It was a byte-for-byte duplicate
  of `EDL_Scripts_4.html` (the Élec/Sanit/Formulaires stub-layer registration script). The user
  supplied the correct original (mojibake-corrupted from an upstream copy — reconstructed via an
  `iconv` CP1252↔UTF-8 round-trip plus manual patching of a handful of bytes lost somewhere
  upstream; diffed and verified text-only, no structural change) and it's now installed. Its two
  tabs ("Configuration du Projet" / "Jours Fériés") call `getSettingsState`,
  `processProjectGeneration`, `getHolidaysFromSheet`, `insertCustomHoliday`,
  `updateCustomHoliday`, `deleteHolidayFromSheet`, `updateSingleHolidayStatus`,
  `updateHolidaysInSheet`, `gsCheckTasksOnDates` — all verified to match `Settings_Code.js`'s
  signatures. **Not yet verified live** (no `clasp push` / browser check done this session — do
  that before considering this closed). `?page=settings&view=mobile` is still broken:
  `SettingsMobile.html` **doesn't exist as a file at all**, so that route throws at
  `HtmlService.createTemplateFromFile`.
- **More broken/missing routes than previously logged (confirmed 2026-08-25, via
  `tools/local-preview/server.js`'s route smoke-test)**: `?page=rapport` has **no
  implementation at all** — neither `Rapport.html` nor `RapportMobile.html` exists, so both
  desktop and mobile throw at `HtmlService.createTemplateFromFile`, unlike `settings` where only
  the mobile variant is missing. `?page=edl&view=mobile` is also broken: `EDLMobile.html`
  doesn't exist (desktop `EDL.html` is fine). `Sidebar.html`/`GlobalNavModal.html` also link to
  several more page keys with no case in `doGet`'s switch at all (`auto-controles`,
  `avancement`, `documents`, `opr`, `passage`, `plans`, `quitus`, `reclamations`, `satisfaction`,
  `sous-traitants`, `synoptiques`, plus top-level `reserves`/`travaux`/`users`) — same
  silent-fallthrough-to-portfolio behavior as before, just a longer confirmed list.
- **Sidebar links outrun `doGet`'s routing.** `Sidebar.html` / `GlobalNavModal.html` list nav
  items for `passage`, `sous-traitants`, `avancement`, `opr`, `synoptiques`, `quitus`,
  `reclamations`, `satisfaction`, `plans`, `documents` — none of these are cases in `Pages.js`'s
  `switch(page)`, so clicking them falls through to the `default` branch and silently redirects
  to ProjectPortfolio instead of erroring. Worth deciding which of these are "not built yet"
  (expected) vs. dead links to clean out of the nav.

## Not yet read end-to-end

The large client-side `.html` script files were spot-checked (grep for function inventories,
structural sanity) but not read line-by-line this session: `EDL_Scripts_1/2/3.html`,
`Planning_Scripts_1/2/3.html`, `Locataires_Scripts.html`, `LocatairesMobile.html`,
`Planning_Mobile.html`, `ProjectDashboard(Mobile).html`, `ProjectPortfolio.html`. Read these
before touching their corresponding feature in depth.

## Deliberately deferred

*(Nothing yet. For things consciously scoped out of a task rather than silently dropped — see
`agents/decisions.md`'s "Open Decisions" for the difference between a deferral and a decision
still being worked out.)*

## Sandbox-specific facts learned this session

- **`clasp` was not installed** in this sandbox until 2026-08-25 (now installed globally,
  `@google/clasp` v3.4.0) and has never been logged in (`~/.clasprc.json` didn't exist) — so
  `clasp push`/`pull` against the live Apps Script project has not actually been exercised yet
  this session despite `agents/runbook.md` describing it as the normal workflow. Needs a manual
  `clasp login --no-localhost` from the user (see `agents/runbook.md`).
- **`Webapp Files/` was never under git version control until 2026-08-25.** Only a one-time
  extraction snapshot (`extracted/Web APP/apps-script-src/`, now removed) was tracked. Now
  fixed — `Webapp Files/` is tracked directly.
- **The abandoned Node/Express/Prisma rewrite (`app/`) was still running** — its `node
  src/server.js` process (port 3000) and its Postgres instance (port 5432, db `chantier`) were
  both live in this sandbox despite the source files having been deleted from the working tree
  in an earlier, uncommitted session. Both stopped 2026-08-25; the deletion is now committed.
- **`tools/local-preview/server.js`** (added 2026-08-25) now owns port 3000 instead — a
  dependency-free Node static preview server for `Webapp Files/`'s HTML shells, for
  layout/CSS-only iteration. See `agents/runbook.md`'s "Local layout-only preview" section for
  what it does and doesn't cover. It lives outside `Webapp Files/` deliberately, since anything
  inside that folder gets pushed to the live Apps Script project by `clasp push`.