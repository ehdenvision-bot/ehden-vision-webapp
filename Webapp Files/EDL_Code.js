/**
 * =========================================================
 * WORKSPACE — SHARED / CORE SERVER FUNCTIONS
 * =========================================================
 * Mirrors Workspace_Core_Scripts.html on the client: everything here is
 * either the main data entry point for the page, or a generic helper with
 * no EDL-specific business logic — i.e. things every layer (EDL, Travaux,
 * Élec, Sanit, Réserves, Formulaires) is likely to need, not just EDL.
 *
 * NOTE ON FILE ORGANIZATION: Apps Script shares one global namespace across
 * every .gs file in the project — there is no import/include mechanism like
 * the HTML side's include_(). Splitting into Workspace_Core_Server.gs /
 * EDL_Server.gs is purely for human navigation (so "where does this
 * function live" has an obvious answer as more layers are added); every
 * function below is still callable from anywhere, including EDL_Server.gs.
 *
 * As Travaux/Élec/Sanit/Réserves/Formulaires get their own backend logic,
 * give each its own <Layer>_Server.gs file (same split as EDL_Server.gs)
 * rather than growing this file — this one should stay limited to things
 * that are genuinely shared.
 */

/**
 * MAIN ENTRY POINT: Called by the frontend on load
 * getLocatairesPageDataEDL(APP_DATA.token, APP_DATA.projectId)
 *
 * NOTE: the "EDL" suffix is historical — this actually loads the shared
 * base data every layer's selectors depend on (locataires/communs/facades,
 * the room configuration, ...), not just EDL's own data. It also happens to
 * pull in EDL's notes (edlNotes) as part of the same round trip, which is
 * why this Core file calls into getEDLNotesData() in EDL_Server.gs below —
 * a deliberate cross-file call, not an accident. When Travaux/Élec/etc. need
 * their own preloaded data the same way, add a line here the same way
 * (e.g. `travaux: getTravauxData()`, defined in Travaux_Server.gs).
 *
 * Happy to rename this to something layer-neutral (e.g.
 * getWorkspaceBaseData) if you want — just say the word, since the one
 * client-side call site (Workspace_Core_Scripts.html) would need the same
 * rename to stay in sync.
 */
function getLocatairesPageDataEDL(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  // 1. Fetch all Travaux related data
  let fetchedTravauxConfig = [];
  let fetchedTravauxDonnees = [];
  let fetchedSousCategoriesTravaux = [];

  try {
    fetchedTravauxConfig = getTravauxConfigDataHelper();
    fetchedTravauxDonnees = getTravauxDonneesDataHelper();
    fetchedSousCategoriesTravaux = getSousCategoriesTravauxHelper();
  } catch (e) {
    console.error("Erreur lors de la récupération des données Travaux: ", e);
  }

  // 2. Company branding (name + logo) for the Travaux "Fiche de travaux"
  // recap header — per-project Script Properties, same convention as
  // PROJECT_PHOTOS_FILE (it can be a different company on another
  // project). COMPANY_LOGO is a Drive file ID living in the
  // PROJECT_PHOTOS_FILE root folder, so the client builds its <img> src
  // directly (https://lh3.googleusercontent.com/d/<id>), exactly like
  // EDL's photo gallery already does — no base64 round-trip needed.
  const scriptProps = PropertiesService.getScriptProperties();

  // 3. Return the payload
  return {
    locataires:     fetchSheetData('Locataires'),
    communs:        fetchSheetData('Parties communes'),
    facades:        fetchSheetData('Facades'),
    facadesConfig:  getSheetDataAsObjects('Config Facades'),
    configLogement: getConfigLogementData('Config Logement'),

    planning:       fetchAllNotes(),
    edlNotes:       getEDLNotesData(), // EDL-specific — see EDL_Server.gs
    travauxConfig: fetchedTravauxConfig,
    travauxDonnees: fetchedTravauxDonnees,
    sousCategoriesTravaux: fetchedSousCategoriesTravaux,

    companyName:    scriptProps.getProperty('COMPANY_NAME') || '',
    companyLogoId:  scriptProps.getProperty('COMPANY_LOGO') || ''
  };
}

/**
 * HELPER: Generic function to turn a Google Sheet into an array of JS Objects.
 * Headers on Row 6, data from Row 7 — the standard convention used across
 * these workbooks. No layer-specific logic; any future layer reading a
 * sheet built the same way can reuse this directly.
 * @param {string} sheetName - The exact name of the tab
 */
function getSheetDataAsObjects(sheetName) {
  const ss = SpreadsheetApp.openById(BATIMENTS_SS_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Feuille introuvable : " + sheetName);

  const data = sheet.getDataRange().getValues();
  if (data.length <= 6) return []; // Sheet is empty or only has headers

  const headers = data[6 - 1]; // Convert 1-based row to 0-based array index
  const result = [];

  // Loop through rows starting just below the header
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    const obj = {};
    let isRowEmpty = true;

    for (let j = 0; j < headers.length; j++) {
      const header = String(headers[j]).trim();
      if (header) {
        obj[header] = row[j];
        // Check if row actually has data (ignore completely blank rows)
        if (row[j] !== "" && row[j] !== null) {
          isRowEmpty = false;
        }
      }
    }

    if (!isRowEmpty) {
      result.push(obj);
    }
  }

  return result;
}

/**
 * HELPER (NEW): Admin-only gate, shared across layers — any future
 * admin-level endpoint (not just Travaux's Config CRUD below) can reuse
 * this the same way. Wraps assertCanEdit_ (session valid, not isClient,
 * not otherwise unauthorized) with an additional role === 'admin' check.
 *
 * ASSUMPTION: the user object assertCanEdit_ / getSession_ return carries
 * a `.role` field the same way APP_DATA.user does client-side (see
 * Workspace_Core_Scripts.html's role checks). If your session object names
 * this field differently, adjust the `user.role` reference below.
 *
 * Mirrors the client-side gate on the "Config Travaux" button itself
 * (setupAdminConfigTravauxButton() in Workspace_Core_Scripts.html) — this
 * is the real enforcement, the button being hidden is only a UX nicety.
 */
function assertIsAdmin_(token, projectId) {
  const user = assertCanEdit_(token, projectId);
  const role = String((user && user.role) || '').toLowerCase();
  if (role !== 'admin') {
    throw new Error("Action réservée aux administrateurs.");
  }
  return user;
}

/**
 * HELPER: Custom logic for the "Config Logement" sheet with checkboxes
 * Rule: Headers on Row 6, Data starts on Row 7. Checkboxes map to booleans.
 *
 * Shared, not EDL-specific: this feeds the Pièce selector in
 * Workspace_Core_Scripts.html (populateRoomOrPartie), which every layer uses.
 */
function getConfigLogementData(sheetName) {
  const ss = SpreadsheetApp.openById(BATIMENTS_SS_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Feuille introuvable : " + sheetName);

  const data = sheet.getDataRange().getValues();
  // Ensure we have enough rows to reach the data
  if (data.length < 6) return [];

  const headers = data[5]; // Row 6 (Index 5) contains the room names
  const result = [];

  // Start from Row 7 (Index 6)
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    // Column B (Index 1) is "Config. Logement". Skip row if empty.
    if (!row[1] || String(row[1]).trim() === "") continue;

    let configObj = { configLogement: String(row[1]).trim() };

    // Loop through columns starting from C (Index 2) to read the checkboxes
    for (let j = 2; j < headers.length; j++) {
      const roomName = String(headers[j]).trim();
      if (roomName) {
        // In Apps Script, checked checkboxes come through as boolean true
        configObj[roomName] = (row[j] === true);
      }
    }
    result.push(configObj);
  }

  return result;
}

/**
 * Fetches a plan image from the secure project folder structure and returns a base64 Data URL.
 *
 * Shared across all 6 layers: called by loadPlanGraphicAsset() in
 * Workspace_Core_Scripts.html, which is itself shared. Layers 1-5 (EDL,
 * Travaux, Élec, Sanit, Réserves) all resolve a filename the same way and
 * land here; Formulaires (layer 6) will likely still call this same
 * function once its resolveAsset() picks a real filename convention for its
 * "photo" — nothing here needs to change for that, it's just a filename.
 *
 * @param {string} baseFilename - The generated filename without extension (e.g., "log_A-1-R02-05-12")
 * @return {string} Data URL string or throws an error if not found
 */
function fetchPlanAssetAsBase64(baseFilename) {
  try {
    // 1. Retrieve the Root Folder ID from your Project Properties
    const rootFolderId = PropertiesService.getScriptProperties().getProperty('PROJECT_PHOTOS_FILE');
    if (!rootFolderId) {
      throw new Error("La propriété de projet 'PROJECT_PHOTOS_FILE' n'est pas définie.");
    }

    const rootFolder = DriveApp.getFolderById(rootFolderId);
    const subfolderName = "01- Plans";
    const subfolders = rootFolder.getFoldersByName(subfolderName);

    if (!subfolders.hasNext()) {
      throw new Error(`Le sous-dossier "${subfolderName}" est introuvable dans le dossier racine.`);
    }
    const plansFolder = subfolders.next();

    // 2. Search for files matching the base name across allowed web extensions
    const extensions = ['svg', 'webp', 'png', 'jpg', 'jpeg'];
    let targetFile = null;
    let foundExtension = '';

    for (let ext of extensions) {
      const files = plansFolder.getFilesByName(`${baseFilename}.${ext}`);
      if (files.hasNext()) {
        targetFile = files.next();
        foundExtension = ext;
        break;
      }
    }

    if (!targetFile) {
      throw new Error(`Aucun plan trouvé avec le nom : ${baseFilename} (.svg, .webp, .png, .jpg)`);
    }

    // 3. Convert Blob data directly to a clean Base64 Data URL payload
    const blob = targetFile.getBlob();
    const base64Data = Utilities.base64Encode(blob.getBytes());
    let mimeType = blob.getContentType();

    // Fix fallback mimeTypes for standard vector formatting if drive intercepts it poorly
    if (foundExtension === 'svg') mimeType = 'image/svg+xml';
    if (foundExtension === 'webp') mimeType = 'image/webp';

    return `data:${mimeType};base64,${base64Data}`;

  } catch (error) {
    console.error("Erreur dans fetchPlanAssetAsBase64:", error.message);
    throw new Error(error.message);
  }
}

/**
 * CUSTOM ICON FONT — Drive folder "04- Icons" (root PROJECT_PHOTOS_FILE
 * folder, same convention as "01- Plans" / "03- Reserves Photos" above).
 *
 * Lets an icon-name field (starting with Travaux's "Icône (recap)") pull
 * from a private, project-specific icon set in addition to Google's
 * Material Symbols library. Expects the (unmodified) contents of an
 * IcoMoon export dropped straight into this folder:
 *   - "selection.json" — IcoMoon's own icon-selection manifest (also what
 *     you'd re-import into the IcoMoon app to keep editing the set later).
 *     This is the SOURCE OF TRUTH for both "is this name a custom icon?"
 *     and "what glyph renders it?" — see getCustomIconManifest() below.
 *   - the compiled font — whatever IcoMoon named it (default: icomoon.*),
 *     no renaming needed. See fetchCustomIconFontAsBase64() below.
 *
 * IMPORTANT — this does NOT use font ligatures. IcoMoon's default export
 * (unlike Google's Material Symbols) maps each icon to a private-use-area
 * character via CSS "content:", not to a ligature you can type as plain
 * text — confirmed against a real export: selection.json's
 * icons[].properties.code (e.g. 59648) matches style.css's
 * ".icon-xxx:before { content: "\eXXX"; }" (59648 == 0xE900) exactly.
 * So instead of relying on the font to substitute typed text, the CLIENT
 * looks up the name in the manifest this returns and renders
 * String.fromCodePoint(code) directly — same visual result, no dependency
 * on IcoMoon's "Support Liga" export option, works with the plain default
 * export. See iconGlyphText() in Workspace_Core_Scripts.html.
 *
 * Both functions are read-only and, like fetchPlanAssetAsBase64 above,
 * deliberately take no token/auth check — same trust boundary as the plan
 * photos they sit next to. A missing "04- Icons" folder, or a folder
 * without "selection.json" yet, is NOT an error for
 * getCustomIconManifest() (just means no custom icons yet); a missing
 * folder or font file IS an error for fetchCustomIconFontAsBase64() once
 * the client actually needs the font (nothing sensible to fall back to).
 */

const CUSTOM_ICONS_FOLDER_NAME_ = "04- Icons";

function getCustomIconManifest() {
  const rootFolderId = PropertiesService.getScriptProperties().getProperty('PROJECT_PHOTOS_FILE');
  if (!rootFolderId) {
    throw new Error("La propriété de projet 'PROJECT_PHOTOS_FILE' n'est pas définie.");
  }

  const rootFolder = DriveApp.getFolderById(rootFolderId);
  const subfolders = rootFolder.getFoldersByName(CUSTOM_ICONS_FOLDER_NAME_);
  if (!subfolders.hasNext()) return {}; // not created yet -> simply no custom icons, not an error

  const iconsFolder = subfolders.next();
  const files = iconsFolder.getFilesByName('selection.json');
  if (!files.hasNext()) return {}; // font pasted in without its manifest -> no custom icons readable yet, not an error

  let parsed;
  try {
    parsed = JSON.parse(files.next().getBlob().getDataAsString('UTF-8'));
  } catch (e) {
    throw new Error('"selection.json" dans "04- Icons" n\'est pas un JSON valide.');
  }

  const manifest = {};
  (parsed.icons || []).forEach(function (entry) {
    const props = entry && entry.properties;
    if (props && props.name && props.code) {
      manifest[String(props.name).trim()] = props.code; // IcoMoon lowercases names itself — no normalization needed here
    }
  });
  return manifest;
}

function fetchCustomIconFontAsBase64() {
  try {
    const rootFolderId = PropertiesService.getScriptProperties().getProperty('PROJECT_PHOTOS_FILE');
    if (!rootFolderId) {
      throw new Error("La propriété de projet 'PROJECT_PHOTOS_FILE' n'est pas définie.");
    }

    const rootFolder = DriveApp.getFolderById(rootFolderId);
    const subfolders = rootFolder.getFoldersByName(CUSTOM_ICONS_FOLDER_NAME_);
    if (!subfolders.hasNext()) {
      throw new Error(`Le sous-dossier "${CUSTOM_ICONS_FOLDER_NAME_}" est introuvable dans le dossier racine.`);
    }
    const iconsFolder = subfolders.next();

    // Matched by extension, not a fixed filename — IcoMoon's default
    // export names this icomoon.woff (no renaming asked of you). woff2
    // preferred if you ever export one (smaller), woff is what today's
    // default IcoMoon export actually gives you.
    const files = iconsFolder.getFiles();
    let woffFile = null, woff2File = null;
    while (files.hasNext()) {
      const f = files.next();
      const name = f.getName().toLowerCase();
      if (name.endsWith('.woff2')) woff2File = f;
      else if (name.endsWith('.woff')) woffFile = f;
    }
    const targetFile = woff2File || woffFile;
    const foundExtension = woff2File ? 'woff2' : (woffFile ? 'woff' : '');

    if (!targetFile) {
      throw new Error(`Aucune police trouvée dans "${CUSTOM_ICONS_FOLDER_NAME_}" (.woff2 ou .woff attendu).`);
    }

    const blob = targetFile.getBlob();
    const base64Data = Utilities.base64Encode(blob.getBytes());
    const mimeType = foundExtension === 'woff2' ? 'font/woff2' : 'font/woff';
    return { dataUrl: `data:${mimeType};base64,${base64Data}`, format: foundExtension };

  } catch (error) {
    console.error("Erreur dans fetchCustomIconFontAsBase64:", error.message);
    throw new Error(error.message);
  }
}

/**
 * HELPER: Formats a Date object or date string into short French format (e.g. "MAR. 09 JUIN 2026")
 *
 * Generic utility, not tied to interventions/EDL — currently only used by
 * getEDLInterventionsByLot() in EDL_Server.gs, but any future layer with a
 * date to display (Travaux due dates, Formulaires submission dates, ...)
 * should reuse this rather than reimplementing French date formatting.
 */
function formatDateFr(val) {
  if (!val) return '';

  let dateObj = val;
  if (!(dateObj instanceof Date)) {
    dateObj = new Date(val);
  }

  // If not a valid date, return as clean string
  if (isNaN(dateObj.getTime())) return String(val).trim();

  // Option A: Short French format with day of week (e.g., "MAR. 09 JUIN 2026")
  return dateObj.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).toUpperCase();

  /* // Option B: If you prefer simple numeric French format ("09/06/2026"), uncomment this line:
  // return dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  */
}

/**
 * HELPER: Formats time values correctly.
 * - Leaves text ranges (e.g., "09:00 - 10:00") intact.
 * - Formats time cells (e.g., 05:00:00) into clean time format ("05:00" or "05:00:00").
 *
 * Generic utility — same reasoning as formatDateFr() above.
 */
function formatHeure(val) {
  if (!val) return '';

  // If Google Sheets returned a Date object for a time cell
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "HH:mm");
  }

  const strVal = String(val).trim();

  // Fallback if a date string was converted previously
  if (strVal.includes('GMT') || strVal.includes('1899') || strVal.includes('1970')) {
    const d = new Date(strVal);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "HH:mm");
    }
  }
  return strVal;
}

/**
 * =========================================================
 * EDL LAYER — SERVER FUNCTIONS
 * =========================================================
 * Mirrors EDL_Scripts.html on the client. Everything here is specific to
 * the EDL layer's own sheets ("EDL Notes", "EDL Photos") and its own data
 * shape — not shared with the other layers.
 */

