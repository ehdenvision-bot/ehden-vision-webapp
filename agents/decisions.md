# Decisions Log

Resolved decisions move to the archive section at the bottom.

---

## Open Decisions

### 2026-08-31 — Two ways to consume the RPC backend; which is the target?
The RPC registry (`app/src/rpc/`) is now reachable two ways, hitting the identical functions
with the identical `{args:[...]}` shape:

- **`/rpc/*`** — same-origin, unauthenticated, driven by the `google.script.run` shim in
  `app/src/render.js`. The "serve `Webapp Files/*.html` from Node" model that Phase 0/1 was
  built and verified against. Google Workspace is not in the loop.
- **`/bridge/rpc/*`** — shared-secret gated (`X-Api-Key`, see `app/src/appscript-auth.js`),
  added 2026-08-31, **server side only — nothing on the Apps Script side yet**. For the model
  the user asked about: Google Workspace keeps hosting the Apps Script web app, and its
  `*_Code.js` data functions call this server via `UrlFetchApp` instead of reading Sheets.
  The session token still travels as a normal RPC arg (unchanged per-user auth); the shared
  secret only proves the caller is our Apps Script project; `X-User-Email` is advisory/logging
  (live deployment is `ANYONE_ANONYMOUS`).

Both mounts coexist deliberately. Picking one is a user decision, not yet made. If the
Apps Script-hosted model wins, the browser shim + `/rpc` mount + `pages.js`/`render.js` become
dead code; if the Node-hosted model wins, `/bridge/rpc` + `appscript-auth.js` do. **Don't
delete either side until that call is made.** This is a third architecture shape distinct from
both prior plans — flagged per `CLAUDE.md` rather than silently adopted.

What still has to happen before the bridge model is real (none done):
- Public HTTPS host for `app/` + managed Postgres (currently local-only; the `/proxy/3001/`
  URL is dev tooling, not a deploy target).
- `ApiClient.js` in `Webapp Files/` (the `callApi_` `UrlFetchApp` helper), `API_BASE_URL` /
  `API_SHARED_SECRET` in Script Properties.
- Per-module: Postgres tables + a one-time importer + forwarding each client-callable
  `*_Code.js` function to `callApi_`. Same volume as finishing the port, minus the frontend.
- Photos stay in Drive (store file IDs in PG); Gmail sending stays in Apps Script.

---

## Resolved Decisions

### 2026-08-25 — Target stack chosen: Node.js + PostgreSQL, built in parallel starting now
**Reversal of the same day's earlier call.** Earlier on 2026-08-25 (commit `09f2bef`) an early
Node.js/Express/Prisma/PostgreSQL rewrite (`app/`) was removed as abandoned, in favor of a
*progressive* migration: keep building directly on `Webapp Files/` + Google Sheets, defer the
stack choice, cut over only once the app was functionally complete.

Later the same day the user explicitly reversed that: build the Node.js + PostgreSQL rewrite now,
in parallel, rather than deferring it. Considered and rejected: continuing the progressive/Sheets
plan (rejected — user's explicit call, not derived from new evidence about Sheets' limits).

**What was decided:**
- New codebase lives in `app/` (same directory the earlier attempt used; it was empty after the
  removal). Stack: Node.js + Express + PostgreSQL, no ORM — plain `pg` client +
  `node-pg-migrate` for versioned migrations. (The earlier attempt used Prisma; not reused —
  no reason recorded for that specific choice, just not carried forward.)
- **`Webapp Files/` stays fully intact and live** — this is a parallel build, not a cutover. Both
  codebases coexist; `Webapp Files/` is still what's deployed to Google Workspace.
- Auth/session model ported with behavioral fidelity to `Security_Code.js`/`Login_Code.js`:
  opaque UUID session tokens with server-side TTL expiry (was CacheService, now a `sessions`
  table), same role-based edit gate (`assertCanEdit_` → `requireEditor` middleware), same
  project-status lock check.
  - **Password hashing changed deliberately**: new/reset passwords use bcrypt, not the legacy
    salted-SHA-256 `HASHv1:salt:digest` format. A compat verifier
    (`app/src/lib/password.js`) accepts both, so rows migrated straight from the sheet keep
    working without a forced reset — bcrypt is only ever written going forward.
- Data model ported so far mirrors two sheets read end-to-end for their exact column layout:
  `Utilisateurs` (`users` table) and `Projects` (`projects` table) — see migration file headers
  in `app/migrations/` for the source column mapping. Remaining sheets (Planning, Locataires,
  Bâtiments, Réserves, EDL, Logs) are NOT yet modeled — tracked in `agents/todo.md`.
- The React frontend from the earlier attempt (`app/frontend/`, commit `14ddb41`, described as
  replicating all legacy pages against the real design system) was deleted in the same `09f2bef`
  cleanup alongside the Prisma backend. It's recoverable from git history rather than needing a
  rebuild — see `agents/todo.md`.
