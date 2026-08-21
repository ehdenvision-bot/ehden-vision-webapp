/**
 * ==========================================
 * 1. DATA FETCHING LOGIC
 * ==========================================
 */

/**
 * Main entry point: Fetches locataires, communs, facades, and planning data.
 * @param {string} token     - Session token from the client.
 * @param {string} projectId - Passed through for context/logging but not used for auth.
 */
function getLocatairesPageData(token, projectId) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  return {
    locataires:     fetchSheetData('Locataires'),
    communs:        fetchSheetData('Parties communes'),
    facades:        fetchSheetData('Facades'),
    configFacades:  fetchSheetData('Config Facades'),
    planning:       fetchAllNotes()
  };
}

/**
 * Reads planning notes from all three Planning sheets and merges them
 * into a single map keyed by unit/lot ID.
 */
function fetchAllNotes() {
  try {
    // PLANNING_SS_ID is declared as a file-scope constant in Planning_gs
    if (!PLANNING_SS_ID) return {};

    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    const notesSheets = ['Planning', 'Planning Communs', 'Planning Facades'];
    const combinedNotes = {};

    notesSheets.forEach(sheetName => {
      const sheet = ss.getSheetByName(sheetName);
      if (sheet && sheet.getLastRow() >= 7) {
        const data = sheet.getRange(7, 1, sheet.getLastRow() - 6, 3).getValues();

        data.forEach(row => {
          const id = String(row[0] || '').trim();
          if (!id) return;

          const status  = String(row[1] || '').trim();
          const rawNote = String(row[2] || '').trim();

          let pubNote  = "";
          let privNote = "";

          if (rawNote.startsWith('{') && rawNote.endsWith('}')) {
            try {
              const parsed = JSON.parse(rawNote);
              pubNote  = parsed.pub  || "";
              privNote = parsed.priv || parsed.int || "";
            } catch (_) {
              pubNote = rawNote;
            }
          } else {
            pubNote = rawNote;
          }

          combinedNotes[id] = { status, note: pubNote, privateNote: privNote };
        });
      }
    });

    return combinedNotes;
  } catch (e) {
    console.error("Erreur fetchAllNotes:", e);
    return {};
  }
}

/**
 * Generic sheet reader — reads all data rows starting from row 7, column B.
 * @param {string} sheetName - 'Locataires', 'Parties communes', or 'Facades'
 */