/**
 * HELPER: Fetches EDL Notes from the EDL_SS_ID workbook.
 * - Headers on Row 6 (Index 5).
 * - Col B (Index 1): IDs.
 * - Col C (Index 2): General notes (Whole floor/facades).
 * - Col D+ (Index 3+): Room notes.
 *
 * Called from getLocatairesPageDataEDL() in Workspace_Core_Server.gs as
 * part of the shared page-load payload (rawData.edlNotes on the client).
 */
function getEDLNotesData() {
  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  const sheet = ss.getSheetByName('EDL Notes');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 6) return []; // Sheet is empty or hasn't reached row 6

  const headers = data[5]; // Row 6
  const result = [];

  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    const id = String(row[1]).trim(); // Column B
    if (!id) continue;

    const obj = { ID: id };
    let hasData = false;

    // Column C (Index 2): General Note (used for Whole Level / Facade)
    // We assign it to a hardcoded key 'Général' so the frontend always knows how to find it
    if (row[2] !== "" && row[2] !== null) {
      obj['Général'] = row[2];
      hasData = true;
    }

    // Column D onwards (Index 3+): Specific Rooms
    for (let j = 3; j < headers.length; j++) {
      const header = String(headers[j]).trim();
      if (header && row[j] !== "" && row[j] !== null) {
        obj[header] = row[j];
        hasData = true;
      }
    }

    if (hasData) {
      result.push(obj);
    }
  }

  return result;
}

/**
 * Writes one {pub, priv} JSON cell into 'EDL Notes' for a given ID, at
 * either the fixed "Général" column (colTarget === 2) or a room name
 * (colTarget is a string — looked up in the header row, or appended as a
 * new column if it doesn't exist yet). Extracted out of saveEDLNotesData()
 * 2026-08-26 so the new "Toutes les pièces" general-note case (below) can
 * reuse the exact same column-resolution/row-upsert logic that whole-level
 * and specific-room saves already used, instead of a third copy of it.
 */
function _saveEDLNoteToColumn_(id, colTarget, jsonString) {
  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  let sheet = ss.getSheetByName('EDL Notes');
  if (!sheet) sheet = ss.insertSheet('EDL Notes');

  const data = sheet.getDataRange().getValues();

  // Ensure we have headers on Row 6 if the sheet was just created
  if (data.length < 6 || !data[5] || !data[5][1]) {
    sheet.getRange(6, 2).setValue("ID");
    sheet.getRange(6, 3).setValue("Général");
  }

  const currentData = sheet.getDataRange().getValues();
  const headers = currentData[5]; // Row 6

  let colIndex = -1;
  if (colTarget === 2) {
    colIndex = 2; // Column C exactly — "Général"
  } else {
    // Search for the room name starting from Column D (index 3)
    colIndex = headers.indexOf(colTarget);
    if (colIndex === -1) {
      // Room header doesn't exist, append it at the end
      colIndex = Math.max(headers.length, 3);
      sheet.getRange(6, colIndex + 1).setValue(colTarget);
    }
  }

  // Find the row for this ID in Column B (Index 1)
  let rowIndex = -1;
  for (let i = 6; i < currentData.length; i++) {
    if (String(currentData[i][1]).trim() === String(id).trim()) {
      rowIndex = i;
      break;
    }
  }

  if (rowIndex === -1) {
    // ID doesn't exist, append new row
    const newRow = new Array(colIndex + 1).fill("");
    newRow[1] = id; // Col B
    newRow[colIndex] = jsonString; // Target Column
    sheet.appendRow(newRow);
  } else {
    // ID exists, update specific cell
    sheet.getRange(rowIndex + 1, colIndex + 1).setValue(jsonString);
  }
}

/**
 * Saves EDL notes and status. Routes to either Planning or specific columns in EDL Notes.
 * Called by EDL_Scripts.html's saveCurrentNotesInBackground() (autosave on
 * blur, and on exiting Mode Édition).
 */
function saveEDLNotesData(token, projectId, payload) {
  const user = assertCanEdit_(token, projectId);
  const jsonString = JSON.stringify({ pub: payload.pubNote, priv: payload.privNote });

  // ROUTE 1: Individual Apartment Global Status & Note (still goes to Planning)
  if (payload.isGlobal && !payload.isWholeLevel) {
    const planningPayload = {
      id: payload.id,
      planStatus: payload.status,
      planNote: payload.pubNote,
      planPrivateNote: payload.privNote
    };
    updatePlanningData(planningPayload);

    // ROUTE 1.5 (NEW 2026-08-26, agents/edl-page-spec.md section 2): a
    // second, EDL-specific general note pair — distinct from the Planning
    // note above (cross-page occupant/work-progress status) — for "Toutes
    // les pièces" on a NORMAL APARTMENT only (payload.currentView ===
    // 'locataires'; Communs/Façades general saves also take ROUTE 1 but
    // don't get this second note). Reuses the same 'Général' column
    // whole-building entries already write, via the extracted helper above.
    if (payload.currentView === 'locataires') {
      const edlGeneralJson = JSON.stringify({
        pub: payload.edlGeneralPub || '',
        priv: payload.edlGeneralPriv || ''
      });
      _saveEDLNoteToColumn_(payload.id, 2, edlGeneralJson);
    }

    return true;
  }

  // ROUTE 2: 'EDL Notes' (Whole Level General Notes & Specific Rooms)
  const colTarget = payload.isWholeLevel ? 2 : payload.room;
  _saveEDLNoteToColumn_(payload.id, colTarget, jsonString);

  return true;
}

// Canonical header set for 'EDL Photos' — row 1, matching the sheet's
// original layout (NOT the row-6/row-7 convention most other sheets in
// this app use; kept as-is rather than migrated, since that would mean
// moving every existing photo row). Caption/Uploader/Unused/UnusedReason
// added 2026-08-26 (agents/edl-page-spec.md section 2). Both read and
// write below look these up by name via _findLogCol() (defined in
// Logs.js, globally callable — same generic column-name resolver, no
// point duplicating it) rather than fixed positions, exactly like Logs.js
// itself, so a sheet that predates these columns gets migrated forward
// automatically instead of silently misaligning.
const EDL_PHOTO_HEADERS = ["ID_Photo", "ID_Lot", "Room", "Drive_ID", "Timestamp", "Caption", "Uploader", "Unused", "UnusedReason"];

function _ensureEDLPhotoSheetHeaders_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const missing = EDL_PHOTO_HEADERS.filter(h => _findLogCol(existing, [h]) === -1);
  if (missing.length) {
    const range = sheet.getRange(1, lastCol + 1, 1, missing.length);
    range.setValues([missing]);
    range.setFontWeight("bold").setBackground("#e2e8f0");
  }
}

function _edlPhotoCols_(headers) {
  return {
    photoId:  _findLogCol(headers, ['id_photo', 'idphoto']),
    idLot:    _findLogCol(headers, ['id_lot', 'idlot']),
    room:     _findLogCol(headers, ['room', 'piece', 'pièce']),
    driveId:  _findLogCol(headers, ['drive_id', 'driveid']),
    timestamp:_findLogCol(headers, ['timestamp', 'date']),
    caption:  _findLogCol(headers, ['caption', 'legende', 'légende']),
    uploader: _findLogCol(headers, ['uploader', 'ajoutepar', 'ajoutépar']),
    unused:   _findLogCol(headers, ['unused', 'inutilisee', 'inutilisée']),
    reason:   _findLogCol(headers, ['unusedreason', 'raison'])
  };
}

/**
 * Saves a photo: 1. Uploads to Drive, 2. Logs to "EDL Photos" sheet
 * Called by EDL_Scripts.html's bindPhotoUpload().
 *
 * BUG FIXED 2026-08-26: this used to take no token at all and perform no
 * server-side auth check whatsoever — unlike every other write endpoint in
 * this file (found during EDL exploration 2026-08-25, deferred at the
 * user's request until this exact function was touched again for the
 * caption/uploader work below; see agents/todo.md's now-closed item).
 * Now gated the same way every other EDL write is: assertCanEdit_.
 *
 * The mechanics here (compress on the client, upload blob to the project's
 * Drive folder, log a row) aren't inherently EDL-only — if Travaux or another
 * layer wants its own photo gallery later, this is a reasonable function to
 * copy into that layer's own _Server.gs (pointing at its own log sheet)
 * rather than trying to generalize this one across layers prematurely.
 */
function uploadEDLPhoto(token, projectId, idLot, room, fileName, base64Data, mimeType, caption) {
  const user = assertCanEdit_(token, projectId);

  const folderId = PropertiesService.getScriptProperties().getProperty('PROJECT_PHOTOS_FILE');
  const folder = DriveApp.getFolderById(folderId);

  // 1. Convert Base64 to Blob and Save to Drive
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  const file = folder.createFile(blob);

  // 2. Append to "EDL Photos" Sheet
  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  let sheet = ss.getSheetByName('EDL Photos');
  if (!sheet) {
    sheet = ss.insertSheet('EDL Photos');
    sheet.appendRow(EDL_PHOTO_HEADERS);
    sheet.getRange(1, 1, 1, EDL_PHOTO_HEADERS.length).setFontWeight("bold").setBackground("#e2e8f0");
    sheet.setFrozenRows(1);
  } else {
    _ensureEDLPhotoSheetHeaders_(sheet);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = _edlPhotoCols_(headers);

  const photoId = 'PHO-' + new Date().getTime(); // Unique ID
  const timestamp = new Date().toISOString();
  const uploader = user.email || 'Inconnu';

  const row = new Array(headers.length).fill("");
  const set = (idx, val) => { if (idx !== -1) row[idx] = val; };
  set(col.photoId, photoId);
  set(col.idLot, idLot);
  set(col.room, room);
  set(col.driveId, file.getId());
  set(col.timestamp, timestamp);
  set(col.caption, caption || '');
  set(col.uploader, uploader);
  set(col.unused, '');
  set(col.reason, '');

  sheet.appendRow(row);

  return { photoId, driveId: file.getId(), timestamp, caption: caption || '', uploader, unused: false, unusedReason: '' };
}

/**
 * Returns all photos as an array for the frontend to cache
 * Called from EDL_Scripts.html's onBaseDataLoaded() hook.
 *
 * Takes a token now (2026-08-26) — a valid session is required, matching
 * every other page-load read; still just getSession_, not assertCanEdit_,
 * since this is a read available to any signed-in role (clients included).
 */
function getEDLPhotosData(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  const sheet = ss.getSheetByName('EDL Photos');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const col = _edlPhotoCols_(headers);

  return data.slice(1).map(row => ({
    photoId:      col.photoId  !== -1 ? row[col.photoId]  : '',
    idLot:        col.idLot    !== -1 ? row[col.idLot]    : '',
    room:         col.room     !== -1 ? row[col.room]     : '',
    driveId:      col.driveId  !== -1 ? row[col.driveId]  : '',
    timestamp:    col.timestamp!== -1 ? row[col.timestamp]: '',
    caption:      col.caption  !== -1 ? String(row[col.caption]  || '') : '',
    uploader:     col.uploader !== -1 ? String(row[col.uploader] || '') : '',
    unused:       col.unused   !== -1 ? (String(row[col.unused]  || '').toLowerCase() === 'true') : false,
    unusedReason: col.reason   !== -1 ? String(row[col.reason]   || '') : ''
  })).filter(p => p.photoId); // skip fully-blank trailing rows
}

/**
 * Marks (or unmarks) one photo as unused — NEVER a true delete, per
 * agents/edl-page-spec.md section 2: preserves the audit trail and removes
 * any way to use deletion to hide a problem. Reversible, staff-only
 * (assertCanEdit_ — no isClient exclusion needed since clients never pass
 * that gate), optional reason. Client-side logs this to the Journal via
 * appLog() after a successful call, matching this file's existing
 * convention of never calling gsWriteUniversalLog directly (see the note
 * atop the EDL LAYER — SERVER FUNCTIONS section above).
 */
function gsSetEDLPhotoUnused(token, projectId, photoId, unused, reason) {
  assertCanEdit_(token, projectId);

  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  const sheet = ss.getSheetByName('EDL Photos');
  if (!sheet) throw new Error("Feuille 'EDL Photos' introuvable.");

  _ensureEDLPhotoSheetHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = _edlPhotoCols_(headers);
  if (col.photoId === -1) throw new Error("Colonne ID_Photo introuvable.");

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col.photoId]).trim() === String(photoId).trim()) {
      if (col.unused !== -1) sheet.getRange(i + 1, col.unused + 1).setValue(unused ? 'TRUE' : '');
      if (col.reason !== -1) sheet.getRange(i + 1, col.reason + 1).setValue(unused ? (reason || '') : '');
      return true;
    }
  }
  throw new Error("Photo introuvable : " + photoId);
}

/**
 * Reassigns one photo to a different room, apartment, or both — same
 * underlying mechanism as gsMigrateEDLData's bulk photo move, scoped to a
 * single row. No conflict handling needed (photos never conflict, per
 * spec — they just add another row under the new ID/room). Staff-only.
 */
function gsMigrateEDLPhoto(token, projectId, photoId, targetIdLot, targetRoom) {
  assertCanEdit_(token, projectId);

  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  const sheet = ss.getSheetByName('EDL Photos');
  if (!sheet) throw new Error("Feuille 'EDL Photos' introuvable.");

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = _edlPhotoCols_(headers);
  if (col.photoId === -1) throw new Error("Colonne ID_Photo introuvable.");

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col.photoId]).trim() === String(photoId).trim()) {
      if (targetIdLot && col.idLot !== -1) sheet.getRange(i + 1, col.idLot + 1).setValue(targetIdLot);
      if (targetRoom && col.room !== -1) sheet.getRange(i + 1, col.room + 1).setValue(targetRoom);
      return true;
    }
  }
  throw new Error("Photo introuvable : " + photoId);
}

/**
 * Bulk-migrates every EDL photo/note/status from sourceId to targetId in
 * one action (agents/edl-page-spec.md section 2). EDL-only — Réserves gets
 * its own, selective version later (see agents/edl-todo.md). Blocks on
 * conflict (target already has its own Planning status/note, or its own
 * EDL Notes value for any column the source also has data in) rather than
 * silently overwriting; photos never conflict, they just get bulk-
 * reassigned. "Moves" literally: target gets the values, source's moved
 * fields are cleared afterward (not deleted rows — an EDL Notes row with
 * every note column blank is already treated as "no data" by
 * getEDLNotesData()'s hasData check, so this is equivalent to not
 * existing without any row-shifting risk).
 */
function gsMigrateEDLData(token, projectId, sourceId, targetId) {
  assertCanEdit_(token, projectId);

  sourceId = String(sourceId || '').trim();
  targetId = String(targetId || '').trim();
  if (!sourceId || !targetId) throw new Error("ID source et ID cible requis.");
  if (sourceId === targetId) throw new Error("La source et la cible doivent être différentes.");

  const planningSheetName = sourceId.startsWith('COM-') ? 'Planning Communs'
    : sourceId.startsWith('FAC-') ? 'Planning Facades' : 'Planning';

  const planningSs = SpreadsheetApp.openById(PLANNING_SS_ID);
  const planningSheet = planningSs.getSheetByName(planningSheetName);

  let planningData = [];
  let sourcePlanRow = -1, targetPlanRow = -1;
  if (planningSheet && planningSheet.getLastRow() >= 7) {
    planningData = planningSheet.getRange(7, 1, planningSheet.getLastRow() - 6, 3).getValues();
    planningData.forEach((row, i) => {
      const id = String(row[0] || '').trim();
      if (id === sourceId) sourcePlanRow = i;
      if (id === targetId) targetPlanRow = i;
    });
  }

  // Conflict check 1: Planning (whole-apartment status/note)
  if (targetPlanRow !== -1) {
    const targetStatus = String(planningData[targetPlanRow][1] || '').trim();
    const targetNotes = String(planningData[targetPlanRow][2] || '').trim();
    if (targetStatus || targetNotes) {
      throw new Error("Migration bloquée : « " + targetId + " » a déjà un statut/note global. Aucune donnée n'a été déplacée.");
    }
  }

  // Conflict check 2: EDL Notes (per-column — 'Général' + each room)
  const edlSs = SpreadsheetApp.openById(EDL_SS_ID);
  const notesSheet = edlSs.getSheetByName('EDL Notes');
  let notesData = [], notesHeaders = [];
  let sourceNotesRow = -1, targetNotesRow = -1;
  if (notesSheet) {
    const all = notesSheet.getDataRange().getValues();
    if (all.length >= 6) {
      notesHeaders = all[5];
      notesData = all;
      for (let i = 6; i < all.length; i++) {
        const id = String(all[i][1] || '').trim();
        if (id === sourceId) sourceNotesRow = i;
        if (id === targetId) targetNotesRow = i;
      }
    }
  }

  if (sourceNotesRow !== -1 && targetNotesRow !== -1) {
    for (let j = 2; j < notesHeaders.length; j++) {
      const srcVal = notesData[sourceNotesRow][j];
      const tgtVal = notesData[targetNotesRow][j];
      if (srcVal !== '' && srcVal !== null && tgtVal !== '' && tgtVal !== null) {
        const colLabel = j === 2 ? 'Général' : String(notesHeaders[j] || ('colonne ' + j));
        throw new Error("Migration bloquée : « " + targetId + " » a déjà une note EDL pour « " + colLabel + " ». Aucune donnée n'a été déplacée.");
      }
    }
  }

  // No conflicts — perform the move.

  // 1. Photos: bulk-reassign ID_Lot, never conflicts.
  let movedPhotoCount = 0;
  const photosSheet = edlSs.getSheetByName('EDL Photos');
  if (photosSheet) {
    const pData = photosSheet.getDataRange().getValues();
    if (pData.length > 1) {
      const pCol = _edlPhotoCols_(pData[0]);
      if (pCol.idLot !== -1) {
        for (let i = 1; i < pData.length; i++) {
          if (String(pData[i][pCol.idLot]).trim() === sourceId) {
            photosSheet.getRange(i + 1, pCol.idLot + 1).setValue(targetId);
            movedPhotoCount++;
          }
        }
      }
    }
  }

  // 2. EDL Notes: merge source's non-blank cells into target row, then
  //    blank the source (conflict check above already guaranteed no
  //    column is non-blank on both sides).
  let movedNoteCount = 0;
  if (sourceNotesRow !== -1) {
    const sourceRowArr = notesData[sourceNotesRow];
    if (targetNotesRow === -1) {
      const newRow = sourceRowArr.slice();
      newRow[1] = targetId;
      notesSheet.appendRow(newRow);
      for (let j = 2; j < newRow.length; j++) {
        if (newRow[j] !== '' && newRow[j] !== null) movedNoteCount++;
      }
    } else {
      // targetNotesRow is a 0-indexed row index into the same
      // getDataRange().getValues() array sourceNotesRow uses — the actual
      // (1-indexed) sheet row is simply targetNotesRow + 1, exactly like
      // sheetRowNum below for the source row.
      const targetSheetRowNum = targetNotesRow + 1;
      for (let j = 2; j < sourceRowArr.length; j++) {
        const v = sourceRowArr[j];
        if (v !== '' && v !== null) {
          notesSheet.getRange(targetSheetRowNum, j + 1).setValue(v);
          movedNoteCount++;
        }
      }
    }
    // Clear source row's note columns (whole-building col C onward).
    const sheetRowNum = sourceNotesRow + 1; // notesData is 0-indexed from getDataRange(); row number = index+1
    const blankRow = new Array(sourceRowArr.length - 2).fill('');
    notesSheet.getRange(sheetRowNum, 3, 1, blankRow.length).setValues([blankRow]);
  }

  // 3. Planning: move status/note the same way (updatePlanningData upserts).
  let movedPlanning = false;
  if (sourcePlanRow !== -1) {
    const srcStatus = String(planningData[sourcePlanRow][1] || '').trim();
    const srcNotesRaw = String(planningData[sourcePlanRow][2] || '').trim();
    let srcPub = '', srcPriv = '';
    if (srcNotesRaw) {
      try {
        const parsed = JSON.parse(srcNotesRaw);
        srcPub = parsed.pub || '';
        srcPriv = parsed.priv || '';
      } catch (e) { srcPub = srcNotesRaw; }
    }
    if (srcStatus || srcPub || srcPriv) {
      updatePlanningData({ id: targetId, planStatus: srcStatus, planNote: srcPub, planPrivateNote: srcPriv }, planningSheetName);
      updatePlanningData({ id: sourceId, planStatus: '', planNote: '', planPrivateNote: '' }, planningSheetName);
      movedPlanning = true;
    }
  }

  return { movedPhotoCount, movedNoteCount, movedPlanning, sourceId, targetId };
}

