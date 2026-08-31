# Progress Log

Copy the template in `agents/progress-entry-template.md` for each new entry, newest at the top.

## 2026-08-26 - Layer 6 (Formulaires) implementation — all 6 EDL layers now complete

Status: completed (pushed live). Verification blocked — see Notes. This closes out the full
`agents/edl-page-spec.md` scope: EDL, Travaux, Réserves, Élec., Sanit., Formulaires are all
implemented and pushed.

Owner/agent: Claude (main thread)

Files changed:

- `Webapp/EDL_Scripts_4.html` — Formulaires layer implemented in full (was a placeholder stub
  since the Layer 4+5 entry). `escapeHtmlF`, `resolveMergeTokens`, `buildFixedHeaderHtml`,
  `buildSignatureBlockHtml`, `statusBadgeHtml`, `buildRightPanelHtml`/`bindRightPanel`/
  `renderAll`, `openAddFormulaireFlow`/`createFormDocument`, `renderPreview` (reuses Travaux's
  `#print-root`/`@page` print pattern for document output, with `window.__fdocSendEmail`/
  `window.__fdocUploadSigned`), `openTemplateManager`, and `ensurePanelVisibilityOverride`/
  `mountPanelHtml`/`fdocPanelObserver` (the MutationObserver fix — see Notes). Registered via
  `WorkspaceCore.registerLayer('formulaires', ...)`.
- `Webapp/EDL_Code.js` — new "FORMULAIRES" section: `FORM_TEMPLATES_SHEET_`/
  `FORM_TEMPLATE_HEADERS_`, `FORM_DOCUMENTS_SHEET_`/`FORM_DOCUMENT_HEADERS_`, `_getFormSheet_`,
  `gsGetFormTemplates`/`gsSaveFormTemplate`/`gsDeleteFormTemplate`, `gsGetFormDocumentsByLot`,
  `gsCreateFormDocument`, `_findFormDocRow_`, `gsUpdateFormDocumentStatus`,
  `gsUploadSignedFormDocument` (new "06- Formulaires Signes" Drive folder),
  `gsSendFormulaireEmail` (`MailApp.sendEmail`, uses the already-declared `script.send_mail`
  scope). Two new sheets in the existing `EDL_SS_ID` workbook (`Form Templates`,
  `Form Documents`), no new Script Property needed.
- `agents/edl-todo.md` — Layer 6 and the "Cross-layer patterns" section both marked DONE with
  implementation notes, mirroring the format used for Layers 1-5.

Server/live-system changes: `clasp push` — no manifest/syntax errors.

Verification:

- `node --check` on the script blocks extracted from `EDL_Scripts_4.html`, and on `EDL_Code.js`
  directly — clean.
- **Not verified live in-browser** — same Google sign-in wall as every prior entry this session;
  no credentials available, none obtained.

Notes:

- Real architecture conflict found and fixed: `WorkspaceCore.refreshActiveLayer()` hides
  `#layer-panel-root` and shows a generic empty-state whenever there's no apartment selection —
  but Formulaires' spec explicitly requires showing the template browser in exactly that state
  (apartment-level like Réserves, template list is the "nothing selected" view, not an empty
  state). Fixed with a `MutationObserver` scoped to only act while Formulaires is the active
  layer, re-asserting this layer's own content — doesn't touch shared core behavior for any
  other layer. Confirmed self-terminating, no infinite loop.
- Document generation deliberately reuses the already-proven `#print-root`/`@page` CSS pattern
  from Travaux's recap instead of the spec's *suggested* Google-Docs-merge mechanism — the spec
  explicitly permits substituting whatever fits the codebase's existing conventions best.
- Permissions: this is the one layer where clients have zero write capability at all (strictly
  read-only per spec) — no client-facing toolbar exists here, unlike Réserves/Élec/Sanit.
- No signature pad — confirmed session resolution: print or email, then staff uploads the
  signed/scanned document back onto the instance.

