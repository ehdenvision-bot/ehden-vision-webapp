/**
 * =================================================================
 * API CLIENT — bridge from Apps Script to the external data server
 * (Node/Express + Postgres). Used by the flag-controlled dispatchers
 * in the *_Code.js modules (starting with Locataires_Code.js).
 * =================================================================
 *
 * CONFIG LIVES ONLY IN SCRIPT PROPERTIES — never hardcode a URL or a
 * secret in this file. Set, in the Apps Script editor → Project
 * Settings → Script Properties:
 *
 *   API_BASE_URL       e.g. https://api.ehden-vision.example.com
 *                      (no trailing slash; scheme required)
 *   API_SHARED_SECRET  64 hex chars; must equal the server's
 *                      APPSCRIPT_SHARED_SECRET env var
 *
 * To repoint at a different server later: change API_BASE_URL only.
 * No code change, no redeploy of logic. The value is resolved on
 * every call (below), not cached in a constant.
 *
 * Per-module cutover flags (also Script Properties), e.g.:
 *   USE_API_LOCATAIRES  'true'  -> that module's calls go to the API
 *                       anything else (unset / 'false') -> Google Sheets
 */

/**
 * Calls POST {API_BASE_URL}/bridge/rpc/<fnName> with body {args:[...]}.
 * Mirrors the google.script.run contract: returns the server's
 * `result` on 2xx, throws Error(message) otherwise so a client-side
 * .withFailureHandler(...) fires exactly as it does for a native
 * Apps Script exception.
 *
 * @param {string} fnName - server RPC function name (e.g. 'getLocatairesPageData')
 * @param {Array}  args   - positional args, same order as the Apps Script fn
 * @returns {*} the server's { result } payload
 */
function callApi_(fnName, args) {
  var props  = PropertiesService.getScriptProperties();
  var base   = String(props.getProperty('API_BASE_URL') || '').replace(/\/+$/, '');
  var secret = String(props.getProperty('API_SHARED_SECRET') || '');

  if (!base)   throw new Error("Configuration API manquante : API_BASE_URL (Script Properties).");
  if (!secret) throw new Error("Configuration API manquante : API_SHARED_SECRET (Script Properties).");

  // Best-effort caller identity — for server logs only. The web app is
  // ANYONE_ANONYMOUS so this is often empty; the shared secret is what
  // authenticates the request, the session token (passed as a normal
  // arg) is what identifies the user.
  var callerEmail = '';
  try { callerEmail = Session.getActiveUser().getEmail() || ''; } catch (e) { callerEmail = ''; }

  var response = UrlFetchApp.fetch(base + '/bridge/rpc/' + encodeURIComponent(fnName), {
    method:      'post',
    contentType: 'application/json',
    headers: {
      'X-Api-Key':    secret,
      'X-User-Email': callerEmail
    },
    payload:            JSON.stringify({ args: args || [] }),
    muteHttpExceptions: true,
    followRedirects:    false
  });

  var code = response.getResponseCode();
  var text = response.getContentText() || '{}';
  var body;
  try { body = JSON.parse(text); } catch (e) { body = {}; }

  if (code >= 200 && code < 300) {
    return body.result;
  }

  throw new Error(
    body.message || body.error || ('Erreur API (' + code + ') sur ' + fnName)
  );
}

/**
 * Manual check — run from the Apps Script editor. Logs the server's
 * /health and /bridge/health so you can confirm connectivity, the
 * shared secret, and the DB status before flipping any USE_API_* flag.
 */
function apiHealthCheck_() {
  var props  = PropertiesService.getScriptProperties();
  var base   = String(props.getProperty('API_BASE_URL') || '').replace(/\/+$/, '');
  var secret = String(props.getProperty('API_SHARED_SECRET') || '');
  if (!base) { Logger.log('API_BASE_URL not set.'); return; }

  var pub = UrlFetchApp.fetch(base + '/health', { muteHttpExceptions: true });
  Logger.log('GET /health -> ' + pub.getResponseCode() + ' ' + pub.getContentText());

  var gated = UrlFetchApp.fetch(base + '/bridge/health', {
    headers: { 'X-Api-Key': secret },
    muteHttpExceptions: true
  });
  Logger.log('GET /bridge/health -> ' + gated.getResponseCode() + ' ' + gated.getContentText());
}
