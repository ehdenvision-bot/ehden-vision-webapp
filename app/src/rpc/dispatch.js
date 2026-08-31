// Generic RPC dispatcher: POST /rpc/<fn> -> registry[fn](...args), mirroring how
// google.script.run.<fn>(...args) worked in the original — see render.js's client shim for the
// other half of this bridge. One dispatcher, one registry, instead of a bespoke REST route per
// module — keeps every server function a 1:1 port of its Apps Script original (same name, same
// signature), which is the whole point of this architecture (see agents/decisions.md).

const express = require('express');
const registry = require('./registry');

const router = express.Router();

router.post('/:fn', async (req, res) => {
  const fn = registry[req.params.fn];
  if (typeof fn !== 'function') {
    return res.status(404).json({ message: `No RPC function named "${req.params.fn}".` });
  }

  const args = Array.isArray(req.body?.args) ? req.body.args : [];
  const startedAt = Date.now();
  // Bridge calls (src/appscript-auth.js) set req.viaBridge / req.callerEmail; the browser shim
  // path sets neither. Logging both timing and origin here is the only latency/quota visibility
  // there is once Apps Script is calling over the public internet.
  const tag = req.viaBridge ? `bridge rpc ${req.params.fn}` : `rpc ${req.params.fn}`;
  const who = req.callerEmail ? ` <${req.callerEmail}>` : '';
  try {
    const result = await fn(...args);
    console.log(`${tag}${who} ok ${Date.now() - startedAt}ms`);
    res.json({ result: result === undefined ? null : result });
  } catch (err) {
    // Matches what the client shim's .withFailureHandler expects: an Error-like object with
    // .message, the same as what google.script.run delivers when a server function throws.
    console.error(`${tag}${who} FAIL ${Date.now() - startedAt}ms:`, err);
    res.status(400).json({ message: err.message || 'Erreur serveur.' });
  }
});

module.exports = router;
