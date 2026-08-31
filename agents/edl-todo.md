# EDL Page — Implementation To-Do List

Last updated: 2026-08-26.

Built from `agents/edl-page-spec.md` (the authoritative behavior spec — read that first for
*why*; this is the checklist of *what*, broken out by layer per the spec's own suggested first
step). Codebase hook contracts/conventions to build against are in
`agents/edl-architecture.md`. Sequence: the spec doesn't prescribe order beyond "global section
first" — Phase 0 below must land before any layer work, since every layer depends on it.

## Resolved (2026-08-26, follow-up to the spec intake)

1. **Signature capture: spec is authoritative.** No in-app signature pad for the PC version —
   print/email the document, staff uploads the signed/scanned copy back onto the instance. The
   earlier in-session decision (canvas signature) is overridden.
2. **Logging: extend the existing system, don't build a parallel one.** Add explicit
   old-value/new-value fields to the existing `Logs_<module>` sheets / `appLog()` /
   `gsWriteUniversalLog()` pipeline (already used by Travaux/Réserves) rather than building the
   spec's separate unified "Journal" sheet from scratch. Every "logs to the Journal" line below
   means "logs through this extended existing pipeline."
3. **No separate `Database_Changes.md`.** Work out current sheet/column structure by reading
   the actual code/sheets in `Webapp/` directly; design any genuinely new schema (Élec/Sanit's
   four-tier model, any Communs categorization column, the old/new-value log fields) from
   scratch, following the existing conventions in `agents/edl-architecture.md` (headers row 6,
   data row 7, `<X>_SS_ID` Script Properties per workbook).

## Phase 0 — Global / shared architecture (spec section 1) — build first, everything depends on it

- [x] **`isProjectActive` centralized** — `Webapp/EDL_Scripts_1.html`: declared as a top-level
      const from `APP_DATA.projectStatus` and added to `WorkspaceCore.buildContext()`. Found and
      fixed a live bug in the process: `projectStatus` was never declared anywhere in EDL's
      script files (only `Planning_Scripts_1.html` had its own copy), so Réserves'
      `drawInterventionUI()` (`EDL_Scripts_3.html`) — which guards `canEditTechnical`/
      `canEditStatus` on it — was silently always disabled for everyone. Fixed by pointing that
      code at the new real top-level const.
- [x] **"Client action independent of Mode Édition" helper** — `WorkspaceCore.isClientActionEnabled
      (extraCondition)` added in `EDL_Scripts_1.html`, returns `isClient && isProjectActive &&
      (extraCondition !== false)`. Staff's equivalent stays inline
      (`isAuthorized && editModeOn && extraCondition`) per each action's own existing shape — not
      wrapped in a second helper, since that half already varies more per call site. Ready for
      Travaux/Réserves/Élec/Sanit to call into as those layers' toolbar work lands.
- [x] **Logging extended, not duplicated** — `Logs.js`: added a `Role` column (derived
      server-side from the validated session, not client input — every existing `appLog()` call
      site gets it for free), fixed a real read/write row-mismatch bug found along the way
      (`gsGetUniversalLog` was reading headers from row 4 while `gsWriteUniversalLog` always
      wrote them to row 1), and made both read and write column-name-based instead of positional
      so future header additions never require another migration like this one. No new Field/
      OldValue/NewValue columns — the spec's requirement is already met by an existing `{Ancien,
      Nouveau}` convention in `details` that `ClientLib.html` already renders as a diff; see the
      file's updated header comment.
- [ ] **Ongoing, not a one-time task**: confirm `clientView` continues to hide private
      notes/annotations, admin-only fields, and internal-only actions (e.g. "Ajouter
      autocontrôle") on every new feature below as it's built — audit each addition against this
      individually, don't treat it as satisfied once globally.

## Layer 1 — EDL (spec section 2) — IMPLEMENTED 2026-08-26, pushed live, not yet browser-verified

- [x] EDL-specific general note pair for "Toutes les pièces" (normal apartments only) —
      `Webapp/EDL_Scripts_2.html` (new `#edl-general-note-container` block, wired into
      `updateStatusAndNotes`/`saveCurrentNotesInBackground`) + `Webapp/EDL_Code.js`
      (`saveEDLNotesData`'s new "ROUTE 1.5", extracted `_saveEDLNoteToColumn_` helper shared
      with the existing whole-level/room-specific paths).