Next recommended action: none outstanding from the spec — all 6 layers are built and pushed.
The user is doing a live end-to-end review of the deployed app next (blocked from automated
verification all session by Google's sign-in wall) and will report back findings/bugs to
triage. Worth pre-flagging to them: (1) the Travaux recap header's "aide au déménagement"
mobilier line needs a `aide_deplacement_mobiliers` poste to exist in Config Travaux to show a
value — nothing renders it automatically if that poste was never created; (2) documented scope
cuts across layers — click-based tool arming instead of literal drag (Réserves, Élec, Sanit),
form-based (not visual) template-item authoring for Élec/Sanit catalogs, no Signalement-phase
photo capture in Réserves, no Undo anywhere; (3) two inferences flagged directly in code
comments that are worth a deliberate look: Réserves' "Tracer une liaison" tool's interpretation,
and the Communs/Façades categorization approach for Élec/Sanit item types.

## 2026-08-26 - Layers 4+5 (Élec./Sanit.) implementation — both layers complete

Status: completed (pushed live, after a mid-session pause for the user to shut down their
machine — resumed and pushed on return). Verification blocked — see Notes.

Owner/agent: Claude (main thread)

Files changed:

- `Webapp/EDL_Scripts_4.html` — full rewrite. Shared `createPlanEditorLayer(catalogue, label,
  icon)` factory instantiated for both `elec` and `sanit`; the Formulaires stub (6th layer) is
  restored to its prior placeholder state, untouched otherwise.
- `Webapp/EDL_Code.js` — new "PLAN EDITOR" section: `gsGetPlanEditorItemTypes`/
  `gsSavePlanEditorItemType`/`gsDeletePlanEditorItemType`, `gsGetPlanEditorTemplates`/
  `gsSavePlanEditorTemplate`/`gsDeletePlanEditorTemplate`, `gsGetPlanEditorTemplateItems`/
  `gsSavePlanEditorTemplateItem`/`gsDeletePlanEditorTemplateItem`, `gsGetPlanEditorInstances`/
  `gsSavePlanEditorInstance`/`gsDeletePlanEditorInstance`, `gsSeedPlanEditorInstances`. All new
  sheets in the existing `EDL_SS_ID` workbook (`Elec`/`Sanit` + `Item Types`/`Templates`/
  `Template Items`/`Instances`), no new Script Property needed.

Server/live-system changes: `clasp push` — 39 files, no manifest/syntax errors (verified both
before the pause and again on resume, since the push itself had to wait for the next session).

Verification:

- `node --check` on both script blocks extracted from `EDL_Scripts_4.html`, and on `EDL_Code.js`
  directly — clean.
- Careful self-review caught 3 real bugs before push (see `agents/edl-todo.md`'s Layer 4 entry
  for detail): a dead/inert `google.script.run` chain, a double-invoked click handler, and —
  the most consequential — the entire Formulaires layer registration silently dropped by writing
  this file via one large `Write` call instead of incremental edits. All three fixed.
- **Not verified live in-browser** — same Google sign-in wall as every prior entry this session.

Notes:

- Confirmed the spec's own claim that Élec and Sanit are architecturally identical — Sanit is
  one line of code (a second `registerLayer` call) once Élec's shared engine exists.
- Scope cut, documented in code and in `agents/edl-todo.md`: the admin Template Items authoring
  UI is form-based (manual X/Y percentage entry), not a visual plan-click placer — the more
  important everyday surface (editing real per-apartment instances) IS fully visual/click-based,
  matching Réserves' toolbar interaction model.
- This session had a hard pause mid-edit (user needed to shut down their machine) — the file was
  left in a syntactically valid, locally-saved-but-unpushed state, explicitly confirmed via
  `node --check` before stopping, then pushed on resume. Worth remembering that a mid-task pause
  request should resolve to the nearest safe, verified stopping point, not necessarily the exact
  sentence-of-instruction boundary.

Next recommended action: Layer 6 (Formulaires) — new construction, spec section 7, the last
layer.

## 2026-08-26 - Layer 3 (Réserves) implementation — layer complete

Status: completed (pushed live), verification blocked — see Notes.

Owner/agent: Claude (main thread) + 1 Explore agent for investigation

Files changed:

- `Webapp/EDL.html` — Mode Édition button repositioned.
- `Webapp/EDL_Scripts_3.html` — full toolbar interaction system (9 tools), annotations
  (SVG overlay), photo gallery with phase grouping, mark-unused for autocontrôles.
- `Webapp/EDL_Code.js` — `gsCreateReservesIntervention`, `gsMoveReservesIntervention`,
  `gsDuplicateReservesIntervention`, `gsSetAutocontroleUnused`, `gsCreateReservesAnnotation`,
  `gsGetReservesAnnotations`, `gsUploadReservesPhoto`, `gsGetReservesPhotosData`,
  `gsSetReservesPhotoUnused` (all new), plus `getReservesInterventionsByLot` widened and
  `validateReservesIntervention` extended to write photo metadata.

Server/live-system changes: `clasp push` — 39 files, no manifest/syntax errors.

Verification:

- Investigation found the spec's assumed "sidebar edit panel" is dead code (targets a
  `#sidebar-content` element absent from EDL.html) and that "Ajouter une réserve"/"Tracer une
  liaison" had zero click handlers despite sitting in the right DOM slot — this layer was
  substantially new construction, not a toolbar rearrangement.
