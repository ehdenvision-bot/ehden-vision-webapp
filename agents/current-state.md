# Current State

Last updated: 2026-08-25.

## Project

**Ehden Vision** (working title shown in the UI/emails — confirm this is the real product
name) — a French-language construction/renovation project-management web app: tenant
("Locataires") and building info, a multi-view construction Planning/Gantt across three
sub-views (logements / parties communes / façades), a 6-layer per-lot "Workspace" (EDL = état
des lieux, Travaux, Élec, Sanit, Réserves/Autocontrôle, Formulaires), a punch-list ("Réserves")
workflow, and a universal cross-module audit log. Currently a Google Apps Script web app,
developed and tested directly against Google Workspace. A full rewrite to a different stack is
planned but hasn't started — target stack not yet decided (see `agents/decisions.md`).

- **Live source: `Webapp Files/`** — a `clasp clone` of the actual deployed Apps Script project. This
  is the real, editable app right now, not a legacy or reference copy.
- **No rewrite codebase exists yet.** When one starts, record its location and stack here, and
  update `CLAUDE.md`'s "Repo Management" section to match — it currently assumes only `Webapp Files/`
  exists.

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

*(Empty — see `CLAUDE.md`'s "`Webapp Files/` local dev environment" section, which this mirrors. Fills
up once something about your actual dev setup turns out to behave unexpectedly.)*