- [x] Photo metadata: caption + uploader — `EDL_Code.js`'s `uploadEDLPhoto`/`getEDLPhotosData`
      rewritten around a name-based column resolver (`_edlPhotoCols_`, reusing `Logs.js`'s
      `_findLogCol`) so the sheet migrates forward automatically; caption input added next to
      the dropzone in `EDL_Scripts_2.html`.
- [x] Photo viewer — new `WorkspaceCore.showImageInPlanViewer()`/`restorePlanViewer()` in
      `EDL_Scripts_1.html` (reuses the existing `#plan-wrapper` zoom/pan, per spec), driven from
      `EDL_Scripts_2.html`'s `__edlOpenPhotoViewer`/`__edlPhotoViewerNav`/
      `__edlTogglePhotoViewerInfo`/`__edlClosePhotoViewer`. Handles both cleanup paths: tagged
      `.layer-overlay` so a cross-layer switch sweeps it via the existing `clearPlanOverlays()`,
      and `render()` now closes the viewer itself on any selection change within the layer.
- [x] Mark-photo-unused — `gsSetEDLPhotoUnused` (server) + `__edlToggleUnusedPhoto` (client,
      `Swal.fire` reason prompt matching Réserves' existing correction-modal pattern). Badge
      always visible (not clientView-hidden), reversible, show/hide-unused gallery toggle.
- [x] Migrate all EDL data — `gsMigrateEDLData` (server): conflict-checked against both Planning
      (whole-apartment status/note) and EDL Notes (per-column), bulk-reassigns photos, moves
      (not copies) notes/status, blocked entirely on any conflict. `__edlMigrateAllData` (client).
- [x] Migrate a single photo — `gsMigrateEDLPhoto` (server) + `__edlMigratePhoto` (client).
- [x] Confirmed: kept flat Drive photo storage (no per-apartment folders) — untouched.

**Bug fixed while touching this code**: `uploadEDLPhoto`'s missing auth check (logged separately
in `agents/todo.md`) — now takes `token`/`projectId` and calls `assertCanEdit_`, same as every
other write endpoint in the file.