- `node --check` on extracted JS from `EDL_Scripts_3.html`, plus `EDL_Code.js` directly — both
  clean.
- Careful manual column-index verification for every new sheet (Reserves Photos, Reserves
  Annotations, the new O/P columns on the autocontrôle sheets) — caught and fixed a range-width
  off-by-one in the annotations read.
- Caught a whole class of bug specific to this file: several new functions invoked via inline
  `onclick=` needed an explicit `window.` prefix (IIFE-wrapped file, inline handlers evaluate in
  global scope) — found by re-deriving the pattern from this file's own existing code, then
  grepping every `onclick=` in the file to confirm no others were missed.
- **Not verified live in-browser** — same Google sign-in wall as every prior entry.

Notes:

- Interaction model is click-based throughout (arm tool → click marker/plan point), not literal
  mouse-drag, including for "Move" and the line/rectangle annotations — a deliberate, documented
  scope/complexity tradeoff, not an oversight.
- Two genuine inferences made and flagged in code (not silently guessed): "Tracer une liaison"
  read as the entry point for the new line/rectangle annotations feature; Réserves photos
  attached via the existing Valider flow are always tagged phase='Correction' since there's no
  Signalement-time capture entry point yet.
- Skipped the optional "Annuler" (undo) — spec explicitly allowed skipping it if it didn't fit
  naturally, and it didn't given the size of everything else in this layer.

Next recommended action: Layer 4 (Élec.) — new construction, spec section 5.

## 2026-08-26 - Layer 2 (Travaux) implementation, part 2 of 2 — layer complete

Status: completed (pushed live), verification blocked — see Notes. All of Layer 2 (spec section
3) is now implemented.

Owner/agent: Claude (main thread)

Files changed:

- `Webapp/EDL_Scripts_2.html` — Travaux layer: 4-row header redesign (`buildRecapHeaderHtml`,
  including a reserved-idWork lookup for "Aide au déplacement des mobiliers",
  `AIDE_DEPLACEMENT_ID_WORK = 'aide_deplacement_mobiliers'`); A4-locked, zoomable, non-scrolling
  recap canvas (`renderPlanPanelLocataires`/`renderPlanPanel`); secondaries now nest inline in
  the recap too, not just the checklist (`buildRecapBoxHtml`'s new `secondaryRows`, with a
  documented gap for room-scoped primaries); "Gérer les postes de travaux" regrouped by
  Sous-catégorie (was Discipline) with up/down/indent/outdent arrows
  (`ctmMoveLigne`/`ctmIndent`/`ctmOutdent`, all reusing the existing `saveTravauxConfigRow`
  endpoint via a small Promise wrapper); manual note space, single-line row rendering, and a QR
  placeholder box added to `buildRecapBoxHtml`/`renderPlanPanelLocataires`. Also relaxed the
  admin form's Sous-catégorie/Ligne requirement to skip for secondaries too, not just pinned
  postes (a secondary's position is entirely inherited from its primary).
- `Webapp/EDL_Scripts_1.html` — no changes this part (Phase 0/part 1 changes only).
- `Webapp/EDL_Code.js` — no changes this part.

Server/live-system changes:

- `clasp push` — 39 files, no manifest/syntax errors.

Verification:

- Command: `clasp push` — Result: succeeded.
- Command: `node --check` on the extracted JS from `EDL_Scripts_2.html`, `EDL_Scripts_1.html`,
  and directly on `EDL_Code.js` — Result: all three clean, no syntax errors. Added this step
  this session given how much manual editing accumulated across two large Travaux batches —
  cheap and caught nothing here, but worth keeping as a habit before pushing dense changes.
- Manual code review throughout, re-reading every function after writing it.
- **Not verified live in-browser** — same Google sign-in wall as every prior entry.

Notes:

- The header's "Aide au déplacement" cell needs a manual one-time setup step from the user: the
  admin has to actually create a poste with the exact ID Work `aide_deplacement_mobiliers` for
  it to show a value — flagged prominently in `agents/edl-todo.md`, not silently assumed done.
- Chose arrows-only for position/hierarchy (no drag-and-drop) given the spec's own reasoning
  that arrows are the essential, always-available mechanism and drag is supplementary — a
  deliberate scope cut under time pressure, not an oversight.
- Regrouping "Gérer les postes de travaux" from Discipline to Sous-catégorie is a real, visible
  change to that admin screen's layout beyond what the spec literally asked for — necessary
  because "position" and "the item immediately above" are only unambiguous within a
  Sous-catégorie, which a Discipline-based grouping could scatter across unrelated visual
  groups. Worth confirming this reads well once verified live.

Next recommended action:

- Get the user's live confirmation on all of Layer 2 (both parts) before starting Layer 3
  (Réserves) — this is the largest, most state-heavy layer touched so far this session.
- Layer 3 (Réserves, spec section 4) is next per `agents/edl-todo.md`.

## 2026-08-26 - Layer 2 (Travaux) implementation, part 1 of 2

Status: completed (pushed live), verification blocked — see Notes. Remaining Travaux items
(position/hierarchy UI, A4 zoom, header redesign, note space, icon, single-line, QR) deferred
to a second pass.

Owner/agent: Claude (main thread), with one Explore agent for the initial deep-dive read

Files changed:

- `Webapp/EDL_Scripts_1.html` — `updateTravauxAdminButtonsVisibility()` added, called from
  `activateLayer()`; `setupAdminConfigTravauxButton`/`setupAdminSousCategoriesButton` trimmed to
  click-wiring only.
- `Webapp/EDL_Scripts_2.html` — Travaux layer: removed the sous-catégorie import feature
  entirely; removed the "Détails de champ" extra-fields mechanism (`parseDetailsChamp`,
  `buildExtraFieldHtml`, the `_primary`-object value shape) and replaced it with a `parentId`-
  based primary/secondary link (one level, enforced by never offering an existing secondary as
  a parent choice); added `suffix`; changed blank Sous-catégorie from defaulting to 'Autres' to
  meaning "pinned" (a new admin-form checkbox makes this reachable, since Sous-catégorie used to
  be a required field); pinned postes now render in their own section at the top of the
  Locataires checklist and are excluded from recap sous-catégorie boxes.
- `Webapp/EDL_Code.js` — `getTravauxConfigDataHelper`/`TRAVAUX_CONFIG_COLUMNS_` extended with
  new columns K (`parentId`) and L (`suffix`), additive only (column I `detailsChamp` kept as a
  now-always-blank positional placeholder so J/K/L never shift out of alignment with rows
  written before this change); `seedSousCategoriesFromExistingConfig` removed.

Server/live-system changes:

- `clasp push` — 39 files, no manifest/syntax errors.

Verification:

- Command: `clasp push` — Result: succeeded.
- Extensive manual code review, re-reading every changed function after writing it.
- Caught and fixed three self-introduced bugs during review before push: (1) `ctmBuildRowHtml`
  was going to be called as `g.rows.map(ctmBuildRowHtml)` with a new second parameter — `.map`
  passes `(element, index, array)`, so that would have silently received the array *index* as
  `allRows` instead of the actual rows list; fixed to an explicit wrapper closure. (2) The new
  "Poste épinglé" checkbox's initial checked-state (and 3 paired hidden/shown UI states) used
  `scNom` truthiness directly, which is also falsy for a brand-new row's default empty
  Sous-catégorie — every new poste would have opened pre-marked as pinned; fixed with an
  explicit `isPinnedInitially = !isNew && !scNom`. (3) `formatRecapValue`'s callers
  (`buildRecapBoxHtml`, `renderPlanPanelLegacy`) still read a `.extras` property I'd removed
  from its return shape — would have thrown on every recap render; fixed both call sites.
- **Not verified live in-browser** — same Google sign-in wall as every prior entry this session.

Notes:

- Deliberately did NOT try to migrate a pre-existing row's "Détails de champ" data into the new
  primary/secondary model — added a `unwrapLegacyFieldValue()` compatibility shim instead so a
  historical saved value (from before this migration) still displays correctly instead of
  showing "[object Object]", but any old extra-field sub-values are simply orphaned going
  forward, matching the spec's "entirely removed" intent.
- Deliberately left secondaries requiring their own Sous-catégorie/Ligne in the recap (they
  print as independent lines, not nested inline like they now correctly are in the checklist) —
  flagged clearly in code comments and `agents/edl-todo.md` as deferred to the header-redesign
  batch, rather than half-building the recap-nesting under time pressure.
- The "Aide au déplacement des mobiliers" pinned poste is now creatable and correctly hidden
  from recap boxes, but doesn't yet appear anywhere ON the recap (that's specifically what the
  still-open header-redesign item is for) — a real, called-out gap, not an oversight.