/**
 * =========================================================
 * RÉSERVES LAYER — SERVER FUNCTIONS
 * =========================================================
 * Functions specifically related to the Réserves layer.
 */
function getReservesInterventionsByLot(token, idLot, viewMode) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  if (!idLot) return [];

  try {
    const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
    const names = getSheetNames(viewMode || 'locataires');
    const results = [];

    function extractInterventions(sheetName) {
      if (!sheetName) return;
      const sh = ss.getSheetByName(sheetName);
      if (!sh) return;

      const lastRow = sh.getLastRow();
      if (lastRow < 7) return;

      // Widened from 12 to 16 columns 2026-08-26 (agents/edl-page-spec.md
      // section 4) — O/P (unused/unusedReason, indices 14/15) are the new
      // Supprimer mark-in-place flags, additive columns appended after the
      // pre-existing M/N (need-validation/secondary-status, indices 12/13,
      // already used elsewhere via gsGetInterventionDetails but not
      // previously read here). A row from before this column existed reads
      // '' for both — .getValues() pads short rows automatically.
      const data = sh.getRange(7, 1, lastRow - 6, 16).getValues();
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowLogement = String(row[2]).trim();

        if (rowLogement === String(idLot).trim()) {
          results.push({
            id: String(row[1]).trim(),
            discipline: String(row[3]).trim(),
            description: String(row[4]).trim(),
            coordonnees: String(row[5] || '').trim(),
            status: String(row[6]).trim(),
            equipe: String(row[7] || '').trim(),
            dateIntervention: formatDateFr(row[8]),
            heure: formatHeure(row[9]),
            dueDate: formatDateFr(row[10]),
            historique: String(row[11] || '').trim(),
            unused: String(row[14] || '').trim().toLowerCase() === 'true',
            unusedReason: String(row[15] || '').trim()
          });
        }
      }
    }

    extractInterventions(names.reserves);
    extractInterventions(names.autocontroles);

    return results;
  } catch (e) {
    console.error("Erreur getReservesInterventionsByLot: " + e.message);
    throw new Error("Impossible de récupérer les interventions.");
  }
}

/**
 * =========================================================
 * RÉSERVES — TOOLBAR ACTIONS (spec section 4, 2026-08-26)
 * =========================================================
 * New: create/move/duplicate interventions, mark an autocontrôle
 * unused-in-place. All coordinate-carrying — "Coordonnées" is always a
 * "x,y" PERCENTAGE-of-image-bounds string (see getReservesInterventionsByLot
 * and the shared renderOverlayTags()/EDL_Scripts_1.html), computed
 * client-side from the plan image's actual on-screen bounding box, which
 * already reflects the current zoom/pan transform — no server-side
 * conversion needed here.
 */

/**
 * Next sequential ID for a réserve/autocontrôle, "R-YYYY-NNN" /
 * "A-YYYY-NNN" (matches the convention already documented elsewhere in
 * this app, e.g. Logs.js's gsGetUniversalLog doc example 'R-2026-004').
 * Scans both sheets for the view so a fresh sequence can't collide even if
 * a row somehow ended up in the "wrong" sheet for its prefix.
 */
function _nextReservesId_(ss, names, prefix) {
  const year = new Date().getFullYear();
  let maxSeq = 0;
  const pattern = new RegExp('^' + prefix + '-' + year + '-(\\d+)$');
  [names.reserves, names.autocontroles].forEach(function (sheetName) {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    const lastRow = sh.getLastRow();
    if (lastRow < 7) return;
    sh.getRange(7, 2, lastRow - 6, 1).getValues().forEach(function (row) {
      const m = String(row[0] || '').trim().match(pattern);
      if (m) {
        const seq = parseInt(m[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    });
  });
  const seqStr = String(maxSeq + 1);
  return prefix + '-' + year + '-' + (seqStr.length < 3 ? ('000' + seqStr).slice(-3) : seqStr);
}

/**
 * "Ajouter une réserve" / "Ajouter autocontrôle" — creates a new
 * intervention at a clicked plan coordinate. Starts blank (Discipline/
 * Équipe empty, status "À planifier", no notes/photos) — filled in
 * afterward via the existing Éditer/Valider modals. isAuthorized-gated;
 * client-side toolbar rendering is what actually keeps "Ajouter
 * autocontrôle" away from clients (see spec section 4's visibility rules)
 * — this endpoint itself just requires edit rights, same as every other
 * Réserves write.
 */
function gsCreateReservesIntervention(token, projectId, payload) {
  assertCanEdit_(token, projectId);
  const view = payload.view || 'locataires';
  const isAutocontrole = !!payload.isAutocontrole;
  const idLot = payload.idLot;
  const coordonnees = payload.coordonnees;
  if (!idLot || !coordonnees) throw new Error("Emplacement ou logement manquant.");

  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  const names = getSheetNames(view);
  const sheetName = isAutocontrole ? names.autocontroles : names.reserves;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Feuille introuvable : " + sheetName);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const id = _nextReservesId_(ss, names, isAutocontrole ? 'A' : 'R');
    const description = isAutocontrole ? '' : JSON.stringify({ pub: '', priv: '' });
    const newRow = new Array(12).fill('');
    newRow[1] = id;
    newRow[2] = idLot;
    newRow[4] = description;
    newRow[5] = coordonnees;
    newRow[6] = 'À planifier';
    sheet.appendRow(newRow);
    return {
      id: id, discipline: '', description: description, coordonnees: coordonnees,
      status: 'À planifier', equipe: '', dateIntervention: '', heure: '', dueDate: '',
      historique: '', unused: false, unusedReason: ''
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * "Move" — drags an existing marker to a new position on the SAME plan
 * (distinct from gsCorrectInterventionReference, which moves to a
 * DIFFERENT apartment). Just updates the Coordonnées column.
 */
function gsMoveReservesIntervention(token, projectId, payload) {
  assertCanEdit_(token, projectId);
  const view = payload.view || 'locataires';
  const interventionId = String(payload.interventionId || '').trim();
  const isReserve = interventionId.startsWith('R-');

  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  const names = getSheetNames(view);
  const sheet = ss.getSheetByName(isReserve ? names.reserves : names.autocontroles);
  if (!sheet) throw new Error("Feuille introuvable.");

  const lastRow = sheet.getLastRow();
  if (lastRow >= 7) {
    const ids = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === interventionId) {
        sheet.getRange(7 + i, 6).setValue(payload.coordonnees); // column F
        return { success: true };
      }
    }
  }
  throw new Error("Intervention introuvable : " + interventionId);
}

/**
 * "Duplicate" (same apartment) and "Paste" (possibly a different
 * apartment — the two-step Copy/Paste flow) both land here: same
 * mechanics, only `targetIdLot` differs. Field-copying rule (spec section
 * 4): Discipline + Équipe always copied; for a réserve, which note gets
 * copied depends on who's acting — `isClientActor` copies the source's
 * PUBLIC note into the new item's public note, staff copies the PRIVATE
 * note into the new item's private note. Status and photos are never
 * copied — the new item starts fresh on both. Autocontrôles have no
 * public/private split (plain text Description, and clients never
 * interact with them at all) — their description is copied as-is.
 */
function gsDuplicateReservesIntervention(token, projectId, payload) {
  assertCanEdit_(token, projectId);
  const view = payload.view || 'locataires';
  const sourceId = String(payload.sourceId || '').trim();
  const isAutocontrole = sourceId.startsWith('A-');
  const targetIdLot = payload.targetIdLot;
  const coordonnees = payload.coordonnees;
  if (!sourceId || !targetIdLot || !coordonnees) throw new Error("Source, cible ou emplacement manquant.");

  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  const names = getSheetNames(view);
  const sheetName = isAutocontrole ? names.autocontroles : names.reserves;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Feuille introuvable : " + sheetName);

  const lastRow = sheet.getLastRow();
  if (lastRow < 7) throw new Error("Intervention source introuvable.");
  const data = sheet.getRange(7, 1, lastRow - 6, 12).getValues();
  const sourceRow = data.filter(function (r) { return String(r[1]).trim() === sourceId; })[0];
  if (!sourceRow) throw new Error("Intervention source introuvable : " + sourceId);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const id = _nextReservesId_(ss, names, isAutocontrole ? 'A' : 'R');
    let description = '';
    if (isAutocontrole) {
      description = String(sourceRow[4] || '');
    } else {
      let srcNote = { pub: '', priv: '' };
      try { srcNote = JSON.parse(String(sourceRow[4] || '{}')); } catch (e) { /* leave blank */ }
      description = payload.isClientActor
        ? JSON.stringify({ pub: srcNote.pub || '', priv: '' })
        : JSON.stringify({ pub: '', priv: srcNote.priv || '' });
    }

    const newRow = new Array(12).fill('');
    newRow[1] = id;
    newRow[2] = targetIdLot;
    newRow[3] = sourceRow[3]; // Discipline
    newRow[4] = description;
    newRow[5] = coordonnees;
    newRow[6] = 'À planifier';
    newRow[7] = sourceRow[7]; // Équipe
    sheet.appendRow(newRow);
    return {
      id: id, discipline: String(sourceRow[3] || ''), description: description, coordonnees: coordonnees,
      status: 'À planifier', equipe: String(sourceRow[7] || ''), dateIntervention: '', heure: '', dueDate: '',
      historique: '', unused: false, unusedReason: ''
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * "Supprimer" — autocontrôles only, never réserves (a réserve can be
 * status-corrected but never removed this way). Mark-in-place, never a
 * true delete, mirroring EDL's photo mark-unused shape (gsSetEDLPhotoUnused):
 * reversible, optional reason, stays visible (marked) rather than
 * disappearing. Columns O/P (indices 14/15), additive — appended after the
 * pre-existing M/N (need-validation/secondary-status) rather than reusing
 * them.
 */
function gsSetAutocontroleUnused(token, projectId, payload) {
  assertCanEdit_(token, projectId);
  const view = payload.view || 'locataires';
  const interventionId = String(payload.interventionId || '').trim();
  if (!interventionId.startsWith('A-')) throw new Error("Cette action ne s'applique qu'aux autocontrôles.");

  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  const names = getSheetNames(view);
  const sheet = ss.getSheetByName(names.autocontroles);
  if (!sheet) throw new Error("Feuille introuvable : " + names.autocontroles);

  const lastRow = sheet.getLastRow();
  if (lastRow >= 7) {
    const ids = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === interventionId) {
        const row = 7 + i;
        sheet.getRange(row, 15).setValue(payload.unused ? 'TRUE' : ''); // O
        sheet.getRange(row, 16).setValue(payload.unused ? (payload.reason || '') : ''); // P
        return { success: true };
      }
    }
  }
  throw new Error("Autocontrôle introuvable : " + interventionId);
}

/**
 * =========================================================
 * RÉSERVES PHOTOS (spec section 4 — "same treatment as EDL's photos, plus
 * phase tracking") — brand new sheet; before this, Réserves photos had NO
 * persisted metadata at all, not even a row (see agents/progress-log.md
 * for the investigation that found this — Drive upload only, discarded
 * URL). Headers row 6 / data row 7, matching this workbook's own
 * convention (the OTHER Réserves sheets), not EDL Photos' row-1 legacy
 * layout — this is a fresh sheet with no precedent to preserve.
 */
const RESERVES_PHOTOS_SHEET_ = 'Reserves Photos';
const RESERVES_PHOTO_HEADERS_ = ['ID_Photo', 'ID_Lot', 'Intervention_ID', 'Phase', 'Correction_Ref', 'Drive_ID', 'Timestamp', 'Caption', 'Uploader', 'Unused', 'UnusedReason'];

function _getReservesPhotosSheet_() {
  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  let sheet = ss.getSheetByName(RESERVES_PHOTOS_SHEET_);
  if (!sheet) {
    sheet = ss.insertSheet(RESERVES_PHOTOS_SHEET_);
    const range = sheet.getRange(6, 2, 1, RESERVES_PHOTO_HEADERS_.length);
    range.setValues([RESERVES_PHOTO_HEADERS_]);
    range.setFontWeight('bold').setBackground('#e2e8f0');
    sheet.setFrozenRows(6);
  }
  return sheet;
}

/**
 * Attaches a photo to an intervention, tagged with its lifecycle phase
 * ('Signalement' | 'Correction') and, for a Correction-phase photo, a
 * `correctionRef` grouping it with whichever correction event it
 * documents (an ISO timestamp is enough — spec section 4 leaves the exact
 * grouping key open, "e.g. by date, or a direct reference to the
 * correction record"). Currently called from the existing "Valider" modal
 * (onValidateInterventionClicked), tagged phase='Correction' there since
 * validation follows a fix — a dedicated Signalement-time photo capture
 * (e.g. at intervention-creation) isn't wired up yet, a known gap, not
 * silently assumed complete.
 */
function gsUploadReservesPhoto(token, projectId, interventionId, idLot, phase, correctionRef, fileName, base64Data, mimeType, caption) {
  const user = assertCanEdit_(token, projectId);

  const folderId = PropertiesService.getScriptProperties().getProperty('PROJECT_PHOTOS_FILE');
  const folder = DriveApp.getFolderById(folderId);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  const file = folder.createFile(blob);

  const sheet = _getReservesPhotosSheet_();
  const photoId = 'RPHO-' + new Date().getTime();
  const timestamp = new Date().toISOString();
  const uploader = user.email || 'Inconnu';
  const resolvedPhase = phase || 'Signalement';

  sheet.appendRow(['', photoId, idLot, interventionId, resolvedPhase, correctionRef || '', file.getId(), timestamp, caption || '', uploader, '', '']);

  return {
    photoId: photoId, idLot: idLot, interventionId: interventionId, phase: resolvedPhase,
    correctionRef: correctionRef || '', driveId: file.getId(), timestamp: timestamp,
    caption: caption || '', uploader: uploader, unused: false, unusedReason: ''
  };
}

function gsGetReservesPhotosData(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  const sheet = ss.getSheetByName(RESERVES_PHOTOS_SHEET_);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 7) return [];

  return sheet.getRange(7, 2, lastRow - 6, 11).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return {
        photoId: r[0], idLot: r[1], interventionId: r[2], phase: r[3], correctionRef: r[4],
        driveId: r[5], timestamp: r[6], caption: r[7], uploader: r[8],
        unused: String(r[9] || '').toLowerCase() === 'true', unusedReason: r[10]
      };
    });
}

/** Mark-unused for Réserves photos — same shape as gsSetEDLPhotoUnused. */
function gsSetReservesPhotoUnused(token, projectId, photoId, unused, reason) {
  assertCanEdit_(token, projectId);
  const sheet = _getReservesPhotosSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow >= 7) {
    const ids = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === String(photoId).trim()) {
        const row = 7 + i;
        sheet.getRange(row, 11).setValue(unused ? 'TRUE' : ''); // K (col 2 + 9 = col 11)
        sheet.getRange(row, 12).setValue(unused ? (reason || '') : ''); // L
        return true;
      }
    }
  }
  throw new Error("Photo introuvable : " + photoId);
}