**Not yet done**: live browser verification — blocked on the @HEAD deployment's Google sign-in
wall (see `agents/progress-log.md`'s 2026-08-26 entries). Needs a manual spot-check: add a
photo with a caption, mark one unused, open the photo viewer and page through prev/next, try
migrating a single photo, and (carefully — it's destructive-by-design if misused, though
non-conflicting data is always preserved) test the migrate-all-data flow against two real
apartment IDs.

## Layer 2 — Travaux (spec section 3) — DONE, pushed live 2026-08-26

- [x] Admin buttons scoped to active layer — `updateTravauxAdminButtonsVisibility()` added in
      `EDL_Scripts_1.html`, called from `WorkspaceCore.activateLayer()` on every layer switch.
- [x] "Importer les sous-catégories existantes" removed entirely — button/wiring in
      `EDL_Scripts_2.html`, `seedSousCategoriesFromExistingConfig` in `EDL_Code.js`.
- [x] Primary/secondary postes replacing "champs supplémentaires" — `parentId` field (new
      column K in `Config Travaux`, additive, `detailsChamp`/column I no longer read/written),
      one-level enforced at the admin-form level (`ctmEligibleParents` never offers an existing
      secondary as a parent choice). Nests inline, smaller, under its primary in BOTH the
      checklist (`buildWorkItemRowHtml`) and the recap (`buildRecapBoxHtml`'s `secondaryRows`) —
      the recap side landed in the position/hierarchy pass below once it became clear indent/
      outdent needed it anyway. One known, documented gap: a secondary only nests in the recap
      when its primary is whole-apartment-scoped (`piecesApplicables` empty) — a room-scoped
      primary produces one recap row per room, and there's no single row to attach a secondary
      to, so that combination's secondaries simply don't render on the recap yet.
- [x] Suffix/unit field (`suffix`, new column L) — shown after the value in both the checklist
      badge (`formatChecklistFieldValue`) and the recap (`formatRecapValue`).
- [x] "Aide au déplacement des mobiliers" pinned-poste convention — blank Sous-catégorie now
      means pinned (was defaulting to 'Autres'), with a real admin form control (a "Poste
      épinglé" checkbox, since Sous-catégorie used to be required). Pinned postes render at the
      top of the Locataires checklist, are excluded from recap sous-catégorie boxes, AND
      (completed in the header-redesign pass) surface in row 2 of the new recap header via a
      **reserved idWork convention**: `AIDE_DEPLACEMENT_ID_WORK = 'aide_deplacement_mobiliers'`
      in `EDL_Scripts_2.html`. **Action needed from you**: to actually see a value in that header
      cell, create that exact poste (Locataires, "Poste épinglé" checked, Menu déroulant field
      type with Oui/Non options) via "Gérer les postes de travaux", typing
      `aide_deplacement_mobiliers` into its "ID Work" field — it is not auto-detected by label.
      Until that poste exists the header cell just shows "—".
- [x] Position/hierarchy management in "Gérer les postes de travaux" — up/down arrows (reorder
      within the same Sous-catégorie) + a right arrow (attach as secondary to whichever poste
      sits immediately above it) + a left arrow on secondary rows (detach, reassigned to its
      former primary's Sous-catégorie at the next free Ligne). The admin list is now grouped by
      Sous-catégorie instead of Discipline (position is scoped to Sous-catégorie, a Discipline
      grouping could scatter true siblings across unrelated visual groups). **Arrows only, no
      drag-and-drop** — spec explicitly frames arrows as the essential, always-available
      mechanism ("drag alone leaves no accessible/precise fallback"); drag was scoped out given
      the size of everything else in this pass. All three actions reuse the existing
      `saveTravauxConfigRow` endpoint — no new server surface.
- [x] Left panel A4 fixed-ratio zoomable canvas — `#print-root` now locked to `aspect-ratio: 210
      / 297` (CSS), no scroll (`overflow: hidden` — content beyond one page's worth is clipped
      on screen rather than scrollable, matching "what's on screen is exactly what prints on one
      page"; multi-page print modes are the already-deferred item below), reuses the existing
      `#apartment-plan-visual`/`planZoomState` zoom/pan (`renderPlanPanel` now un-hides
      `#plan-zoom-controls` for the Locataires recap and calls `resetZoomPanState()` on every
      render instead of hiding zoom entirely). Communs/Façades (`renderPlanPanelLegacy`)
      untouched — still the original flat scrolling list, zoom stays hidden for that case.
- [x] Header redesign — 4 compact rows replacing the old branding-strip + title-row + 7-field
      grid: row 1 project name/"Fiche Travaux"/logo/Imprimer; row 2 Logement N.
      (bâtiment+hall-porte) | Aide au déplacement; row 3 Type logement | Référence (now resolves
      to the apartment's own ID — it had no source before this); row 4 NOM.
- [x] Reserved blank note space at the bottom of each sous-catégorie box (`buildRecapBoxHtml`,
      pure CSS, no data/save logic).
- [x] Per-poste icon — confirmed already functional (the per-row `logo` field, pre-existing) and
      left as-is; no separate build needed.
- [x] Single-line rendering per work item on the recap — row's own flex-wrap removed, only the
      title span itself may wrap internally; value chip stays pinned via `shrink-0`. Applied to
      both primary and secondary rows.
- [x] Fixed, system-added QR-code sous-catégorie, always last — `buildQrPlaceholderBoxHtml()`,
      appended to column 3 (or shown standalone when there are no real postes yet). Reserved
      slot only, per spec — QR content itself is a TODO.
- [x] **Deferred, do not build**: multiple print modes — left untouched, confirmed out of scope.

**Verification note**: extensive manual code review + `node --check` syntax verification on all
three changed files (clean), but — same as every layer this session — not verified live in a
browser (Google sign-in wall on the @HEAD deployment). This layer in particular has a lot of
interacting UI state (pinned/secondary/skip-sous-catégorie toggles in the admin form, the
position arrows' enabled/disabled states, the A4 zoom) that's much more easily wrong in ways a
static code read won't catch — recommend this be the first one you spot-check.

## Layer 3 — Réserves (spec section 4) — DONE, pushed live 2026-08-26

**Major finding before implementation**: the spec's "Current state" assumed a sidebar edit
panel (discipline/équipe/date/heure + notes) that turned out to be dead code — it targets
`#sidebar-content`, which doesn't exist anywhere in EDL.html's DOM (copy-pasted from
Planning_Scripts_3.html, never wired up here). The actually-reachable editing UI is a set of
SweetAlert2 modals (`onEditInterventionClicked`, `onValidateInterventionClicked`). Built
everything below against the real, reachable UI. Also found: "Ajouter une réserve"/"Tracer une
liaison" already sat in the correct shared slot, but `bindEditTools` was a literal empty stub —
zero click-to-place logic existed anywhere. This layer was much closer to new construction than
the spec's framing suggested.

- [x] Layout fix — `#mode-toggle-btn` moved to sit right after the filters container instead of
      the far-right `ml-auto` group (`EDL.html`). One global button shared by every layer, so
      this nudges its position slightly for non-Réserves layers too — worth a visual check.
- [x] Toolbar redesign — full click-to-place interaction system built from scratch
      (`EDL_Scripts_3.html`'s new "TOOLBAR" section). **Interaction-model deviation**: every
      tool is click-based (arm tool → click marker and/or plan point), not literal mouse-drag,
      including Move and the annotations tool — functionally equivalent, substantially less
      code than mixing manual drag-tracking with the click-arming every other tool needs;
      documented in code comments as a deliberate tradeoff.
  - [x] Staff: full toolbar in `#edit-tools-container` (existing `.edit-only-ui`, Mode-Édition-
        gated for free). Clients (and staff previewing via clientView): a separate, dynamically
        created `#reserves-client-toolbar` (tagged `.layer-overlay` for automatic cleanup on
        layer switch via the existing `clearPlanOverlays()` sweep), independent of Mode Édition,
        excluding Ajouter autocontrôle + Supprimer.
  - [x] **Ajouter autocontrôle** + **Ajouter réserve** — `gsCreateReservesIntervention` (new),
        sequential `R-YYYY-NNN`/`A-YYYY-NNN` IDs matching the convention already documented
        elsewhere in the app.
  - [x] **Move** — `gsMoveReservesIntervention` (new), click-source-then-click-destination.
  - [x] **Duplicate** — `gsDuplicateReservesIntervention` (new, same apartment only).
  - [x] **Copy** + **Paste** — reuse `gsDuplicateReservesIntervention` with a different target;
        clipboard is a module-scope client variable (confirmed sufficient — switching Bâtiment/
        Hall/Étage/Porte never triggers a real page navigation, only cross-PAGE nav does, which
        Copy/Paste never crosses).
  - [x] Field-copying rule (Duplicate + Paste): Discipline/Équipe always; note field by actor
        (client→public, staff→private); status/photos never copied. Autocontrôles (no pub/priv
        split, clients never interact with them) copy their raw description as-is.
  - [x] **Supprimer** — `gsSetAutocontroleUnused` (new columns O/P, additive), mark-in-place,
        reversible via a new "Réactiver" button on unused autocontrôle cards (the toolbar
        gesture alone can only mark unused, not disambiguate a reactivate intent).
  - [x] **Skipped**: Annuler/undo — explicitly optional in the spec ("include only if it fits
        naturally"); didn't fit given everything else in this pass.
- [x] Line/rectangle annotations — `gsCreateReservesAnnotation`/`gsGetReservesAnnotations` (new
      sheet), rendered as an SVG overlay in `#plan-markers-overlay`. **Inference, flagged in
      code**: read "Tracer une liaison" (an existing, unimplemented button name) as the entry
      point for this same new feature, with Rectangle added as a second shape — genuinely
      ambiguous, could be wrong if "liaison" meant a connector between two specific réserve
      markers instead of a freeform line.
- [x] Réserves photos — brand new "Reserves Photos" sheet (there was previously **zero**
      persisted photo metadata at all, not even a row — Drive upload only, URL discarded).
      Wired into the existing `onValidateInterventionClicked` flow (`validateReservesIntervention`
      now also writes photo rows), tagged phase='Correction' with a per-validation-event
      `correctionRef` (ISO timestamp) grouping photos from the same round. Gallery
      (`viewInterventionPhotos`, was a stub toast) groups Signalement vs. each Correction round
      separately, with mark-unused. **Known gap**: no Signalement-time photo capture entry point
      exists yet — every photo attached via this pass is necessarily phase='Correction', since
      Valider is still the only upload entry point.

**Bugs caught and fixed during review before push**: a `.map(fn)` extra-argument mistake
(same class as Travaux's), an unclosed `bindEditTools` function body, an annotations sheet
range-width off-by-one, and — the one that would have been hardest to spot live — several new
functions called from inline `onclick=` attributes needed an explicit `window.` prefix (this
whole file is IIFE-wrapped; a bare top-level `function` declaration is invisible to inline HTML
event attributes, which evaluate in global scope). Verified via a full grep of every `onclick=`
in the file after fixing, not just the ones touched.

## Layer 4 — Élec. (spec section 5) — DONE, pushed live 2026-08-26

Built as ONE shared "Plan Editor" engine (`createPlanEditorLayer(catalogue, label, icon)` in
`EDL_Scripts_4.html`, parameterized by `catalogue: 'elec'|'sanit'`), confirmed zero architecture
differences needed between the two per the spec's own claim — Layer 5 (Sanit) is this same
engine instantiated a second time, not separate work. All sheets live in `EDL_SS_ID` (no new
Script Property), headers row 6 / data row 7, matching this workbook's existing convention.

- [x] Item Types catalog — `gsGetPlanEditorItemTypes`/`gsSavePlanEditorItemType`/
      `gsDeletePlanEditorItemType`, admin UI (`openItemTypeManager`). `PropertiesSchema` reuses
      the "Label:Type;Label:Type" mini-language shape — legitimate here (an item TYPE's property
      schema, not a per-row ad hoc bag), distinct from the mechanism removed from Travaux.
- [x] Templates — scoped to exactly one of {type, commun} via a `Scope`/`ScopeValue` pair, admin
      UI (`openTemplateManager`). Façades use the same `commun` scope as Communs (per spec's own
      "assumed to match" — unconfirmed, flag if wrong).
- [x] Template Items — item type + room + default position/rotation + min/max + condition +
      per-rule enforcement, admin UI (`openTemplateItemsManager`). **Scope cut, documented in
      code**: this admin authoring UI is form-based (manual X/Y % number entry), not a visual
      plan-click placer — reusing the instance-editing engine in a "template mode" would have
      been more elegant but needed more plumbing than time allowed. Real per-apartment instance
      editing (the everyday-use surface) IS fully visual — see below.
- [x] Instances — `gsGetPlanEditorInstances`/`gsSavePlanEditorInstance`/
      `gsDeletePlanEditorInstance`. True delete, no mark-not-delete concern, per spec.
- [x] View mode — read-only overlay markers (icon + inline property text, `renderMarkers`) +
      per-room count/constraint panel (`buildRightPanelHtml`), constraint violations flagged
      (blocking = rose, warning = amber).
- [x] Edit mode — click-based interaction (same model as Réserves' toolbar: arm an item-type
      palette button → pick room → click plan to place; click an existing marker to edit)
      rather than free mouse-drag — same documented rationale as Réserves. Rotation is 4 buttons
      (0/90/180/270°) in the instance editor modal, numeric inputs for properties, Duplicate and
      Delete both present.
- [x] Client access — full edit, same `.layer-overlay`-tagged separate-toolbar pattern built for
      Réserves (client toolbar independent of Mode Édition; staff's gated by
      `#edit-tools-container`'s existing `.edit-only-ui`). Template/Item-Type management stays
      admin-only (`isAdmin` check on the "manage" buttons).
- [x] Onboarding — `gsSeedPlanEditorInstances` (copy-on-first-touch, blocked if the target
      already has instances), client prompt (`offerOnboarding`) offering a matching template OR
      duplicate-from-another-ID, shown once per selection when entering edit mode with zero
      instances. **Simplification**: Communs/Façades template matching uses the commun's own ID
      directly as `scopeValue` (no separate "categorization column" — there's no
      `Database_Changes.md` this session to define one against, per the earlier resolved
      decision to design schemas from the codebase directly); each Commun's template(s) are
      simply keyed by its own ID.
- [x] Constraint conditions — basic `attribute operator value` parser (`evalCondition`,
      `>=`/`<=`/`>`/`<`/`==`/`!=`), evaluated against `ctx.activeItem`'s own fields (e.g.
      `surface`). Unparsable/unresolvable conditions fail OPEN (constraint still applies) rather
      than silently blocking everything — a deliberate choice, flagged in code.

**Bugs caught and fixed during review before push**: a dead/inert `google.script.run` chain left
over from an earlier draft (called `.gsResolveTemplateIdForLot` as a property access, never
actually invoking it — harmless but confusing dead code, removed), and a toolbar button handler
that called the placement flow TWICE per click with one bogus argument (leftover scaffolding).
Also: writing this file via a single large `Write` instead of incremental edits accidentally
**dropped the Formulaires layer's registration entirely** (a real regression — the layer would
have silently failed to activate) — caught in review and restored to its exact prior stub state.

## Layer 5 — Sanit. (spec section 6) — DONE, pushed live 2026-08-26

Confirmed: zero engine changes needed — `WorkspaceCore.registerLayer('sanit',
createPlanEditorLayer('sanit', 'Sanit.', 'plumbing'))` is the entire Sanit-specific code, one
line. Catalog CONTENT (sinks/toilets/water heaters/pipes) is data entry through the admin UI,
not yet seeded with real items — same as Élec's catalog, that's expected next-step data entry,
not a build gap.

## Layer 6 — Formulaires (spec section 7) — DONE, pushed live 2026-08-26 — LAST LAYER

Document generation reuses Travaux's already-proven `#print-root`/`@page` pattern instead of the
spec's *suggested* Google-Docs-merge mechanism (spec explicitly allows this: "use whatever fits
the existing codebase's approach best"). Two new sheets in `EDL_SS_ID` (`Form Templates`,
`Form Documents`), same conventions as everywhere else this session.

- [x] Panel layout — `data-entry`, Pièce dropdown locked (`unlockRoomDropdown`/disable pattern,
      matching Réserves). Right panel: template browser with no ID selected, that apartment's
      documents (status-badged) + "Ajouter un formulaire" once selected. Left panel
      (`renderPlanPanel`) previews whichever's clicked. **Real architecture conflict found and
      fixed**: `WorkspaceCore.refreshActiveLayer()` hides `#layer-panel-root` entirely and shows
      a generic empty-state whenever no apartment is selected — exactly the state where this
      layer needs to show something (the template browser). Fixed with a `MutationObserver` on
      `#layer-panel-root`'s class list, scoped to only act when Formulaires is the active layer,
      re-asserting this layer's own content instead — doesn't touch shared core (every other
      layer's "nothing to show yet" behavior is untouched) and reacts to the state being
      triggered by anything (initial load with no selection, or clearing a selection while
      already on this layer), not just a one-time timing fix.
- [x] Two-tier statement source — `gsGetFormTemplates`/`gsSaveFormTemplate`/`gsDeleteFormTemplate`
      (admin catalog, `openTemplateManager`) + ad hoc custom statements (blank `TemplateID` on
      the instance, created via the same "Ajouter un formulaire" flow by leaving the template
      dropdown on "Statement personnalisé").
- [x] Signature path — print (`window.print()`) or email (`gsSendFormulaireEmail`, real
      `MailApp.sendEmail`, already-declared `script.send_mail` scope), then
      `gsUploadSignedFormDocument` attaches the signed/scanned upload. No signature pad, per the
      session's confirmed resolution.
- [x] Document generation — fixed header (`buildFixedHeaderHtml`: occupant, reference, ID, date)
      + corps (Auto: `{{merge_token}}`s resolved client-side at instance-creation via
      `resolveMergeTokens`, matching how Travaux's own recap header already merges data
      client-side; Manuel: blank textarea at creation) + two signature blocks always
      (`buildSignatureBlockHtml`, owner + staff, both names editable).
- [x] Statuses — Non signé (default) / Envoyé (on email send) / Signé (on signed-scan upload).
      No 4th state, as specified.
- [x] Permissions — clients get **zero write capability in this layer at all** (spec: "strictly
      read-only"), the one layer this session where the Réserves/Élec-style
      "client-independent-of-Mode-Édition toolbar" pattern doesn't apply, since there's nothing
      for a client to do beyond view/print. Template CRUD admin-only; create/fill-corps/edit-
      signer-names any authorized staff.

## Cross-layer patterns (spec section 8) — DONE, applied throughout

- [x] "Client actions independent of Mode Édition" — `WorkspaceCore.isClientActionEnabled()`
      (Phase 0) plus the repeated `.layer-overlay`-tagged-separate-toolbar pattern (Réserves,
      Élec, Sanit) for layers where clients DO get some write access; Formulaires correctly has
      no such toolbar since clients have none there.
- [x] "Evidence vs. configuration data" delete rule — applied consistently: EDL/Réserves photos
      and réserves themselves never truly delete (mark-in-place); autocontrôles mark-in-place via
      Supprimer; Élec/Sanit instances and Formulaires documents are true-deletable/true-mutable
      configuration data (Formulaires documents aren't explicitly deletable in this pass — not
      spec'd either way, left as create/update-only, matching "no true delete" being the safer
      default for a signed-document audit trail).
- [x] "Catalog admin-only, usage broader" — Config Travaux, Élec/Sanit Item Types + Templates,
      Formulaires templates: all admin-managed; using them (checklist, placement, generating a
      statement) is open to broader staff and, in several layers, clients too.
- [x] Every mutating action logs to the Journal — `appLog()` calls present in every new write
      path across all 6 layers' implementation work this session; the Journal itself is the
      extended existing `Logs.js` pipeline (Phase 0 resolution), not a separate sheet.
