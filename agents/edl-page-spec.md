# EDL Page — Implementation Specification for Claude Code

## How to use this document
This describes the required behavior and logic for a set of changes to an existing Google Apps Script web app (the EDL page). It assumes:
- The Google Sheets structure changes listed in the companion `Database_Changes.md` have already been applied manually — that file is not for you to act on, it's a record of what the human has set up (or will set up) directly in Sheets.
- You have the actual codebase open and can locate existing functions, variables, and sheet names by searching it — this document describes *behavior*, not function signatures. Where an existing function/variable name is mentioned, it's to help you locate the relevant code, not to prescribe naming for anything new.
- Sections marked **"Current state"** describe what's already built and working — don't change this unless a "New" or "Resolved" subsection right below it says to. Sections marked **"New"** are net-new work.
- An **"Open items / assumptions"** list closes out most sections — these are genuine unresolved details or inferences, not just caveats. Where one affects a design choice you have to make to implement something, make a reasonable choice, note it, and keep going rather than blocking.

Suggested first step: turn this into a To-Do list broken out by layer (matching the file-per-layer structure below and the codebase's existing one-file-per-layer convention), then sequence it however makes sense given the codebase — this document doesn't prescribe an implementation order.

---

## 0. System overview

This is a Google Apps Script web app for conducting "État des lieux" (EDL) — documenting an apartment/common area/façade's condition. A PC version (in progress, this document's scope) is for creating, viewing, and correcting EDL data. A mobile version (future, out of scope here) will be field-oriented for capturing data on-site.

The page is split into 6 layers sharing one shell:
1. **EDL** — photos and remarks per room.
2. **Travaux** — scope-of-work checklist, admin-configurable.
3. **Réserves** — defects/remarks, their planning, and status tracking (includes "autocontrôles," an internal QC variant).
4. **Élec.** — customizable electrical plan with templated, constraint-checked item placement.
5. **Sanit.** — identical architecture to Élec., sanitary fixtures.
6. **Formulaires** — generates and tracks signable statements/documents.

---

## 1. Global / shared architecture

Every layer below depends on this section. Get this right first — it's the foundation.

### 1.1 Stack & data
- Google Apps Script web app. Backend `.gs` files share one global namespace, split by file for human navigation (`Workspace_Core_Server.gs`, `EDL_Server.gs`, and one `<Layer>_Server.gs` per layer).
- Frontend: HTML templates stitched together with `include_()`; client JS lives in per-file `<script>` blocks.
- Data store: one Google Sheet, one tab per data type. Convention: headers on row 6, data from row 7.
- Media: Google Drive. Photos, plan images, and the custom icon webfont are fetched as base64 through dedicated `.gs` endpoints.

### 1.2 Shell & layer contract
One shell hosts all 6 layers. A layer is a self-contained module that registers itself once with the core, providing: a label and layout mode (`data-entry` = 40/60 plan/panel split, or `drawing` = 60/40 and hides the Pièce dropdown), a mount step (build the panel DOM once), a render step (refresh panel content for the active selection), and several optional hooks — react to leaving edit mode (e.g. autosave), lazy-load the layer's own data once base data is ready, react once the plan/photo image has loaded, provide edit-tool buttons and wire them up, provide custom content for the left/plan side, and override which image asset loads (default is the shared plan).

A layer never talks to another layer directly — only to the shared core. Every layer gets, for free: the dynamic panel header, an empty-state placeholder, view/edit-mode-aware hiding of edit-only UI, a status-select/read-only-badge swap pattern, zoom & pan on the plan, overlay-tag highlight sync, and print support.

### 1.3 Identity & apartment-type backbone
Every layer operates on one "cible" — a Locataire (apartment), Commun, or Façade — selected via cascading Bâtiment-Hall / Étage / Porte selectors.

`Config Logement` maps an apartment type to the rooms it contains, and is the key for Élec./Sanit. templates and item-count rules (Locataires only — see section 5). Communs have no shared type system; Élec./Sanit. templates for Communs are defined per specific Commun ID instead (see section 5). Façades are assumed to follow the same per-Commun-ID pattern — not explicitly confirmed, flag if wrong.

### 1.4 Roles & permissions — shared primitives, composed per layer
Rather than a single global permission table, a handful of shared primitives get combined into layer-specific and field-specific `canEdit*` conditions. Keep using this pattern for anything new rather than inventing a parallel permission system.

