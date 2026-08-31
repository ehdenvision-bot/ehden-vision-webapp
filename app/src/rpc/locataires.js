// Ported from Webapp Files/Locataires_Code.js — client-callable surface confirmed by grepping
// Locataires_Scripts.html / LocatairesMobile.html for google.script.run.*: getLocatairesPageData,
// updateLocataireData, updatePlanningOnlyData. Everything else in the original file
// (fetchAllNotes, fetchSheetData, updatePlanningData, formatProperCase, formatPhoneForUi) is an
// internal helper, not a separate RPC target — same distinction the original made informally by
// never calling them from the client.

const { pool } = require('../db');
const { getSession } = require('../session');
const { assertCanEdit } = require('../security');

/** Ported from Locataires_Code.js's formatProperCase(). */
function formatProperCase(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/(^|\s|-)\S/g, (l) => l.toUpperCase());
}

/** Ported from Locataires_Code.js's formatPhoneForUi(). */
function formatPhoneForUi(num) {
  if (!num) return '';
  let s = String(num).replace(/\s/g, '');
  if (s.length === 9 && !s.startsWith('0')) s = '0' + s;
  return s.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

/** Ported from fetchSheetData('Locataires') — display formatting applied at read time, matching the original. */
async function fetchLocataires() {
  const { rows } = await pool.query(
    `SELECT id, batiment, hall, etage, empilement, porte,
            type_log AS "typeLog", config_logement AS "configLogement", surface,
            nom, prenom, adresse, ville,
            tel_fixe AS "telFixe", tel_port1 AS "telPort1", tel_port2 AS "telPort2",
            email, email2, reference
       FROM locataires`
  );
  return rows.map((r) => ({
    ...r,
    nom: String(r.nom || '').toUpperCase(),
    prenom: formatProperCase(r.prenom),
    telFixe: formatPhoneForUi(r.telFixe),
    telPort1: formatPhoneForUi(r.telPort1),
    telPort2: formatPhoneForUi(r.telPort2),
  }));
}

/** Ported from fetchSheetData('Parties communes'). */
async function fetchPartiesCommunes() {
  const { rows } = await pool.query(
    `SELECT id, batiment, hall, etage, description, ref, abr FROM parties_communes`
  );
  return rows;
}

/** Ported from fetchSheetData('Facades'). */
async function fetchFacades() {
  const { rows } = await pool.query(
    `SELECT id, id2, batiment, hall, orientation, trame, partie, type FROM facades`
  );
  return rows;
}

/** Ported from fetchSheetData('Config Facades'). */
async function fetchConfigFacades() {
  const { rows } = await pool.query(`SELECT type, description FROM config_facades`);
  return rows;
}

/** Ported from fetchAllNotes() — combines the 3 planning-notes views into one id-keyed map. */
async function fetchAllNotes() {
  const { rows } = await pool.query(`SELECT id, status, note_pub, note_priv FROM planning_notes`);
  const combined = {};
  for (const row of rows) {
    combined[row.id] = {
      status: row.status || '',
      note: row.note_pub || '',
      privateNote: row.note_priv || '',
    };
  }
  return combined;
}

/**
 * Ported from Locataires_Code.js's getLocatairesPageData(token, projectId). projectId is
 * passed through for context/logging in the original but not used for auth there either.
 */
async function getLocatairesPageData(token) {
  const user = await getSession(token);
  if (!user) throw new Error('Sécurité : Session expirée.');

  const [locataires, communs, facades, configFacades, planning] = await Promise.all([
    fetchLocataires(),
    fetchPartiesCommunes(),
    fetchFacades(),
    fetchConfigFacades(),
    fetchAllNotes(),
  ]);

  return { locataires, communs, facades, configFacades, planning };
}

/** Ported from updatePlanningData(payload, explicitSheetName) — upsert into planning_notes. */
async function updatePlanningData(payload, explicitView) {
  const id = String(payload.id || '');
  if (!id) return;

  const view =
    explicitView ||
    (id.startsWith('COM-') ? 'Planning Communs' : id.startsWith('FAC-') ? 'Planning Facades' : 'Planning');

  const notePub = payload.planNote || '';
  const notePriv = payload.planPrivateNote || '';

  await pool.query(
    `INSERT INTO planning_notes (id, view, status, note_pub, note_priv)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, note_pub = EXCLUDED.note_pub,
       note_priv = EXCLUDED.note_priv`,
    [id, view, payload.planStatus || '', notePub, notePriv]
  );
}

/** Ported from Locataires_Code.js's updateLocataireData(token, projectId, payload). */
async function updateLocataireData(token, projectId, payload) {
  await assertCanEdit(token, projectId);

  const cleanPhone = (num) => String(num || '').replace(/\s/g, '');

  const { rowCount } = await pool.query(
    `UPDATE locataires
        SET nom = $2, prenom = $3, tel_fixe = $4, tel_port1 = $5, tel_port2 = $6,
            email = $7, email2 = $8
      WHERE id = $1`,
    [
      String(payload.id),
      String(payload.nom || '').toUpperCase(),
      formatProperCase(payload.prenom),
      cleanPhone(payload.telFixe),
      cleanPhone(payload.telPort1),
      cleanPhone(payload.telPort2),
      payload.email,
      payload.email2,
    ]
  );
  if (rowCount === 0) throw new Error('Identifiant non trouvé.');

  await updatePlanningData(payload);
  return true;
}

/** Ported from Locataires_Code.js's updatePlanningOnlyData(token, projectId, view, payload). */
async function updatePlanningOnlyData(token, projectId, view, payload) {
  await assertCanEdit(token, projectId);
  const sheetName = view === 'communs' ? 'Planning Communs' : view === 'facades' ? 'Planning Facades' : 'Planning';
  await updatePlanningData(payload, sheetName);
  return true;
}

module.exports = { getLocatairesPageData, updateLocataireData, updatePlanningOnlyData };
