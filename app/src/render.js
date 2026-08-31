// Renders the literal Webapp Files/*.html templates — same file, read in place, not copied —
// so the migrated app can never drift from the live Apps Script app's markup. Ported from
// tools/local-preview/server.js's resolveIncludes()/renderPage(), which solved the same
// include_()-tag-resolution problem for the layout-only preview; this is the real, data-wired
// version. See agents/decisions.md's second 2026-08-25 entry for the full reasoning.

const fs = require('node:fs');
const path = require('node:path');

const SRC_DIR = path.resolve(__dirname, '..', '..', 'Webapp Files');

// Only files actually present in Webapp Files/ can be requested — callers pass a fixed name
// from pages.js's ROUTES table, never anything sourced from user input, but this guards against
// path traversal regardless (e.g. a future caller passing a request param by mistake).
function readSourceFile(name) {
  const safeName = path.basename(name);
  if (safeName !== name) throw new Error(`render: refusing unsafe template name "${name}"`);
  const file = path.join(SRC_DIR, `${safeName}.html`);
  return fs.readFileSync(file, 'utf8');
}

function resolveIncludes(html, data, depth = 0) {
  if (depth > 10) throw new Error('include_ recursion too deep — check for a cycle');
  return html.replace(
    /<\?!=\s*include_\(\s*['"]([^'"]+)['"](?:\s*,\s*data)?\s*\)\s*;?\s*\?>/g,
    (_match, name) => resolveIncludes(readSourceFile(name), data, depth + 1)
  );
}

// google.script.run, for real: forwards google.script.run.<fn>(...args) to POST /rpc/<fn> with
// the args array, and drives the .withSuccessHandler/.withFailureHandler chain from the
// response — same call shape the original client code already uses throughout
// Webapp Files/*_Scripts_*.html, so none of that code needs to change.
const GOOGLE_SCRIPT_RUN_SHIM = `
<script>
  window.google = window.google || {};
  google.script = google.script || {};
  google.script.run = (function () {
    function makeChain(handlers) {
      return new Proxy({}, {
        get(_t, fnName) {
          if (fnName === 'withSuccessHandler') {
            return (cb) => makeChain(Object.assign({}, handlers, { success: cb }));
          }
          if (fnName === 'withFailureHandler') {
            return (cb) => makeChain(Object.assign({}, handlers, { failure: cb }));
          }
          if (fnName === 'withUserObject') {
            return (obj) => makeChain(Object.assign({}, handlers, { userObject: obj }));
          }
          return (...args) => {
            fetch('rpc/' + fnName, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ args }),
            })
              .then(async (res) => {
                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                  const err = new Error(body.message || ('Request failed (' + res.status + ')'));
                  if (handlers.failure) handlers.failure(err, handlers.userObject);
                  return;
                }
                if (handlers.success) handlers.success(body.result, handlers.userObject);
              })
              .catch((err) => {
                if (handlers.failure) handlers.failure(err, handlers.userObject);
              });
          };
        },
      });
    }
    return makeChain({});
  })();
</script>
`;

function injectShim(html) {
  return html.includes('</head>')
    ? html.replace('</head>', `${GOOGLE_SCRIPT_RUN_SHIM}</head>`)
    : GOOGLE_SCRIPT_RUN_SHIM + html;
}

// Renders `name` (e.g. "Login", "ProjectPortfolio") with `data`, matching Login_Code.js's
// render_()/include_() exactly: resolves include_() tags, injects `data` at the
// <?!= JSON.stringify(data || {}) ?> tag (ClientLib.html:9 — becomes APP_DATA client-side),
// and resolves <?= getScriptUrl() ?>. baseUrl is relative ("./"), not an absolute deployed URL
// like the original's ScriptApp.getService().getUrl() — this app is currently served behind a
// path-prefixed proxy whose prefix isn't known server-side (confirmed via the earlier
// proxy-diagnostic: the proxy strips its own prefix before forwarding, so Express never sees
// it). Every BASE_URL usage in ClientLib.html is `BASE_URL + '?...'`, so a relative "./"
// resolves correctly against the current page's real URL regardless of prefix — same fix class
// as the asset/API path bugs found earlier today. Revisit if this ever gets a stable domain.
function renderPage(name, data) {
  let html = resolveIncludes(readSourceFile(name), data);
  html = html.replace(
    /<\?!=\s*JSON\.stringify\(\s*data(?:\s*\|\|\s*\{\})?\s*\)\s*\?>/g,
    JSON.stringify(data)
  );
  html = html.replace(/<\?=\s*getScriptUrl\(\)\s*\?>/g, './');
  return injectShim(html);
}

module.exports = { renderPage };
