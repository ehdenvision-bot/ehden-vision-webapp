// Ported from Webapp Files/Settings_Code.js. Client-callable surface confirmed by grepping
// Settings.html (the only file that calls any of these): getSettingsState,
// processProjectGeneration, getHolidaysFromSheet, updateHolidaysInSheet, insertCustomHoliday,
// deleteHolidayFromSheet, updateCustomHoliday, updateSingleHolidayStatus, gsCheckTasksOnDates.
// getPlanningMeta/getPlanningChunk/getTaskSettings are dead code in the original (grepped, never
// called) and are NOT ported. See app/migrations/*create-settings.js for the schema and the
// 'Planning Commun(s)' bug found and fixed here.

const { pool } = require('../db');
const { getSession } = require('../session');
const { assertCanEdit } = require('../security');

const VIEWS = ['Planning', 'Planning Communs', 'Planning Facades']; // see migration file header re: the fixed typo
const RESERVE_VIEWS = ['Planning Reserves', 'Planning Reserves Communs', 'Planning Reserves Facades'];

/** Ported from calculateFrenchHolidays(year) — Gauss's Easter algorithm, verbatim. */
function calculateFrenchHolidays(year) {
  const f = Math.floor,
    G = year % 19,
    C = f(year / 100),
    H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30,
    I = H - f(H / 28) * (1 - f(H / 28) * f(29 / (H + 1)) * f((21 - G) / 11)),
    J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7,
    L = I - J,
    month = 3 + f((L + 40) / 44),
    day = L + 28 - 31 * f(month / 4);

  const easter = new Date(year, month - 1, day);
  const easterMonday = new Date(year, month - 1, day + 1);
  const ascension = new Date(year, month - 1, day + 39);
  const pentecostMonday = new Date(year, month - 1, day + 50);

  return [
    { date: new Date(year, 0, 1), desc: "Jour de l'an" },
    { date: easter, desc: 'Pâques' },
    { date: easterMonday, desc: 'Lundi de Pâques' },
    { date: new Date(year, 4, 1), desc: 'Fête du Travail' },
    { date: new Date(year, 4, 8), desc: 'Armistice 39/45' },
    { date: ascension, desc: 'Ascension' },
    { date: pentecostMonday, desc: 'Lundi de Pentecôte' },
    { date: new Date(year, 6, 14), desc: 'Fête Nationale' },
    { date: new Date(year, 7, 15), desc: 'Assomption' },
    { date: new Date(year, 10, 1), desc: 'Toussaint' },
    { date: new Date(year, 10, 11), desc: 'Armistice 14/18' },
    { date: getJourDuPatron(year), desc: 'Jour du Patron', typeFixe: 'Non' },
    { date: new Date(year, 11, 25), desc: 'Noël' },
  ];
}