Next recommended action:

- Get the user's live confirmation on Layer 2 part 1 (or proceed straight to part 2 given the
  established "continue" cadence this session).
- Part 2: position/hierarchy drag-and-drop UI, A4 zoomable recap canvas, 4-row header redesign
  (including finally surfacing "Aide au déplacement" and completing the secondary-inline-recap
  nesting), manual note space, per-poste icon cleanup, single-line recap rendering, QR-code
  placeholder sous-catégorie.

## 2026-08-26 - EDL Layer 1 (EDL) implementation

Status: completed (pushed live), verification blocked — see Notes

Owner/agent: Claude (main thread)

Files changed:

- `Webapp/EDL_Code.js` — `saveEDLNotesData` gained a new "ROUTE 1.5" for the EDL-specific
  general note pair (Toutes les pièces, locataires only), logic extracted into
  `_saveEDLNoteToColumn_` shared with the existing whole-level/room-specific paths.
  `uploadEDLPhoto`/`getEDLPhotosData` rewritten: real auth (`uploadEDLPhoto` now takes
  token/projectId, was previously unauthenticated — see agents/todo.md), caption + uploader
  fields, name-based column resolution (`_edlPhotoCols_`, reusing `Logs.js`'s `_findLogCol`) so
  the sheet auto-migrates forward instead of relying on fixed positions. New:
  `gsSetEDLPhotoUnused`, `gsMigrateEDLPhoto`, `gsMigrateEDLData` (conflict-checked bulk
  apartment-to-apartment migration of photos/notes/status).
- `Webapp/EDL_Scripts_1.html` — added `WorkspaceCore.showImageInPlanViewer()`/
  `restorePlanViewer()`, reusing the existing `#plan-wrapper` zoom/pan for the new photo viewer
  rather than a second zoom system, per the spec's explicit instruction.
- `Webapp/EDL_Scripts_2.html` — EDL layer client code substantially extended: general-note UI,
  photo caption input, mark-unused UI (badge, toggle, show/hide-unused gallery filter), photo
  viewer (prev/next/info, `.layer-overlay`-tagged for cleanup on layer switch, `render()` also
  closes it on same-layer selection changes), migrate-single-photo and migrate-all-data flows
  (`Swal.fire` modals matching Réserves' existing correction-modal pattern).

Server/live-system changes:

- `clasp push` — 39 files, no manifest/syntax errors.

Verification:

- Command: `clasp push` — Result: succeeded.
- Extensive manual code review (re-read every changed function end to end after writing it,
  cross-checked call-site signatures repo-wide via Grep for orphaned old-signature calls to
  `uploadEDLPhoto`/`getEDLPhotosData` — none found).
- Caught and fixed two self-introduced bugs during review before push: (1) a placeholder/broken
  row-index calculation left in `gsMigrateEDLData`'s target-row-merge branch
  (`7 + targetNotesRow - 6 + 6` → corrected to `targetNotesRow + 1`); (2) the photo viewer's
  floating controls div would have stayed stuck on screen after a layer switch or same-layer
  selection change — fixed via `.layer-overlay` tagging (swept by the existing
  `clearPlanOverlays()`) and an explicit close-on-selection-change check in `render()`.
- **Not verified live in-browser** — same Google sign-in wall as the Phase 0 entry below;
  unresolved this session. Needs a manual spot-check (see `agents/edl-todo.md`'s Layer 1 section
  for the specific checklist: caption, mark-unused, viewer prev/next, single-photo migrate,
  migrate-all against two real apartment IDs).

Notes:

- Found and fixed the `uploadEDLPhoto` missing-auth bug while directly touching this function,
  per CLAUDE.md's "fix bugs when you find them" — it had been deferred, not ignored, in the
  Phase 0 entry below, specifically until this moment.
- Chose to reuse `Logs.js`'s `_findLogCol` for `EDL_Code.js`'s new column-name resolution
  (`_edlPhotoCols_`) rather than writing a second copy — same generic helper, no
  EDL/Logs-specific logic in it.
- `gsMigrateEDLData`'s conflict check is per-column for EDL Notes (blocks only if the SAME room
  has data on both sides) and whole-row for Planning (blocks if the target has ANY status/note)
  — matches the spec's "if the target apartment already has its own notes/status for a room,
  block" wording read as: a conflict is scoped to what's actually being written, not an
  all-or-nothing lock across every field.

Next recommended action:

- Get the user's live spot-check on Layer 1 before starting Layer 2 (Travaux) — this touched
  shared photo-sheet schema and the WorkspaceCore plan-viewer override that Réserves/future
  layers could also end up depending on, so it's worth confirming solid before building further
  on top of it.

## 2026-08-26 - EDL Phase 0 implementation (isProjectActive, client-action helper, Logs.js)

Status: completed (pushed live), verification partially blocked — see Notes

Owner/agent: Claude (main thread)

Files changed:

- `Webapp/EDL_Scripts_1.html` — declared `projectStatus`/`isProjectActive` as real top-level
  consts (from `APP_DATA.projectStatus`), added `isProjectActive` to `WorkspaceCore.buildContext
  ()`, added `WorkspaceCore.isClientActionEnabled(extraCondition)` helper for the "client action
  independent of Mode Édition" pattern (agents/edl-page-spec.md sections 1.4/8).
- `Webapp/EDL_Scripts_3.html` — removed the broken `typeof projectStatus !== 'undefined'` guard
  in `drawInterventionUI()`, now uses the real top-level const.
- `Webapp/Logs.js` — added a `Role` column (derived server-side from the validated session, zero
  client-side changes needed), fixed a read/write row-mismatch bug (`gsGetUniversalLog` read
  headers from row 4 / data from row 5; `gsWriteUniversalLog` always wrote row 1 / row 2 — now
  both agree), made both read and write column-name-based (`_findLogCol`) instead of positional.
- `agents/edl-todo.md` — Phase 0 items checked off with notes on what was found/fixed.

Server/live-system changes:

- `clasp push` — 39 files pushed to the live Apps Script project (@HEAD deployment). Succeeded
  with no manifest/syntax errors.

Verification:

- Command: `clasp push` — Result: succeeded, 39 files, no errors.
- Command: Playwright headless Chromium navigation to the @HEAD web app deployment URL
  (`https://script.google.com/macros/s/AKfycbwCgN-1Bwket-.../exec?page=edl`) — Result: **blocked
  by Google's own sign-in wall**, not the app itself (screenshot confirms landing on
  accounts.google.com). @HEAD deployments are restricted to accounts with script access; I have
  no Google credentials to authenticate with and won't attempt to obtain any. Could not confirm
  live behavior this way.
