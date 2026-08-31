/**
 * Phase 3 (Settings) — from Webapp Files/Settings_Code.js, read end-to-end. Client-callable
 * surface confirmed by grep (Settings.html only): getSettingsState, processProjectGeneration,
 * getHolidaysFromSheet, updateHolidaysInSheet, insertCustomHoliday, deleteHolidayFromSheet,
 * updateCustomHoliday, updateSingleHolidayStatus, gsCheckTasksOnDates. getPlanningMeta/
 * getPlanningChunk/getTaskSettings are dead code (never called from any client script) — not
 * ported.
 *
 * Bug found and fixed in the port (not preserved): the original's processProjectGeneration/
 * gsCheckTasksOnDates use the sheet name 'Planning Commun' (no "s"), while every other module
 * (Planing_Code.js, Locataires_Code.js) uses 'Planning Communs'. Since getSheetByName() returns
 * null on a miss and the original code just `return`s silently, this means the live app's
 * grid-(re)generation and data-loss check silently no-op for the common-areas view. The port
 * uses 'Planning Communs' consistently everywhere — see agents/decisions.md.
 *
 * Schema notes (relational redesign, not a literal spreadsheet-grid copy — see
 * app/src/rpc/settings.js's comments for why this is a faithful *behavioral* port despite the
 * shape being different):
 *   - `planning_grid_state`: one row per view ('Planning' | 'Planning Communs' |
 *     'Planning Facades', to be extended by Phase 5), replacing the spreadsheet's A1 marker +
 *     row-2 date-range cells.
 *   - `planning_cells`: sparse (view, entity_id, date) -> value, replacing the wide per-date
 *     grid columns. Empty cells simply don't have a row — no need to pre-allocate a column per
 *     date the way a spreadsheet does. Populated by Phase 5's task-writing functions; Settings
 *     only reads/checks it (data-loss prevention, gsCheckTasksOnDates).
 *   - `holidays`: mirrors the 'Conges' sheet exactly (date, description, type_fixe, jour_ouvre).
 *     No "row1"/sync-to-grid artifact is modeled — the original's syncPlanningRow1() writes a
 *     derived working-day flag onto each of the 3 planning sheets' row 1; in a relational model
 *     that's just a computed value (date not in holidays, or a weekday), not stored state — see
 *     app/src/rpc/settings.js.
 */

exports.up = (pgm) => {
  pgm.createTable('planning_grid_state', {
    view: { type: 'text', primaryKey: true },
    is_created: { type: 'boolean', notNull: true, default: false },
    start_date: { type: 'date' },
    end_date: { type: 'date' },
  });

  pgm.createTable('planning_cells', {
    view: { type: 'text', notNull: true },
    entity_id: { type: 'text', notNull: true },
    date: { type: 'date', notNull: true },
    value: { type: 'text' },
  });
  pgm.addConstraint('planning_cells', 'planning_cells_pk', {
    primaryKey: ['view', 'entity_id', 'date'],
  });
  pgm.createIndex('planning_cells', ['view', 'date']); // gsCheckTasksOnDates' access pattern

  pgm.createTable('holidays', {
    id: 'id',
    date: { type: 'date', notNull: true },
    description: { type: 'text', notNull: true },
    type_fixe: { type: 'text', notNull: true, default: 'Oui' }, // 'Oui' = auto-calculated, 'Non' = custom
    jour_ouvre: { type: 'text', notNull: true, default: 'Non' }, // 'Oui' overrides it back to a working day
  });
  pgm.addConstraint('holidays', 'holidays_date_desc_unique', {
    unique: ['date', 'description'],
  });
};

exports.down = (pgm) => {
  pgm.dropTable('holidays');
  pgm.dropTable('planning_cells');
  pgm.dropTable('planning_grid_state');
};