- File/photo storage (the original's Drive-folder thumbnail lookup in `gsListProjects`) is
  explicitly NOT decided yet — `/api/projects` currently omits images.

### 2026-08-25 — Frontend recovered from git history, wired to the new backend, working end-to-end through the proxy
Recovered `app/frontend/` (React/Vite/Tailwind, all pages) from commit `14ddb41` per the item
above, rather than rebuilding. Required real changes, not just a copy:

- **Session transport changed from Bearer token to httpOnly cookie**, since the frontend's
  `api.js` was already built around `fetch(..., { credentials: "same-origin" })` with no manual
  token handling. `app/src/routes/auth.js` now sets/clears a `session` cookie
  (`COOKIE_SECURE=true` env var to require HTTPS once there's a real deployment — off by
  default so local `curl` testing on plain HTTP keeps working); `requireSession` middleware
  accepts either the cookie or a `Bearer` header, so direct API/curl testing still works too.
  Response shapes changed to match what the frontend already expected (`POST /login` →
  `{ user }`, `GET /me` → the user object directly, not wrapped) rather than editing the
  frontend to match the backend's original shape — the frontend was the more-complete,
  already-correct side of that mismatch.
- **Proxy-path-prefix bugs, found only by testing the real proxied URL in a real browser** — see
  the concrete writeup now in `CLAUDE.md`'s "Never assume, always verify" bullet, not repeated
  here. Fixed: Vite `base: './'`, `HashRouter` instead of `BrowserRouter`, `api.js`'s `apiUrl()`
  resolving against `document.baseURI`, and one hardcoded absolute logo path in `Layout.jsx`.
- `app/src/server.js` now serves `app/frontend/dist/` as static files with an SPA fallback
  (any non-`/api` GET → `index.html`), so frontend and API are same-origin — no CORS needed.

**Verified end-to-end through the actual proxy** (`https://michel.optima-tech.info/proxy/3001/`,
in the user's own browser, not just `curl`): login with the seeded test user renders the
Portfolio page with the seeded project. This is the first point in the rewrite verified through
a real browser against the real proxy, not just `curl` against `127.0.0.1` — worth treating as
the standard going forward, since the proxy-prefix bugs above were specifically invisible to
`curl`-against-localhost testing.

**Not done**: every other page (Planning, Locataires, Bâtiments, Réserves, EDL, Logs, Users,
Settings) renders but has no backend to call — see `agents/todo.md`. Don't read "the frontend
works" as "the app works."

### 2026-08-25 — Frontend architecture reversed again: literal HTML/JS from `Webapp Files/`, not a React reinterpretation
**Third reversal today** (Prisma backend abandoned → progressive-Sheets plan abandoned →
Node/Postgres-in-parallel chosen; now the frontend layer specifically pivots again). Naming this
plainly per `CLAUDE.md`: this one is not a repeat of the earlier pattern of abandoning and
redoing the *same* thing — it's a scoped, evidence-driven correction of the frontend layer only,
prompted by the user comparing actual rendered output ("many things are missing or different")
against the original, and an explicit statement of the real objective: a *complete* migration,
where fidelity to the existing (already-designed, already-approved) app matters more than a
componentized rewrite.

**What was wrong**: the recovered React frontend (`app/frontend/`, see the entry above) was a
*reinterpretation* — different Tailwind color tokens, different markup, "deliberate v1 scope
cuts" per its own original commit message. It was never going to be pixel/structure-exact, and
wasn't.

**What was decided**: stop reinterpreting. Serve the literal files in `Webapp Files/` — same
HTML, same Tailwind classes, same copy, same IDs, same `*_Scripts_*.html` client JS — with only
the data layer swapped:
- **Templates read directly from `Webapp Files/`**, not copied into `app/` — same approach
  `tools/local-preview/server.js` already uses (`resolveIncludes()` for `include_()` tags).
  Guarantees zero drift: an edit to `Webapp Files/` (still the live, actively-edited GAS app)
  is immediately reflected, there is exactly one copy of the markup on disk. `Webapp Files/`
  itself is still never written to by anything in `app/`.
- **`Pages.js`'s `doGet()` reimplemented in Express**, verified against the real function
  (`Webapp Files/Pages.js`) rather than assumed: build the same `data` object (token, view,
  projectId, user, isAuthorized, isClient, canEdit, project lock status...) from real Postgres
  session/project lookups instead of `CacheService`/Sheets, inject it via the same
  `<?!= JSON.stringify(data || {}) ?>` → `APP_DATA` tag the templates already contain.
  `DEV_MODE` (currently hardcoded `true` in the live app, a known separate issue) defaults OFF
  in the rewrite per the existing `agents/todo.md` item — not carried over silently.
- **`google.script.run` replaced by a same-signature shim + generic RPC dispatcher**, not a
  bespoke REST API: the original client code already threads the session token explicitly
  through every call (`google.script.run.gsListProjects(token)`, confirmed by reading
  `ClientLib.html` — token lives in `localStorage`, not a cookie), so a shim that forwards
  `google.script.run.<fn>(...args)` to `POST /rpc/<fn>` with the args array, and a backend
  registry of Node functions with the **exact same names and parameter signatures** as their
  Apps Script originals, is a mechanical 1:1 port with no new API design per module. This also
  means the already-verified `Bearer`/cookie session work from the prior entry is superseded —
  RPC calls carry the token as a plain argument, matching the original exactly.
- **`app/frontend/` (the React SPA) is retired** — deleted from the working tree (recoverable
  from git history at `14ddb41` if ever needed, same as before). Its already-verified backend
  logic (password hashing incl. legacy `HASHv1` compat, session table, project queries) is not
  wasted — it gets re-homed into the RPC registry under the original function names
  (`gsLoginWithEmailPassword`, `gsLogout`, `gsListProjects`, ...) rather than rewritten.

**Scale, confirmed by grepping every `*_Code.js` for top-level function declarations** (not
estimated): Login 16, Projects 4, Security 2, Logs 8, Locataires 8, Settings 19, EDL 38,
Planning 47, Planning Mobile 22 — **~165 functions total**, most not yet ported. Not all of
these are client-callable RPC targets (some are internal `_`-suffixed helpers or Node-side
implementation details of a public one) — the real public surface per module is whatever that
module's `*_Scripts_*.html` actually calls via `google.script.run.*`, to be confirmed by
grepping at the time each module is ported, not assumed from the function list alone. Full
breakdown and phased plan in `agents/todo.md`.

**Built and verified the same session**: Phase 0 (the foundation above) plus Login and
ProjectPortfolio (Phase 1) — confirmed by the user in their actual browser through the real
proxy: the literal original `Login.html` renders (background photo, SweetAlert2, real Tailwind
tokens, not the retired React reinterpretation), login succeeds, `ProjectPortfolio.html` shows
real seeded project data. One real bug found and fixed during this verification: a malformed
session token reached a `uuid`-typed Postgres column directly and leaked a raw type-cast error
instead of the correct French message — see `app/src/session.js`.

### 2026-08-25 — Phase 3 (Settings) done. Two real bugs found and fixed, one in the original app, one introduced by the port
**Bug in the original app**: `Settings_Code.js`'s `processProjectGeneration`/`gsCheckTasksOnDates`
use the sheet name `'Planning Commun'` (no "s"); every other module uses `'Planning Communs'`.
Since `getSheetByName()` returns `null` on a miss and the original just `return`s silently, the
live app's date-grid generation and its data-loss-prevention check silently no-op for the
common-areas view. Fixed in the port (uses `'Planning Communs'` consistently) rather than
preserved — this is a typo, not a deliberate behavior, and "migrate the exact same app" doesn't
mean reproducing a silent no-op bug nobody intended.

**Bug introduced by the port, caught by verification, not shipped**: dates were landing 1-2 days
early (`Jan 1` → `Dec 30`, `Noël` → `Dec 23`) because `toISOString()` converts to UTC before
extracting the date, silently shifting a local-midnight `Date` object backward in this sandbox's
Asia/Beirut (UTC+3) timezone — compounded by a well-known `pg` driver gotcha where `date`
columns come back as UTC-midnight `Date` objects. Root cause and full fix in `app/src/db.js`
(date columns now parsed as plain `"YYYY-MM-DD"` strings, no `Date` object ambiguity) and
`app/src/server.js` (`process.env.TZ = 'UTC'`, locked to match what Apps Script's actual runtime
does — the original's own `new Date(startDate); setHours(0,0,0,0)` pattern, ported verbatim,
would have broken differently again in a negative-UTC-offset host). This is exactly the kind of
catch `CLAUDE.md`'s "never assume, always verify" is there for — found by literally checking the
returned dates against known facts (Easter 2026 is April 5), not by inspecting the code.

Client-callable surface confirmed by grep: `getPlanningMeta`/`getPlanningChunk`/`getTaskSettings`
are dead code in the live app (never called from any client script) — not ported, per the
established "the real public surface is whatever the client actually calls" rule.

Schema: `app/migrations/*create-settings.js` (`planning_grid_state`, `planning_cells`,
`holidays`) — `planning_cells` is a sparse (view, entity_id, date) → value table, the relational
equivalent of the original's wide per-date spreadsheet columns; deliberately shared groundwork
for Phase 5 (Planning), not a one-off. Verified end-to-end via `curl`: settings state, full
holiday CRUD (insert/update/delete/status-toggle), grid creation with correct dates, the
data-loss-prevention guard (confirmed it actually blocks a shrink when cell data exists outside
the new range, with the correct French message), and `gsCheckTasksOnDates`.