/**
 * =========================================================
 * RÉSERVES ANNOTATIONS (spec section 4 — line/rectangle, freeform,
 * not tied to any réserve/autocontrôle)
 * =========================================================
 * New sheet, same convention as this workbook's other Réserves sheets
 * (headers row 6, data row 7). One sheet covers every view (Locataires/
 * Communs/Façades) — a "View" column disambiguates, since an annotation
 * has no natural Cible-prefixed ID the way interventions do.
 */
const RESERVES_ANNOTATIONS_SHEET_ = 'Reserves Annotations';
const RESERVES_ANNOTATION_HEADERS_ = ['ID', 'View', 'ID_Lot', 'Shape', 'X1', 'Y1', 'X2', 'Y2', 'Color', 'Visibility'];

function _getReservesAnnotationsSheet_() {
  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  let sheet = ss.getSheetByName(RESERVES_ANNOTATIONS_SHEET_);
  if (!sheet) {
    sheet = ss.insertSheet(RESERVES_ANNOTATIONS_SHEET_);
    const range = sheet.getRange(6, 2, 1, RESERVES_ANNOTATION_HEADERS_.length);
    range.setValues([RESERVES_ANNOTATION_HEADERS_]);
    range.setFontWeight('bold').setBackground('#e2e8f0');
    sheet.setFrozenRows(6);
  }
  return sheet;
}

function gsCreateReservesAnnotation(token, projectId, payload) {
  assertCanEdit_(token, projectId);
  const sheet = _getReservesAnnotationsSheet_();
  const id = 'ANN-' + new Date().getTime();
  sheet.appendRow(['', id, payload.view || 'locataires', payload.idLot, payload.shape, payload.x1, payload.y1, payload.x2, payload.y2, payload.color || '#dc2626', payload.visibility || 'Private']);
  return {
    id: id, view: payload.view, idLot: payload.idLot, shape: payload.shape,
    x1: parseFloat(payload.x1), y1: parseFloat(payload.y1), x2: parseFloat(payload.x2), y2: parseFloat(payload.y2),
    color: payload.color || '#dc2626', visibility: payload.visibility || 'Private'
  };
}

/** Returns every annotation for a view (all apartments) — the client filters to the active one, same pattern as interventions. */
function gsGetReservesAnnotations(token, view) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  const sheet = ss.getSheetByName(RESERVES_ANNOTATIONS_SHEET_);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 7) return [];
  const isClientUser = !!(user && user.isClient === true);
  // Width 10 (columns B..K — ID..Visibility, matching
  // RESERVES_ANNOTATION_HEADERS_'s 10 entries and appendRow's 11-element
  // row above, index 0 there being the blank column A).
  return sheet.getRange(7, 2, lastRow - 6, 10).getValues()
    .filter(function (r) { return r[0] && (!view || String(r[1]) === view); })
    .filter(function (r) { return !isClientUser || String(r[9]) !== 'Private'; })
    .map(function (r) {
      return { id: r[0], view: r[1], idLot: r[2], shape: r[3], x1: parseFloat(r[4]), y1: parseFloat(r[5]), x2: parseFloat(r[6]), y2: parseFloat(r[7]), color: r[8], visibility: r[9] };
    });
}

/**
 * =========================================================
 * PLAN EDITOR — shared engine for Élec. and Sanit. (spec sections 5+6,
 * 2026-08-26). One engine, parameterized by `catalogue` ('elec'|'sanit')
 * — confirmed by the spec itself that the two layers are architecturally
 * identical, only the catalog CONTENT differs (sockets/switches vs.
 * sinks/toilets), which is data entry through the admin UI, not code.
 * All sheets live in EDL_SS_ID (same workbook as Config Travaux/EDL
 * Notes — no new Script Property needed), headers row 6 / data row 7.
 *
 * Four tiers, exactly per spec section 5's data model:
 *   Item Types    — global catalog: label, icon, PropertiesSchema
 *                   ("Label:Type;Label:Type", same mini-language shape as
 *                   Travaux's old per-row extra fields, but here it's a
 *                   legitimate schema-of-properties-this-TYPE-can-have,
 *                   not an ad hoc per-row bag — different problem).
 *   Templates     — named, scoped to exactly one of {apartment type,
 *                   specific Commun ID} — never both, per spec.
 *   Template Items — a template's default placed items AND their count
 *                   constraints. Per spec, constraint fields (min/max/
 *                   condition/enforcement) live on the same row as a
 *                   placed item's position — when several default items
 *                   share a (room, itemType) pair, the constraint is only
 *                   really meaningful once per pair; _constraintsFor_
 *                   below takes the first non-blank value it finds for
 *                   each (room, itemType), an admin-discipline assumption
 *                   (don't set contradictory constraints on sibling rows)
 *                   rather than a second constraints table.
 *   Instances     — real per-apartment/commun placed items, seeded by
 *                   copy (never a live link) from a template or another
 *                   ID's instances, per the onboarding flow.
 */
function _planEditorSheetName_(catalogue, kind) {
  const prefix = (catalogue === 'sanit') ? 'Sanit' : 'Elec';
  return prefix + ' ' + kind; // kind: 'Item Types' | 'Templates' | 'Template Items' | 'Instances'
}

function _getPlanEditorSheet_(catalogue, kind, headers) {
  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  const name = _planEditorSheetName_(catalogue, kind);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const range = sheet.getRange(6, 2, 1, headers.length);
    range.setValues([headers]);
    range.setFontWeight('bold').setBackground('#e2e8f0');
    sheet.setFrozenRows(6);
  }
  return sheet;
}

const PE_ITEMTYPE_HEADERS_ = ['ID', 'Label', 'Icon', 'PropertiesSchema'];
const PE_TEMPLATE_HEADERS_ = ['ID', 'Name', 'Scope', 'ScopeValue'];
const PE_TEMPLATEITEM_HEADERS_ = ['ID', 'TemplateID', 'ItemTypeID', 'Room', 'X', 'Y', 'Rotation', 'MinCount', 'MaxCount', 'Condition', 'Enforcement'];
const PE_INSTANCE_HEADERS_ = ['ID', 'IdLot', 'ItemTypeID', 'Room', 'X', 'Y', 'Rotation', 'PropertiesJSON'];

function _peReadAll_(catalogue, kind, headers) {
  const sheet = _getPlanEditorSheet_(catalogue, kind, headers);
  const lastRow = sheet.getLastRow();
  if (lastRow < 7) return [];
  return sheet.getRange(7, 2, lastRow - 6, headers.length).getValues().filter(function (r) { return r[0]; });
}

// --- Item Types (admin catalog) ----------------------------------------

function gsGetPlanEditorItemTypes(token, catalogue) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  return _peReadAll_(catalogue, 'Item Types', PE_ITEMTYPE_HEADERS_).map(function (r) {
    return { id: r[0], label: r[1], icon: r[2], propertiesSchema: r[3] };
  });
}

function gsSavePlanEditorItemType(token, projectId, catalogue, rowData, isNew) {
  assertIsAdmin_(token, projectId);
  const sheet = _getPlanEditorSheet_(catalogue, 'Item Types', PE_ITEMTYPE_HEADERS_);
  const lastRow = sheet.getLastRow();
  const ids = lastRow > 6 ? sheet.getRange(7, 2, lastRow - 6, 1).getValues() : [];
  let targetRow = -1;
  for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]).trim() === String(rowData.id).trim()) { targetRow = 7 + i; break; } }
  if (isNew) {
    if (targetRow !== -1) throw new Error("Cet ID existe déjà : " + rowData.id);
    targetRow = Math.max(lastRow + 1, 7);
  } else if (targetRow === -1) {
    throw new Error("Type d'élément introuvable : " + rowData.id);
  }
  sheet.getRange(targetRow, 2, 1, 4).setValues([[rowData.id, rowData.label, rowData.icon || '', rowData.propertiesSchema || '']]);
  return gsGetPlanEditorItemTypes(token, catalogue);
}

function gsDeletePlanEditorItemType(token, projectId, catalogue, itemTypeId) {
  assertIsAdmin_(token, projectId);
  const sheet = _getPlanEditorSheet_(catalogue, 'Item Types', PE_ITEMTYPE_HEADERS_);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 7) {
    const ids = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === String(itemTypeId).trim()) { sheet.deleteRow(7 + i); break; }
    }
  }
  return gsGetPlanEditorItemTypes(token, catalogue);
}

// --- Templates -----------------------------------------------------------

function gsGetPlanEditorTemplates(token, catalogue) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  return _peReadAll_(catalogue, 'Templates', PE_TEMPLATE_HEADERS_).map(function (r) {
    return { id: r[0], name: r[1], scope: r[2], scopeValue: r[3] };
  });
}

function gsSavePlanEditorTemplate(token, projectId, catalogue, rowData, isNew) {
  assertIsAdmin_(token, projectId);
  const sheet = _getPlanEditorSheet_(catalogue, 'Templates', PE_TEMPLATE_HEADERS_);
  let id = rowData.id;
  if (isNew) { id = 'TPL-' + new Date().getTime(); sheet.appendRow(['', id, rowData.name, rowData.scope, rowData.scopeValue]); }
  else {
    const lastRow = sheet.getLastRow();
    const ids = lastRow > 6 ? sheet.getRange(7, 2, lastRow - 6, 1).getValues() : [];
    let targetRow = -1;
    for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]).trim() === String(id).trim()) { targetRow = 7 + i; break; } }
    if (targetRow === -1) throw new Error("Modèle introuvable : " + id);
    sheet.getRange(targetRow, 2, 1, 4).setValues([[id, rowData.name, rowData.scope, rowData.scopeValue]]);
  }
  return gsGetPlanEditorTemplates(token, catalogue);
}

function gsDeletePlanEditorTemplate(token, projectId, catalogue, templateId) {
  assertIsAdmin_(token, projectId);
  const sheet = _getPlanEditorSheet_(catalogue, 'Templates', PE_TEMPLATE_HEADERS_);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 7) {
    const ids = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === String(templateId).trim()) { sheet.deleteRow(7 + i); break; }
    }
  }
  // Orphaned Template Items (rows referencing this templateId) are left as-is,
  // same "deliberately don't cascade" choice Travaux's deleteTravauxConfigRow makes.
  return gsGetPlanEditorTemplates(token, catalogue);
}

// --- Template Items (a template's default layout + constraints) --------

function gsGetPlanEditorTemplateItems(token, catalogue, templateId) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  return _peReadAll_(catalogue, 'Template Items', PE_TEMPLATEITEM_HEADERS_)
    .filter(function (r) { return String(r[1]) === String(templateId); })
    .map(function (r) {
      return { id: r[0], templateId: r[1], itemTypeId: r[2], room: r[3], x: parseFloat(r[4]), y: parseFloat(r[5]), rotation: parseFloat(r[6]) || 0, minCount: r[7], maxCount: r[8], condition: r[9], enforcement: r[10] };
    });
}

function gsSavePlanEditorTemplateItem(token, projectId, catalogue, rowData, isNew) {
  assertIsAdmin_(token, projectId);
  const sheet = _getPlanEditorSheet_(catalogue, 'Template Items', PE_TEMPLATEITEM_HEADERS_);
  const row = [rowData.id, rowData.templateId, rowData.itemTypeId, rowData.room, rowData.x, rowData.y, rowData.rotation || 0, rowData.minCount, rowData.maxCount, rowData.condition || '', rowData.enforcement || 'blocking'];
  if (isNew) {
    row[0] = 'TI-' + new Date().getTime();
    sheet.appendRow([''].concat(row));
  } else {
    const lastRow = sheet.getLastRow();
    const ids = lastRow > 6 ? sheet.getRange(7, 2, lastRow - 6, 1).getValues() : [];
    let targetRow = -1;
    for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]).trim() === String(rowData.id).trim()) { targetRow = 7 + i; break; } }
    if (targetRow === -1) throw new Error("Élément de modèle introuvable : " + rowData.id);
    sheet.getRange(targetRow, 2, 1, row.length).setValues([row]);
  }
  return gsGetPlanEditorTemplateItems(token, catalogue, rowData.templateId);
}

function gsDeletePlanEditorTemplateItem(token, projectId, catalogue, templateItemId, templateId) {
  assertIsAdmin_(token, projectId);
  const sheet = _getPlanEditorSheet_(catalogue, 'Template Items', PE_TEMPLATEITEM_HEADERS_);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 7) {
    const ids = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === String(templateItemId).trim()) { sheet.deleteRow(7 + i); break; }
    }
  }
  return gsGetPlanEditorTemplateItems(token, catalogue, templateId);
}

// --- Instances (real per-apartment/commun placed items) -----------------

function gsGetPlanEditorInstances(token, catalogue, idLot) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  return _peReadAll_(catalogue, 'Instances', PE_INSTANCE_HEADERS_)
    .filter(function (r) { return String(r[1]) === String(idLot); })
    .map(function (r) {
      let props = {};
      try { props = r[7] ? JSON.parse(r[7]) : {}; } catch (e) {}
      return { id: r[0], idLot: r[1], itemTypeId: r[2], room: r[3], x: parseFloat(r[4]), y: parseFloat(r[5]), rotation: parseFloat(r[6]) || 0, properties: props };
    });
}

// Client full access (spec section 5) — assertCanEdit_ only, no isAdmin
// requirement, matching every other Élec/Sanit instance-editing endpoint.
function gsSavePlanEditorInstance(token, projectId, catalogue, rowData, isNew) {
  assertCanEdit_(token, projectId);
  const sheet = _getPlanEditorSheet_(catalogue, 'Instances', PE_INSTANCE_HEADERS_);
  const propsJson = JSON.stringify(rowData.properties || {});
  if (isNew) {
    const id = 'INS-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
    sheet.appendRow(['', id, rowData.idLot, rowData.itemTypeId, rowData.room, rowData.x, rowData.y, rowData.rotation || 0, propsJson]);
    return { id: id, idLot: rowData.idLot, itemTypeId: rowData.itemTypeId, room: rowData.room, x: rowData.x, y: rowData.y, rotation: rowData.rotation || 0, properties: rowData.properties || {} };
  }
  const lastRow = sheet.getLastRow();
  const ids = lastRow > 6 ? sheet.getRange(7, 2, lastRow - 6, 1).getValues() : [];
  let targetRow = -1;
  for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]).trim() === String(rowData.id).trim()) { targetRow = 7 + i; break; } }
  if (targetRow === -1) throw new Error("Élément introuvable : " + rowData.id);
  sheet.getRange(targetRow, 2, 1, 8).setValues([[rowData.id, rowData.idLot, rowData.itemTypeId, rowData.room, rowData.x, rowData.y, rowData.rotation || 0, propsJson]]);
  return { id: rowData.id, idLot: rowData.idLot, itemTypeId: rowData.itemTypeId, room: rowData.room, x: rowData.x, y: rowData.y, rotation: rowData.rotation || 0, properties: rowData.properties || {} };
}

// True delete (spec section 5 — configuration data, not evidence; no
// "never delete" concern here unlike EDL/Réserves photos).
function gsDeletePlanEditorInstance(token, projectId, catalogue, instanceId) {
  assertCanEdit_(token, projectId);
  const sheet = _getPlanEditorSheet_(catalogue, 'Instances', PE_INSTANCE_HEADERS_);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 7) {
    const ids = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === String(instanceId).trim()) { sheet.deleteRow(7 + i); return true; }
    }
  }
  throw new Error("Élément introuvable : " + instanceId);
}

/**
 * Onboarding (spec section 5): seeds real instances by COPYING (never a
 * live link) either a template's default layout or another ID's actual
 * instances. Blocked if the target ID already has instances — this is a
 * one-time onboarding action, not a repeatable merge/overwrite.
 */
function gsSeedPlanEditorInstances(token, projectId, catalogue, idLot, sourceKind, sourceId) {
  assertCanEdit_(token, projectId);
  const existing = gsGetPlanEditorInstances(token, catalogue, idLot);
  if (existing.length > 0) throw new Error("Cet identifiant a déjà des éléments placés — l'amorçage ne s'applique qu'une fois.");

  const sheet = _getPlanEditorSheet_(catalogue, 'Instances', PE_INSTANCE_HEADERS_);
  let sourceItems = [];
  if (sourceKind === 'template') {
    sourceItems = gsGetPlanEditorTemplateItems(token, catalogue, sourceId).map(function (ti) {
      return { itemTypeId: ti.itemTypeId, room: ti.room, x: ti.x, y: ti.y, rotation: ti.rotation, properties: {} };
    });
  } else if (sourceKind === 'duplicate') {
    sourceItems = gsGetPlanEditorInstances(token, catalogue, sourceId).map(function (inst) {
      return { itemTypeId: inst.itemTypeId, room: inst.room, x: inst.x, y: inst.y, rotation: inst.rotation, properties: inst.properties };
    });
  } else {
    throw new Error("sourceKind invalide : " + sourceKind);
  }

  sourceItems.forEach(function (item, i) {
    const id = 'INS-' + new Date().getTime() + '-' + i;
    sheet.appendRow(['', id, idLot, item.itemTypeId, item.room, item.x, item.y, item.rotation || 0, JSON.stringify(item.properties || {})]);
  });
  return gsGetPlanEditorInstances(token, catalogue, idLot);
}