**Shared primitives**:
- `isAuthorized` — whether this session can use Mode Édition at all. Gates the mode-toggle button; if false, the user is permanently in View mode. **Always false for client sessions.**
- `isClient` — external client account.
- `isAdmin` (`role === 'admin'`) / raw `role` — `role === 'admin'` for catalog/config-type actions (managing item catalogs, templates, statement templates), `role === 'admin' || role === 'directeur'` for elevated internal actions.
- `isProjectActive` — whether the project/chantier is still open, read from existing app-wide session data. Should be computed once at the core level and reused by every layer, not re-derived locally per layer.

**The critical pattern — client actions independent of Mode Édition**: because `isAuthorized` is always false for clients, they never see the Mode Édition toggle and can never enter it. Any action a client is allowed to perform must therefore be gated on its own condition (typically involving `isClient`), rendered as live/usable **regardless of the shell's Mode Édition state** — never gated behind the same Mode-Édition check used for staff. Staff's equivalent actions stay gated behind Mode Édition as before. This pattern is used throughout Travaux, Réserves, and Élec./Sanit. below — apply it consistently to any new per-layer edit affordance a client should have access to.

### 1.5 Edit mode / View mode / clientView
- Mode Édition is independent of `isClient` — it's the staff-only toggle described above.
- `clientView` lets staff preview the client's view without logging in as one. Needs to be a close approximation, not pixel-exact — hide what a client shouldn't see (private notes/annotations, admin-only fields, internal-only actions like "Ajouter autocontrôle").
- Field-level editability (e.g. Réserves' existing technical-field and status conditions) is a *different* mechanism from toolbar-button visibility — a field can be gated independently of whether any given toolbar button is shown. Keep these two concerns distinct when implementing; don't conflate "is this button visible" with "is this specific field editable."

### 1.6 Logging — errors + data changes
Existing error logging stays as-is. Add a parallel audit trail for data changes:
- One shared backend logging helper, called by every layer's save/mutating endpoints — not reimplemented per layer.
- New sheet (see `Database_Changes.md` — "Journal") recording: timestamp, user, role, layer, cible (target ID + room where applicable), action, field(s) changed, old value, new value.
- Granularity: one entry per meaningful save/mutating operation (a checklist save, a note autosave-on-blur, a migration, an add/move/delete/duplicate/copy/paste), not per keystroke.
- Every new feature described below that creates, changes, deletes, marks, or moves data should write to this Journal. This isn't repeated in every layer section below — treat it as a blanket requirement.

### 1.7 Conventions
- Plan/photo filenames are generated from tokenized building/floor/orientation/door values, then fetched through the existing asset-loading endpoint.
- Printable content is marked for print and triggers the browser print dialog; only that content is visible in the print output, the screen view is unaffected.
- Icons come from either a standard icon set or a custom icon webfont pulled from Drive, resolved through a shared icon-rendering helper. Reuse this system for every new icon reference below (Travaux poste icons, Élec./Sanit. item-type icons) — don't introduce a second icon mechanism.

### 1.8 Note on per-layer "objects on a plan" implementations
Réserves' toolbar (réserves/autocontrôles + freeform annotations) and Élec./Sanit.'s item placement are structurally similar problems — interactive objects positioned on a plan, moved/deleted/duplicated, with coordinate math that has to survive zoom/pan. These are deliberately **independent implementations**, not a shared primitive — build each on its own terms as described in its section below, don't try to unify them.

---

## 2. Layer 1 — EDL

### Current state — don't change unless noted below
- Status/notes logic has three branches sharing the same public/private textareas but pulling from different sources: whole-building entries (special-prefixed IDs representing a whole immeuble) show notes from an `edlNotes`-style sheet's `'Général'` column, status hidden; "Toutes les pièces" for a normal apartment (or any Communs/Façades view) shows status + public + private notes from the Planning sheet — this is a cross-page general section (occupant info, overall work-progress status) used elsewhere in the webapp, not owned by this layer; a specific room selected shows public/private notes from that sheet's room-named column, status hidden.
- Photos are per-room, resized and compressed to WebP client-side before upload. All photos live in **one flat Drive folder for the whole project** — there's no per-apartment or per-room folder structure. A photos sheet links each photo to an apartment and room by ID. **Keep it this way** — see the resolved decision below; this is what makes the migration features cheap.
- Notes/status autosave on leaving edit mode; photos upload immediately on selection.

### New: EDL-specific general note, for "Toutes les pièces"
Add a second public/private note pair, shown between the existing Planning-sourced general section and the photo gallery, only when "Toutes les pièces" is selected for a normal apartment. Distinct purpose from the Planning note: the Planning note is cross-page (occupant/work-progress status); this one is specifically about the work observed for *this EDL*. No new sheet or column — reuse the same `'Général'`-column mechanism already used for whole-building entries, just also write/read it in the "Toutes les pièces" branch for normal apartments. The save path for that branch currently only writes the Planning sheet — extend it to also write this second pair to the `'Général'` column, the same way the specific-room branch writes to its room column.

### New: photo metadata
Photos need metadata, stored alongside the photo reference (not embedded in the image file): a caption (optional free text), automatic upload timestamp, automatic uploader identity. (Timestamp already exists on the photos sheet — add caption and uploader.)

### New: photo viewer (bigger view)
Clicking a thumbnail (single click) replaces the plan panel's displayed image with the selected photo, reusing the plan-container's existing zoom/pan — don't build a separate zoom system. A small "back to plan" control restores the plan; next/prev controls let the user flip through that room's other photos without returning to the thumbnail grid.

Metadata display is hidden by default and revealed via a small "info" toggle button alongside the back/next/prev controls (not a double-click — that would collide with the single-click-to-enlarge gesture and has no clean touch equivalent for the future mobile version). Toggling it shows a compact strip: caption, "Added by [uploader] on [date]", and the reason if the photo is marked unused. The "unused" badge itself (below) stays always-visible on the photo regardless of this toggle — it's a status, not incidental metadata.

### New: mark a photo unused (never delete)
Photos can never be deleted through the UI — only marked unused, to preserve the audit trail and remove any way to use deletion to hide something. Marked photos stay **highlighted in place** (grayed out, badged "Non utilisée") rather than moved to a separate hidden section — nothing should disappear from the default view. Add a one-click "show/hide unused" toggle to declutter the gallery on demand without hiding anything structurally. Visible to clients too, badge included — not hidden by clientView. Reversible (mark/unmark) by any authorized staff member — not a client action. Optional reason field when marking unused. Add a status flag and optional reason column to the photos sheet for this (fast client-side rendering); the full who/when audit trail also goes to the Journal.

### New: migrate all EDL data to another apartment
Bulk operation: every EDL photo, note, and status for apartment X moves to apartment Y in one action. EDL-only (a similar but *selective* capability is planned for Réserves later — see section 4 — not the same feature). Because photo storage is flat (see above), this is cheap: bulk-update the `ID_Lot`-equivalent column on every matching photo row to the target; move the notes and planning rows' cell values (both are one-row-per-apartment) to the target apartment's row.
- **Conflict handling**: if the target apartment already has its own notes/status for a room, block the migration rather than overwrite — no silent data loss. Photos never conflict, they just add more rows under the new ID.
- **Permissions**: `isAuthorized`. Since clients never have this, no separate client exclusion is needed.
- Log one Journal entry summarizing the migration (source ID, target ID, counts moved).

### New: migrate a single photo
One photo can be reassigned to a different room, a different apartment, or both, in one action — same underlying mechanism as the bulk migration, scoped to one photo row. No conflict handling needed (photos just add another row under the new ID/room). Permissions: `isAuthorized`, same as the bulk migration.

### Resolved: keep flat photo storage, no per-apartment folders
Explicitly considered and rejected moving to one Drive folder per apartment. The migration features above are cheap and safe specifically because the sheet is the sole source of truth for which apartment/room a photo belongs to — moving a photo is a cell edit. Per-apartment folders would mean every migration also needs an actual Drive file-move alongside the sheet update, adding latency, failure modes, and a real risk of the two falling out of sync. Do not introduce folder-based organization for EDL photos.

### Open items / assumptions
- Photo metadata field set (caption + timestamp + uploader) may need more fields later (e.g. a tag/category) — not currently required.
- Migration conflict handling (block on non-empty target) is the specified default; no override behavior is needed.
- Marking-unused is staff-only; clients can view the status but not toggle it — inferred, not explicitly confirmed, but consistent with how every other staff-only write action in this app is gated.

---

## 3. Layer 2 — Travaux

### Current state — don't change unless noted below
- Driven entirely by an admin-managed catalog (one row per checklist item), scoped by cible (Locataires/Communs/Facades), grouped into "sous-catégories" (boxes on the left recap) and "disciplines" (groups on the right checklist), with a room-scope field, a field type (Checkbox / Menu Déroulant / Texte — unrecognized types fall back to Texte so a typo never silently disappears), and dropdown options where relevant.
- Right panel: every applicable room for the current selection renders as its own scrollable card — a fixed "Toutes les pièces" card always comes first.
- Left panel: a live, printable A4 recap grouped by sous-catégorie, with a print button.
- "Config Travaux" and "Gérer les sous-catégories" admin modals are gated on `isAdmin`.
- No clientView-based hiding in this layer today — intentional, stays that way (see below).

### Current permission model — already resolved, don't re-litigate
- Clients can edit checklist item **values** (e.g. toggle yes/no on a work item) but never touch the catalog — catalog CRUD stays `isAdmin`-only regardless of `isClient`.
- Mechanism: checklist controls keep swapping to a read-only badge for staff outside Mode Édition. For clients, render the live control whenever their own condition (`isClient && isProjectActive`) is true — independent of Mode Édition, per the pattern in section 1.4.
- Full client visibility of the scope-of-work list is intentional — no clientView hiding needed in this layer.

### New: admin buttons scoped to the layer
"Config Travaux" and "Gérer les sous-catégories" buttons should only be visible when the active layer is Travaux, in addition to the existing admin-only gate — currently they show regardless of active layer.

### New: remove sous-catégorie import
Remove the "Importer les sous-catégories existantes" button from "Gérer les sous-catégories," and the logic behind it, entirely.

### New: primary/secondary work items, replacing "champs supplémentaires"
Remove the extra-fields mini-language mechanism entirely. Replace it with: any "poste de travaux" can be flagged **secondary** and linked to a **primary** poste, via a parent reference on an ordinary catalog row — added through the exact same form as any other poste, no special syntax. **One level only** — a secondary can't itself have secondaries; this is a deliberate simplification for non-technical admins, not an oversight.

Rendering: a secondary's title should be smaller than its primary's and follow inline where the primary's title ends. The visible checklist likely doesn't need to look meaningfully different from today (a primary field with smaller linked sub-fields following it, similar to how the old extra-fields likely render already) — the real change is on the admin side, managing linked rows instead of a delimited string.

### New: optional suffix/unit
Add an optional suffix/unit field to a poste de travaux (e.g. `cm`), displayed right after its value (e.g. "Largeur: [value] cm").

### New: position and hierarchy management in "Gérer les postes de travaux"
Replace the manually-typed position field with an outliner-style pair of independent controls:
- **Position**: drag-and-drop *or* up/down arrow buttons to reorder within siblings (offer both — drag alone leaves no accessible/precise fallback). The position value is still stored, just set through the interaction instead of typed.
- **Hierarchy**: left/right arrow buttons indent/outdent — right arrow attaches an item as secondary to whichever primary sits immediately above it in the list; left arrow detaches a secondary back into its own primary.
- Reordering never changes hierarchy; only the indent/outdent arrows do.

### New: left panel becomes a fixed-ratio, zoomable A4 canvas
Two changes, related:
- Lock the recap container to the true A4 ratio (210:297) so what's on screen is exactly what prints on one page.
- Replace scrolling with the same zoom/pan mechanism already used for the plan-container elsewhere (don't build a new one) — shown fit-to-view by default, zoomable for detail, no scroll. This panel's purpose is layout overview only; checking actual values happens on the right panel, which is unaffected by this change.

### New: "Aide au déplacement des mobiliers" — a special pinned poste, not a separate field
This is not a new data field — it's an ordinary catalog row: cible = Locataires, **blank sous-catégorie**, value type Oui/Non (using the existing field-type system — a dropdown with Oui/Non options, no new field type). **Establish a general convention**: any poste with a blank sous-catégorie is a pinned, header-level item — shown at the top of "Gérer les postes de travaux" and at the top of the right-panel checklist (Locataires-view only), and excluded from any sous-catégorie box on the left recap. The header (below) reads this specific poste's current value directly — needs a stable way to identify *this* poste specifically (e.g. a reserved/known ID) rather than scanning all pinned items generically.

### New: header redesign (4 rows, compact)
This is the left A4 recap's own header (on-screen and printed), not the app's global topbar. Goal: minimize its height to give the sous-catégorie boxes more room.
1. Project name (has a max width; if long, shrinks and wraps to 2 lines) — "Fiche Travaux" — company logo.
2. Left: "Logement N." + concatenation of bâtiment + hall + "-" + door number. Right: "Aide au déplacement des mobiliers" + its Oui/Non value (see above).
3. Left: "Type logement" + its value. Right: "Référence" + the apartment ID.
4. Left: "NOM" + occupant name.

### New: manual note space per sous-catégorie
Not a data field — just a reserved blank area at the bottom of each sous-catégorie box, sized for someone to write on by hand after printing. No editing UI, no save/load logic, no new column needed.

### New: per-work icon on the left recap
Each work line shows an assigned icon (from the shared icon system, section 1.7) to its left. This needs a new icon field at the individual-poste level — previously only the sous-catégorie itself had an icon.

### New: single-line work rendering on the left recap
Each work renders on a single line. Only the title may wrap onto multiple lines if it's long; everything else (value, suffix, icon) must stay on one line regardless.

### New: fixed QR-code sous-catégorie
A system-added sous-catégorie always appears last on the recap, reserved for a QR code. Content/purpose of the QR code is **not defined yet** — build the reserved slot, leave the actual QR content as a placeholder/TODO.

### Deferred — do not design or build this pass
Multiple print modes (print current page vs. print-by-selection across bâtiment/hall/étage/empilement/apartment ID) were explicitly deferred. Leave the existing single print button as-is; don't attempt to guess the selection UI.

### Open items / assumptions
- Single-level nesting for primary/secondary is a deliberate simplification — don't build deeper nesting.
- How the header locates the "Aide au déplacement des mobiliers" poste specifically (a reserved ID vs. matching by name) is left to your judgment.
- Print options and QR code content are both deliberately out of scope this pass.

---

## 4. Layer 3 — Réserves

### Current state — don't change unless noted below
- Interventions come in two kinds by ID prefix: regular réserves and autocontrôles — autocontrôles are already filtered out entirely for clients and clientView (never shown to them).
- Filter bar (discipline/équipe/status) sits in the sticky top area, shown only while this layer is active. Right panel: interventions list with a status badge. Left panel: plan with tags at each intervention's location.
- Sidebar edit panel per intervention: discipline/équipe/date/heure selects + public/private notes. Technical-field editability and status editability are each gated by their own condition, involving `isAuthorized`/`isClient`/`isProjectActive` — **these are independent of Mode Édition entirely, and stay that way**. This is a different mechanism from the toolbar-button visibility described below — don't conflate the two.
- A large custom calendar/date-picker handles scheduling.
- "Corriger" offers correcting the **status** (requires a reason, already writes an old/new value record) or the **reference** (moves the intervention to a different apartment/commun/façade).
- Photos compress to WebP client-side before upload, same approach as EDL.
- Pièce dropdown is locked/disabled while this layer is active — every intervention shows regardless of room.

### New: layout fix
Move the "Mode Édition" button to the right of the filter buttons, same row — it currently sits beneath them.

### New: toolbar redesign
Buttons render on the **left side of the header, near the plan/photo** (the shared edit-tools slot), not in the right panel.

**Visibility** — two different rules:
- **Staff**: the whole toolbar only appears in Mode Édition. (Previously "Ajouter une réserve"/"Tracer une liaison" were always visible regardless of mode — that was a bug, fix it as part of this.)
- **Clients**: see the toolbar **except "Ajouter autocontrôle" and "Supprimer"**, and see it **independent of Mode Édition** (per the pattern in section 1.4 — they never have that toggle). Both exceptions are also hidden in clientView.

**Buttons**:
- **Ajouter une réserve**, **Tracer une liaison** — existing behavior, now correctly hidden outside edit mode for staff / hidden entirely for clients only on the two exceptions above.
- **Ajouter autocontrôle** — new button, gated on `isAuthorized`, hidden from clients and in clientView.
- **Move** — drag an existing marker to a new position on the *same* plan. (Distinct from reference-correction, which moves an intervention to a *different* apartment.)
- **Duplicate** — same apartment ID only. Asks directly for a coordinate to place the copy (no separate paste step). See the field-copying rule below for what gets copied.
- **Copy** + **Paste** — two-step, cross-apartment capable. Copy marks an item (same fields as Duplicate, see below); the "clipboard" must persist across navigating to a different apartment/ID, so store it in shared/core-level state, not this layer's per-apartment render state. Paste places the copy at a clicked coordinate wherever is *currently being viewed* — the new item's apartment ID is whatever apartment is currently open, whether that's the same one Copy was triggered from or a different one.
- **Supprimer** — staff-only (hidden from clients and in clientView). **Only applicable to autocontrôles, never to réserves** — a réserve can be status-corrected but never removed through this button. Like EDL's photos, this is **not a true delete** — it highlights/marks the autocontrôle in place. Build it the same shape as EDL's mark-unused: reversible, optional reason field, stays visible (marked) rather than disappearing.

**Field-copying rule, for both Duplicate and Copy/Paste**: copy Discipline and Équipe in both cases. For the note field, which one gets copied depends on who's performing the action: a client copies the **public** note into the new item's public note; staff copies the **private** note into the new item's private note. Status and photos are never copied — the new item starts fresh on both.

**Worth adding, not explicitly requested**: given how many mutating actions this toolbar now has, consider an "Annuler" (undo last action) control.

### New: line/rectangle annotations
Separate, freeform shapes, not tied to any réserve or autocontrôle — a distinct tool: click it, then click-drag on the plan to define the shape. Just a shape + color, no text label. Each annotation has a public/private flag, same principle as every other public/private field in this app — private ones hidden by clientView/isClient.

### New: photos get EDL's treatment, plus phase tracking
Réserves photos should get the same metadata/mark-unused treatment as EDL's photos (caption, uploader, never truly delete, mark-unused-in-place instead) — for the same reasons.

Additionally: a photo can be taken at different points in an intervention's lifecycle — when first reported, when a correction is made (to document the fixed state), and potentially again if the client isn't satisfied and further correction rounds happen. These must not display mixed together. Suggested model: tag each photo with a phase (Signalement / Correction), and group Correction-phase photos by which specific correction event they document (e.g. by date, or a direct reference to the correction record) rather than a fixed list of round numbers — this handles an open-ended number of unsatisfied-client rounds without hardcoding how many can exist. Render the gallery as separate labeled groups rather than one flat list.

### Open items / assumptions
- Selective, multi-select migration of réserves/autocontrôles to a different apartment (select several, migrate just that selection) is **planned but not designed** — Copy/Paste above covers the single-item version; treat multi-select as a separate future feature, not part of this pass.
- The public/private note-copying rule (client copies public, staff copies private) is unusual enough that it's worth double-checking the intent is understood correctly during implementation.
- The photo-phase grouping design is a proposal, not an exactly specified structure.
- Whether the redesigned Supprimer needs a reason field and reversibility exactly like EDL's mark-unused, or should differ, wasn't explicitly confirmed — built as a parallel feature by default.
- Undo was suggested, not requested — include only if it fits naturally.

---

## 5. Layer 4 — Élec.

Nothing is built yet beyond a placeholder — this is new construction, not a revision.

### Scope: Locataires (by type) and Communs (by specific ID)
Templates for Locataires are defined per apartment **type** (via the existing apartment-type/room mapping), reusable across every apartment of that type. Communs have no shared type system, so their templates are defined per **specific Commun ID** instead — one-off, not reused across communs. Façades are assumed to follow the same per-ID pattern as Communs — not explicitly confirmed, flag if wrong.

### View mode vs. Edit mode
- **View mode (default)**: left side shows the plan with item symbols overlaid, read-only — each symbol shows its icon plus any relevant property text inline (e.g. a sink's width shown beside its icon). Right side shows one read-only container per room, listing the count of each item type present and whether any constraint is violated.
- **Edit mode**: left side becomes editable — add, move, rotate (90° steps only, not free rotation), edit properties via numeric input (no visual resize handle), duplicate, delete. Right side stays read-only but recalculates live as edits happen, highlighting any constraint no longer satisfied.
- Delete is a true delete here — this is placement/configuration data, not documentation of an observed physical fact, so there's no "never delete" concern the way there is for EDL/Réserves photos.

### Client access: full, both view and edit
Clients get the same edit capabilities as staff here — not read-only. Apply the same pattern used in Réserves/Travaux: staff's toolbar is gated by Mode Édition; clients get theirs independent of it (they never have `isAuthorized`, never see that toggle). **Assumption**: this covers day-to-day item placement on a specific apartment's plan — the separate admin module for defining item types and templates (below) stays admin-only, matching every other catalog in this app. Flag/reconsider if full client access was actually meant to extend to template management too.

### Room detection: explicit tag, not position-based zones
Each placed item explicitly declares which room it belongs to — do **not** infer room membership from the item's position relative to invisible room-boundary zones. Position-based detection was considered and rejected: it fails silently (a boundary misplacement produces a wrong count with no visible explanation), real rooms are often irregular shapes making zones hard to draw accurately, and it doesn't pay off for one-off Commun templates where zone geometry would only ever be used once. Make room selection part of the placement flow itself (pick the room, then place the item) rather than a field to remember afterward.

### Data model: four tiers
1. **Item types** — a global catalog, defined once via a separate admin module, independent of any template: item label (e.g. "Prise électrique," "Prise de terre"), an icon (from the shared icon system), and optional extra properties as label/type pairs (e.g. "Largeur:Nombre").
2. **Templates** — named, and scoped to either one apartment type or one specific Commun ID (never both on the same template). A type or Commun can have several named templates, not just one.
3. **Template items** — the actual items placed within one template: which item type, which room, a default position (x/y + rotation), and a count constraint (min/max) that is **per-template** (confirmed — not shared across a type's several templates), an optional condition (blank = always applies, or a simple attribute/operator/value expression such as "surface>=50" — tiered rules are just multiple rows with different conditions, no need for a more complex expression grammar), and an enforcement mode (blocking vs. warning — varies per rule, not global).
4. **Instances** — the actual per-apartment/commun placed items once a template's been applied or an ID's data duplicated: which item type, the room (explicit tag, per above), actual position/rotation, actual property values.

Refer to `Database_Changes.md` for the exact sheet/column layout already set up for this.

### Onboarding: apply a template, or duplicate an existing ID
Opening this layer for an apartment/commun with no instance data yet should prompt a choice:
- **Apply a saved template** — filtered to templates matching this apartment's exact type (Locataires), or templates already saved specifically for this Commun ID.
- **Duplicate an existing ID's actual data** — copies another apartment/commun's real placed instances rather than the abstract template defaults, useful when an existing apartment is a better real-world starting point than the raw template. Filtered to the same apartment type for Locataires. For Communs, filter using the new categorization column added to the Communs sheet specifically for this purpose (see `Database_Changes.md`) — there's no existing type system to filter by otherwise.

### Open items / assumptions
- Façades' template pattern is assumed to match Communs', not explicitly confirmed.
- Exact schema/column naming is flexible — see `Database_Changes.md` for what's already been set up; keep whatever you build internally consistent with it.

## 6. Layer 5 — Sanit.

Architecturally identical to Élec. above — same view/edit mode split, same client-access resolution, same room-detection decision, same four-tier data model shape (its own Item Types / Templates / Template Items / Instances, sanitary fixtures instead of electrical), same onboarding flow, same interaction model (icons from the shared system, 90°-snapped rotation, numeric-input property edits). The only difference is the actual catalog content (sinks, toilets, water heaters, pipes, etc.) — that's data entry once the layer exists, not an architecture difference. Communs categorization filtering reuses the same new column added for Élec., not a duplicate.

---

## 7. Layer 6 — Formulaires

Nothing is built yet beyond a placeholder — this is new construction, not a revision.

### Panel layout
- Layout mode: `data-entry` (40/60 plan/panel split, matches the scaffold's original assumption).
- The Pièce dropdown doesn't apply — statements are apartment-level, not room-level, same as Réserves.
- **Right panel has two states**: with no apartment ID selected, it defaults to the **template list** (browse/pick a template). Once an ID is selected, it shows that apartment's **formulaire instances** — both signed and unsigned, visually distinguished — plus an "add new formulaire" action that picks from the template list.
- Left panel dynamically previews whichever template or instance is currently selected, in either state — shows the blank/generated document while unsigned, the uploaded signed scan once signed.

### Statement source: two-tier
An admin-managed catalog of reusable templates (same pattern as the Travaux catalog), plus ad hoc custom statements any authorized staff member can create directly on a specific apartment, not necessarily added to the shared catalog.

### Signature path (PC version)
Print (existing print convention) for in-person signing, or send by email to the owner's on-file address so they can sign remotely and send it back. Either way, staff then upload the signed/scanned document, attaching it to that statement instance. No on-screen signature pad needed for the PC version — that's mobile-version scope.

### Document generation model
Every generated formulaire, regardless of template, is built from three parts:
1. **Fixed header block** — auto-filled from existing apartment/occupant data, not template-specific: occupant name, apartment reference, apartment ID, date (list may extend further — treat as extensible, not a fixed enumeration).
2. **Corps (body)** — template-specific, and each template is defined as exactly one of: **Auto** (fixed text with its own merge tokens, generated the same way every time) or **Manuel** (blank, filled in by staff as free text when a new instance is created for a specific apartment).
3. **Two signatures, always** — the apartment owner and the staff member, never more or fewer. Each has a name field that's auto-filled by default but always editable, to cover someone signing on behalf of the assigned person. Both signatures live on the same physical/PDF page and get filled by hand, consistent with the print-or-email-then-upload-scan workflow above.

**Suggested mechanism** (an implementation choice, adjust if a better fit exists in the codebase): store each template as a Google Doc with placeholder tokens, duplicate + merge + export to PDF when staff generates a new instance for an apartment.

### Statuses
Non signé / Envoyé / Signé. Starting simple — a 4th state for "sent, awaiting return" was discussed and deliberately deferred, don't add it preemptively.

### Permissions
- **Clients**: strictly read-only. Can view/download their own statements (signed or not) but never create, edit, or upload.
- **Viewing the template list**: any authorized staff, so they can pick one when adding a new formulaire to an ID.
- **Managing templates** (create/edit/delete): admin-only, matching every other catalog in this app.
- **Creating a formulaire instance, filling manual corps text, editing signer names**: any authorized staff, not clients.

### Open items / assumptions
- The suggested Google Docs merge mechanism is a suggestion, not a hard requirement — use whatever fits the existing codebase's document-generation approach best if there's already a pattern for this elsewhere.
- The full list of "fixed header" fields beyond occupant name/apartment/ID/date isn't fully enumerated — treat it as extensible.
- Whether "name" in the fixed header means the occupant's name (assumed) or the template's own title was ambiguous in the original request — implemented as occupant name, consistent with the other fields in that block all being data merge fields.

---

## 8. Cross-layer patterns to apply consistently

These recur across multiple sections above — worth building once, consistently, rather than reinventing per layer.

**Client actions independent of Mode Édition.** Travaux's checklist, Réserves' toolbar, and Élec./Sanit.'s full edit access all follow the same shape: staff's version of an action is gated behind the Mode Édition toggle; a client's version of the same (or a subset of the same) action is gated behind its own `isClient`-involving condition, rendered live regardless of Mode Édition, because clients never have `isAuthorized` and never see that toggle at all. Implement this once as a reusable pattern/helper if the codebase structure allows it, rather than duplicating the logic per layer.

**Evidence vs. configuration data — what can be truly deleted.** Photos (EDL and Réserves) and Réserves' réserves themselves are treated as evidence of an observed physical fact — they're never truly deletable, only mark-in-place/highlight, specifically to prevent anyone using deletion to hide a problem. Autocontrôles (an internal QC construct, not client-facing evidence) can be marked/highlighted via Supprimer, staff-only. Élec./Sanit. instances are configuration/placement data, not evidence — true delete is fine there. Apply this same reasoning if similar delete-vs-mark decisions come up during implementation that aren't explicitly covered above: ask "is this documenting something observed, or just configuration" — evidence-like data should default to mark-not-delete.

**Catalog management stays admin-only; usage is broader.** Config Travaux, Élec./Sanit.'s Item Types and Templates, and the Formulaires template catalog are all admin-managed, while actually *using* what's in those catalogs (filling a checklist, placing a templated item, generating a statement) is open to broader staff and, in several layers, clients too. Keep this split consistent for any new catalog-like structure.

**Every mutating action logs to the Journal** (section 1.6) — this is a blanket requirement across every feature above, not called out individually each time.

---

## Closing note

This document, together with `Database_Changes.md` (the Google Sheets changes, already handled separately), should be sufficient to plan and implement everything described. Where a section says "Open items / assumptions," those are real gaps or judgment calls, not boilerplate — worth a quick check-in on the ones that meaningfully affect a design choice before building that specific piece, but not a reason to block on the rest.
