const { Pool, types } = require('pg');

// pg's default behavior parses `date` columns into a JS Date object at UTC midnight of that
// calendar date — combined with any local-timezone-aware formatting downstream (e.g.
// toISOString(), or local getters in a negative-UTC-offset environment), that silently shifts
// the date by a day. Found 2026-08-25 via Settings phase verification (holidays and date
// ranges were landing 1-2 days early in this sandbox's Asia/Beirut, UTC+3, timezone — see
// agents/decisions.md). Returning the raw "YYYY-MM-DD" string instead removes the ambiguity
// entirely, independent of the server's host timezone. OID 1082 = date.
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  // Idle client errors (e.g. connection dropped) — log, don't crash the process.
  console.error('Unexpected Postgres pool error:', err);
});

module.exports = { pool };