/**
 * =========================================================
 * FORMULAIRES (spec section 7, 2026-08-26) — owner sign-off documents.
 * =========================================================
 * Two sheets in EDL_SS_ID (same "no new workbook" convention as everything
 * else this session), headers row 6 / data row 7:
 *   Form Templates — admin catalog. BodyType 'auto' (fixed text with
 *     {{merge_token}}s, resolved CLIENT-side at instance-creation time
 *     against ctx.activeItem/ctx.activeId/today, matching how Travaux's
 *     recap header already merges data client-side — the server just
 *     stores whatever bodyHtml it's handed) or 'manuel' (blank, staff
 *     types the corps directly when creating an instance).
 *   Form Documents — instances. TemplateId blank = a fully ad hoc custom
 *     statement (spec's "not necessarily added to the shared catalog").
 *     BodyHtml here is the FINAL merged/typed corps for this one instance
 *     (not re-resolved from the template on every read) — a template
 *     edited later never retroactively changes an already-created
 *     instance, matching how Config Travaux edits don't rewrite already-
 *     saved Données Travaux answers either.
 * No signature pad (session decision, agents/edl-todo.md) — print or
 * email, then upload the signed/scanned document; gsSendFormulaireEmail
 * uses MailApp (script.send_mail scope already declared in
 * appsscript.json).
 */
const FORM_TEMPLATES_SHEET_ = 'Form Templates';
const FORM_TEMPLATE_HEADERS_ = ['ID', 'Name', 'BodyType', 'BodyHtml', 'Active'];
const FORM_DOCUMENTS_SHEET_ = 'Form Documents';
const FORM_DOCUMENT_HEADERS_ = ['ID', 'IdLot', 'TemplateID', 'Title', 'BodyHtml', 'Status', 'OwnerSignerName', 'StaffSignerName', 'SignedDriveID', 'CreatedAt', 'CreatedBy'];

function _getFormSheet_(name, headers) {
  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const range = sheet.getRange(6, 2, 1, headers.length);
    range.setValues([headers]);
    range.setFontWeight('bold').setBackground('#e2e8f0');
    sheet.setFrozenRows(6);
  }
  return sheet;
}

// --- Templates (admin catalog; any authorized staff can VIEW, per spec) --

function gsGetFormTemplates(token, projectId) {
  assertCanEdit_(token, projectId); // "any authorized staff", not clients — spec section 7
  const sheet = _getFormSheet_(FORM_TEMPLATES_SHEET_, FORM_TEMPLATE_HEADERS_);
  const lastRow = sheet.getLastRow();
  if (lastRow < 7) return [];
  return sheet.getRange(7, 2, lastRow - 6, 5).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { id: r[0], name: r[1], bodyType: r[2], bodyHtml: r[3], active: String(r[4]).toLowerCase() !== 'false' }; });
}

function gsSaveFormTemplate(token, projectId, rowData, isNew) {
  assertIsAdmin_(token, projectId);
  const sheet = _getFormSheet_(FORM_TEMPLATES_SHEET_, FORM_TEMPLATE_HEADERS_);
  const row = [rowData.name, rowData.bodyType, rowData.bodyHtml || '', rowData.active === false ? 'false' : 'true'];
  if (isNew) {
    const id = 'FTPL-' + new Date().getTime();
    sheet.appendRow([''].concat([id]).concat(row));
  } else {
    const lastRow = sheet.getLastRow();
    const ids = lastRow > 6 ? sheet.getRange(7, 2, lastRow - 6, 1).getValues() : [];
    let targetRow = -1;
    for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]).trim() === String(rowData.id).trim()) { targetRow = 7 + i; break; } }
    if (targetRow === -1) throw new Error("Modèle introuvable : " + rowData.id);
    sheet.getRange(targetRow, 3, 1, 4).setValues([row]);
  }
  return gsGetFormTemplates(token, projectId);
}

function gsDeleteFormTemplate(token, projectId, templateId) {
  assertIsAdmin_(token, projectId);
  const sheet = _getFormSheet_(FORM_TEMPLATES_SHEET_, FORM_TEMPLATE_HEADERS_);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 7) {
    const ids = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]).trim() === String(templateId).trim()) { sheet.deleteRow(7 + i); break; } }
  }
  return gsGetFormTemplates(token, projectId);
}

// --- Documents (instances) ------------------------------------------------

// Clients read their own apartment's documents too (spec: "strictly
// read-only... can view/download their own statements") — getSession_
// only, not assertCanEdit_, matching every other client-readable endpoint.
function gsGetFormDocumentsByLot(token, idLot) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  const sheet = _getFormSheet_(FORM_DOCUMENTS_SHEET_, FORM_DOCUMENT_HEADERS_);
  const lastRow = sheet.getLastRow();
  if (lastRow < 7) return [];
  return sheet.getRange(7, 2, lastRow - 6, 11).getValues()
    .filter(function (r) { return r[0] && String(r[1]) === String(idLot); })
    .map(function (r) {
      return { id: r[0], idLot: r[1], templateId: r[2], title: r[3], bodyHtml: r[4], status: r[5], ownerSignerName: r[6], staffSignerName: r[7], signedDriveId: r[8], createdAt: r[9], createdBy: r[10] };
    });
}

function gsCreateFormDocument(token, projectId, payload) {
  const user = assertCanEdit_(token, projectId); // staff only, never clients — spec section 7
  const sheet = _getFormSheet_(FORM_DOCUMENTS_SHEET_, FORM_DOCUMENT_HEADERS_);
  const id = 'FDOC-' + new Date().getTime();
  const createdAt = new Date().toISOString();
  sheet.appendRow(['', id, payload.idLot, payload.templateId || '', payload.title, payload.bodyHtml || '', 'Non signé', payload.ownerSignerName || '', payload.staffSignerName || '', '', createdAt, user.email || 'Inconnu']);
  return { id: id, idLot: payload.idLot, templateId: payload.templateId || '', title: payload.title, bodyHtml: payload.bodyHtml || '', status: 'Non signé', ownerSignerName: payload.ownerSignerName || '', staffSignerName: payload.staffSignerName || '', signedDriveId: '', createdAt: createdAt, createdBy: user.email || 'Inconnu' };
}

function _findFormDocRow_(sheet, docId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 7) return -1;
  const ids = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
  for (let i = 0; i < ids.length; i++) { if (String(ids[i][0]).trim() === String(docId).trim()) return 7 + i; }
  return -1;
}

function gsUpdateFormDocumentStatus(token, projectId, docId, status) {
  assertCanEdit_(token, projectId);
  const sheet = _getFormSheet_(FORM_DOCUMENTS_SHEET_, FORM_DOCUMENT_HEADERS_);
  const row = _findFormDocRow_(sheet, docId);
  if (row === -1) throw new Error("Document introuvable : " + docId);
  sheet.getRange(row, 7).setValue(status); // column G = Status
  return true;
}

/** Uploads the signed/scanned document — sets status to "Signé". */
function gsUploadSignedFormDocument(token, projectId, docId, fileName, base64Data, mimeType) {
  assertCanEdit_(token, projectId);
  const sheet = _getFormSheet_(FORM_DOCUMENTS_SHEET_, FORM_DOCUMENT_HEADERS_);
  const row = _findFormDocRow_(sheet, docId);
  if (row === -1) throw new Error("Document introuvable : " + docId);

  const folderId = PropertiesService.getScriptProperties().getProperty('PROJECT_PHOTOS_FILE');
  const folder = DriveApp.getFolderById(folderId);
  let signedFolder;
  const subs = folder.getFoldersByName('06- Formulaires Signes');
  signedFolder = subs.hasNext() ? subs.next() : folder.createFolder('06- Formulaires Signes');
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  const file = signedFolder.createFile(blob);

  sheet.getRange(row, 9).setValue(file.getId()); // I = SignedDriveID
  sheet.getRange(row, 7).setValue('Signé');      // G = Status
  return { signedDriveId: file.getId(), status: 'Signé' };
}

/** Sends the document by email to the owner; marks status "Envoyé". */
function gsSendFormulaireEmail(token, projectId, docId, recipientEmail, subject, bodyText) {
  assertCanEdit_(token, projectId);
  if (!recipientEmail) throw new Error("Adresse e-mail du destinataire manquante.");
  const sheet = _getFormSheet_(FORM_DOCUMENTS_SHEET_, FORM_DOCUMENT_HEADERS_);
  const row = _findFormDocRow_(sheet, docId);
  if (row === -1) throw new Error("Document introuvable : " + docId);

  MailApp.sendEmail({ to: recipientEmail, subject: subject, htmlBody: bodyText });
  sheet.getRange(row, 7).setValue('Envoyé'); // G = Status
  return true;
}

/**
 * Validates a Reserve or Autocontrole intervention.
 * Sets the statuses, removes any planned dates if required, and clears
 * references to the intervention ID inside the corresponding tracking planning sheets.
 */
function validateReservesIntervention(token, projectId, payload) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session de connexion expirée.");

  const { interventionId, isReserve, moduleView, clearDate, photos } = payload;
  const uploadedPhotos = [];

  // 1. Photo storage optimization processing
  if (photos && photos.length > 0) {
    const rootFolderId = PropertiesService.getScriptProperties().getProperty('PROJECT_PHOTOS_FILE');
    if (!rootFolderId) throw new Error("La configuration de stockage 'PROJECT_PHOTOS_FILE' est introuvable.");

    const rootFolder = DriveApp.getFolderById(rootFolderId);
    let reservesFolder;
    const subfolders = rootFolder.getFoldersByName("03- Reserves Photos");
    
    if (subfolders.hasNext()) {
      reservesFolder = subfolders.next();
    } else {
      reservesFolder = rootFolder.createFolder("03- Reserves Photos");
    }

    photos.forEach(photo => {
      const blob = Utilities.newBlob(Utilities.base64Decode(photo.base64), 'image/webp', photo.name);
      const file = reservesFolder.createFile(blob);
      uploadedPhotos.push({
        name: file.getName(),
        id: file.getId(),
        url: file.getUrl()
      });
    });
  }

  // 2. Open targeted tracking databases
  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  const sheets = ss.getSheets();
  let targetSheet = null;
  let targetRowIndex = -1;
  let headers = [];

  for (let s of sheets) {
    const data = s.getDataRange().getValues();
    if (data.length < 7) continue; 

    headers = data[5]; // Header rows live at index 5 (Row 6)
    const idColIndex = headers.indexOf("ID Réserve") !== -1 ? headers.indexOf("ID Réserve") : 1; 

    for (let i = 6; i < data.length; i++) {
      if (String(data[i][idColIndex]).trim() === String(interventionId).trim()) {
        targetSheet = s;
        targetRowIndex = i + 1; 
        break;
      }
    }
    if (targetSheet) break;
  }

  if (!targetSheet) {
    throw new Error(`Impossible de localiser l'ID d'intervention ${interventionId} dans le fichier.`);
  }

  // 2.5 Photo metadata — added 2026-08-26 (agents/edl-page-spec.md section
  // 4, "same metadata/mark-unused treatment as EDL's photos, plus phase
  // tracking"). Before this, uploadedPhotos (step 1) were Drive-only, no
  // sheet row at all. Tagged phase='Correction' since validating an
  // intervention follows a fix — there's no separate Signalement-time
  // photo-capture entry point yet (a known gap, see agents/edl-todo.md),
  // so every photo attached through this existing flow is a Correction
  // photo. correctionRef groups photos from the SAME validation event
  // together (spec: "by date, or a direct reference to the correction
  // record") — an ISO timestamp captured once, shared by every photo in
  // this one call, is enough for that; the intervention itself may still
  // get reopened and re-validated later for a genuinely new round, which
  // would carry a different correctionRef, per spec's "open-ended number
  // of unsatisfied-client rounds" requirement.
  if (uploadedPhotos.length > 0) {
    const idLot = String(targetSheet.getRange(targetRowIndex, 3).getValue() || '').trim();
    const correctionRef = new Date().toISOString();
    const photosSheet = _getReservesPhotosSheet_();
    uploadedPhotos.forEach(function (p) {
      const photoId = 'RPHO-' + Utilities.getUuid();
      photosSheet.appendRow(['', photoId, idLot, interventionId, 'Correction', correctionRef, p.id, correctionRef, '', user.email || 'Inconnu', '', '']);
    });
  }

  // 3. Apply structural state mutations
  let statusColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return (text.includes("statut") || text === "status") && !text.includes("second") && !text.includes("sous");
  });
  if (statusColIndex === -1) statusColIndex = 6;
  targetSheet.getRange(targetRowIndex, statusColIndex + 1).setValue("Validée");

  if (isReserve) {
    let secStatusColIndex = headers.findIndex(h => {
      const text = String(h).toLowerCase();
      return text.includes("secondaire") || text.includes("sous-statut") || text.includes("secondary");
    });
    if (secStatusColIndex !== -1) {
      targetSheet.getRange(targetRowIndex, secStatusColIndex + 1).setValue("Levée");
    }
  }

  // 4. Remove Target Scheduling References (Main Sheet + Planning Matrix Grid)
  if (clearDate) {
    // Clear out of standard reference listing row field
    let dateColIndex = headers.findIndex(h => {
      const text = String(h).toLowerCase();
      return text.includes("date") && text.includes("intervention");
    });
    if (dateColIndex === -1) {
      dateColIndex = headers.findIndex(h => String(h).toLowerCase() === "date");
    }
    if (dateColIndex !== -1) {
      targetSheet.getRange(targetRowIndex, dateColIndex + 1).setValue("");
    }

    // Clear out of Planning Grid matrix cell reference allocations
    try {
      // BUGFIX: this used to look up the sheet on `ss`, which is RESERVES_SS_ID —
      // but "Planning Reserves" lives in the Planning workbook, so planSheet was
      // always null here and this block was a silent no-op. Fixed the same way
      // as gsUpdateInterventionDateTime() below: shared getSheetNames() for the
      // sheet name, and the bare PLANNING_SS_ID global (declared once in
      // Planning_gs.txt, shared across every .gs file in the project) to open
      // the right workbook.
      const names = getSheetNames(moduleView || 'locataires');
      const ssPlan = SpreadsheetApp.openById(PLANNING_SS_ID);
      const planSheet = ssPlan.getSheetByName(names.planReserves);
      
      if (planSheet) {
        const planRange = planSheet.getDataRange();
        const planValues = planRange.getValues();
        const searchId = String(interventionId).trim();

        // Scan the entire planning grid array matrix for the target ID.
        // Cells hold '|'-separated IDs (same convention as gsUpdateInterventionDateTime
        // and gsSaveInterventionDetails) — not comma-separated, so this now splits/
        // filters/rejoins on '|' instead of the previous comma-cleanup, which could
        // never actually match this format.
        for (let r = 0; r < planValues.length; r++) {
          for (let c = 0; c < planValues[r].length; c++) {
            let cellValue = String(planValues[r][c]);
            
            if (cellValue.includes(searchId)) {
              let arr = cellValue.split('|').map(x => x.trim()).filter(x => x !== "" && x !== searchId);
              planSheet.getRange(r + 1, c + 1).setValue(arr.join(' | '));
            }
          }
        }
      }
    } catch (planningError) {
      // Allow logging gracefully without breaking the main execution loop chain
      console.error("Erreur lors de la purge de la cellule planning matrix: " + planningError.toString());
    }
  }

  return { 
    success: true, 
    uploadedPhotoUrls: uploadedPhotos 
  };
}

/**
 * Permet au Workspace d'importer dynamiquement l'interface du Calendrier.
 * (Assurez-vous que le nom du fichier Html correspond à celui contenant votre modal calendrier)
 */
function getPlanningCalendarHtml() {
  try {
    // Si votre composant calendrier est dans un fichier nommé "Planning_Calendar_Component.html"
    // ou si vous pouvez isoler son code UI dans un fichier dédié, insérez son nom ici.
    return HtmlService.createTemplateFromFile('Planning_html').evaluate().getContent();
  } catch (e) {
    console.error("Erreur lors de la récupération du composant Calendrier :", e.message);
    throw new Error("Impossible de charger l'interface du calendrier.");
  }
}

/**
 * Met à jour la date et l'heure d'une intervention spécifique.
 * Aligne également le statut sur "Planifié" si nécessaire.
 */
function updateInterventionDateTime(token, projectId, interventionId, newDate, newTime) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  const sheets = ss.getSheets();
  let targetSheet = null;
  let targetRowIndex = -1;
  let headers = [];

  // Recherche de l'intervention à travers les onglets
  for (let s of sheets) {
    const data = s.getDataRange().getValues();
    if (data.length < 7) continue; 

    headers = data[5]; // Ligne 6
    const idColIndex = headers.indexOf("ID Réserve") !== -1 ? headers.indexOf("ID Réserve") : 1; 

    for (let i = 6; i < data.length; i++) {
      if (String(data[i][idColIndex]).trim() === String(interventionId).trim()) {
        targetSheet = s;
        targetRowIndex = i + 1; 
        break;
      }
    }
    if (targetSheet) break;
  }

  if (!targetSheet) {
    throw new Error(`Intervention ${interventionId} introuvable pour la planification.`);
  }

  // Identification des colonnes dynamiques
  let dateColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return (text.includes("date") && text.includes("intervention")) || text === "date";
  });
  
  let timeColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return text.includes("heure") || text.includes("créneau") || text.includes("creneau");
  });

  let statusColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return (text.includes("statut") || text === "status") && !text.includes("second");
  });

  // Mise à jour des valeurs
  if (dateColIndex !== -1) targetSheet.getRange(targetRowIndex, dateColIndex + 1).setValue(newDate);
  if (timeColIndex !== -1) targetSheet.getRange(targetRowIndex, timeColIndex + 1).setValue(newTime);

  // Vérifier et mettre à jour le statut vers "Planifié" s'il était "À planifier"
  if (statusColIndex !== -1) {
    const currentStatus = String(targetSheet.getRange(targetRowIndex, statusColIndex + 1).getValue()).trim().toLowerCase();
    if (currentStatus === 'à planifier' || currentStatus === 'a planifier') {
      targetSheet.getRange(targetRowIndex, statusColIndex + 1).setValue("Planifié");
    }
  }

  // NOTE SUR LA MATRICE DE PLANNING :
  // Si vous avez un script existant dans "Planning_gs.txt" qui gère le remplissage
  // des grilles visuelles du calendrier de la feuille, vous pouvez simplement
  // appeler cette fonction ici. (ex: `recalculatePlanningGrids();`)

  return true;
}