- Manual code trace (not a substitute for live verification, but the actual check performed):
  confirmed via Grep that `projectStatus` was declared nowhere in any EDL-page script file
  before this fix (only `Planning_Scripts_1.html` had its own copy) and that
  `ClientLib.html:180` explicitly documents leaving it unset; confirmed `Logs.js`'s write side
  has always appended headers to row 1 (`insertSheet` → immediate `appendRow`) while the read
  side read `data[3]` (row 4) — a real mismatch, now fixed on both sides.
- **Not yet verified**: live in-browser behavior. Asked the user to spot-check Réserves'
  intervention sidebar fields directly (they have an authenticated session, I don't).

Notes:

- This surfaced a live bug unrelated to anything the spec asked for: Réserves' intervention
  sidebar fields (discipline/équipe/date/heure/notes) were unconditionally disabled for every
  user, always, because the `isProjectActive` check they depend on referenced a variable that
  was never declared on the EDL page. Fixed as part of centralizing `isProjectActive` per Phase
  0's own requirement, per CLAUDE.md's "fix bugs when you find them."
- Also decided not to add flat OldValue/NewValue log columns (as a literal reading of the spec's
  section 1.6 might suggest) after finding `ClientLib.html` already has a working `{Ancien,
  Nouveau}` before/after convention in `details` — that already satisfies the requirement more
  flexibly (multiple field changes per entry) than flat columns could. Documented directly in
  `Logs.js`'s header comment so this isn't rediscovered/reversed next session.
- Playwright + Chromium (full browser + headless-shell, ~2 downloads) got installed into
  `~/AppData/Local/ms-playwright` during the failed verification attempt — left in place (small,
  reusable for future verification attempts), only the scratch script/screenshot were deleted.

Next recommended action:

- Get the user's live confirmation on the Réserves fields fix.
- Continue into Layer 1 (EDL) to-do items per `agents/edl-todo.md` (photo metadata, photo
  viewer, mark-unused, migration features) — or wherever the user directs next.

## 2026-08-26 - EDL page architecture + spec intake

Status: completed (design/documentation only — no `Webapp/` files touched)

Owner/agent: Claude (main thread) + 3 background subagents (2 Explore, 1 Plan)

Files changed:

- `agents/edl-page-spec.md` (new) — user-supplied full behavior spec for all 6 EDL layers,
  pasted with UTF-8-as-Latin1 mojibake (same class of corruption as the earlier Settings.html
  incident) and fixed programmatically via Node (latin1→utf8 roundtrip, plus a targeted fix for
  uppercase-É/em-dash characters whose bytes were already dropped upstream before reaching this
  session — verified clean end to end, no leftover replacement characters).
- `agents/edl-architecture.md` (rewritten) — was a from-scratch architecture draft (Plan Editor
  engine design, Formulaire design, phased to-do) produced before the real spec arrived; now
  repurposed as a codebase-hook-contract reference only, since the real spec supersedes the
  draft's design decisions (and contradicts one: draft assumed in-app canvas signature capture,
  spec wants print/email/upload-scan for the PC version).