function fetchSheetData(sheetName) {
  // BATIMENTS_SS_ID is declared as a file-scope constant in Planning_gs
  const ss    = SpreadsheetApp.openById(BATIMENTS_SS_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Feuille introuvable : " + sheetName);

  const startRow = 7;
  const startCol = 2; // Column B

  const lastRow = sheet.getLastRow();
  if (lastRow < startRow) return [];

  let numCols;
  if (sheetName === 'Locataires')       numCols = 20;
  else if (sheetName === 'Parties communes') numCols = 8;
  else if (sheetName === 'Facades')     numCols = 8;
  else                                  numCols = sheet.getLastColumn() - 1;

  const values = sheet.getRange(startRow, startCol, lastRow - startRow + 1, numCols).getValues();

  // Remove empty rows (Column B empty)
  const cleaned = values.filter(r => r[0] !== "" && r[0] !== null && r[0] !== undefined);

  return cleaned.map(row => {

    if (sheetName === 'Locataires') {
      return {
        id:               row[0],
        batiment:         row[2],
        hall:             row[3],
        etage:            row[4],
        empilement:       row[5],
        porte:            row[6],
        typeLog:          row[7],
        configLogement:   row[8],
        surface:          row[9],
        nom:              String(row[10]).toUpperCase(),
        prenom:           formatProperCase(String(row[11])),
        adresse:          row[12],
        ville:            row[13],
        telFixe:          formatPhoneForUi(row[14]),
        telPort1:         formatPhoneForUi(row[15]),
        telPort2:         formatPhoneForUi(row[16]),
        email:            row[17],
        email2:           row[18],
        reference:        row[19]
      };
    }

    if (sheetName === 'Parties communes') {
      return {
        id:          row[0],
        batiment:    row[2],
        hall:        row[3],
        etage:       row[4],
        description: row[5],
        ref:         row[6],
        abr:         row[7]
      };
    }

    if (sheetName === 'Facades') {
      return {
        id:          String(row[0] || '').trim(),
        id2:         String(row[1] || '').trim(),
        batiment:    String(row[2] || '').trim(),
        hall:        String(row[3] || '').trim(),
        orientation: String(row[4] || '').trim(),
        trame:       String(row[5] || '').trim(),
        partie:      String(row[6] || '').trim(),
        type:        String(row[7] || '').trim()
      };
    }

    if (sheetName === 'Config Facades') {
      return {
        type:        String(row[0] || '').trim(), // Column B
        description: String(row[1] || '').trim()  // Column C
      };
    }

    return { id: row[0] };
  });
}


/**
 * ==========================================
 * 2. DATA UPDATE OPERATIONS
 * ==========================================
 */

/**
 * Updates a Locataire contact row and its corresponding Planning entry.
 *
 * Security: assertCanEdit_(token, projectId) validates:
 *   1. Session token is valid
 *   2. User role is authorized (admin / directeur / collaborateur)
 *   3. Project status is 'Active' (fetched from DB — not trusted from client)
 */
function updateLocataireData(token, projectId, payload) {
  const user = assertCanEdit_(token, projectId);
  // assertCanEdit_ throws on failure, so reaching here means the user is authorized.

  // BATIMENTS_SS_ID is declared as a file-scope constant in Planning_gs
  const ss    = SpreadsheetApp.openById(BATIMENTS_SS_ID);
  const sheet = ss.getSheetByName('Locataires');

  // Find the row by ID in Column B
  const data     = sheet.getRange(7, 2, sheet.getLastRow() - 6, 1).getValues();
  const rowIndex = data.findIndex(row => String(row[0]) === String(payload.id));

  if (rowIndex === -1) throw new Error("Identifiant non trouvé.");

  const sheetRow   = rowIndex + 7;
  const cleanPhone = (num) => String(num).replace(/\s/g, '');

  // Write contact fields
  sheet.getRange(sheetRow, 12, 1, 2).setValues([[
    payload.nom.toUpperCase(),
    formatProperCase(payload.prenom)
  ]]);
  sheet.getRange(sheetRow, 16, 1, 5).setValues([[
    cleanPhone(payload.telFixe),
    cleanPhone(payload.telPort1),
    cleanPhone(payload.telPort2),
    payload.email,
    payload.email2
  ]]);

  updatePlanningData(payload);
  return true;
}

/**
 * Updates only the planning entry (status, notes) for Communs and Facades.
 * Maps the target sheet explicitly based on the front-end active view context.
 */
function updatePlanningOnlyData(token, projectId, view, payload) {
  const user = assertCanEdit_(token, projectId);

  // Map the view explicitly to the correct spreadsheet sheet tab
  const sheetName = view === 'communs' ? 'Planning Communs'
                  : view === 'facades' ? 'Planning Facades'
                  : 'Planning';

  updatePlanningData(payload, sheetName);
  return true;
}

/**
 * Writes or updates a row in the appropriate Planning sheet.
 * Enhanced to accept an explicit sheet name to override automatic ID prefix checking.
 */
function updatePlanningData(payload, explicitSheetName) {
  if (!PLANNING_SS_ID) return;

  const ss = SpreadsheetApp.openById(PLANNING_SS_ID);

  const id = String(payload.id || '');
  
  // Use the explicit sheet name if provided, otherwise fall back to ID parsing
  const sheetName = explicitSheetName || (
                    id.startsWith('COM-') ? 'Planning Communs'
                  : id.startsWith('FAC-') ? 'Planning Facades'
                  : 'Planning'
  );

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  const startRow   = 7;
  const COL_ID     = 1;
  const COL_STATUS = 2;
  const COL_NOTES  = 3;

  const lastRow = sheet.getLastRow();
  let data = [];
  if (lastRow >= startRow) {
    data = sheet.getRange(startRow, COL_ID, lastRow - startRow + 1, 1).getValues();
  }

  const rowIndex = data.findIndex(row => String(row[0]).trim() === id.trim());

  const notesObj = {
    pub:  payload.planNote        || "",
    priv: payload.planPrivateNote || ""
  };
  const notesString = (notesObj.pub === "" && notesObj.priv === "")
    ? ""
    : JSON.stringify(notesObj);

  if (rowIndex === -1) {
    const newRowIndex = Math.max(lastRow + 1, startRow);
    sheet.getRange(newRowIndex, COL_ID, 1, 3).setValues([[
      payload.id,
      payload.planStatus || "",
      notesString
    ]]);
  } else {
    const sheetRow = startRow + rowIndex;
    sheet.getRange(sheetRow, COL_STATUS, 1, 2).setValues([[
      payload.planStatus || "",
      notesString
    ]]);
  }
}




/**
 * ==========================================
 * 3. FORMATTING UTILITIES
 * ==========================================
 */

/**
 * Converts "JEAN-PIERRE" or "jean pierre" to "Jean-Pierre".
 */
function formatProperCase(str) {
  return str.toLowerCase().replace(/(^|\s|-)\S/g, L => L.toUpperCase());
}

/**
 * Formats a raw phone number for UI display: "0X XX XX XX XX"
 */
function formatPhoneForUi(num) {
  if (!num) return "";
  let s = String(num).replace(/\s/g, '');

  // Correct missing leading zero for 9-digit numbers
  if (s.length === 9 && !s.startsWith('0')) s = '0' + s;

  return s.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}