// NOTE: EDL used to have its own gsGetProjectCalendar(token) here, returning
// { map, start, end }. Removed — Planning_gs.txt already declares a function
// with the exact same name (returning a bare day->0/1 map), and Apps Script
// shares one global namespace across every .gs file in a project, so the two
// were colliding: whichever file happened to load last silently won, and the
// other page's calendar payload shape broke with no error thrown.
// EDL_Script_2.txt's initCalendarBackground() now calls Planning_gs.txt's
// gsGetProjectCalendar() (the day map) and getProjectDateBounds() (start/end)
// directly instead — see the updated function there.

/**
 * Enregistre la nouvelle date et le créneau, met à jour le statut, et déplace
 * la référence ID dans la matrice du planning de chantier. Tient aussi à jour
 * le cache "dernière date connue" (colonne L, voir _writeLastKnownDateCache
 * ci-dessous) : écrit dès qu'une date est active après l'appel — qu'elle
 * vienne d'être posée ou qu'elle soit déjà en place et que seul le créneau
 * change — jamais écrasé par du vide.
 */
function gsUpdateInterventionDateTime(token, projectId, payload) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const { interId, newDateISO, creneau, moduleView } = payload;

  // 1. MISE À JOUR DE LA FEUILLE RÉSERVES / AUTOCONTROLES
  const ssReserves = SpreadsheetApp.openById(RESERVES_SS_ID);
  const sheets = ssReserves.getSheets();
  let targetSheet = null;
  let targetRowIndex = -1;
  let headers = [];

  for (let s of sheets) {
    const data = s.getDataRange().getValues();
    if (data.length < 7) continue; 
    headers = data[5]; 
    const idColIndex = headers.indexOf("ID Réserve") !== -1 ? headers.indexOf("ID Réserve") : 1; 
    for (let i = 6; i < data.length; i++) {
      if (String(data[i][idColIndex]).trim() === String(interId).trim()) {
        targetSheet = s;
        targetRowIndex = i + 1; 
        break;
      }
    }
    if (targetSheet) break;
  }

  if (!targetSheet) throw new Error(`Intervention ${interId} introuvable.`);

  // Identification des colonnes cibles
  const dateColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return (text.includes("date") && text.includes("intervention")) || text === "date";
  });
  const timeColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return text.includes("heure") || text.includes("créneau") || text.includes("creneau");
  });
  const statusColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return (text.includes("statut") || text === "status") && !text.includes("second");
  });

  // Écriture : Créneau
  if (timeColIndex !== -1) targetSheet.getRange(targetRowIndex, timeColIndex + 1).setValue(creneau);

  // Capture the intervention's date BEFORE we overwrite it below — needed by the
  // Planning Reserves matrix sync to locate the precise old-date column.
  const oldDateValue = (dateColIndex !== -1) ? targetSheet.getRange(targetRowIndex, dateColIndex + 1).getValue() : null;

  // Écriture : Date stricte formatée pour Google Sheets
  let dateSimple = '';
  if (dateColIndex !== -1 && newDateISO) {
    const p = newDateISO.split('-');
    const d = new Date(p[0], p[1] - 1, p[2]);
    const dateCell = targetSheet.getRange(targetRowIndex, dateColIndex + 1);
    dateCell.setValue(d);
    dateCell.setNumberFormat("dd/MM/yyyy");
    dateSimple = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } else if (oldDateValue instanceof Date) {
    // Pas de nouvelle date dans cet appel (édition du créneau seul, par
    // exemple) — la date déjà en place reste active : on la réutilise pour
    // le cache ci-dessous, pour qu'il reflète le créneau qu'on vient
    // vraiment de changer plutôt que de rester désynchronisé.
    dateSimple = `${String(oldDateValue.getDate()).padStart(2, '0')}/${String(oldDateValue.getMonth() + 1).padStart(2, '0')}/${oldDateValue.getFullYear()}`;
  }

  // Cache "dernière date connue" (voir _resolveLastKnownDateColIndex /
  // _writeLastKnownDateCache) — écrit uniquement s'il y a une date active
  // après cet appel (fraîchement posée ci-dessus, ou déjà en place), avec le
  // créneau tel qu'il est désormais. Si la ligne n'a AUCUNE date active
  // (jamais posée), on n'écrit rien : le cache garde sa dernière vraie
  // valeur, disponible pour une restauration future, au lieu d'être écrasé
  // par du vide.
  if (dateSimple) {
    _writeLastKnownDateCache(targetSheet, targetRowIndex, headers, dateSimple, creneau);
  }

  // Écriture : Bascule automatique du Statut
  let newStatus = "";
  if (statusColIndex !== -1) {
    const currentStatus = String(targetSheet.getRange(targetRowIndex, statusColIndex + 1).getValue()).trim().toLowerCase();
    if (currentStatus === 'à planifier' || currentStatus === 'a planifier') {
      newStatus = "Planifié";
      targetSheet.getRange(targetRowIndex, statusColIndex + 1).setValue("Planifié");
    }
  }

  // 2. DÉPLACEMENT DANS LA MATRICE DU PLANNING (Onglet 'Planning Reserves')
  // Exact same approach as gsSaveInterventionDetails() in Planning_gs.txt:
  // compute the SPECIFIC old-date column (from oldDateValue, captured above,
  // via the shared _isoDate() helper) and the SPECIFIC new-date column, then
  // touch only those two cells. Previously this scanned every column in the
  // row for any cell containing interId — which, when a cell held multiple
  // pipe-separated IDs (e.g. two reserves for the same logement on the same
  // date), could end up moving more than just this one intervention. Targeting
  // the exact old/new columns like the reference implementation avoids that.
  if (newDateISO) {
    try {
      // Retrouver l'ID du logement lié à cette intervention
      const logIdColIndex = headers.indexOf("ID Logement") !== -1 ? headers.indexOf("ID Logement") : 2;
      const logId = String(targetSheet.getRange(targetRowIndex, logIdColIndex + 1).getValue()).trim();

      const names = getSheetNames(moduleView || 'locataires');
      const ssPlan = SpreadsheetApp.openById(PLANNING_SS_ID);
      const planSheet = ssPlan.getSheetByName(names.planReserves);
      
      if (planSheet && logId) {
        const tz = ssPlan.getSpreadsheetTimeZone();
        const lastCol = planSheet.getLastColumn();
        const datesHeader = planSheet.getRange(2, 8, 1, lastCol - 7).getValues()[0];

        const oldIsoDate = _isoDate(oldDateValue, tz);
        let oldColIdx = -1, newColIdx = -1;
        datesHeader.forEach((d, idx) => {
          const iso = _isoDate(d, tz);
          if (iso === oldIsoDate) oldColIdx = idx + 8;
          if (iso === newDateISO) newColIdx = idx + 8;
        });

        const planIds = planSheet.getRange(1, 1, planSheet.getLastRow(), 1).getValues();
        let planRowIdx = -1;
        for (let r = 6; r < planIds.length; r++) {
          if (String(planIds[r][0]).trim() === logId) { planRowIdx = r + 1; break; }
        }

        if (planRowIdx !== -1) {
          if (oldColIdx !== -1 && oldColIdx !== newColIdx) {
            const oldCell = planSheet.getRange(planRowIdx, oldColIdx);
            const arr = String(oldCell.getValue()).split('|').map(x => x.trim()).filter(x => x !== "" && x !== interId);
            oldCell.setValue(arr.join(' | '));
          }
          if (newColIdx !== -1 && oldColIdx !== newColIdx) {
            const newCell = planSheet.getRange(planRowIdx, newColIdx);
            const arr = String(newCell.getValue()).split('|').map(x => x.trim()).filter(x => x !== "");
            if (!arr.includes(interId)) arr.push(interId);
            newCell.setValue(arr.join(' | '));
          }
        }
      }
    } catch (e) {
      console.error("Erreur de déplacement dans la matrice planning: " + e.message);
    }
  }

  return { success: true, updatedStatus: newStatus };
}

/**
 * HELPER (REVISED 19/07/2026): column L is NOT the app's history log — that's
 * appLog() → gsWriteUniversalLog() (see ClientLib.txt), called client-side
 * after these functions succeed. Column L is instead a small, dedicated
 * cache: just the last date+time this intervention was ever actually
 * planned for, stored as a single compact "DD/MM/YYYY|HH:MM" string (or
 * "DD/MM/YYYY|" if no time slot). That's ALL "Reprendre la dernière date
 * connue" ever needed — one value, not a full log — so reading it is a
 * direct cell lookup instead of a search through a shared, cross-module log.
 *
 * Prefers an actual header cell that says "Historique"/"Dernière
 * planification"/"last known" (case-insensitive) if the sheet has one;
 * falls back to column L (index 11).
 */
function _resolveLastKnownDateColIndex(headers) {
  const named = headers.findIndex(h => {
    const t = String(h).trim().toLowerCase();
    return t === 'historique' || (t.includes('dernière') && t.includes('planif')) || t.includes('last known');
  });
  return named !== -1 ? named : 11;
}

/**
 * Writes/overwrites the last-known-date cache (see resolver above). Called
 * anywhere a date is genuinely SET on an intervention (gsUpdateInterventionDateTime,
 * and gsCorrectIntervention's 'new'/'restore' dateAction, when newDateISO is
 * present).
 *
 * RÉVISÉ (19/07/2026) : gsCorrectIntervention's 'clear' dateAction branch now
 * ALSO calls this — but the other way round from a normal "set": right
 * BEFORE the active date/heure is wiped, using the value about to be
 * cleared, precisely so that value survives the wipe and stays available
 * for a future "Reprendre la dernière date connue" even if, for whatever
 * reason, it wasn't already the cached one. See gsCorrectIntervention below.
 */
function _writeLastKnownDateCache(sheet, rowIndex, headers, dateSimple, timeValue) {
  if (!dateSimple) return;
  const colIndex = _resolveLastKnownDateColIndex(headers);
  sheet.getRange(rowIndex, colIndex + 1).setValue(`${dateSimple}|${timeValue || ''}`);
}

/**
 * Single-intervention read of the last-known-date cache (see
 * _resolveLastKnownDateColIndex() above). Used by the Corriger modal's
 * background prefetch (EDL_Script_2.txt's fetchLastKnownPlanning()) so the
 * lookup reflects the current cell even if it changed since this lot's full
 * intervention list was cached client-side, without re-fetching that whole
 * list. Returns { date: 'DD/MM/YYYY', time: 'HH:MM' } or { date: null, time: null }.
 */
function gsGetLastKnownPlanning(token, projectId, interventionId) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  const sheets = ss.getSheets();

  for (let s of sheets) {
    const data = s.getDataRange().getValues();
    if (data.length < 7) continue;
    const headers = data[5];
    const idColIndex = headers.indexOf("ID Réserve") !== -1 ? headers.indexOf("ID Réserve") : 1;
    const cacheColIndex = _resolveLastKnownDateColIndex(headers);
    for (let i = 6; i < data.length; i++) {
      if (String(data[i][idColIndex]).trim() === String(interventionId).trim()) {
        const raw = String(data[i][cacheColIndex] || '').trim();
        if (!raw) return { date: null, time: null };
        const parts = raw.split('|');
        return { date: parts[0] || null, time: parts[1] || '' };
      }
    }
  }
  return { date: null, time: null };
}

/**
 * Applies a manual correction from the "Corriger" modal: new status, a
 * mandatory note, and — depending on the status chosen and whether the
 * intervention already has an active date — a `dateAction`.
 *
 * REVISED (19/07/2026): the "nouvelle planification" checkbox is gone
 * client-side (see openStatusCorrectionModal() in EDL_Script_2.txt), replaced
 * by a sub-menu driven directly by the chosen status. The payload reflects
 * that with a single `dateAction` field, replacing the old
 * replanAction/clearPlanning pair:
 *   - 'new'     — freshly-picked date/créneau from the calendar (newDateISO set).
 *   - 'restore' — date/créneau taken as-is from the column L cache (newDateISO set).
 *   - 'clear'   — active date/créneau removed (status "À planifier" with no
 *                 new date, or "Bloquée" + "Retirer cette date").
 *   - 'keep' / null — existing date/créneau left untouched; only the status changes.
 *
 * The actual audit trail (who changed what, motif included) lives in the
 * Journal Universel — appLog() → gsWriteUniversalLog() (see ClientLib.txt),
 * called client-side right after this succeeds (see submitCorrection() in
 * EDL_Script_2.txt). This function's own job re: column L is narrower:
 *   - 'new'/'restore' (with newDateISO present): overwrites the
 *     last-known-date cache with the date just set — see
 *     _writeLastKnownDateCache() / _resolveLastKnownDateColIndex() above — so
 *     "Reprendre la dernière date connue" can read it back directly next time.
 *   - 'clear': REVISED (19/07/2026) — unlike before, this branch now writes
 *     the CURRENT (about-to-be-wiped) date/heure to that same cache FIRST,
 *     then clears the active date/créneau on the Reserves/Autocontrole row
 *     and pulls the ID out of the Planning Reserves matrix — targeting the
 *     one precise old-date column (via _isoDate), same safer approach
 *     gsUpdateInterventionDateTime already uses above, rather than scanning
 *     every cell in the matrix for a substring match.
 *   - 'keep' / null: neither the date/créneau columns nor the cache are
 *     touched — only the status column changes.
 */
function gsCorrectIntervention(token, projectId, payload) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const { interId, status, previousStatus, note, dateAction, newDateISO, creneau, moduleView, userEmail } = payload;

  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  const sheets = ss.getSheets();
  let targetSheet = null;
  let targetRowIndex = -1;
  let headers = [];

  for (let s of sheets) {
    const data = s.getDataRange().getValues();
    if (data.length < 7) continue;
    headers = data[5];
    const idColIndex = headers.indexOf("ID Réserve") !== -1 ? headers.indexOf("ID Réserve") : 1;
    for (let i = 6; i < data.length; i++) {
      if (String(data[i][idColIndex]).trim() === String(interId).trim()) {
        targetSheet = s;
        targetRowIndex = i + 1;
        break;
      }
    }
    if (targetSheet) break;
  }
  if (!targetSheet) throw new Error(`Intervention ${interId} introuvable.`);

  const statusColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return (text.includes("statut") || text === "status") && !text.includes("second") && !text.includes("sous");
  });
  const dateColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return (text.includes("date") && text.includes("intervention")) || text === "date";
  });
  const timeColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return text.includes("heure") || text.includes("créneau") || text.includes("creneau");
  });
  const logIdColIndex = headers.indexOf("ID Logement") !== -1 ? headers.indexOf("ID Logement") : 2;

  // 1. Statut — écrit tel quel (le menu du modal n'envoie que les 4 valeurs
  // qu'il propose : "À planifier" / "Planifiée" / "Bloquée" / "Validée").
  if (statusColIndex !== -1) targetSheet.getRange(targetRowIndex, statusColIndex + 1).setValue(status);

  // Capturé AVANT toute écriture — nécessaire pour retrouver la bonne colonne
  // (ancienne date) dans la matrice de planning, exactement comme dans
  // gsUpdateInterventionDateTime() ci-dessus.
  const oldDateValue = (dateColIndex !== -1) ? targetSheet.getRange(targetRowIndex, dateColIndex + 1).getValue() : null;
  const logId = (logIdColIndex !== -1) ? String(targetSheet.getRange(targetRowIndex, logIdColIndex + 1).getValue()).trim() : '';

  let updatedDateFr = '';       // format d'affichage ("MAR. 22 JUIL. 2026"), même convention que dateIntervention ailleurs
  let updatedHeure = '';
  let plannedDateSimple = '';   // dd/MM/yyyy — alimente uniquement le cache "dernière date connue" ci-dessous

  if ((dateAction === 'new' || dateAction === 'restore') && newDateISO) {
    // 2a. Nouvelle date + créneau (choisie sur le calendrier, ou reprise depuis la colonne L)
    const p = newDateISO.split('-');
    const d = new Date(p[0], p[1] - 1, p[2]);
    if (dateColIndex !== -1) {
      const cell = targetSheet.getRange(targetRowIndex, dateColIndex + 1);
      cell.setValue(d);
      cell.setNumberFormat("dd/MM/yyyy");
    }
    if (timeColIndex !== -1) targetSheet.getRange(targetRowIndex, timeColIndex + 1).setValue(creneau || '');
    updatedDateFr = formatDateFr(d);
    updatedHeure = creneau || '';
    plannedDateSimple = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } else if (dateAction === 'clear') {
    // "À planifier" sans nouvelle date, ou "Bloquée" + "Retirer cette date"
    // ⇒ on efface date + créneau. RÉVISÉ (19/07/2026) : avant d'effacer, on
    // met en cache la date/heure ACTUELLE (celle qu'on est sur le point de
    // vider) dans la colonne "dernière date connue" (col. L), pour qu'elle
    // reste disponible à une future restauration même si, pour une raison
    // ou une autre, elle n'y était pas déjà — voir _writeLastKnownDateCache().
    let oldDateSimple = '';
    if (oldDateValue instanceof Date) {
      oldDateSimple = `${String(oldDateValue.getDate()).padStart(2, '0')}/${String(oldDateValue.getMonth() + 1).padStart(2, '0')}/${oldDateValue.getFullYear()}`;
    }
    const oldHeureFormatted = (timeColIndex !== -1) ? formatHeure(targetSheet.getRange(targetRowIndex, timeColIndex + 1).getValue()) : '';
    if (oldDateSimple) {
      _writeLastKnownDateCache(targetSheet, targetRowIndex, headers, oldDateSimple, oldHeureFormatted);
    }

    if (dateColIndex !== -1) targetSheet.getRange(targetRowIndex, dateColIndex + 1).setValue('');
    if (timeColIndex !== -1) targetSheet.getRange(targetRowIndex, timeColIndex + 1).setValue('');
    updatedDateFr = '';
    updatedHeure = '';
  } else {
    // Correction du statut seul (dateAction 'keep' ou null) — date/créneau
    // inchangés, on relit juste la valeur actuelle.
    updatedDateFr = formatDateFr(oldDateValue);
    updatedHeure = (timeColIndex !== -1) ? formatHeure(targetSheet.getRange(targetRowIndex, timeColIndex + 1).getValue()) : '';
  }

  // 3. Matrice "Planning Reserves" — à resynchroniser dès que la date a changé
  // ou a été effacée. Cible précisément l'ancienne et/ou la nouvelle colonne
  // plutôt que de parcourir toute la matrice (voir le commentaire au-dessus
  // de gsUpdateInterventionDateTime()).
  if (((dateAction === 'new' || dateAction === 'restore') && newDateISO) || dateAction === 'clear') {
    try {
      const names = getSheetNames(moduleView || 'locataires');
      const ssPlan = SpreadsheetApp.openById(PLANNING_SS_ID);
      const planSheet = ssPlan.getSheetByName(names.planReserves);

      if (planSheet && logId) {
        const tz = ssPlan.getSpreadsheetTimeZone();
        const lastCol = planSheet.getLastColumn();
        const datesHeader = planSheet.getRange(2, 8, 1, lastCol - 7).getValues()[0];
        const oldIsoDate = _isoDate(oldDateValue, tz);

        let oldColIdx = -1, newColIdx = -1;
        datesHeader.forEach((d, idx) => {
          const iso = _isoDate(d, tz);
          if (iso === oldIsoDate) oldColIdx = idx + 8;
          if (newDateISO && iso === newDateISO) newColIdx = idx + 8;
        });

        const planIds = planSheet.getRange(1, 1, planSheet.getLastRow(), 1).getValues();
        let planRowIdx = -1;
        for (let r = 6; r < planIds.length; r++) {
          if (String(planIds[r][0]).trim() === logId) { planRowIdx = r + 1; break; }
        }

        if (planRowIdx !== -1) {
          if (oldColIdx !== -1 && oldColIdx !== newColIdx) {
            const oldCell = planSheet.getRange(planRowIdx, oldColIdx);
            const arr = String(oldCell.getValue()).split('|').map(x => x.trim()).filter(x => x !== "" && x !== interId);
            oldCell.setValue(arr.join(' | '));
          }
          if (newColIdx !== -1 && oldColIdx !== newColIdx) {
            const newCell = planSheet.getRange(planRowIdx, newColIdx);
            const arr = String(newCell.getValue()).split('|').map(x => x.trim()).filter(x => x !== "");
            if (!arr.includes(interId)) arr.push(interId);
            newCell.setValue(arr.join(' | '));
          }
        }
      }
    } catch (planningError) {
      console.error("Erreur de synchronisation planning (correction) : " + planningError.toString());
    }
  }

  // 4. Cache "dernière date connue" — colonne L, écrite ici seulement pour
  // 'new'/'restore' (une date est réellement (re)posée). Le cas 'clear' a
  // déjà écrit SA propre valeur (l'ancienne date, avant effacement) plus haut,
  // dans la branche dédiée — voir le commentaire RÉVISÉ (19/07/2026) là-bas.
  // L'audit complet (qui a changé quoi, motif inclus) n'est pas géré ici : il
  // vit dans le Journal Universel via appLog(), appelé côté client juste
  // après que cet appel réussisse (voir submitCorrection() dans EDL_Script_2.txt).
  if ((dateAction === 'new' || dateAction === 'restore') && newDateISO) {
    _writeLastKnownDateCache(targetSheet, targetRowIndex, headers, plannedDateSimple, updatedHeure);
  }

  return {
    success: true,
    updatedStatus: status,
    updatedDate: updatedDateFr,
    updatedHeure: updatedHeure
  };
}