/** Ported from getJourDuPatron(year). */
function getJourDuPatron(year) {
  let d = new Date(year, 11, 24);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** dd/MM/yyyy, matching Utilities.formatDate's original format exactly — not locale-dependent. */
function toFrDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function parseDateSafe(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Ported from Settings_Code.js's getSettingsState(token). */
async function getSettingsState(token) {
  const user = await getSession(token);
  if (!user) throw new Error('Sécurité : Session expirée.');

  const { rows } = await pool.query(
    `SELECT is_created, start_date, end_date FROM planning_grid_state WHERE view = 'Planning'`
  );
  const row = rows[0];
  if (!row || !row.is_created) return { isCreated: false, currentStart: '', currentEnd: '' };

  // start_date/end_date come back as plain "YYYY-MM-DD" strings — see db.js's date type parser
  // override (avoids the pg-driver-returns-a-UTC-midnight-Date-object gotcha entirely).
  return {
    isCreated: true,
    currentStart: row.start_date || '',
    currentEnd: row.end_date || '',
  };
}

/**
 * Ported from Settings_Code.js's getHolidaysFromSheet_()/getHolidaysFromSheet(token) — merged
 * into one function since the port has no equivalent of "internal, no token needed" vs. "public
 * wrapper" (every RPC entry point is reachable the same way; getHolidaysFromSheet_ was only
 * ever called internally by processProjectGeneration, which calls this module's own function
 * directly, not through the RPC dispatcher).
 */
async function getHolidaysFromSheet(token) {
  const user = await getSession(token);
  if (!user) throw new Error('Sécurité : Session expirée.');
  return fetchHolidays();
}

async function fetchHolidays() {
  const { rows } = await pool.query(
    `SELECT date, description, type_fixe, jour_ouvre FROM holidays ORDER BY date`
  );
  return rows.map((r) => ({
    dateStr: r.date, // already "YYYY-MM-DD" — see db.js's date type parser override
    desc: r.description,
    typeFixe: r.type_fixe,
    isWorkingDay: r.jour_ouvre,
  }));
}

/**
 * Ported from saveHolidaysToSheet(newStart, newEnd) — recomputes auto-calculated holidays for
 * every year in [newStart, newEnd], merges with existing custom holidays (type_fixe === 'Non'),
 * dedupes by (date, desc), and replaces the whole table — matches the original exactly (it
 * clears and rewrites the full 'Conges' sheet range every time, not just the affected years).
 */
async function saveHolidaysToSheet(newStart, newEnd) {
  // Normalized to plain "YYYY-MM-DD" strings throughout (not Date objects) — `date` from
  // Postgres already is one (db.js's type parser), and auto-computed ones are converted via
  // toIsoDate() immediately rather than carried as Date objects through the merge/dedup, to
  // avoid the exact Date-object-timezone-ambiguity class of bug found in this same function
  // during verification (see server.js's TZ comment and agents/decisions.md).
  const { rows: existing } = await pool.query(`SELECT date, description, type_fixe, jour_ouvre FROM holidays`);
  const customHolidays = existing
    .filter((r) => r.type_fixe === 'Non')
    .map((r) => [r.date, r.description, r.type_fixe, r.jour_ouvre]);

  const autoHolidays = [];
  for (let year = newStart.getFullYear(); year <= newEnd.getFullYear(); year++) {
    calculateFrenchHolidays(year).forEach((h) => {
      autoHolidays.push([toIsoDate(h.date), h.desc, h.typeFixe === 'Non' ? 'Non' : 'Oui', 'Non']);
    });
  }

  const merged = [...autoHolidays, ...customHolidays];
  const seen = new Set();
  const cleaned = [];
  for (const row of merged) {
    const key = row[0] + '##' + String(row[1]).toUpperCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(row);
  }

  await pool.query('DELETE FROM holidays');
  for (const [date, desc, typeFixe, jourOuvre] of cleaned) {
    await pool.query(
      `INSERT INTO holidays (date, description, type_fixe, jour_ouvre) VALUES ($1, $2, $3, $4)
       ON CONFLICT (date, description) DO NOTHING`,
      [date, desc, typeFixe, jourOuvre]
    );
  }
}

/**
 * Equivalent of syncPlanningRow1() — the original writes a derived "is this date a working day"
 * flag onto row 1 of each of the 3 planning sheets, for the grid's rendering to read later. In
 * this relational schema that flag is just computed on demand from `holidays` (Phase 5, when
 * the Planning page actually needs it), not a stored artifact to keep in sync — so there is
 * nothing to do here. Kept as a function (rather than removing the call sites below) so the
 * ported code's structure/call order still mirrors the original 1:1, and so this comment is
 * where a future session will find the explanation.
 */
async function syncPlanningRow1() {
  // Intentionally a no-op — see comment above.
}

/** Ported from Settings_Code.js's processProjectGeneration(token, params, projectId). */
async function processProjectGeneration(token, params, projectId) {
  await assertCanEdit(token, projectId);

  const { startDate, endDate, months, mode } = params;
  const newStart = new Date(startDate);
  newStart.setHours(0, 0, 0, 0);
  const newEnd = months
    ? new Date(new Date(newStart).setMonth(newStart.getMonth() + parseInt(months, 10)))
    : new Date(endDate);
  newEnd.setHours(23, 59, 59, 999);

  if (mode !== 'create') {
    if (newEnd.getTime() < newStart.getTime()) {
      throw new Error('La date de fin doit être après la date de début.');
    }

    for (const view of VIEWS) {
      const { rows } = await pool.query(
        `SELECT entity_id, date FROM planning_cells
          WHERE view = $1 AND value IS NOT NULL AND value != ''
            AND (date < $2 OR date > $3)
          LIMIT 1`,
        [view, toIsoDate(newStart), toIsoDate(newEnd)]
      );
      if (rows[0]) {
        const formattedDate = toFrDate(new Date(rows[0].date));
        throw new Error(
          `DATA_LOSS_PREVENTION: Impossible de réduire les dates. L'ID ${rows[0].entity_id} contient des données le ${formattedDate} dans le "${view}".`
        );
      }
    }
  }

  await saveHolidaysToSheet(newStart, newEnd);

  for (const view of VIEWS) {
    await pool.query(
      `INSERT INTO planning_grid_state (view, is_created, start_date, end_date)
       VALUES ($1, true, $2, $3)
       ON CONFLICT (view) DO UPDATE SET is_created = true, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date`,
      [view, toIsoDate(newStart), toIsoDate(newEnd)]
    );
  }
  await syncPlanningRow1();

  return 'Projet généré/mis à jour avec succès pour les 3 plannings.';
}

/** Ported from Settings_Code.js's updateHolidaysInSheet(token, dataArray, projectId). */
async function updateHolidaysInSheet(token, dataArray, projectId) {
  await assertCanEdit(token, projectId);

  await pool.query('DELETE FROM holidays');
  for (const row of dataArray || []) {
    const d = parseDateSafe(row[0]);
    await pool.query(
      `INSERT INTO holidays (date, description, type_fixe, jour_ouvre) VALUES ($1, $2, $3, $4)
       ON CONFLICT (date, description) DO NOTHING`,
      [toIsoDate(d), row[1], row[2], row[3]]
    );
  }

  await syncPlanningRow1();
  return true;
}

/** Ported from Settings_Code.js's insertCustomHoliday(token, dateStr, desc, isFixed, year, projectId).
 * isFixed/year are accepted (matching the original's signature/positional args, since
 * projectId's position depends on it) but genuinely unused server-side in the original too —
 * every inserted row is hardcoded type_fixe='Non', jour_ouvre='Non' regardless of their value. */
async function insertCustomHoliday(token, dateStr, desc, isFixed, year, projectId) {
  await assertCanEdit(token, projectId);

  const d = parseDateSafe(dateStr);
  await pool.query(
    `INSERT INTO holidays (date, description, type_fixe, jour_ouvre) VALUES ($1, $2, 'Non', 'Non')
     ON CONFLICT (date, description) DO NOTHING`,
    [toIsoDate(d), desc]
  );

  await syncPlanningRow1();
  return true;
}

/** Ported from Settings_Code.js's deleteHolidayFromSheet(token, dateStr, desc, projectId). */
async function deleteHolidayFromSheet(token, dateStr, desc, projectId) {
  await assertCanEdit(token, projectId);
  await pool.query('DELETE FROM holidays WHERE date = $1 AND description = $2', [dateStr, desc]);
  await syncPlanningRow1();
}

/** Ported from Settings_Code.js's updateCustomHoliday(token, oldDateStr, oldDesc, newDateStr, newDesc, projectId).
 * Only matches rows with type_fixe = 'Non' (custom), same restriction as the original — and,
 * matching the original exactly, always resets jour_ouvre back to 'Non' on edit. */
async function updateCustomHoliday(token, oldDateStr, oldDesc, newDateStr, newDesc, projectId) {
  await assertCanEdit(token, projectId);

  await pool.query(
    `UPDATE holidays SET date = $3, description = $4, jour_ouvre = 'Non'
      WHERE date = $1 AND description = $2 AND type_fixe = 'Non'`,
    [oldDateStr, oldDesc, toIsoDate(parseDateSafe(newDateStr)), newDesc]
  );
  return true;
}

/** Ported from Settings_Code.js's updateSingleHolidayStatus(token, dateStr, status, projectId). */
async function updateSingleHolidayStatus(token, dateStr, status, projectId) {
  await assertCanEdit(token, projectId);
  await pool.query('UPDATE holidays SET jour_ouvre = $2 WHERE date = $1', [dateStr, status]);
  await syncPlanningRow1();
  return true;
}

/**
 * Ported from Settings_Code.js's gsCheckTasksOnDates(token, datesToCheck). Checks the 3
 * Planning views plus the 3 "Planning Reserves*" views (EDL/Réserves territory — Phase 4, not
 * modeled yet, so those simply never match, same as an empty/nonexistent sheet in the original).
 */
async function gsCheckTasksOnDates(token, datesToCheck) {
  const user = await getSession(token);
  if (!user) throw new Error('Sécurité : Session expirée.');

  const { rows } = await pool.query(
    `SELECT DISTINCT date FROM planning_cells
      WHERE view = ANY($1) AND date = ANY($2::date[]) AND value IS NOT NULL AND value != ''`,
    [[...VIEWS, ...RESERVE_VIEWS], datesToCheck]
  );
  const conflictedDates = rows.map((r) => r.date); // already "YYYY-MM-DD" — see db.js
  return { hasTasks: conflictedDates.length > 0, dates: conflictedDates };
}

module.exports = {
  getSettingsState,
  processProjectGeneration,
  getHolidaysFromSheet,
  updateHolidaysInSheet,
  insertCustomHoliday,
  deleteHolidayFromSheet,
  updateCustomHoliday,
  updateSingleHolidayStatus,
  gsCheckTasksOnDates,
};
