# EDL Page — Codebase Reference

Last updated: 2026-08-26.

**This file no longer holds the architecture decisions.** The authoritative behavior spec is
now `agents/edl-page-spec.md` (supplied 2026-08-26, supersedes everything this file used to say
about the Plan Editor engine, Formulaire design, and the phased to-do list — several of those
draft decisions conflict with the real spec; confirmed 2026-08-26 that the spec wins, e.g. its
print/email-then-upload-scan signature flow replaces this draft's in-app canvas signature idea).
See `agents/edl-todo.md` for the live per-layer to-do list built from that spec.

What's still useful here: the `WorkspaceCore` hook contract and existing conventions, verified
directly against the code. The spec itself says to locate these in the codebase rather than
prescribing names — this is that lookup, done once, so it doesn't need repeating next session.

## `WorkspaceCore` layer contract (`Webapp/EDL_Scripts_1.html:117-258`, doc comment `:56-116`)

- `registerLayer(id, config)` hooks: `mount(container, ctx)` once per activation; `render(ctx)`
  on every selection change; optional `getEditToolsHtml(ctx)`/`bindEditTools(container, ctx)`
  (mounted into `#edit-tools-container`, already carries `.edit-only-ui` so it auto-hides
  outside Mode Édition); optional `resolveAsset(ctx)` (override the shared plan photo filename);
  optional `renderPlanPanel(ctx, wrapperEl)` (take over the plan pane with live HTML instead of
  a photo — checked *before* `resolveAsset` in the dispatch order, `:1330-1339`); `onAssetLoaded
  (ctx)` (fires after the plan `<img>` + sibling `#plan-markers-overlay` exist); `onExitEditMode
  (ctx)`; `onBaseDataLoaded(ctx)`.
- `ctx` shape (`buildContext`, `:139-152`): `currentView`, `selectionState`, `activeItem`,
  `activeId`, `roomName`, `isClient`, `isAuthorized`, `isClientViewActive`. `isAdmin`
  (`role === 'admin'`) is a separate module-level const (`:38-39`), not on `ctx`.
- Layout: `data-mode="drawing"` (60/40 plan/detail split, hides the Pièce dropdown) vs.
  `"data-entry"` (40/60) — matches the spec's `layoutMode` concept exactly.
- **Overlay primitives are view-mode only.** `renderOverlayTags()`/`toggleHighlight()`
  (`:1552-1579`) draw static click-to-highlight pins and explicitly no-op in edit mode — usable
  for Réserves' existing pins, **not** for Élec/Sanit's draggable/rotatable items or Réserves'
  new toolbar-driven objects (spec section 1.8 confirms these should be independent
  implementations anyway). Both can still mount into `#plan-markers-overlay` and tag elements
  `.layer-overlay` to get free cleanup from `clearPlanOverlays()` on every layer switch.
- `configLogement` (`Locataires_Code.js:115`) is the existing apartment-type key, already used
  to pick the shared plan photo (`log_${configLogement}`, `EDL_Scripts_1.html:1291-1292`) and to
  look up a type's rooms (`getConfigLogementData`, `EDL_Code.js:160-192`) — this is the spec's
  "Config Logement" reference in section 1.3, already wired up, no new taxonomy needed.
- Drive/asset conventions: `PROJECT_PHOTOS_FILE` root with subfolders `"01- Plans"`,
  `"03- Reserves Photos"`, `"04- Icons"` (an IcoMoon icon font + `selection.json` manifest,
  resolved via `iconSpanHtml()`/`iconGlyphText()`, `EDL_Scripts_1.html:284-371`) — this is the
  spec's "shared icon-rendering helper" (section 1.7).
- Server conventions: `gs<Verb><Noun>(token, ...)` calling `getSession_(token)` first;
  `assertCanEdit_`/`assertIsAdmin_` (`EDL_Code.js:144-151`) are the existing write/admin gates.
  Sheets: Script Property `<X>_SS_ID` consts declared once in `Planing_Code.js:6-10` (global
  namespace, no import system); headers row 6, data row 7 — matches spec section 1.1 exactly.
- Logging today: `appLog(module, entityId, action, visibility, type, details)` /
  `appErrorLog(error, context, payload)` in `ClientLib.html` → `gsWriteUniversalLog`/
  `gsWriteErrorLog` in `Logs.js`, one `Logs_<module>` sheet per module (Public/Private
  visibility, no explicit old/new-value columns — just a JSON `Payload`). **Resolved
  2026-08-26**: extend this existing pipeline with explicit old-value/new-value fields rather
  than building the spec's separate unified "Journal" sheet (section 1.6) — see
  `agents/edl-todo.md`'s Phase 0.
- Existing print pattern: Travaux's `renderPlanPanel` → `#print-root` → CSS `@page` (A4,
  `EDL.html:151-178`) → `window.print()` (`EDL_Scripts_2.html:2233-2360`, header builder
  `buildRecapHeaderHtml` at `:2181-2223`) — directly reusable for the spec's Travaux A4-canvas
  work (section 3) and Formulaires' print path (section 7).
- Photo upload pattern: client-side WebP compress → base64 → `google.script.run` →
  `uploadEDLPhoto` (`EDL_Scripts_2.html:160-200` / `EDL_Code.js:576-595`) — reusable shape for
  any new photo-metadata/mark-unused work in EDL and Réserves (spec sections 2 and 4). Note:
  `uploadEDLPhoto` takes no token and does no server-side auth check — see the bug already
  logged in `agents/todo.md`, unrelated to this spec but worth fixing while touching this code.
- Admin-CRUD screen pattern: Config Travaux / Sous-catégories manager
  (`EDL_Scripts_2.html:472-1190`) — the existing shape for any new catalog-management UI
  (Élec/Sanit item types & templates, Formulaires templates).