/**
 * Applies a "Référence" correction — the Corriger modal's OTHER path (new,
 * alongside gsCorrectIntervention() above): reassigns this intervention row
 * to a different Logement/Commun/Façade ID (column "ID Logement", resolved
 * by header same as everywhere else — index 2 / column C — if that header
 * isn't found). Mirrors gsCorrectIntervention()'s sheet lookup; the only
 * structural difference is WHICH column gets rewritten (the reference, not
 * the Statut) and how the Planning Reserves matrix gets touched. Audit
 * trail is appLog()'s job (called client-side after this succeeds, see
 * submitReferenceCorrection() in EDL_Script_2.txt) — this function doesn't
 * touch the last-known-date cache either, since a reference change never
 * sets a brand-new date (only moves or drops an existing one).
 *
 * planningAction (only meaningful when the intervention already had a
 * planned date — the client only asks/sends this in that case):
 *   'move'   — same date, cell moves from the old logement's planning row to
 *              the new logement's row. Nothing on the Reserves/Autocontroles
 *              row itself changes (date/heure/statut stay as they were).
 *   'remove' — date/heure are cleared on the Reserves/Autocontroles row (same
 *              as gsCorrectIntervention's 'clear' dateAction branch) and the ID is
 *              dropped from the old planning cell; nothing is written to the
 *              new logement's row. If the status was exactly "Planifiée" it
 *              falls back to "À planifier" (ASSUMPTION FLAGGED — a status of
 *              "Bloquée"/"Validée" is left untouched since those aren't
 *              purely about having a date, only "Planifiée" implies one).
 *   null     — no prior planning existed; column C is updated, nothing else.
 */
function gsCorrectInterventionReference(token, projectId, payload) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const { interId, newLogementId, newLogementLabel, planningAction, note, moduleView, userEmail } = payload;
  if (!newLogementId) throw new Error("La nouvelle référence est manquante.");

  const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
  const sheets = ss.getSheets();
  let targetSheet = null;
  let targetRowIndex = -1;
  let headers = [];

  for (let s of sheets) {
    const data = s.getDataRange().getValues();
    if (data.length < 7) continue;
    headers = data[5];
    const idColIndex = headers.indexOf("ID Réserve") !== -1 ? headers.indexOf("ID Réserve") : 1;
    for (let i = 6; i < data.length; i++) {
      if (String(data[i][idColIndex]).trim() === String(interId).trim()) {
        targetSheet = s;
        targetRowIndex = i + 1;
        break;
      }
    }
    if (targetSheet) break;
  }
  if (!targetSheet) throw new Error(`Intervention ${interId} introuvable.`);

  const logIdColIndex = headers.indexOf("ID Logement") !== -1 ? headers.indexOf("ID Logement") : 2;
  const dateColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return (text.includes("date") && text.includes("intervention")) || text === "date";
  });
  const timeColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return text.includes("heure") || text.includes("créneau") || text.includes("creneau");
  });
  const statusColIndex = headers.findIndex(h => {
    const text = String(h).toLowerCase();
    return (text.includes("statut") || text === "status") && !text.includes("second") && !text.includes("sous");
  });

  // Capturé AVANT toute écriture — nécessaire pour la synchro planning et
  // pour savoir si une planification existait déjà.
  const oldLogementId = (logIdColIndex !== -1) ? String(targetSheet.getRange(targetRowIndex, logIdColIndex + 1).getValue()).trim() : '';
  const oldDateValue = (dateColIndex !== -1) ? targetSheet.getRange(targetRowIndex, dateColIndex + 1).getValue() : null;
  const hadPlanning = oldDateValue !== null && oldDateValue !== '' && String(oldDateValue).trim() !== '';

  // 1. Colonne "ID Logement" (colonne C par défaut) — la référence elle-même.
  if (logIdColIndex !== -1) targetSheet.getRange(targetRowIndex, logIdColIndex + 1).setValue(newLogementId);

  let planningWarning = null; // seulement rempli si la synchro planning échoue — voir 2. ci-dessous
  let updatedStatus = null;

  // 2. Planification existante : appliquer le choix "déplacer" / "retirer"
  // de l'utilisateur, à la fois sur la ligne Réserves/Autocontroles et sur
  // la matrice "Planning Reserves".
  if (hadPlanning) {
    if (planningAction === 'remove') {
      if (dateColIndex !== -1) targetSheet.getRange(targetRowIndex, dateColIndex + 1).setValue('');
      if (timeColIndex !== -1) targetSheet.getRange(targetRowIndex, timeColIndex + 1).setValue('');

      if (statusColIndex !== -1) {
        const curStatus = String(targetSheet.getRange(targetRowIndex, statusColIndex + 1).getValue()).trim();
        if (curStatus === 'Planifiée') {
          targetSheet.getRange(targetRowIndex, statusColIndex + 1).setValue('À planifier');
          updatedStatus = 'À planifier';
        }
      }
    }

    try {
      const names = getSheetNames(moduleView || 'locataires');
      const ssPlan = SpreadsheetApp.openById(PLANNING_SS_ID);
      const planSheet = ssPlan.getSheetByName(names.planReserves);

      if (planSheet && oldLogementId) {
        const tz = ssPlan.getSpreadsheetTimeZone();
        const lastCol = planSheet.getLastColumn();
        const datesHeader = planSheet.getRange(2, 8, 1, lastCol - 7).getValues()[0];
        const oldIsoDate = _isoDate(oldDateValue, tz);

        let oldDateColIdx = -1;
        datesHeader.forEach((d, idx) => {
          if (_isoDate(d, tz) === oldIsoDate) oldDateColIdx = idx + 8;
        });

        const planIds = planSheet.getRange(1, 1, planSheet.getLastRow(), 1).getValues();
        let oldRowIdx = -1, newRowIdx = -1;
        for (let r = 6; r < planIds.length; r++) {
          const v = String(planIds[r][0]).trim();
          if (v === oldLogementId) oldRowIdx = r + 1;
          if (v === String(newLogementId).trim()) newRowIdx = r + 1;
        }

        // Retire toujours l'ID de l'ancienne cellule (déplacement ou suppression).
        if (oldRowIdx !== -1 && oldDateColIdx !== -1) {
          const oldCell = planSheet.getRange(oldRowIdx, oldDateColIdx);
          const arr = String(oldCell.getValue()).split('|').map(x => x.trim()).filter(x => x !== "" && x !== String(interId).trim());
          oldCell.setValue(arr.join(' | '));
        }

        // Si "déplacer" : ajoute l'ID à la même colonne (même date) mais sur
        // la ligne de la NOUVELLE référence.
        if (planningAction === 'move') {
          if (newRowIdx !== -1 && oldDateColIdx !== -1) {
            const newCell = planSheet.getRange(newRowIdx, oldDateColIdx);
            const arr = String(newCell.getValue()).split('|').map(x => x.trim()).filter(x => x !== "");
            if (!arr.includes(String(interId).trim())) arr.push(String(interId).trim());
            newCell.setValue(arr.join(' | '));
          } else {
            // La nouvelle référence n'a pas (encore) de ligne dans la matrice
            // planning — la correction de référence réussit quand même, mais
            // on le signale au client (au lieu de le perdre silencieusement
            // dans les logs serveur) pour qu'il l'affiche et le journalise.
            console.error(`gsCorrectInterventionReference : ligne "${newLogementId}" introuvable dans ${names.planReserves} — planification non déplacée.`);
            planningWarning = `Ligne "${newLogementId}" introuvable dans le planning — la planification n'a pas pu être déplacée automatiquement, une correction manuelle du planning sera nécessaire.`;
          }
        }
      }
    } catch (planningError) {
      console.error("Erreur de synchronisation planning (correction référence) : " + planningError.toString());
      planningWarning = "La synchronisation avec le planning a échoué — vérifiez la planification manuellement.";
    }
  }

  return {
    success: true,
    oldLogementId: oldLogementId,
    newLogementId: newLogementId,
    updatedStatus: updatedStatus,
    planningWarning: planningWarning
  };
}







/**
 * TRAVAUX_SERVER
 * All backend endpoints specific to the Travaux layer, consolidated here per
 * the file-organization note at the top of Workspace_Core_Server ("give each
 * layer its own <Layer>_Server.gs file rather than growing the shared one").
 * Apps Script shares one global namespace across every .gs file in the
 * project, so nothing below needs any import — it's callable from anywhere,
 * exactly like before.
 *
 * 
 * getTravauxDonneesDataHelper. Delete these five (plus the old
 * getTravauxConfigData, see below) from wherever they currently live once
 * you've dropped this file in — see chat for the exact block to remove.
 *
 * FIXED while moving: getTravauxConfigDataHelper was checking rowObj['ID_Work']
 * to decide whether a row was valid, but the client (initTravauxConfigCache in
 * Travaux_Scripts.html) reads r.idWork — so with headers matching what the
 * client expects, that check silently failed and this function always
 * returned []. It now checks rowObj['idWork'], matching Column B's real
 * header text (see the sheet-header list in chat).
 *
 * REMOVED (superseded): the old getTravauxConfigData(), which read a
 * 'Travaux_Config' sheet with headers on row 1. Config Travaux (row 6,
 * column B, per getTravauxConfigDataHelper below) replaces it — once you've
 * confirmed your 'Config Travaux' sheet has everything 'Travaux_Config' had,
 * that old sheet can be deleted too.
 *
 */