- `agents/edl-todo.md` (new) — per-layer implementation checklist built from
  `edl-page-spec.md`, with a "🔴 Blockers" section for 3 unresolved items.
- `agents/todo.md` — added pointer entry to the above, plus a separate entry for the
  `uploadEDLPhoto` missing-auth-check bug found during exploration (deferred at user's request,
  not fixed this session).
- `agents/current-state.md` — added a dated pointer to the new EDL docs.

Server/live-system changes:

- None.

Verification:

- Command: `Grep -n "[^\x00-\x7F]"` over `agents/edl-page-spec.md` (full file, paginated).
- Result: every non-ASCII character present is a legitimate French accented letter or em-dash;
  zero `�` replacement characters remain.

Notes:

- Session arc: user described the EDL page's 6-layer structure conversationally → 2 Explore
  agents mapped the actual `Webapp/` implementation (found EDL/Travaux/Réserves already built
  via a `WorkspaceCore.registerLayer()` plugin pattern, Élec/Sanit/Formulaires as stubs, not the
  blank page implied by the conversational description) → clarifying questions on the 3 stub
  layers → a Plan agent produced a from-scratch architecture for those 3 layers → user then
  supplied a separate, far more detailed, already-written spec (`Claude_Code_Architecture.md`,
  pasted as this session's attachment) covering all 6 layers, which supersedes the Plan agent's
  design in most particulars and directly contradicts it on Formulaires' signature capture.
- The Plan-agent-produced background task was interrupted once by a session exit mid-run and
  successfully resumed via `SendMessage` rather than restarted — worth remembering that
  background agents survive a session boundary and can be resumed, not just re-launched.
- Plan mode was toggled on/off twice mid-session in ways that didn't map cleanly to natural task
  boundaries (once right after a substantive file write had already succeeded) — treated each
  reminder as authoritative for actions going forward rather than retroactively.

Next recommended action:

- ~~Resolve `agents/edl-todo.md`'s 3 blockers~~ — done same session: spec confirmed authoritative
  on signature capture (no in-app pad), decided to extend existing `Logs.js` rather than build a
  separate "Journal" sheet, and confirmed there's no separate `Database_Changes.md` — sheet
  structure gets read from the actual code/sheets directly instead. Start Phase 0
  (`agents/edl-todo.md`) next session.
