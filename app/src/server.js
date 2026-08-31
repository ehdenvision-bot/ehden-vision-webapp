// Must be set before anything else touches Date — Apps Script's V8 runtime executes in UTC, so
// the original code's date arithmetic (e.g. Settings_Code.js's `new Date(startDate);
// setHours(0,0,0,0)`) is only unambiguous there because the process timezone is UTC. This
// sandbox's host timezone is Asia/Beirut (UTC+3), which happened to mask a day-off-by-one bug
// for some code paths and would have caused a different one in a negative-UTC-offset
// environment — found 2026-08-25 during Settings phase verification (holidays landing 1-2 days
// early). Locking to UTC matches the environment the original code actually assumes, rather
// than depending on whatever timezone this process happens to run in. See db.js's date type
// parser fix (same root cause, the read side) and agents/decisions.md.
process.env.TZ = 'UTC';

require('dotenv').config();
const express = require('express');
const { pool } = require('./db');

const pagesRouter = require('./pages');
const rpcRouter = require('./rpc/dispatch');
const rpcRegistry = require('./rpc/registry');
const { requireApiKey } = require('./appscript-auth');

const app = express();
// Bulk data-import calls from the Apps Script bridge (a whole sheet in one POST) blow past
// express.json()'s 100kb default — RPC_BODY_LIMIT overrides it (applies to /rpc too, harmless).
app.use(express.json({ limit: process.env.RPC_BODY_LIMIT || '5mb' }));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'down', error: err.message });
  }
});

// --- Apps Script -> Node bridge (see appscript-auth.js and agents/decisions.md) ---
// Same registry, same {args:[...]} shape as /rpc, but shared-secret gated because these
// requests come from Google's servers (UrlFetchApp), not a same-origin browser. Kept separate
// from /rpc so the existing google.script.run shim path keeps working untouched.
app.get('/bridge/health', requireApiKey, async (req, res) => {
  let db = 'up';
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    db = 'down';
  }
  res.json({
    ok: db === 'up',
    db,
    caller: req.callerEmail,
    time: new Date().toISOString(),
    rpcFunctions: Object.keys(rpcRegistry).sort(),
  });
});
app.use('/bridge/rpc', requireApiKey, rpcRouter);

app.use('/rpc', rpcRouter);
// Serves the literal Webapp Files/*.html templates — see pages.js and render.js.
app.use('/', pagesRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Erreur serveur.');
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ehden Vision (Node/Postgres rewrite) listening on 0.0.0.0:${PORT}`);
});