// ---------------------------------------------------------------------------
// 1. Reads 'Config Travaux' (Row 6, Column B) — the work-item catalog.
//    FIXED: the sheet's row-6 headers are fixed, human-readable French text
//    (ID_Work, Cible, Sous catégorie, Discipline, Type de Travail, Pièces
//    Applicables, Type de Champ, Détails de champ, Options) meant for the
//    person maintaining the sheet, not for the code to match against. This
//    now reads columns B..J by fixed position instead of matching header
//    text, so it doesn't break if that wording ever changes.
// ---------------------------------------------------------------------------
function getTravauxConfigDataHelper() {
  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  const sheet = ss.getSheetByName('Config Travaux');
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 6) return [];

  // Fixed layout, row 6 = headers (for humans only), data from row 7,
  // columns B–L in this order:
  // B=idWork  C=cible  D=sousCategorie  E=discipline  F=typeTravail
  // G=piecesApplicables  H=typeChamp  I=detailsChamp (legacy, no longer
  // read — see below)  J=options  K=parentId  L=suffix
  //
  // K/L added 2026-08-26 (agents/edl-page-spec.md section 3,
  // "New: primary/secondary work items" + "New: optional suffix/unit") —
  // appended after the original 9 columns rather than reusing column I, so
  // a pre-migration sheet's real (now-unused) Détails de champ text is
  // never misread as a parentId. A row with fewer than 11 columns (i.e.
  // K/L don't exist yet on this sheet) simply reads '' for both — no
  // migration step needed, sheet.getRange below always requests 11 columns
  // regardless of how many the sheet currently has; Apps Script returns ''
  // for any cell past the sheet's actual last column.
  const data = sheet.getRange(7, 2, lastRow - 6, 11).getValues();

  const result = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowObj = {
      idWork: row[0],
      cible: row[1],
      sousCategorie: row[2],
      discipline: row[3],
      typeTravail: row[4],
      piecesApplicables: row[5],
      typeChamp: row[6],
      options: row[8],
      parentId: row[9],
      suffix: row[10]
    };
    if (rowObj.idWork) {
      result.push(rowObj);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 2. Reads 'Données Travaux' (Row 6, Column B) — saved per-ID work data.
//    UNCHANGED logic-wise; this was already correct, just never called from
//    the client. See saveTravauxDonneesData below for the write side, and
//    Travaux_Scripts.html for how the client now actually consumes this.
// ---------------------------------------------------------------------------
function getTravauxDonneesDataHelper() {
  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  const sheet = ss.getSheetByName('Données Travaux');
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= 6 || lastCol < 2) return [];

  const headers = sheet.getRange(6, 2, 1, lastCol - 1).getValues()[0];
  const data = sheet.getRange(7, 2, lastRow - 6, lastCol - 1).getValues();

  const result = [];

  for (let i = 0; i < data.length; i++) {
    const rowObj = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        rowObj[headers[j]] = data[i][j];
      }
    }
    if (rowObj['ID Logement']) {
      result.push(rowObj);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 3. NEW — Saves per-ID work decisions to 'Données Travaux'.
//
//    Sheet shape (your point 1b): one row per ID logement/commun/facade;
//    column B = 'ID Logement'; every other column is one ID-Travail, lazily
//    created the first time it's needed.
//
//    Each cell is a small JSON object keyed by room, e.g.
//      { "Salon": true, "Chambre 1": false }
//    or, for a work item with extra detail sub-fields,
//      { "Salon": { "_primary": true, "Couleur": "Beige" } }
//    — because one row here covers a WHOLE ID, so a
//    work item applicable to several rooms needs several room entries
//    inside the SAME cell rather than its own column per room.
//
//    payload shape: { id, room, values: { idWork: value, idWork2: value, ... } }
//    — exactly what the client's collectWorkItemValues() already produces
//    per currently-visible checklist, just for this one call instead of
//    being folded into the notes payload.
// ---------------------------------------------------------------------------
function saveTravauxDonneesData(token, projectId, payload) {
  const user = assertCanEdit_(token, projectId); // blocks isClient / unauthorized users server-side — not just hidden in the UI

  const ID_HEADER = 'ID Logement'; // column B — matches getTravauxDonneesDataHelper's own filter above

  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // this does a read-modify-write on one whole row; without a lock, two people saving different work items for the same ID at nearly the same moment could clobber each other
  try {
    const ss = SpreadsheetApp.openById(EDL_SS_ID);
    const sheet = ss.getSheetByName('Données Travaux');
    if (!sheet) {
      throw new Error("La feuille 'Données Travaux' est introuvable dans ce projet.");
    }

    let lastRow = sheet.getLastRow();
    let lastCol = sheet.getLastColumn();

    // First-ever save: the header row itself may not exist yet.
    if (lastRow < 6 || lastCol < 2) {
      sheet.getRange(6, 2).setValue(ID_HEADER);
      lastRow = 6;
      lastCol = 2;
    }

    // Headers live on row 6, starting at column B.
    let headers = sheet.getRange(6, 2, 1, lastCol - 1).getValues()[0];

    function findOrCreateColumn_(headerName) {
      let idx = headers.indexOf(headerName);
      if (idx === -1) {
        idx = headers.length;
        headers.push(headerName);
        sheet.getRange(6, 2 + idx).setValue(headerName);
      }
      return idx;
    }

    const idColIdx = findOrCreateColumn_(ID_HEADER);
    const workIds = Object.keys(payload.values || {});
    workIds.forEach(findOrCreateColumn_); // make sure every column we're about to touch exists before we read the row

    lastRow = Math.max(lastRow, 6);

    // Locate this ID's row.
    let targetRow = -1;
    if (lastRow > 6) {
      const idValues = sheet.getRange(7, 2 + idColIdx, lastRow - 6, 1).getValues();
      for (let i = 0; i < idValues.length; i++) {
        if (String(idValues[i][0]) === String(payload.id)) { targetRow = 7 + i; break; }
      }
    }
    if (targetRow === -1) targetRow = Math.max(lastRow + 1, 7);

    // Read the whole row across every current column in one call, so we
    // only overwrite the specific work-item cells we're updating and leave
    // every other work item's already-saved data (for other rooms/items on
    // this same ID) untouched.
    const rowRange = sheet.getRange(targetRow, 2, 1, headers.length);
    const rowValues = rowRange.getValues()[0];
    while (rowValues.length < headers.length) rowValues.push('');

    rowValues[idColIdx] = payload.id;

    workIds.forEach(function (idWork) {
      const colIdx = headers.indexOf(idWork);
      let cellObj = {};
      try { cellObj = rowValues[colIdx] ? JSON.parse(rowValues[colIdx]) : {}; } catch (e) { cellObj = {}; }
      cellObj[payload.room] = payload.values[idWork];
      rowValues[colIdx] = JSON.stringify(cellObj);
    });

    rowRange.setValues([rowValues]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// 4. NEW — Admin CRUD for 'Config Travaux' ITSELF (the work-item catalog —
//    not per-ID answers, that's saveTravauxDonneesData above). Powers the
//    "Config Travaux" admin popup beside Mode Édition (admin-only — see
//    openTravauxConfigManager() in Travaux_Scripts.html). Same fixed B..L
//    column layout as getTravauxConfigDataHelper above; read and write
//    sides must stay in that exact order if this sheet's columns ever move.
//
//    Both functions return the FRESH full row list (same shape
//    getTravauxConfigDataHelper/getLocatairesPageDataEDL's travauxConfig
//    already returns) so the client can just replace its cache in one shot
//    instead of guessing what changed.
// ---------------------------------------------------------------------------
// detailsChamp (column I) kept as a positional placeholder — always
// written as '' now (the form no longer populates rowData.detailsChamp,
// and the .map below defaults any missing key to '') — so columns J/K/L
// (options/parentId/suffix) never shift out of alignment with rows
// written before 2026-08-26. parentId/suffix appended at the end (K/L),
// matching the read side in getTravauxConfigDataHelper above.
const TRAVAUX_CONFIG_COLUMNS_ = ['idWork', 'cible', 'sousCategorie', 'discipline', 'typeTravail', 'piecesApplicables', 'typeChamp', 'detailsChamp', 'options', 'parentId', 'suffix'];

function saveTravauxConfigRow(token, projectId, rowData, isNew) {
  assertIsAdmin_(token, projectId);
  if (!rowData || !String(rowData.idWork || '').trim()) throw new Error("ID Work manquant.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(EDL_SS_ID);
    const sheet = ss.getSheetByName('Config Travaux');
    if (!sheet) throw new Error("La feuille 'Config Travaux' est introuvable dans ce projet.");

    const lastRow = sheet.getLastRow();
    const idValues = lastRow > 6 ? sheet.getRange(7, 2, lastRow - 6, 1).getValues() : [];

    let targetRow = -1;
    for (let i = 0; i < idValues.length; i++) {
      if (String(idValues[i][0]).trim().toLowerCase() === String(rowData.idWork).trim().toLowerCase()) { targetRow = 7 + i; break; }
    }

    if (isNew) {
      // Re-checked here even though the client already pre-validated
      // uniqueness — closes the race where two admins add the same ID at
      // nearly the same moment (the script lock only protects the
      // read-modify-write below, not the client's own check).
      if (targetRow !== -1) throw new Error("Cet ID Work existe déjà : " + rowData.idWork);
      targetRow = Math.max(lastRow + 1, 7);
    } else if (targetRow === -1) {
      throw new Error("Ligne introuvable pour l'ID Work : " + rowData.idWork);
    }

    const rowValues = TRAVAUX_CONFIG_COLUMNS_.map(function (key) { return (rowData[key] == null) ? '' : rowData[key]; });
    sheet.getRange(targetRow, 2, 1, rowValues.length).setValues([rowValues]);

    return getTravauxConfigDataHelper();
  } finally {
    lock.releaseLock();
  }
}

function deleteTravauxConfigRow(token, projectId, idWork) {
  assertIsAdmin_(token, projectId);
  if (!String(idWork || '').trim()) throw new Error("ID Work manquant.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(EDL_SS_ID);
    const sheet = ss.getSheetByName('Config Travaux');
    if (!sheet) throw new Error("La feuille 'Config Travaux' est introuvable dans ce projet.");

    const lastRow = sheet.getLastRow();
    if (lastRow <= 6) return getTravauxConfigDataHelper();

    const idValues = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    let targetRow = -1;
    for (let i = 0; i < idValues.length; i++) {
      if (String(idValues[i][0]).trim().toLowerCase() === String(idWork).trim().toLowerCase()) { targetRow = 7 + i; break; }
    }
    if (targetRow === -1) throw new Error("Ligne introuvable pour l'ID Work : " + idWork);

    // Deliberately does NOT touch 'Données Travaux' — any already-saved
    // answers for this idWork are left as-is (orphaned but harmless: with
    // no matching Config Travaux row, getApplicableWorkItems() just never
    // surfaces that column again). Safer default than cascading a delete
    // into historical per-ID data; revisit if you'd rather it did.
    sheet.deleteRow(targetRow);
    return getTravauxConfigDataHelper();
  } finally {
    lock.releaseLock();
  }
}

/**
 * =========================================================
 * SOUS-CATÉGORIES TRAVAUX — registry (name/color/x-y position)
 * =========================================================
 * New sheet "Sous Categories Travaux" (workbook EDL_SS_ID), same convention
 * as every other sheet here: headers row 6, data row 7+, columns starting
 * at B. Auto-created on first write (mirrors gsWriteUniversalLog's
 * auto-create-with-headers pattern in Logs.js) — no manual sheet setup
 * needed.
 *
 *   B = Cible     (Locataires / Commun / Facades — same wording Config
 *                  Travaux's own Cible column uses)
 *   C = Nom       (unique per Cible, case-insensitive)
 *   D = Couleur   (hex string, e.g. "#0d59f2")
 *   E = Colonne   (integer 1-3 — the 3-column recap grid, Locataires only
 *                  today)
 *   F = Position  (integer >= 1 — unique per (Cible, Colonne))
 *
 * Identity for edit/delete is rowIdx (mirrors gsSaveDiscipline/gsSaveEquipe
 * in Planing_gs — NOT the idWork-keyed pattern Config Travaux itself uses),
 * so renaming doesn't need to re-find the row by its old name.
 */

const SOUS_CATEGORIES_SHEET_NAME_ = 'Sous Categories Travaux';

function _getSousCategoriesSheet_(createIfMissing) {
  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  let sheet = ss.getSheetByName(SOUS_CATEGORIES_SHEET_NAME_);
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet(SOUS_CATEGORIES_SHEET_NAME_);
    sheet.getRange(6, 2, 1, 5).setValues([["Cible", "Nom", "Couleur", "Colonne", "Position"]]).setFontWeight("bold");
    sheet.getRange("B6:F6").setBackground("#e2e8f0");
    sheet.setFrozenRows(6);
  }
  return sheet;
}

function getSousCategoriesTravauxHelper() {
  const sheet = _getSousCategoriesSheet_(false);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 6) return [];

  const data = sheet.getRange(7, 2, lastRow - 6, 5).getValues();
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const nom = String(row[1] || '').trim();
    if (!nom) continue;
    result.push({
      rowIdx: i + 7,
      cible: String(row[0] || '').trim(),
      nom: nom,
      couleur: String(row[2] || '').trim() || '#64748b',
      colonne: parseInt(row[3], 10) || 1,
      position: parseInt(row[4], 10) || 1
    });
  }
  return result;
}

// Loose Cible comparison shared by the rename cascade, the delete-usage
// check, and the seeding helper below — "Locataires"/"locataires" or
// "Commun"/"Communs" all compare equal, matching normalizeView()'s
// tolerance on the client side (EDL_Scripts_2.html).
function normalizeCibleForCompare_(cible) {
  const v = String(cible || '').trim().toLowerCase();
  if (v.startsWith('local')) return 'locataires';
  if (v.startsWith('commun')) return 'communs';
  if (v.startsWith('facade')) return 'facades';
  return v;
}

function saveSousCategorieTravaux(token, projectId, rowData, isNew) {
  assertIsAdmin_(token, projectId);

  const nomTrimmed = String((rowData && rowData.nom) || '').trim();
  if (!nomTrimmed) throw new Error("Le nom de la sous-catégorie est obligatoire.");

  const cible = String((rowData && rowData.cible) || '').trim();
  if (!cible) throw new Error("La cible (vue) est obligatoire.");

  const colonne = parseInt(rowData && rowData.colonne, 10);
  if (!colonne || colonne < 1 || colonne > 3) throw new Error("La colonne doit être 1, 2 ou 3.");

  const position = parseInt(rowData && rowData.position, 10);
  if (!position || position < 1) throw new Error("La position doit être un nombre entier positif.");

  const couleur = String((rowData && rowData.couleur) || '').trim() || '#0d59f2';
  const rowIdx = (rowData && rowData.rowIdx) ? parseInt(rowData.rowIdx, 10) : null;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = _getSousCategoriesSheet_(true);
    const all = getSousCategoriesTravauxHelper();

    let oldNom = null;
    if (rowIdx) {
      const selfRow = all.filter(function (r) { return r.rowIdx === rowIdx; })[0];
      if (selfRow) oldNom = selfRow.nom;
    }

    const isDuplicateName = all.some(function (r) {
      if (rowIdx && r.rowIdx === rowIdx) return false; // self, on edit — never a collision with itself
      return r.cible === cible && r.nom.toLowerCase() === nomTrimmed.toLowerCase();
    });
    if (isDuplicateName) {
      return { success: false, isUserNotice: true, message: "Une sous-catégorie « " + nomTrimmed + " » existe déjà pour cette vue." };
    }

    const isDuplicatePosition = all.some(function (r) {
      if (rowIdx && r.rowIdx === rowIdx) return false;
      return r.cible === cible && r.colonne === colonne && r.position === position;
    });
    if (isDuplicatePosition) {
      return { success: false, isUserNotice: true, message: "Cette position (colonne " + colonne + ", position " + position + ") est déjà occupée dans cette vue." };
    }

    const rowValues = [cible, nomTrimmed, couleur, colonne, position];
    const targetRow = rowIdx ? rowIdx : Math.max(sheet.getLastRow() + 1, 7);
    sheet.getRange(targetRow, 2, 1, 5).setValues([rowValues]);

    const renamed = (oldNom && oldNom !== nomTrimmed) ? { oldName: oldNom, newName: nomTrimmed, cible: cible } : null;

    return { success: true, rows: getSousCategoriesTravauxHelper(), renamed: renamed };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Rewrites the Nom segment of "Config Travaux" rows' composite
 * sousCategorie field ("Nom|Ligne|Logo") after a rename — mirrors
 * gsCascadeDisciplineUpdate (Planing_gs.js). Only a valid session is
 * required: the admin gate already happened in the save that triggered
 * this cascade.
 */
function cascadeSousCategorieRename(token, cible, oldName, newName) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  if (!oldName || !newName || oldName === newName) return false;

  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  const sheet = ss.getSheetByName('Config Travaux');
  if (!sheet) return false;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 6) return false;

  // B..J = idWork, cible, sousCategorie, discipline, typeTravail,
  // piecesApplicables, typeChamp, detailsChamp (legacy), options (see
  // getTravauxConfigDataHelper — K/L parentId/suffix don't matter here).
  // We only ever touch index 2 (sousCategorie).
  const range = sheet.getRange(7, 2, lastRow - 6, 9);
  const data = range.getValues();
  let changed = false;
  const targetCible = normalizeCibleForCompare_(cible);

  for (let i = 0; i < data.length; i++) {
    const raw = String(data[i][2] || '');
    if (!raw) continue;
    if (normalizeCibleForCompare_(data[i][1]) !== targetCible) continue;

    const parts = raw.split('|');
    if ((parts[0] || '').trim() === oldName) {
      parts[0] = newName;
      data[i][2] = parts.join('|');
      changed = true;
    }
  }

  if (changed) range.setValues(data);
  return true;
}

function deleteSousCategorieTravaux(token, projectId, rowIdx) {
  assertIsAdmin_(token, projectId);
  const rowIdxNum = parseInt(rowIdx, 10);
  if (!rowIdxNum) throw new Error("Ligne invalide.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = _getSousCategoriesSheet_(false);
    if (!sheet) throw new Error("La feuille '" + SOUS_CATEGORIES_SHEET_NAME_ + "' est introuvable.");

    const rowValues = sheet.getRange(rowIdxNum, 2, 1, 5).getValues()[0];
    const cible = String(rowValues[0] || '').trim();
    const nom = String(rowValues[1] || '').trim();
    if (!nom) throw new Error("Ligne introuvable ou déjà supprimée.");

    // Protect referenced entities — same pattern as gsDeleteDiscipline /
    // gsDeleteEquipe / gsDeleteTask (Planing_gs.js): block if still in use
    // rather than silently orphaning Config Travaux rows.
    const sheetConfig = SpreadsheetApp.openById(EDL_SS_ID).getSheetByName('Config Travaux');
    let usedCount = 0;
    if (sheetConfig) {
      const lastRowConfig = sheetConfig.getLastRow();
      if (lastRowConfig > 6) {
        const configData = sheetConfig.getRange(7, 2, lastRowConfig - 6, 9).getValues();
        const targetCible = normalizeCibleForCompare_(cible);
        configData.forEach(function (r) {
          if (normalizeCibleForCompare_(r[1]) !== targetCible) return;
          const scNom = String(r[2] || '').split('|')[0].trim();
          if (scNom === nom) usedCount++;
        });
      }
    }
    if (usedCount > 0) {
      return {
        success: false, isUserNotice: true,
        message: "Impossible de supprimer : la sous-catégorie « " + nom + " » est utilisée par " + usedCount +
          " poste(s) de travaux dans « Config Travaux ». Retirez-la de ces postes d'abord (ou renommez-la plutôt que de la supprimer)."
      };
    }

    sheet.deleteRow(rowIdxNum);
    return { success: true, rows: getSousCategoriesTravauxHelper() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Overwrites the full (Colonne, Position) layout for one Cible in a single
 * pass — used by the manager's drag-and-drop grid. Takes the WHOLE new
 * arrangement rather than one move at a time: writing single moves
 * sequentially could transiently collide on a swap (target cell briefly
 * "already occupied" by the row being displaced) and get rejected by a
 * per-row duplicate check. Validating the incoming set as a whole sidesteps
 * that entirely.
 */
function reorderSousCategoriesTravaux(token, projectId, cible, layout) {
  assertIsAdmin_(token, projectId);
  if (!Array.isArray(layout) || layout.length === 0) return { success: true, rows: getSousCategoriesTravauxHelper() };

  // Validate the incoming set BEFORE writing anything.
  const seenPositions = {};
  for (let i = 0; i < layout.length; i++) {
    const entry = layout[i];
    const colonne = parseInt(entry.colonne, 10);
    const position = parseInt(entry.position, 10);
    if (!colonne || colonne < 1 || colonne > 3) {
      throw new Error("Colonne invalide (" + entry.colonne + ") pour la ligne " + entry.rowIdx + ".");
    }
    if (!position || position < 1) {
      throw new Error("Position invalide (" + entry.position + ") pour la ligne " + entry.rowIdx + ".");
    }
    const key = colonne + '|' + position;
    if (seenPositions[key]) {
      throw new Error("Positions en double détectées (colonne " + colonne + ", position " + position + ").");
    }
    seenPositions[key] = true;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = _getSousCategoriesSheet_(false);
    if (!sheet) throw new Error("La feuille '" + SOUS_CATEGORIES_SHEET_NAME_ + "' est introuvable.");

    layout.forEach(function (entry) {
      const rowIdxNum = parseInt(entry.rowIdx, 10);
      if (!rowIdxNum) return;
      sheet.getRange(rowIdxNum, 5, 1, 2).setValues([[parseInt(entry.colonne, 10), parseInt(entry.position, 10)]]); // E=Colonne, F=Position
    });

    return { success: true, rows: getSousCategoriesTravauxHelper() };
  } finally {
    lock.releaseLock();
  }
}

// seedSousCategoriesFromExistingConfig() removed 2026-08-26
// (agents/edl-page-spec.md section 3, "New: remove sous-catégorie
// import") — the "Importer les sous-catégories existantes" button and its
// client-side wiring in EDL_Scripts_2.html were removed at the same time.