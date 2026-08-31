// Equivalent of Webapp Files/Security_Code.js's getSession_(): validates a token against the
// sessions table (expiry included) and returns the same identity/display shape the original
// stored in CacheService. Shared by app/src/pages.js (doGet's `data.user`) and RPC functions
// that validate a token argument directly (e.g. gsListProjects) — one implementation, matching
// how the original's getSession_() was itself shared across Pages.js and every *_Code.js file.

const { pool } = require('./db');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getSession(token) {
  // The sessions table's token column is `uuid` — a malformed/garbage token (not just an
  // unknown one) would otherwise reach Postgres and throw a raw type-cast error instead of
  // behaving like any other invalid session. Bug found via RPC testing 2026-08-25: a bad token
  // leaked "invalid input syntax for type uuid" straight to the client instead of the correct
  // "session expired" message every caller (pages.js, gsListProjects, ...) actually expects.
  if (!token || !UUID_RE.test(token)) return null;

  const { rows } = await pool.query(
    `SELECT user_id, email, role, name, enterprise, team, expires_at
       FROM sessions
      WHERE token = $1`,
    [token]
  );
  const session = rows[0];
  if (!session || new Date(session.expires_at) <= new Date()) return null;

  return {
    id: session.user_id,
    email: session.email,
    role: session.role,
    name: session.name,
    enterprise: session.enterprise,
    team: session.team,
  };
}

module.exports = { getSession, UUID_RE };
