/**
 * Settings_Module.gs
/**
 * Returns the current project planning state (dates, isCreated flag).
 * Read-only — requires a valid session, no role restriction.
 *
 * @param {string} token - Session token from the client.
 */
function getSettingsState(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const props = PropertiesService.getScriptProperties();
  const ssPlanning = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  let sheetP = ssPlanning.getSheetByName('Planning');

  if (!sheetP) return { isCreated: false, currentStart: "", currentEnd: "" };

  const marker = String(sheetP.getRange("A1").getValue()).trim();
  const isCreated = (marker === "PROJET_CREE");

  let currentStart = "";
  let currentEnd = "";

  if (isCreated && sheetP.getLastColumn() >= 8) {
    const lastCol = sheetP.getLastColumn();
    const startDateRaw = sheetP.getRange(2, 8).getValue();
    const endDateRaw   = sheetP.getRange(2, lastCol).getValue();

    if (startDateRaw instanceof Date) {
      currentStart = Utilities.formatDate(startDateRaw, Session.getScriptTimeZone(), "yyyy-MM-dd");
      currentEnd   = Utilities.formatDate(endDateRaw,   Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
  }

  return { isCreated, currentStart, currentEnd };
}

/**
 * Generates or updates the project planning grid across all 3 sheets.
 * Write operation — requires assertCanEdit_ (token + role + project status).
 *
 * @param {string} token     - Session token from the client.
 * @param {Object} params    - { startDate, endDate, months, mode }
 * @param {string} projectId - The active project ID for status validation.
 */
function processProjectGeneration(token, params, projectId) {
  assertCanEdit_(token, projectId);

  const { startDate, endDate, months, mode } = params;
  const newStart = new Date(startDate);
  newStart.setHours(0, 0, 0, 0);

  const newEnd = months
    ? new Date(new Date(newStart).setMonth(newStart.getMonth() + parseInt(months)))
    : new Date(endDate);
  newEnd.setHours(23, 59, 59, 999);

  const props = PropertiesService.getScriptProperties();
  const ssPlanning   = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  const ssLocataires = SpreadsheetApp.openById(props.getProperty('BATIMENTS_SPREADSHEET_ID'));

  const sheetConfigs = [
    { targetName: "Planning",         sourceName: "Locataires" },
    { targetName: "Planning Commun",  sourceName: "Parties communes" },
    { targetName: "Planning Facades", sourceName: "Facades" }
  ];

  let savedData = {};

  if (mode !== 'create') {
    const safeStart = newStart.getTime();
    const safeEnd   = newEnd.getTime();

    if (safeEnd < safeStart) {
      throw new Error("La date de fin doit être après la date de début.");
    }

    sheetConfigs.forEach(conf => {
      const sh = ssPlanning.getSheetByName(conf.targetName);
      if (!sh || sh.getLastRow() < 7) return;

      const lastCol = sh.getLastColumn();
      const lastRow = sh.getLastRow();

      if (lastCol < 8) return;

      const oldDatesArr = sh.getRange(2, 8, 1, lastCol - 7).getValues()[0];
      const fullGrid    = sh.getRange(7, 1, lastRow - 6, lastCol).getValues();

      fullGrid.forEach(row => {
        const id = row[0];
        if (!id) return;

        if (!savedData[id]) savedData[id] = {};

        for (let i = 7; i < row.length; i++) {
          if (row[i] !== "" && row[i] !== null) {
            const cellDate = new Date(oldDatesArr[i - 7]);
            const cellTime = cellDate.getTime();

            if (cellTime < safeStart || cellTime > safeEnd) {
              const formattedDate = Utilities.formatDate(cellDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
              throw new Error(`DATA_LOSS_PREVENTION: Impossible de réduire les dates. L'ID ${id} contient des données le ${formattedDate} dans le "${conf.targetName}".`);
            }

            const dKey = Utilities.formatDate(cellDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
            savedData[id][dKey] = row[i];
          }
        }
      });
    });
  }

  saveHolidaysToSheet(newStart, newEnd);
  const holidaySet = new Set(getHolidaysFromSheet_().map(h => h.dateStr));

  const daysDiff     = Math.ceil((newEnd - newStart) / 86400000);
  const headerMatrix = [[], [], [], [], [], []];
  const dateStrings  = [];
  const dayNames     = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];
  const monthNames   = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE"];

  for (let i = 0; i < daysDiff; i++) {
    let curr = new Date(newStart);
    curr.setDate(newStart.getDate() + i);
    const dStr      = Utilities.formatDate(curr, Session.getScriptTimeZone(), "yyyy-MM-dd");
    const isWeekend = (curr.getDay() === 0 || curr.getDay() === 6);
    const isHoliday = holidaySet.has(dStr);

    headerMatrix[0].push((isWeekend || isHoliday) ? 0 : 1);
    headerMatrix[1].push(curr);
    headerMatrix[2].push(monthNames[curr.getMonth()] + " " + curr.getFullYear());
    headerMatrix[3].push("S" + getWeekNum(curr));
    headerMatrix[4].push(dayNames[curr.getDay()]);
    headerMatrix[5].push(curr.getDate());
    dateStrings.push(dStr);
  }

  sheetConfigs.forEach(conf => {
    const sh = ssPlanning.getSheetByName(conf.targetName);
    if (!sh) return;

    sh.clear();
    sh.getRange("A1").setValue("PROJET_CREE").setFontColor("#ffffff");
    sh.getRange(6, 1, 1, 3).setValues([["ID", "Status", "Commentaire"]]).setFontWeight("bold");

    sh.getRange(1, 8, 6, daysDiff).setValues(headerMatrix).setHorizontalAlignment("center").setVerticalAlignment("middle");
    sh.getRange(2, 8, 1, daysDiff).setNumberFormat("dd/mm/yyyy");
    sh.getRange(6, 8, 1, daysDiff).setNumberFormat("0").setFontWeight("bold");
    sh.getRange(1, 1, 6, daysDiff + 7).setBackground("#eef4ff").setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);

    const sourceSheet = ssLocataires.getSheetByName(conf.sourceName);
    if (!sourceSheet) return;

    const ids = sourceSheet.getLastRow() >= 7
      ? sourceSheet.getRange(7, 2, sourceSheet.getLastRow() - 6, 1).getValues().filter(r => r[0] !== "")
      : [];

    if (ids.length > 0) {
      const finalGrid = ids.map(r => {
        const id     = r[0];
        const rowArr = new Array(daysDiff + 7).fill("");
        rowArr[0]    = id;
        if (savedData[id]) {
          dateStrings.forEach((dStr, idx) => {
            if (savedData[id][dStr]) rowArr[idx + 7] = savedData[id][dStr];
          });
        }
        return rowArr;
      });

      sh.getRange(7, 1, finalGrid.length, daysDiff + 7).setValues(finalGrid).setHorizontalAlignment("center").setVerticalAlignment("middle");

      for (let j = 0; j < finalGrid.length; j++) {
        if (j % 2 === 1) sh.getRange(7 + j, 1, 1, daysDiff + 7).setBackground("#f8f9fc");
      }
    }
  });

  return `Projet généré/mis à jour avec succès pour les 3 plannings.`;
}

/**
 * Saves automatically-calculated holidays to the 'Conges' sheet.
 * Internal helper — called only server-side. No token needed.
 */
function saveHolidaysToSheet(newStart, newEnd) {
  const props = PropertiesService.getScriptProperties();
  const ss    = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  let sheetH  = ss.getSheetByName('Conges');

  if (!sheetH) {
    sheetH = ss.insertSheet('Conges');
    sheetH.getRange("A1").setValue("LISTE_CONGES").setFontColor("#ffffff");
    sheetH.getRange(6, 2, 1, 4).setValues([["Date", "Description", "Type Fixe", "Jour Ouvré"]]).setFontWeight("bold");
  }

  const oldData = (sheetH.getLastRow() >= 7)
    ? sheetH.getRange(7, 2, sheetH.getLastRow() - 6, 4).getValues()
    : [];

  const customHolidays = oldData.filter(r => r[2] === "Non");

  const startYear   = newStart.getFullYear();
  const endYear     = newEnd.getFullYear();
  const allHolidays = [];

  for (let year = startYear; year <= endYear; year++) {
    calculateFrenchHolidays(year).forEach(h => {
      allHolidays.push([h.date, h.desc, h.typeFixe === "Non" ? "Non" : "Oui", "Non"]);
    });
  }

  let merged = [...allHolidays, ...customHolidays];

  const unique  = {};
  const cleaned = [];

  merged.forEach(row => {
    const dateObj = row[0] instanceof Date ? row[0] : parseDateSafe(row[0], false);
    const key     = dateObj.getTime() + "##" + String(row[1]).toUpperCase().trim();
    if (!unique[key]) {
      unique[key] = true;
      cleaned.push([dateObj, row[1], row[2], row[3]]);
    }
  });

  cleaned.sort((a, b) => a[0].getTime() - b[0].getTime());

  if (sheetH.getLastRow() >= 7) {
    sheetH.getRange(7, 2, sheetH.getLastRow() - 6, 4).clearContent();
  }

  if (cleaned.length > 0) {
    sheetH.getRange(7, 2, cleaned.length, 4).setValues(cleaned);
    sheetH.getRange(7, 2, cleaned.length, 1).setNumberFormat("dd/mm/yyyy");
  }

  SpreadsheetApp.flush();
}

/**
 * Internal helper — fetches holidays without token check.
 * Used by processProjectGeneration and the public token-gated wrapper.
 */
function getHolidaysFromSheet_() {
  const props  = PropertiesService.getScriptProperties();
  const ss     = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  const sheetH = ss.getSheetByName('Conges');

  if (!sheetH || sheetH.getLastRow() < 7) return [];

  const data = sheetH.getRange(7, 2, sheetH.getLastRow() - 6, 4).getValues();

  return data.map(row => {
    let dateStr = "";
    if (row[0] instanceof Date) {
      dateStr = Utilities.formatDate(row[0], Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    return { dateStr, desc: row[1], typeFixe: row[2], isWorkingDay: row[3] };
  });
}

/**
 * Public wrapper for getHolidaysFromSheet_ — requires a valid session token.
 *
 * @param {string} token - Session token from the client.
 */
function getHolidaysFromSheet(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  return getHolidaysFromSheet_();
}

/**
 * Replaces all holidays in the 'Conges' sheet.
 * Write operation — requires assertCanEdit_.
 */
function updateHolidaysInSheet(token, dataArray, projectId) {
  assertCanEdit_(token, projectId);

  const props  = PropertiesService.getScriptProperties();
  const ss     = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  const sheetH = ss.getSheetByName('Conges');

  if (!sheetH) throw new Error("Feuille 'Conges' introuvable.");

  if (sheetH.getLastRow() >= 7) {
    sheetH.getRange(7, 2, sheetH.getLastRow() - 6, 4).clearContent();
  }

  if (dataArray && dataArray.length > 0) {
    const matrix = dataArray.map(row => {
      const parts = row[0].split('-');
      return [new Date(parts[0], parts[1] - 1, parts[2]), row[1], row[2], row[3]];
    });
    sheetH.getRange(7, 2, matrix.length, 4).setValues(matrix);
  }

  syncPlanningRow1();
  return true;
}

/**
 * Adds a single custom holiday to the 'Conges' sheet.
 * Write operation — requires assertCanEdit_.
 */
function insertCustomHoliday(token, dateStr, desc, isFixed, year, projectId) {
  assertCanEdit_(token, projectId);

  const props  = PropertiesService.getScriptProperties();
  const ss     = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  const sheetH = ss.getSheetByName('Conges');

  const d       = parseDateSafe(dateStr, false);
  let lastRow   = sheetH.getLastRow();
  if (lastRow < 7) lastRow = 6;

  sheetH.getRange(lastRow + 1, 2, 1, 4).setValues([[d, desc, "Non", "Non"]]);
  sheetH.getRange(lastRow + 1, 2).setNumberFormat("dd/mm/yyyy");

  const allData = sheetH.getRange(7, 2, sheetH.getLastRow() - 6, 4).getValues();
  const unique  = {};
  const cleaned = [];

  allData.forEach(r => {
    const date = r[0] instanceof Date ? r[0] : parseDateSafe(r[0], false);
    const key  = date.getTime() + "#" + r[1];
    if (!unique[key]) { unique[key] = true; cleaned.push([date, r[1], r[2], r[3]]); }
  });

  cleaned.sort((a, b) => a[0] - b[0]);

  sheetH.getRange(7, 2, sheetH.getLastRow() - 6, 4).clearContent();
  sheetH.getRange(7, 2, cleaned.length, 4).setValues(cleaned);
  sheetH.getRange(7, 2, cleaned.length, 1).setNumberFormat("dd/mm/yyyy");

  SpreadsheetApp.flush();
  syncPlanningRow1();
  return true;
}

/**
 * Deletes a holiday row from the 'Conges' sheet.
 * Write operation — requires assertCanEdit_.
 */
function deleteHolidayFromSheet(token, dateStr, desc, projectId) {
  assertCanEdit_(token, projectId);

  const props  = PropertiesService.getScriptProperties();
  const ss     = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  const sheetC = ss.getSheetByName('Conges');

  const data = sheetC.getDataRange().getValues();
  for (let i = data.length - 1; i >= 6; i--) {
    const rowDate = Utilities.formatDate(new Date(data[i][1]), Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (rowDate === dateStr && data[i][2] === desc) {
      sheetC.deleteRow(i + 1);
    }
  }

  syncPlanningRow1();
}

/**
 * Updates an existing custom holiday's date and/or description.
 * Write operation — requires assertCanEdit_.
 */
function updateCustomHoliday(token, oldDateStr, oldDesc, newDateStr, newDesc, projectId) {
  assertCanEdit_(token, projectId);

  const props  = PropertiesService.getScriptProperties();
  const ss     = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  const sheetH = ss.getSheetByName('Conges');

  if (!sheetH) throw new Error("Feuille 'Conges' introuvable.");

  const lastRow = sheetH.getLastRow();
  if (lastRow < 7) return true;

  const rows    = sheetH.getRange(7, 2, lastRow - 6, 4).getValues();
  const oldDate = parseDateSafe(oldDateStr, false).getTime();

  const updated = rows.map(r => {
    const d    = r[0] instanceof Date ? r[0] : parseDateSafe(r[0], false);
    if (d.getTime() === oldDate && r[1] === oldDesc && r[2] === "Non") {
      return [parseDateSafe(newDateStr, false), newDesc, "Non", "Non"];
    }
    return r;
  });

  sheetH.getRange(7, 2, lastRow - 6, 4).clearContent();
  sheetH.getRange(7, 2, updated.length, 4).setValues(updated);
  sheetH.getRange(7, 2, updated.length, 1).setNumberFormat("dd/mm/yyyy");

  return true;
}

/**
 * Toggles a fixed holiday between ouvré / non-ouvré.
 * Write operation — requires assertCanEdit_.
 */
function updateSingleHolidayStatus(token, dateStr, status, projectId) {
  assertCanEdit_(token, projectId);

  const props  = PropertiesService.getScriptProperties();
  const ss     = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  const sheetH = ss.getSheetByName('Conges');

  if (!sheetH) return;

  const data = sheetH.getRange(7, 2, sheetH.getLastRow() - 6, 4).getValues();
  for (let i = 0; i < data.length; i++) {
    const rowDate = Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (rowDate === dateStr) {
      sheetH.getRange(7 + i, 5).setValue(status);
      break;
    }
  }

  syncPlanningRow1();
  return true;
}

/**
 * =================================================================
 * INTERNAL HELPERS — Not exposed to the client, no token required.
 * =================================================================
 */

function syncPlanningRow1() {
  const props  = PropertiesService.getScriptProperties();
  const ss     = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  const sheetH = ss.getSheetByName('Conges');
  if (!sheetH) return;

  const targetSheetNames = ["Planning", "Planning Commun", "Planning Facades"];
  const tz = Session.getScriptTimeZone();

  let holidayMap = {};
  const lastRowH = sheetH.getLastRow();
  if (lastRowH >= 7) {
    sheetH.getRange(7, 2, lastRowH - 6, 4).getValues().forEach(row => {
      if (row[0] instanceof Date) {
        holidayMap[Utilities.formatDate(row[0], tz, "yyyy-MM-dd")] = row[3];
      }
    });
  }

  targetSheetNames.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastColumn() < 8) return;
    const lastCol   = sh.getLastColumn();
    const datesRow2 = sh.getRange(2, 8, 1, lastCol - 7).getValues()[0];
    const newRow1   = datesRow2.map(cellDate => {
      if (!(cellDate instanceof Date)) return 1;
      const dStr = Utilities.formatDate(cellDate, tz, "yyyy-MM-dd");
      if (holidayMap.hasOwnProperty(dStr)) return holidayMap[dStr] === "Oui" ? 1 : 0;
      return (cellDate.getDay() === 0 || cellDate.getDay() === 6) ? 0 : 1;
    });
    sh.getRange(1, 8, 1, newRow1.length).setValues([newRow1]);
  });

  SpreadsheetApp.flush();
}

function parseDateSafe(dateStr, isEnd) {
  const parts = dateStr.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isEnd) d.setHours(23, 59, 59, 999);
  else       d.setHours(0, 0, 0, 0);
  return d;
}

function calculateFrenchHolidays(year) {
  const f = Math.floor, G = year % 19, C = f(year / 100),
    H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30,
    I = H - f(H / 28) * (1 - f(H / 28) * f(29 / (H + 1)) * f((21 - G) / 11)),
    J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7, L = I - J,
    month = 3 + f((L + 40) / 44), day = L + 28 - 31 * f(month / 4);

  const easter          = new Date(year, month - 1, day);
  const easterMonday    = new Date(year, month - 1, day + 1);
  const ascension       = new Date(year, month - 1, day + 39);
  const pentecostMonday = new Date(year, month - 1, day + 50);

  return [
    { date: new Date(year, 0, 1),   desc: "Jour de l'an" },
    { date: easter,                  desc: "Pâques" },
    { date: easterMonday,            desc: "Lundi de Pâques" },
    { date: new Date(year, 4, 1),   desc: "Fête du Travail" },
    { date: new Date(year, 4, 8),   desc: "Armistice 39/45" },
    { date: ascension,               desc: "Ascension" },
    { date: pentecostMonday,         desc: "Lundi de Pentecôte" },
    { date: new Date(year, 6, 14),  desc: "Fête Nationale" },
    { date: new Date(year, 7, 15),  desc: "Assomption" },
    { date: new Date(year, 10, 1),  desc: "Toussaint" },
    { date: new Date(year, 10, 11), desc: "Armistice 14/18" },
    { date: getJourDuPatron(year),   desc: "Jour du Patron", typeFixe: "Non" },
    { date: new Date(year, 11, 25), desc: "Noël" }
  ];
}

function getJourDuPatron(year) {
  let d = new Date(year, 11, 24);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

function getWeekNum(d) {
  var d2 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d2.setUTCDate(d2.getUTCDate() + 4 - (d2.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d2.getUTCFullYear(), 0, 1));
  return Math.ceil((((d2 - yearStart) / 86400000) + 1) / 7);
}

function getPlanningMeta(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const props      = PropertiesService.getScriptProperties();
  const ssPlanning = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  const ssLoc      = SpreadsheetApp.openById(props.getProperty('BATIMENTS_SPREADSHEET_ID'));
  const shPlan     = ssPlanning.getSheetByName("Planning");
  const shLoc      = ssLoc.getSheetByName("Locataires");
  const raw        = shPlan.getDataRange().getValues();

  const dates = raw[5].slice(7).map(d => d instanceof Date ? d.toISOString() : null);
  const today = new Date(); today.setHours(0,0,0,0);
  let todayIndex = -1;
  for (let i = 0; i < dates.length; i++) {
    if (!dates[i]) continue;
    const d = new Date(dates[i]); d.setHours(0,0,0,0);
    if (d.getTime() === today.getTime()) { todayIndex = i; break; }
  }

  const last    = shLoc.getLastRow();
  const rows    = shLoc.getRange(7, 2, last - 6, 13).getValues();
  const locDict = {};
  rows.forEach(r => {
    const id = r[0]; if (!id) return;
    locDict[id] = { id, bat: r[2], suffixe: r[3], hall: r[4], etage: r[5], emp: r[6],
      porte: r[7], typeLog: r[8], config: r[9], surface: r[10], nom: r[11], prenom: r[12] };
  });

  return {
    totalDays: dates.length,
    aujourdHui: todayIndex,
    headers: { ouvre: raw[0].slice(7), mois: raw[2].slice(7), semaines: raw[3].slice(7), jours: raw[4].slice(7), dates },
    locataires: locDict
  };
}

function getPlanningChunk(token, start, end) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const props      = PropertiesService.getScriptProperties();
  const ssPlanning = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID'));
  const raw        = ssPlanning.getSheetByName("Planning").getDataRange().getValues();
  const result     = {};

  for (let r = 6; r < raw.length; r++) {
    const id = raw[r][1] || raw[r][0];
    if (!id) continue;
    result[id] = raw[r].slice(7 + start, 7 + end + 1);
  }
  return result;
}

function getTaskSettings(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const props = PropertiesService.getScriptProperties();
  const sh    = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID')).getSheetByName("Taches");
  const rows  = sh.getRange(7, 2, sh.getLastRow() - 6, 9).getValues();
  const tasks = {};
  rows.forEach(r => { if (r[0]) tasks[r[0]] = { abbr: r[0], desc: r[3], short: r[4], bg: r[5], color: r[6] }; });
  return tasks;
}

// =========================================================
// VERIFICATION DES TACHES POUR JOURS NON OUVRÉS
// =========================================================

function gsCheckTasksOnDates(token, datesToCheck) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  
  // CORRECTION : Récupération dynamique de l'ID du classeur
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(props.getProperty('PLANNING_SPREADSHEET_ID')); 
  
  const sheetsToCheck = [
    'Planning', 'Planning Commun', 'Planning Facades',
    'Planning Reserves', 'Planning Reserves Communs', 'Planning Reserves Facades'
  ];
  
  const tz = ss.getSpreadsheetTimeZone();
  let hasConflicts = false;
  let conflictedDates = [];

  sheetsToCheck.forEach(sheetName => {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    
    const lastCol = sh.getLastColumn();
    const lastRow = sh.getLastRow();
    
    if (lastCol < 8 || lastRow < 7) return; 
    
    const headerDates = sh.getRange(2, 8, 1, lastCol - 7).getValues()[0];
    const dataRange = sh.getRange(7, 8, lastRow - 6, lastCol - 7).getValues();
    
    let targetCols = [];
    headerDates.forEach((d, i) => {
      if (d instanceof Date) {
        const isoDate = Utilities.formatDate(d, tz, "yyyy-MM-dd");
        if (datesToCheck.includes(isoDate)) {
          targetCols.push({ date: isoDate, colIdx: i }); 
        }
      }
    });
    
    if (targetCols.length === 0) return; 
    
    for (let r = 0; r < dataRange.length; r++) {
      for (let c = 0; c < targetCols.length; c++) {
        const cellValue = String(dataRange[r][targetCols[c].colIdx]).trim();
        if (cellValue !== "") {
          hasConflicts = true;
          if (!conflictedDates.includes(targetCols[c].date)) {
            conflictedDates.push(targetCols[c].date);
          }
        }
      }
    }
  });

  return { 
    hasTasks: hasConflicts, 
    dates: conflictedDates 
  };
}

