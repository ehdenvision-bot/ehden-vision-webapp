'use strict';

/**
 * Locataires RPC + one-time bulk import.
 *
 *   npm test                                  # unit tests only; the DB block SKIPS
 *   TEST_DATABASE_URL=postgres://u:p@host/ehden_test npm test
 *                                             # + the integration block
 *
 * The integration block calls importLocatairesBundle, which TRUNCATEs 5 tables. It
 * refuses to run unless TEST_DATABASE_URL is set AND differs from DATABASE_URL, so it
 * can never touch a real database. Point it at a throwaway DB; the block runs the real
 * migrations into it and cleans up after itself.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REAL_DB = process.env.DATABASE_URL;
const TEST_DB = process.env.TEST_DATABASE_URL;
const DB_OK = !!TEST_DB && TEST_DB !== REAL_DB;

// The app's pg Pool (src/db.js) reads DATABASE_URL at require time — repoint it at the
// throwaway DB BEFORE requiring anything from src/.
if (DB_OK) process.env.DATABASE_URL = TEST_DB;
process.env.ALLOW_BULK_IMPORT = 'true';

const locataires = require('../src/rpc/locataires');
const registry = require('../src/rpc/registry');
const { pool } = require('../src/db');

const BUNDLE = {
  locataires: [
    {
      id: 'L1A', batiment: 'B01', hall: 'A', etage: '1', empilement: '', porte: '1',
      typeLog: 'T3', configLogement: 'std', surface: 62,
      nom: 'dupont', prenom: 'JEAN-PIERRE', adresse: '1 rue X', ville: 'Ehden',
      telFixe: '01 23 45 67 89', telPort1: '0612345678', telPort2: '',
      email: 'a@b.co', email2: '', reference: 'R-1',
    },
    {
      id: 'L1B', batiment: 'B01', hall: 'A', etage: '1', empilement: '', porte: '2',
      typeLog: 'T2', configLogement: 'std', surface: 45,
      nom: 'Martin', prenom: 'marie claire', adresse: '', ville: '',
      telFixe: '', telPort1: '612345679', telPort2: '', email: '', email2: '', reference: '',
    },
  ],
  communs: [
    { id: 'COM-1', batiment: 'B01', hall: 'A', etage: '0', description: 'Hall', ref: 'H1', abr: 'HA' },
  ],
  facades: [
    { id: 'FAC-1', id2: 'N-01', batiment: 'B01', hall: 'A', orientation: 'Nord', trame: 'T1', partie: 'haute', type: 'ITE' },
  ],
  configFacades: [{ type: 'ITE', description: 'Isolation ext' }],
  planningNotes: [
    { id: 'L1A', view: 'Planning', status: 'en cours', notePub: 'ok', notePriv: 'secret' },
    { id: 'COM-1', view: 'Planning Communs', status: 'fait', notePub: '', notePriv: '' },
    { id: 'FAC-1', view: 'Planning Facades', status: '', notePub: 'facade note', notePriv: '' },
  ],
};

// ===========================================================================
// UNIT — no database
// ===========================================================================

test('importLocatairesBundle refuses unless ALLOW_BULK_IMPORT=true', async () => {
  const prev = process.env.ALLOW_BULK_IMPORT;
  process.env.ALLOW_BULK_IMPORT = 'false';
  try {
    await assert.rejects(() => locataires.importLocatairesBundle(BUNDLE), /ALLOW_BULK_IMPORT/);
  } finally {
    process.env.ALLOW_BULK_IMPORT = prev;
  }
});

test('importLocatairesBundle rejects a missing bundle', async () => {
  await assert.rejects(() => locataires.importLocatairesBundle(null), /Bundle/);
});

test('getLocatairesPageData rejects a non-UUID token without hitting the DB', async () => {
  await assert.rejects(() => locataires.getLocatairesPageData('not-a-uuid'), /Session expirée/);
});

test('updateLocataireData rejects a missing token', async () => {
  await assert.rejects(
    () => locataires.updateLocataireData('', 'P1', { id: 'x' }),
    /Jeton de session manquant/,
  );
});

test('updatePlanningOnlyData rejects a missing token', async () => {
  await assert.rejects(
    () => locataires.updatePlanningOnlyData('', 'P1', 'communs', { id: 'x' }),
    /Jeton de session manquant/,
  );
});

test('registry exposes the Locataires surface + the import tool', () => {
  for (const fn of [
    'getLocatairesPageData', 'updateLocataireData', 'updatePlanningOnlyData', 'importLocatairesBundle',
  ]) {
    assert.equal(typeof registry[fn], 'function', fn);
  }
});

// ===========================================================================
// INTEGRATION — needs TEST_DATABASE_URL (a throwaway db, != DATABASE_URL)
// ===========================================================================

test('Locataires integration', {
  skip: DB_OK ? false : 'set TEST_DATABASE_URL (different from DATABASE_URL) to run',
}, async (t) => {
  const PROJECT_ID = 'TEST-PROJ';
  let sessionToken;

  t.before(async () => {
    const migrate = require('node-pg-migrate').default;
    await migrate({
      databaseUrl: process.env.DATABASE_URL,
      dir: path.join(__dirname, '..', 'migrations'),
      direction: 'up',
      count: Infinity,
      migrationsTable: 'pgmigrations',
    });

    const { rows: userRows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Test', 'test@ehden.co', 'x', 'admin', 'Actif')
       ON CONFLICT (email) DO UPDATE SET role = 'admin'
       RETURNING id`,
    );
    await pool.query(
      `INSERT INTO projects (id, name, status) VALUES ($1, 'Test', 'active')
       ON CONFLICT (id) DO UPDATE SET status = 'active'`,
      [PROJECT_ID],
    );
    const { rows: sessRows } = await pool.query(
      `INSERT INTO sessions (user_id, email, role, name, expires_at)
       VALUES ($1, 'test@ehden.co', 'admin', 'Test', now() + interval '1 hour')
       RETURNING token`,
      [userRows[0].id],
    );
    sessionToken = sessRows[0].token;
  });

  t.after(async () => {
    await pool.query('TRUNCATE locataires, parties_communes, facades, config_facades, planning_notes');
    await pool.query(`DELETE FROM sessions WHERE email = 'test@ehden.co'`);
    await pool.query(`DELETE FROM projects WHERE id = $1`, [PROJECT_ID]);
    await pool.query(`DELETE FROM users WHERE email = 'test@ehden.co'`);
    await pool.end();
  });

  await t.test('import loads every table and returns counts', async () => {
    const res = await locataires.importLocatairesBundle(BUNDLE);
    assert.deepEqual(res.imported, {
      locataires: 2, parties_communes: 1, facades: 1, config_facades: 1, planning_notes: 3,
    });
  });

  await t.test('import normalises nom / prenom / phones like updateLocataireData writes them', async () => {
    const { rows } = await pool.query('SELECT id, nom, prenom, tel_fixe, tel_port1 FROM locataires ORDER BY id');
    assert.equal(rows[0].nom, 'DUPONT');
    assert.equal(rows[0].prenom, 'Jean-Pierre');
    assert.equal(rows[0].tel_fixe, '0123456789'); // spaces stripped on store
    assert.equal(rows[1].prenom, 'Marie Claire');
    assert.equal(rows[1].tel_port1, '612345679'); // stored raw; the leading-0 fix is a read-time thing
  });

  await t.test('import is idempotent — a second run leaves the same rows', async () => {
    await locataires.importLocatairesBundle(BUNDLE);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM locataires');
    assert.equal(rows[0].n, 2);
  });

  await t.test('getLocatairesPageData returns the ported shape with read-time formatting', async () => {
    const data = await locataires.getLocatairesPageData(sessionToken);
    assert.deepEqual(
      Object.keys(data).sort(),
      ['communs', 'configFacades', 'facades', 'locataires', 'planning'],
    );
    const l1a = data.locataires.find((r) => r.id === 'L1A');
    assert.equal(l1a.nom, 'DUPONT');
    assert.equal(l1a.telFixe, '01 23 45 67 89'); // formatPhoneForUi re-spaces
    const l1b = data.locataires.find((r) => r.id === 'L1B');
    assert.equal(l1b.telPort1, '06 12 34 56 79'); // 9 digits -> leading 0 added, then spaced
    assert.deepEqual(data.planning.L1A, { status: 'en cours', note: 'ok', privateNote: 'secret' });
    assert.equal(data.planning['COM-1'].status, 'fait');
  });

  await t.test('updateLocataireData writes contact fields + the planning note', async () => {
    const ok = await locataires.updateLocataireData(sessionToken, PROJECT_ID, {
      id: 'L1A', nom: 'nouveau', prenom: 'yves',
      telFixe: '09 88 77 66 55', telPort1: '', telPort2: '', email: 'x@y.co', email2: '',
      planStatus: 'terminé', planNote: 'done', planPrivateNote: 'p',
    });
    assert.equal(ok, true);
    const { rows } = await pool.query("SELECT nom, prenom, tel_fixe, email FROM locataires WHERE id = 'L1A'");
    assert.deepEqual(rows[0], { nom: 'NOUVEAU', prenom: 'Yves', tel_fixe: '0988776655', email: 'x@y.co' });
    const { rows: pn } = await pool.query("SELECT status, note_pub, note_priv FROM planning_notes WHERE id = 'L1A'");
    assert.deepEqual(pn[0], { status: 'terminé', note_pub: 'done', note_priv: 'p' });
  });

  await t.test('updateLocataireData throws on an unknown id', async () => {
    await assert.rejects(
      () => locataires.updateLocataireData(sessionToken, PROJECT_ID, { id: 'NOPE', nom: 'a', prenom: 'b' }),
      /Identifiant non trouvé/,
    );
  });

  await t.test('updatePlanningOnlyData maps the view name and upserts', async () => {
    await locataires.updatePlanningOnlyData(sessionToken, PROJECT_ID, 'facades', {
      id: 'FAC-1', planStatus: 'ok', planNote: 'n', planPrivateNote: '',
    });
    const { rows } = await pool.query("SELECT view, status FROM planning_notes WHERE id = 'FAC-1'");
    assert.equal(rows[0].view, 'Planning Facades');
    assert.equal(rows[0].status, 'ok');
  });

  await t.test('a garbage token is rejected as an expired session, not a DB error', async () => {
    await assert.rejects(
      () => locataires.updateLocataireData('11111111-1111-1111-1111-111111111111', PROJECT_ID, { id: 'L1A', nom: 'a', prenom: 'b' }),
      /session a expiré/,
    );
  });
});
