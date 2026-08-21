/**
 * =================================================================
 * 1. PROJECT SHEET CONFIGURATION
 * =================================================================
 */
const PROJECT_START_ROW = 5;

const PROJECT_COL = {
  ID: 2,          // Column B
  NAME: 3,        // Column C
  OWNER: 4,       // Column D
  STATUS: 5,      // Column E (Active/Ended/Blocked/Archived)
  START: 6,       // Column F
  END: 7,         // Column G
  CITY: 8,        // Column H
  COUNTRY: 9,     // Column I
  PROGRESS: 10,   // Column J (%)
  UNITS: 11,      // Column K
  DESC: 12        // Column L
};

/**
 * =================================================================
 * 2. DATA RETRIEVAL & IMAGE OPTIMIZATION
 * =================================================================
 */

/**
 * Fetches the list of projects and maps them to objects.
 * Includes base64 thumbnails for high-performance loading.
 */
function gsListProjects(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(props.getProperty("PROJECT_LIST_ID"));
  const sh = ss.getSheetByName('Projects');

  const last = sh.getLastRow();
  if (last < PROJECT_START_ROW) return [];

  const values = sh.getRange(PROJECT_START_ROW, 1, last - PROJECT_START_ROW + 1, PROJECT_COL.DESC).getValues();
  const tz = Session.getScriptTimeZone() || "Europe/Paris";

  // Load Project Photos from Drive
  const logoFolderId = getProp_("PROJECT_PHOTOS_FILE");
  const logoMap = {};

  if (logoFolderId) {
    try {
      const folder = DriveApp.getFolderById(logoFolderId);
      const files = folder.getFiles();
      while (files.hasNext()) {
        const file = files.next();
        const nameWithoutExt = file.getName().split('.')[0].toLowerCase();
        // PERFORMANCE: Fetch the thumbnail blob instead of the full file
        const thumb = file.getThumbnail();
        const b64 = Utilities.base64Encode(thumb.getBytes());
        logoMap[nameWithoutExt] = "data:image/png;base64," + b64;
      }
    } catch (e) {
      console.error("Error accessing projects photos folder: " + e.toString());
    }
  }

  const projects = [];
  const defaultImg = defaultProjectImage_();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const id   = String(row[PROJECT_COL.ID   - 1] || "").trim();
    const name = String(row[PROJECT_COL.NAME - 1] || "").trim();

    if (!id && !name) continue;

    const finalImage = logoMap[id.toLowerCase()] || defaultImg;

    projects.push({
      id,
      name,
      owner: String(row[PROJECT_COL.OWNER - 1] || "").trim(),
      status: String(row[PROJECT_COL.STATUS - 1] || "").trim(),
      startDate: isValidDate_(row[PROJECT_COL.START - 1])
        ? Utilities.formatDate(row[PROJECT_COL.START - 1], tz, "dd/MM/yyyy") : "",
      endDate: isValidDate_(row[PROJECT_COL.END - 1])
        ? Utilities.formatDate(row[PROJECT_COL.END - 1], tz, "dd/MM/yyyy") : "",
      city:    String(row[PROJECT_COL.CITY    - 1] || "").trim(),
      country: String(row[PROJECT_COL.COUNTRY - 1] || "").trim(),
      // Handle percentage conversion (0.1 → 10%)
      progress: Math.max(0, Math.min(100, Math.round(100 * Number(row[PROJECT_COL.PROGRESS - 1] || 0)))),
      units:       String(row[PROJECT_COL.UNITS - 1] || "").trim(),
      description: String(row[PROJECT_COL.DESC  - 1] || "").trim(),
      image: finalImage
    });
  }

  // Alphabetical sort by project name
  projects.sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" }));
  return projects;
}

/**
 * =================================================================
 * 3. UTILITIES
 * =================================================================
 */

/**
 * Fetches a single project row by ID for server-side permission checks.
 * Used by ROUTES and assertCanEdit_ to verify project status without
 * trusting the client-supplied URL parameter.
 *
 * @param {string} projectId
 * @returns {{ id: string, status: string, name: string } | null}
 */
function getProjectById_(projectId) {
  if (!projectId) return null;
  try {
    const props = PropertiesService.getScriptProperties();
    const ss = SpreadsheetApp.openById(props.getProperty("PROJECT_LIST_ID"));
    const sh = ss.getSheetByName('Projects');
    const last = sh.getLastRow();
    if (last < PROJECT_START_ROW) return null;

    // ID at col 2, NAME at col 3, STATUS at col 5.
    // We read from col 1 to PROJECT_COL.STATUS to get all needed columns in one shot.
    const numRows = last - PROJECT_START_ROW + 1;
    const rows = sh.getRange(PROJECT_START_ROW, 1, numRows, PROJECT_COL.STATUS).getValues();

    const target = String(projectId).trim().toLowerCase();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowId = String(row[PROJECT_COL.ID - 1]).trim();
      if (rowId.toLowerCase() === target) {
        return {
          id:     rowId,
          name:   String(row[PROJECT_COL.NAME   - 1]).trim(),
          status: String(row[PROJECT_COL.STATUS  - 1]).trim()
        };
      }
    }
    return null;

  } catch (e) {
    console.error("getProjectById_: " + e.message);
    return null;
  }
}

/**
 * Validates a Date object.
 */
function isValidDate_(d) {
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Generates a clean placeholder SVG as a Base64 data URL.
 */
function defaultProjectImage_() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
    <rect width="100%" height="100%" fill="#f1f5f9"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#94a3b8">Image non disponible</text>
  </svg>`;
  const b64 = Utilities.base64Encode(svg, Utilities.Charset.UTF_8);
  return "data:image/svg+xml;base64," + b64;
}