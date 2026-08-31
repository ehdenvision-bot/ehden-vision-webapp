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

// ---------------------------------------------------------------------------
// ONE-TIME MIGRATION IMPORT — not a client RPC, not part of the ported surface.
// ---------------------------------------------------------------------------
/**
 * Bulk-load the current Locataires / Bâtiments / Planning-notes sheet data into
 * Postgres, called once from the Apps Script side (Webapp Files/Migrate_Locataires.js's
 * importLocatairesToApi_). Reachable only via POST /bridge/rpc/importLocatairesBundle,
 * so it is already X-Api-Key gated; on top of that it refuses unless the server was
 * started with ALLOW_BULK_IMPORT=true. TRUNCATE + INSERT inside one transaction, so
 * re-running it from the same sheets is idempotent. **Turn ALLOW_BULK_IMPORT off (and
 * restart) once the load is verified** — while it is on, any re-run wipes rows edited
 * through the API since the last import.
 *
 * `bundle` field names match Webapp Files/Locataires_Code.js's fetchSheetData() output:
 *   locataires:    [{ id, batiment, hall, etage, empilement, porte, typeLog,
 *                     configLogement, surface, nom, prenom, adresse, ville,
 *                     telFixe, telPort1, telPort2, email, email2, reference }]
 *   communs:       [{ id, batiment, hall, etage, description, ref, abr }]
 *   facades:       [{ id, id2, batiment, hall, orientation, trame, partie, type }]
 *   configFacades: [{ type, description }]
 *   planningNotes: [{ id, view, status, notePub, notePriv }]   // view kept per source sheet
 *
 * nom/prenom/phones are normalised exactly as updateLocataireData writes them
 * (UPPER / properCase / spaces stripped) so imported rows and later-edited rows are
 * byte-identical in the DB; formatPhoneForUi re-adds spacing at read time.
 */
async function importLocatairesBundle(bundle) {
  if (process.env.ALLOW_BULK_IMPORT !== 'true') {
    throw new Error('Import en masse désactivé (ALLOW_BULK_IMPORT != "true").');
  }
  if (!bundle || typeof bundle !== 'object') throw new Error('Bundle manquant ou invalide.');

  const arr = (v) => (Array.isArray(v) ? v : []);
  const locataires = arr(bundle.locataires);
  const communs = arr(bundle.communs);
  const facades = arr(bundle.facades);
  const configFacades = arr(bundle.configFacades);
  const planningNotes = arr(bundle.planningNotes);

  const txt = (v) => (v === undefined || v === null || v === '' ? null : String(v));
  const cleanPhone = (v) => String(v === undefined || v === null ? '' : v).replace(/\s/g, '');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'TRUNCATE locataires, parties_communes, facades, config_facades, planning_notes'
    );

    for (const r of locataires) {
      await client.query(
        `INSERT INTO locataires
           (id, batiment, hall, etage, empilement, porte, type_log, config_logement, surface,
            nom, prenom, adresse, ville, tel_fixe, tel_port1, tel_port2, email, email2, reference)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (id) DO NOTHING`,
        [
          txt(r.id), txt(r.batiment), txt(r.hall), txt(r.etage), txt(r.empilement), txt(r.porte),
          txt(r.typeLog), txt(r.configLogement), txt(r.surface),
          String(r.nom || '').toUpperCase(), formatProperCase(r.prenom),
          txt(r.adresse), txt(r.ville),
          cleanPhone(r.telFixe), cleanPhone(r.telPort1), cleanPhone(r.telPort2),
          txt(r.email), txt(r.email2), txt(r.reference),
        ]
      );
    }

    for (const r of communs) {
      await client.query(
        `INSERT INTO parties_communes (id, batiment, hall, etage, description, ref, abr)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [txt(r.id), txt(r.batiment), txt(r.hall), txt(r.etage), txt(r.description), txt(r.ref), txt(r.abr)]
      );
    }

    for (const r of facades) {
      await client.query(
        `INSERT INTO facades (id, id2, batiment, hall, orientation, trame, partie, type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [txt(r.id), txt(r.id2), txt(r.batiment), txt(r.hall), txt(r.orientation), txt(r.trame), txt(r.partie), txt(r.type)]
      );
    }

    for (const r of configFacades) {
      await client.query(
        `INSERT INTO config_facades (type, description) VALUES ($1,$2)`,
        [txt(r.type), txt(r.description)]
      );
    }

    for (const r of planningNotes) {
      const id = txt(r.id);
      if (!id) continue;
      await client.query(
        `INSERT INTO planning_notes (id, view, status, note_pub, note_priv)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET view = EXCLUDED.view, status = EXCLUDED.status,
           note_pub = EXCLUDED.note_pub, note_priv = EXCLUDED.note_priv`,
        [id, txt(r.view) || 'Planning', txt(r.status), txt(r.notePub), txt(r.notePriv)]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return {
    imported: {
      locataires: locataires.length,
      parties_communes: communs.length,
      facades: facades.length,
      config_facades: configFacades.length,
      planning_notes: planningNotes.length,
    },
  };
}

module.exports = {
  getLocatairesPageData,
  updateLocataireData,
  updatePlanningOnlyData,
  importLocatairesBundle,
};
