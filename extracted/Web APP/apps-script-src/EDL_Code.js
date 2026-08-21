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
  
  try {
    fetchedTravauxConfig = getTravauxConfigDataHelper();
    fetchedTravauxDonnees = getTravauxDonneesDataHelper();
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
    return true;
  }

  // ROUTE 2: 'EDL Notes' (Whole Level General Notes & Specific Rooms)
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
  if (payload.isWholeLevel) {
    colIndex = 2; // Target Column C exactly for whole floors/facades
  } else {
    // Search for the room name starting from Column D (index 3)
    colIndex = headers.indexOf(payload.room);
    if (colIndex === -1) {
      // Room header doesn't exist, append it at the end
      colIndex = Math.max(headers.length, 3);
      sheet.getRange(6, colIndex + 1).setValue(payload.room);
    }
  }

  // Find the row for this ID in Column B (Index 1)
  let rowIndex = -1;
  for (let i = 6; i < currentData.length; i++) {
    if (String(currentData[i][1]).trim() === String(payload.id).trim()) {
      rowIndex = i;
      break;
    }
  }

  if (rowIndex === -1) {
    // ID doesn't exist, append new row
    const newRow = new Array(colIndex + 1).fill("");
    newRow[1] = payload.id; // Col B
    newRow[colIndex] = jsonString; // Target Column
    sheet.appendRow(newRow);
  } else {
    // ID exists, update specific cell
    sheet.getRange(rowIndex + 1, colIndex + 1).setValue(jsonString);
  }

  return true;
}

/**
 * Saves a photo: 1. Uploads to Drive, 2. Logs to "EDL Photos" sheet
 * Called by EDL_Scripts.html's bindPhotoUpload().
 *
 * The mechanics here (compress on the client, upload blob to the project's
 * Drive folder, log a row) aren't inherently EDL-only — if Travaux or another
 * layer wants its own photo gallery later, this is a reasonable function to
 * copy into that layer's own _Server.gs (pointing at its own log sheet)
 * rather than trying to generalize this one across layers prematurely.
 */
function uploadEDLPhoto(idLot, room, fileName, base64Data, mimeType) {
  const folderId = PropertiesService.getScriptProperties().getProperty('PROJECT_PHOTOS_FILE');
  const folder = DriveApp.getFolderById(folderId);

  // 1. Convert Base64 to Blob and Save to Drive
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
  const file = folder.createFile(blob);

  // 2. Append to "EDL Photos" Sheet
  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  const sheet = ss.getSheetByName('EDL Photos');

  const photoId = 'PHO-' + new Date().getTime(); // Unique ID
  const timestamp = new Date().toISOString();

  // Columns: ID_Photo, ID_Lot, Room, Drive_ID, Timestamp
  sheet.appendRow([photoId, idLot, room, file.getId(), timestamp]);

  return { photoId, driveId: file.getId(), timestamp };
}

/**
 * Returns all photos as an array for the frontend to cache
 * Called from EDL_Scripts.html's onBaseDataLoaded() hook.
 */
function getEDLPhotosData() {
  const ss = SpreadsheetApp.openById(EDL_SS_ID);
  const sheet = ss.getSheetByName('EDL Photos');
  const data = sheet.getDataRange().getValues();
  // Skip header, return objects
  return data.slice(1).map(row => ({
    photoId: row[0],
    idLot: row[1],
    room: row[2],
    driveId: row[3],
    timestamp: row[4]
  }));
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

      const data = sh.getRange(7, 1, lastRow - 6, 12).getValues();
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
            historique: String(row[11] || '').trim()              
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
  // columns B–J in this order:
  // B=idWork  C=cible  D=sousCategorie  E=discipline  F=typeTravail
  // G=piecesApplicables  H=typeChamp  I=detailsChamp  J=options
  const data = sheet.getRange(7, 2, lastRow - 6, 9).getValues();

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
      detailsChamp: row[7],
      options: row[8]
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
//    openTravauxConfigManager() in Travaux_Scripts.html). Same fixed B..J
//    column layout as getTravauxConfigDataHelper above; read and write
//    sides must stay in that exact order if this sheet's columns ever move.
//
//    Both functions return the FRESH full row list (same shape
//    getTravauxConfigDataHelper/getLocatairesPageDataEDL's travauxConfig
//    already returns) so the client can just replace its cache in one shot
//    instead of guessing what changed.
// ---------------------------------------------------------------------------
const TRAVAUX_CONFIG_COLUMNS_ = ['idWork', 'cible', 'sousCategorie', 'discipline', 'typeTravail', 'piecesApplicables', 'typeChamp', 'detailsChamp', 'options'];

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