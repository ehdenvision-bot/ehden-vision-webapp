// Auth gate for the Apps Script -> Node bridge (see agents/decisions.md, "Open Decisions").
//
// The idea this supports: the live app stays a Google Apps Script web app hosted on Google
// Workspace, but its `*_Code.js` data functions call THIS server over HTTPS via UrlFetchApp
// instead of reading Google Sheets. Those requests originate from Google's infrastructure, not
// a browser, so the trust model is different from the same-origin `google.script.run` shim:
//
//   - X-Api-Key (a shared secret) authenticates "this request really came from our Apps Script
//     project". Once the server is publicly reachable, /bridge/rpc/* is otherwise open to the
//     world — this header is the only thing gating it.
//   - The session token passed as a normal RPC argument still authenticates *which user* — no
//     change, every ported function already validates it via getSession()/assertCanEdit().
//   - X-User-Email is advisory only (logging). The live deployment is ANYONE_ANONYMOUS, so
//     Session.getActiveUser().getEmail() is frequently "" on the Apps Script side; never trust
//     it for authorization.
//
// Mounted on /bridge/rpc, NOT on /rpc: the browser shim (src/render.js) keeps hitting /rpc
// unauthenticated same-origin. Both consumers coexist until the user picks one.

const crypto = require('node:crypto');

// Length-independent constant-time compare — avoids leaking the secret's length or a
// byte-by-byte match position via response timing.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  const max = Math.max(ab.length, bb.length, 1);
  const pa = Buffer.alloc(max);
  const pb = Buffer.alloc(max);
  ab.copy(pa);
  bb.copy(pb);
  // timingSafeEqual needs equal-length buffers; the padded compare plus this length check
  // together stay constant-time relative to the real secret.
  return crypto.timingSafeEqual(pa, pb) && ab.length === bb.length;
}

function requireApiKey(req, res, next) {
  const expected = process.env.APPSCRIPT_SHARED_SECRET;
  if (!expected) {
    // Fail closed: the bridge is unusable until a secret is configured, rather than silently
    // accepting every caller the moment the server goes public.
    return res
      .status(503)
      .json({ message: 'Bridge not configured (APPSCRIPT_SHARED_SECRET unset).' });
  }
  if (!safeEqual(req.get('X-Api-Key') || '', expected)) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  req.viaBridge = true;
  req.callerEmail = req.get('X-User-Email') || null;
  next();
}

module.exports = { requireApiKey, safeEqual };
