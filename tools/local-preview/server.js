#!/usr/bin/env node
// Static, layout-only preview of the "Webapp Files/" Apps Script pages.
//
// This does NOT run the app. It resolves the same include_()/template tags
// Pages.js's render_() resolves server-side (see Login_Code.js render_/include_),
// so pages lay out correctly, but every google.script.run.* call is stubbed to a
// no-op — no login, no data, no writes. Use this only to iterate on HTML/CSS
// layout without a clasp push round-trip. For anything functional, push and
// test against the real /dev URL (see agents/runbook.md).
//
// Route table below mirrors Pages.js's doGet() switch by hand. If that switch
// changes, update this to match — it's a preview convenience, not a source of
// truth.

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const SRC_DIR = path.resolve(__dirname, "..", "..", "Webapp Files");

// Mirrors the shape of the `data` object Pages.js's doGet() builds (see Pages.js:112-128).
const MOCK_DATA = {
  baseUrl: "/",
  companyName: "Ehden Vision",
  page: "preview",
  token: "PREVIEW_TOKEN",
  view: "desktop",
  currentView: "",
  title: "Preview",
  projectId: "2602-0001",
  transferId: "",
  projectName: "Preview Project",
  projectStatus: "active",
  user: { email: "preview@local", name: "Preview User", role: "admin" },
  isAuthorized: true,
  isClient: false,
  canEdit: true,
  isClientViewActive: false,
};

// Mirrors Pages.js's switch(page) — desktop file, mobile file (or null if none exists).
const ROUTES = {
  "login": { desktop: "Login" },
  "reset-request": { desktop: "ResetRequest" },
  "reset": { desktop: "Reset" },
  "project-portfolio": { desktop: "ProjectPortfolio" },
  "project-dashboard": { desktop: "ProjectDashboard", mobile: "ProjectDashboardMobile" },
  "locataires": { desktop: "Locataires", mobile: "LocatairesMobile" },
  "planning": { desktop: "Planning", mobile: "Planning_Mobile" },
  "edl": { desktop: "EDL", mobile: "EDLMobile" },
  "rapport": { desktop: "Rapport", mobile: "RapportMobile" },
  "settings": { desktop: "Settings", mobile: "SettingsMobile" },
  "supportlogin": { desktop: "SupportLogin" },
  "support": { desktop: "Support" },
};

function readSourceFile(name) {
  // HtmlService.createTemplateFromFile has no extension; the files on disk are .html.
  const file = path.join(SRC_DIR, `${name}.html`);
  return fs.readFileSync(file, "utf8");
}

// Resolves include_('Name') / include_('Name', data) tags, recursively.
function resolveIncludes(html, depth = 0) {
  if (depth > 10) throw new Error("include_ recursion too deep — check for a cycle");
  return html.replace(
    /<\?!=\s*include_\(\s*['"]([^'"]+)['"](?:\s*,\s*data)?\s*\)\s*;?\s*\?>/g,
    (_match, name) => resolveIncludes(readSourceFile(name), depth + 1)
  );
}

function renderPage(name) {
  let html = resolveIncludes(readSourceFile(name));
  html = html.replace(
    /<\?!=\s*JSON\.stringify\(\s*data(?:\s*\|\|\s*\{\})?\s*\)\s*\?>/g,
    JSON.stringify(MOCK_DATA)
  );
  html = html.replace(/<\?=\s*getScriptUrl\(\)\s*\?>/g, "/");
  return html;
}

const GOOGLE_SCRIPT_RUN_STUB = `
<script>
  // Local preview stub — real app has no google.script.run here.
  window.google = window.google || {};
  google.script = google.script || {};
  google.script.run = new Proxy({}, {
    get(_t, fnName) {
      const chain = {
        withSuccessHandler() { return chain; },
        withFailureHandler() { return chain; },
        withUserObject() { return chain; },
      };
      return (...args) => {
        console.warn("[local-preview] google.script.run." + fnName + "() is stubbed — no-op.", args);
        return chain;
      };
    },
  });
</script>
`;

function injectStub(html) {
  return html.includes("</head>")
    ? html.replace("</head>", `${GOOGLE_SCRIPT_RUN_STUB}</head>`)
    : GOOGLE_SCRIPT_RUN_STUB + html;
}

function notFound(res, message) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const page = (url.searchParams.get("page") || "project-portfolio").toLowerCase();
  const view = (url.searchParams.get("view") || "desktop").toLowerCase();

  const route = ROUTES[page];
  if (!route) {
    return notFound(res, `No route for page="${page}" in this preview's route table (tools/local-preview/server.js).`);
  }

  const fileBase = view === "mobile" && route.mobile ? route.mobile : route.desktop;
  const filePath = path.join(SRC_DIR, `${fileBase}.html`);
  if (!fs.existsSync(filePath)) {
    return notFound(
      res,
      `${fileBase}.html doesn't exist in "Webapp Files/" — this route is a known gap, not a preview-server bug.`
    );
  }

  try {
    const html = injectStub(renderPage(fileBase));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Preview render error: ${err.message}`);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Local layout preview on http://0.0.0.0:${PORT}/?page=login`);
  console.log(`Available pages: ${Object.keys(ROUTES).join(", ")}`);
});
