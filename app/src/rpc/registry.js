// RPC registry: one Node async function per Apps Script gs* function, same name, same
// parameter signature, same return/throw shape as the original — see agents/decisions.md and
// agents/todo.md's "Architecture" section. Ported so far: Login_Code.js's
// gsLoginWithEmailPassword/gsLogout, Projects_Code.js's gsListProjects. Everything else in
// agents/todo.md's phase list is NOT here yet — add as each phase is done, one function at a
// time, each with a comment naming the source file it was ported from.

const { pool } = require('../db');
const { verifyPassword } = require('../lib/password');
const { getSession, UUID_RE } = require('../session');
const locataires = require('./locataires');
const settings = require('./settings');

const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 21600); // 6h, matches original
const STATUS_ACTIVE = 'Actif'; // Utilisateurs sheet's French status value — see Login_Code.js

/**
 * Ported from Webapp Files/Login_Code.js's gsLoginWithEmailPassword(email, password).
 * Original: finds user by email, checks password hash, checks account status, creates a
 * session, returns { sessionToken }. Throws (not returns an error object) on failure — matches
 * google.script.run's real error-to-client-failure-handler behavior, which the dispatcher
 * translates back into that shape for the client shim.
 */
async function gsLoginWithEmailPassword(email, password) {
  const { rows } = await pool.query(
    `SELECT id, name, enterprise, email, password_hash, role, team, status
       FROM users WHERE email = $1`,
    [String(email || '').trim().toLowerCase()]
  );
  const user = rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new Error('Email ou mot de passe incorrect.');
  }
  if (user.status !== STATUS_ACTIVE) {
    throw new Error('Votre compte est suspendu. Contactez le support.');
  }

  const { rows: sessionRows } = await pool.query(
    `INSERT INTO sessions (user_id, email, role, name, enterprise, team, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' seconds')::interval)
     RETURNING token`,
    [user.id, user.email, user.role, user.name, user.enterprise, user.team, SESSION_TTL_SECONDS]
  );

  return { sessionToken: sessionRows[0].token };
}

/**
 * Ported from Webapp Files/Login_Code.js's gsLogout(token) — deletes the session row
 * server-side so a leaked/old token can't be reused after explicit sign-out.
 */
async function gsLogout(token) {
  // A malformed (not merely unknown) token would otherwise hit the uuid-typed `token` column
  // and throw "invalid input syntax for type uuid" instead of logging out cleanly — same class
  // of bug already fixed for reads in src/session.js. Apps Script's CacheService.remove() never
  // threw on a bad key, so a bogus token here just means "no row to delete".
  if (!token || !UUID_RE.test(token)) return { ok: true };
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  return { ok: true };
}

/**
 * Ported from Webapp Files/Projects_Code.js's gsListProjects(token). Same fields, same
 * French-locale alphabetical sort by name. Photo/thumbnail lookup (originally a Drive folder
 * read) is NOT ported yet — file/photo storage is an open cross-cutting decision, see
 * agents/todo.md.
 */
async function gsListProjects(token) {
  const user = await getSession(token);
  if (!user) throw new Error('Sécurité : Session expirée.');

  const { rows } = await pool.query(
    `SELECT id, name, owner, status, start_date, end_date, city, country,
            progress, units, description
       FROM projects`
  );
  rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));
  return rows;
}

module.exports = {
  gsLoginWithEmailPassword,
  gsLogout,
  gsListProjects,
  // Phase 2 (Locataires) — see app/src/rpc/locataires.js. Note: unlike gs*-prefixed functions
  // above, the originals here have no "gs" prefix (Locataires_Code.js's own naming) — the
  // registry key must match exactly what the client calls, not a made-up convention.
  getLocatairesPageData: locataires.getLocatairesPageData,
  updateLocataireData: locataires.updateLocataireData,
  updatePlanningOnlyData: locataires.updatePlanningOnlyData,
  // Phase 3 (Settings) — see app/src/rpc/settings.js.
  ...settings,
};
