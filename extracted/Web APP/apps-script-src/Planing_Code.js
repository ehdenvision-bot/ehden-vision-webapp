// =========================================================
// 0. FILE-SCOPE CONSTANTS — cached once, reused by every function
// =========================================================
// PropertiesService.getScriptProperties() was previously called 32 times (once per function).
// Caching here eliminates the repeated overhead.
const _SCRIPT_PROPS     = PropertiesService.getScriptProperties();
const PLANNING_SS_ID    = _SCRIPT_PROPS.getProperty('PLANNING_SPREADSHEET_ID');
const RESERVES_SS_ID    = _SCRIPT_PROPS.getProperty('RESERVES_SPREADSHEET_ID');
const BATIMENTS_SS_ID   = _SCRIPT_PROPS.getProperty('BATIMENTS_SPREADSHEET_ID');
const EDL_SS_ID         = _SCRIPT_PROPS.getProperty('EDL_SPREADSHEET_ID');

// =========================================================
// 1. Extraction optimisée du planning pour une fenêtre horizontale (dates) et verticale (bâtiment)
// =========================================================
function getSheetNames(view) {
  const map = {
    'locataires': { plan: 'Planning', source: 'Locataires', recap: 'Recap', avancement: 'avancement', planReserves: 'Planning Reserves' , reserves: 'Reserves' , autocontroles: 'AutoControle' , notes: 'Notes'},
    'communs': { plan: 'Planning Communs', source: 'Parties communes', recap: 'Recap Communs', avancement: 'avancement Communs', planReserves: 'Planning Reserves Communs' , reserves: 'Reserves Communs' , autocontroles: 'AutoControle Communs' , notes: 'Notes Communs'},
    'facades': { plan: 'Planning Facades', source: 'Facades', recap: 'Recap Facades', avancement: 'Avancement Facades', planReserves: 'Planning Reserves Facades' , reserves: 'Reserves Facades' , autocontroles: 'AutoControle Facades' , notes: 'Notes Facades'}
  };
  return map[view] || map['locataires'];
}

function gsGetPlanningWindow(token, projectId, startDateStr, endDateStr, currentView, batimentFilter, isClient) {

  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  
  const names = getSheetNames(currentView);
  const ssPlanning = SpreadsheetApp.openById(PLANNING_SS_ID);
  const shPlan = ssPlanning.getSheetByName(names.plan);
  const shPlanReserves = ssPlanning.getSheetByName(names.planReserves);
  
  const ssSource = SpreadsheetApp.openById(BATIMENTS_SS_ID);
  const shSource = ssSource.getSheetByName(names.source);

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  startDate.setHours(0,0,0,0);
  endDate.setHours(23,59,59,999);

  const lastCol = shPlan.getLastColumn();
  if (lastCol < 8) return emptyResult(startDateStr, endDateStr);
  const dateRow2 = shPlan.getRange(2, 8, 1, lastCol - 7).getValues()[0];

  let colStart = null, colEnd = null;
  for (let i = 0; i < dateRow2.length; i++) {
    const d = dateRow2[i];
    if (!(d instanceof Date)) continue;
    if (colStart === null && d >= startDate) colStart = i;
    if (d <= endDate) colEnd = i;
  }

  if (colStart === null || colEnd === null) return emptyResult(startDateStr, endDateStr);
  const colStartAbs = 8 + colStart;
  const colEndAbs   = 8 + colEnd;
  const windowSize  = colEndAbs - colStartAbs + 1;

  // FIX 4: Read all 6 header rows in one batched getRange call instead of 5 separate calls.
  // Rows: 1=workingDays, 2=dates(already read), 3=months, 4=weeks, 5=weekdays, 6=quant
  const headerBlock = shPlan.getRange(1, colStartAbs, 6, windowSize).getDisplayValues();
  const headers = {
    workingDays: headerBlock[0],
    months:      headerBlock[2],
    weeks:       headerBlock[3],
    weekdays:    headerBlock[4],
    quant:       headerBlock[5],
    dates: dateRow2.slice(colStart, colEnd + 1).map(d => {
      if (d instanceof Date) return Utilities.formatDate(d, ssPlanning.getSpreadsheetTimeZone(), "yyyy-MM-dd");
      return String(d);
    })
  };

  // 1. MÉTADONNÉES LOGEMENTS
  const logementsMeta = _buildLogementsMeta(shSource, currentView, batimentFilter);

  // --- FONCTION UTILITAIRE POUR EXTRAIRE AVANCEMENT ET NOTES ---
  function extractTaskData(sheetName) {
    const dataMap = {};
    const sheet = ssPlanning.getSheetByName(sheetName);
    if (!sheet) return dataMap;
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow >= 7 && lastCol >= 2) {
      const hdrs = sheet.getRange(6, 2, 1, lastCol - 1).getValues()[0];
      const grid = sheet.getRange(7, 1, lastRow - 6, lastCol).getValues();
      for (let r = 0; r < grid.length; r++) {
        const id = String(grid[r][0]).trim();
        if (!id || !logementsMeta[id]) continue;
        for (let c = 1; c < grid[r].length; c++) {
          const cellVal = String(grid[r][c]).trim();
          if (cellVal !== "") {
            if (!dataMap[id]) dataMap[id] = {};
            dataMap[id][hdrs[c - 1]] = cellVal; // Format: dataMap["ID_Logement"]["PLOMB"] = "En cours"
          }
        }
      }
    }
    return dataMap;
  }

  // 2. EXTRACTION DES DONNÉES SÉPARÉES (TÂCHES)
  const notesData = isClient ? {} : extractTaskData(names.notes);
  const avancData = extractTaskData(names.avancement);

  // 3. FUSION AVEC LE PLANNING (DATES)
  const lastRowPlan = shPlan.getLastRow();
  if (lastRowPlan <= 6) return emptyResult(startDateStr, endDateStr);

  const gridMeta  = shPlan.getRange(7, 1, lastRowPlan - 6, 3).getValues();
  const gridSlice = shPlan.getRange(7, colStartAbs, lastRowPlan - 6, windowSize).getValues();
  const planningRows = [];

  for (let r = 0; r < gridMeta.length; r++) {
    const id = gridMeta[r][0];
    if (!id || !logementsMeta[id]) continue;

    for (let c = 0; c < gridSlice[r].length; c++) {
      if (gridSlice[r][c]) {
        let tasksInCell = String(gridSlice[r][c]).split('|');
        
        // C'est ici que la magie opère : On reconstruit la chaîne pour le frontend
        let newTasksInCell = tasksInCell.map(t => {
          if (!t.trim()) return t;
          let parts = t.split('@');
          let baseAbbr = parts[0].trim();
          let ampm = (parts.length >= 2 && (parts[1] === "AM" || parts[1] === "PM")) ? parts[1] : "";
          
          let status = (avancData[id] && avancData[id][baseAbbr]) ? avancData[id][baseAbbr] : "";
          let note = (notesData[id] && notesData[id][baseAbbr]) ? notesData[id][baseAbbr] : "";
          
          let res = baseAbbr;
          if (ampm) res += `@${ampm}`;
          if (status || note) res += `@${status}`; // On inclut le statut (même vide) si une note suit
          if (note) res += `@${note}`;
          return res;
        });
        gridSlice[r][c] = newTasksInCell.join('|');
      }
    }

    planningRows.push({
      id: id,
      status: gridMeta[r][1] || "",
      comment: gridMeta[r][2] || "",
      tasks: gridSlice[r],
      sheetRowIdx: r + 7  // FIX E5: row's 1-based sheet index — lets client-side save calls skip the full column-A scan
    });
  }

  // 4. RÉSERVES (Non modifié)
  // Replace section 4 in your gsGetPlanningWindow function with this:
  const repairs = {};
  if (shPlanReserves) {
    const lastRowPlanRes = shPlanReserves.getLastRow();
    if (lastRowPlanRes >= 7) {
      const gridMetaRes = shPlanReserves.getRange(7, 1, lastRowPlanRes - 6, 1).getValues();
      const gridSliceRes = shPlanReserves.getRange(7, colStartAbs, lastRowPlanRes - 6, windowSize).getValues();
      for (let r = 0; r < gridMetaRes.length; r++) {
        const id = gridMetaRes[r][0];
        if (!id || !logementsMeta[id]) continue;
        for (let c = 0; c < gridSliceRes[r].length; c++) {
          let cellVal = gridSliceRes[r][c].toString().trim();
          if (cellVal !== "") {
            let items = cellVal.split('|').map(i => i.trim()).filter(i => i !== "");
            
            // SECURITY: Hide any Autocontrôles ('A-') if the user is a client or in client view
            if (isClient) {
              items = items.filter(item => !item.startsWith('A-'));
            }
            
            if (items.length > 0) {
              const dateISO = headers.dates[c];
              if (!repairs[id]) repairs[id] = {};
              repairs[id][dateISO] = items;
            }
          }
        }
      }
    }
  }

  return { ok: true, window: { start: startDateStr, end: endDateStr }, headers: headers, logements: logementsMeta, planning: planningRows, repairs: repairs, notes: notesData };
}

function emptyResult(start, end) {
  return { ok: false, window: { start, end }, headers: {}, logements: {}, planning: [], repairs: {}, notes: {} };
}

// =========================================================
// Extracted from gsGetPlanningWindow's section "1. MÉTADONNÉES LOGEMENTS"
// so gsGetLogementsStructure() below can reuse the exact same parsing
// without also pulling in a date window. Behavior is unchanged — same
// column mapping per view, same batimentFilter support.
// =========================================================
function _buildLogementsMeta(shSource, view, batimentFilter) {
  const logementsMeta = {};
  const lastRowSource = shSource.getLastRow();
  if (lastRowSource >= 7) {
    const src = shSource.getRange(7, 2, lastRowSource - 6, 13).getValues();
    src.forEach(row => {
      const id = row[0];
      const bat = row[2];
      if (!id || (batimentFilter && bat !== batimentFilter)) return;

      let meta = { id: id, batiment: row[2], hall: row[3] };
      if (view === 'communs') {
        meta.etage = row[4];
        const colG = row[5] ? String(row[5]).trim() : "";
        const colH = row[6] ? String(row[6]).trim() : "";
        let desc = colG;
        if (colH !== "") {
          const fNum = parseInt(colH, 10);
          desc += " - " + (!isNaN(fNum) ? String(fNum).padStart(2, '0') : colH);
        }
        meta.description_part1 = colG; meta.description_part2 = colH; meta.description = desc.trim();
      } else if (view === 'facades') {
        meta.orientation = row[4]; meta.type = row[7];
        const colG = row[5] ? String(row[5]).trim() : "";
        const colH = row[6] ? String(row[6]).trim() : "";
        const gNum = parseInt(colG, 10);
        meta.trame_part1 = colG;
        meta.trame = ("Trame " + (!isNaN(gNum) ? String(gNum).padStart(2, '0') : colG) + (colH ? " - " + colH : "")).trim();
        meta.partie = colH;
        meta.trame_filter_val = ("Trame " + (!isNaN(gNum) ? String(gNum).padStart(2, '0') : colG)).trim();
      } else {
        meta.etage = row[4]; meta.empilement = row[5]; meta.porte = row[6]; meta.type = row[7];
        meta.type1 = row[7] ? "L" + String(row[7]).trim() : "";
        meta.config = row[8]; meta.surface = row[9]; meta.nom = row[10]; meta.prenom = row[11];
      }
      logementsMeta[id] = meta;
    });
  }
  return logementsMeta;
}

// =========================================================
// Structure complète (Bâtiment/Hall/Étage-Orientation/Porte-Description-
// Trame/ID, ...) d'une vue, SANS fenêtre de dates et SANS filtre Bâtiment
// — contrairement à gsGetPlanningWindow(), qui peut être restreint par
// batimentFilter (l'utilisateur peut avoir un filtre Bâtiment actif sur la
// grille). Utilisée par le sélecteur en cascade de la correction de
// référence ("Corriger" -> "La référence") côté Planning, pour que la
// liste des cibles proposées ne dépende jamais d'un filtre d'affichage.
// Retourne un TABLEAU (Object.values du dict interne), pour un usage
// direct avec .filter()/.map() côté client — même forme que rawData[view]
// dans EDL_Script_2.txt.
// =========================================================
function gsGetLogementsStructure(token, projectId, view) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const names = getSheetNames(view);
  const ssSource = SpreadsheetApp.openById(BATIMENTS_SS_ID);
  const shSource = ssSource.getSheetByName(names.source);
  if (!shSource) return [];

  const logementsMeta = _buildLogementsMeta(shSource, view, null);
  return Object.values(logementsMeta);
}

// =========================================================
// 2. Récupère les bornes temporelles réelles du projet (première et dernière date du planning)
// =========================================================

function getProjectDateBounds(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const ssPlanning = SpreadsheetApp.openById(PLANNING_SS_ID);
  const shPlan = ssPlanning.getSheetByName('Planning');
  
  const lastCol = shPlan.getLastColumn();
  if (lastCol < 8) return { start: new Date().toISOString(), end: new Date().toISOString() };

  // On récupère la ligne 2 (où sont vos dates) de la colonne 8 à la fin
  const dateValues = shPlan.getRange(2, 8, 1, lastCol - 7).getValues()[0];
  
  return {
    start: new Date(dateValues[0]).toISOString(),
    end: new Date(dateValues[dateValues.length - 1]).toISOString()
  };
}

// =========================================================
// 3. Fetches tasks from the "Taches" sheet starting from Row 7, Col B.
// =========================================================

function gsGetTasks(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  try {
    const id = PLANNING_SS_ID;
    const ss = SpreadsheetApp.openById(id);
    const sheet = ss.getSheetByName('Taches');
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow < 7) return [];

    // On récupère de la colonne A (1) à I (9)
    const data = sheet.getRange(7, 1, lastRow - 6, 9).getValues();
    
    return data.map((row, index) => ({
      rowIdx: index + 7,
      abbr: row[1],        // Col B (Index 1)
      type: row[2],        // Col C (Index 2)
      equipe: row[3],      // Col D (Index 3)
      desc: row[4],        // Col E (Index 4)
      descCourte: row[5],   // Col F (Index 5)
      bgColor: row[6],     // Col G (Index 6)
      duree: row[7],       // Col H (Index 7)
      unite: row[8]        // Col I (Index 8)
    })).filter(t => t.abbr && t.abbr.toString().trim() !== ""); 
    
  } catch (e) {
    console.error("Erreur gsGetTasks: " + e.message);
    return [];
  }
}

// =========================================================
// 3. Saves or Updates a task
// =========================================================

function gsSaveTask(token, taskData) {
  assertCanEdit_(token, taskData.projectId || null);

  const id = PLANNING_SS_ID;
  const ss = SpreadsheetApp.openById(id);
  const sheetTaches = ss.getSheetByName('Taches');

  const newAbbr = taskData.abbr.toString().trim();
  const newDescCourte = taskData.descCourte.toString().trim();
  const rowIdx = taskData.rowIdx ? parseInt(taskData.rowIdx) : null;

  // ABREVIATION VALIDATION
  if (newAbbr.includes('|') || newAbbr.includes('@')) {
    return { success: false, isUserNotice: true, message: "L'abréviation ne peut pas contenir les caractères '|' ou '@'." };
  }

  // --- 1. VÉRIFICATION DES DOUBLONS ---
  const lastRowTaches = sheetTaches.getLastRow();
  if (lastRowTaches >= 7) {
    // On récupère de la colonne B (2) à F (6) pour avoir l'abréviation et la description courte
    const existingData = sheetTaches.getRange(7, 2, lastRowTaches - 6, 5).getValues();
    
    for (let i = 0; i < existingData.length; i++) {
      const currentRow = i + 7;
      
      // Si on est en mode édition, on ignore la ligne qu'on est en train de modifier
      if (rowIdx && currentRow === rowIdx) continue; 

      const existingAbbr = existingData[i][0].toString().trim(); // Col B (Abréviation)
      const existingDesc = existingData[i][4].toString().trim(); // Col F (Desc Courte)

      // Vérification insensible à la casse
      if (existingAbbr.toLowerCase() === newAbbr.toLowerCase()) {
        return { success: false, isUserNotice: true, message: "L'abréviation '" + newAbbr + "' est déjà utilisée par une autre tâche." };
      }
      if (existingDesc.toLowerCase() === newDescCourte.toLowerCase()) {
        return { success: false, isUserNotice: true, message: "La description courte '" + newDescCourte + "' est déjà utilisée par une autre tâche." };
      }
    }
  }

  // --- 2. MISE À JOUR EN CASCADE (PLANNING) ---
  if (rowIdx) {
    const oldAbbr = sheetTaches.getRange(rowIdx, 2).getValue().toString().trim();
    const oldDiscipline = sheetTaches.getRange(rowIdx, 3).getValue().toString().trim();
    
    // VERROU : Empêcher le changement de discipline si c'est la dernière tâche EDL/OPR
    const upperOldDisc = oldDiscipline.toUpperCase();
    const upperNewDisc = taskData.type.toString().trim().toUpperCase();

    if ((upperOldDisc === "EDL" || upperOldDisc === "OPR") && upperOldDisc !== upperNewDisc) {
      if (lastRowTaches >= 7) {
        const allDisciplines = sheetTaches.getRange(7, 3, lastRowTaches - 6, 1).getValues();
        let count = 0;
        for (let i = 0; i < allDisciplines.length; i++) {
          if (allDisciplines[i][0].toString().trim().toUpperCase() === upperOldDisc) count++;
        }
        if (count <= 1) {
          return { success: false, isUserNotice: true, message: "Action impossible : Vous ne pouvez pas modifier le corps d'état de cette tâche car c'est la dernière associée à '" + oldDiscipline + "'." };
        }
      }
    }
    
    // CASCADE : Si l'abréviation a changé, on met à jour le planning en respectant les séparateurs "|"
    if (oldAbbr !== "" && oldAbbr !== newAbbr) {
      const planSheetNames = ['Planning', 'Planning Communs', 'Planning Facades']; // Les 3 vues
      
      planSheetNames.forEach(sheetName => {
        const sheetPlan = ss.getSheetByName(sheetName);
        if (!sheetPlan) return; // Ignore si l'onglet n'existe pas

        const lastRowPlan = sheetPlan.getLastRow();
        const lastColPlan = sheetPlan.getLastColumn();
        
        if (lastRowPlan >= 7 && lastColPlan >= 8) {
          const planRange = sheetPlan.getRange(7, 8, lastRowPlan - 6, lastColPlan - 7);
          const planData = planRange.getValues();
          let updateCount = 0;

          for (let r = 0; r < planData.length; r++) {
            for (let c = 0; c < planData[r].length; c++) {
              let cellVal = planData[r][c].toString().trim();
              if (cellVal !== "") {
                let parts = cellVal.split('|');
                let changed = false;
                
                for (let p = 0; p < parts.length; p++) {
                  // Separate the base task from its modifier (e.g., "PLOMB" and "@AM")
                  let baseTask = parts[p].split('@')[0].trim();
                  let modifier = parts[p].includes('@') ? '@' + parts[p].split('@')[1].trim() : '';

                  if (baseTask === oldAbbr) {
                    parts[p] = newAbbr + modifier; // Applies the new name but keeps @AM/@PM
                    changed = true;
                  }
                }
                
                if (changed) {
                  planData[r][c] = parts.join('|');
                  updateCount++;
                }
              }
            }
          }
          if (updateCount > 0) planRange.setValues(planData);
        }
      });
    }
  }

  // --- 3. MISE À JOUR SYNCHRONISÉE DES CYCLES ---
  if (taskData.rowIdx && taskData.oldAbbr) {
    const sheetCycles = ss.getSheetByName('Cycles');
    const lastRow = sheetCycles.getLastRow();
  
    // On récupère la nouvelle couleur définie pour la tâche
    const newColor = taskData.bgColor || taskData.couleur || "#e2e8f0";

    if (lastRow >= 7) {
      const range = sheetCycles.getRange(7, 2, lastRow - 6, 4); // Nom, Desc, JSON, Aperçu
      const values = range.getValues();
      let modified = false;

      for (let i = 0; i < values.length; i++) {
        let sequenceJson = values[i][2];
        if (!sequenceJson) continue;

        try {
          let sequence = JSON.parse(sequenceJson);
          let cycleChanged = false;

          sequence = sequence.map(step => {
            // Si cette étape du cycle correspond à la tâche qu'on modifie
            if (step.taskAbbr === taskData.oldAbbr) {
              cycleChanged = true;
              return {
                ...step,
                taskAbbr: taskData.abbr, // Nouvelle Abrév.
                duree: taskData.duree,    // Nouvelle Durée
                color: newColor           // MISE À JOUR DE LA COULEUR ICI
              };
            }
            return step;
          });

          if (cycleChanged) {
            values[i][2] = JSON.stringify(sequence);
            // Mise à jour de l'aperçu visuel (index 3)
            values[i][3] = sequence.map(s => s.taskAbbr).join(" > ");
            modified = true;
          }
        } catch (e) {
          console.error("Erreur parsing JSON cycle ligne " + (i+7));
        }
      }

      if (modified) {
        range.setValues(values);
      }
    }
  }

  // --- 4. ENREGISTREMENT ---
  const rowValues = [newAbbr, taskData.type, taskData.equipe, taskData.desc, taskData.descCourte, taskData.couleur || taskData.bgColor, taskData.duree, taskData.unite];
  
  if (rowIdx) {
    sheetTaches.getRange(rowIdx, 2, 1, 8).setValues([rowValues]);
  } else {
    let targetRow = Math.max(sheetTaches.getLastRow() + 1, 7);
    sheetTaches.getRange(targetRow, 2, 1, 8).setValues([rowValues]);
  }

  try {
    syncTaskHeaders(taskData.oldAbbr, taskData.abbr);
  } catch (e) {
    console.error("Erreur de synchro des colonnes : " + e.message);
  }

  return true;
}

// =========================================================
// 4. Supprime une tâche et ses colonnes associées dans Recap et Avancement
// =========================================================

function gsDeleteTask(token, rowIdx, forceDelete = false, colsCacheJson) {
  assertCanEdit_(token, null);

  const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
  const sheetTaches = ss.getSheetByName('Taches');
  const planSheetNames = ['Planning', 'Planning Communs', 'Planning Facades'];

  const row = parseInt(rowIdx);

  // Récupération de l'abréviation et de la discipline
  const rowData      = sheetTaches.getRange(row, 2, 1, 2).getValues()[0];
  const abbrToDelete = rowData[0].toString().trim();
  const discipline   = rowData[1].toString().trim();
  const upperDisc    = discipline.toUpperCase();

  // Si on est en mode "Force Delete" (Le client a validé l'alerte de suppression de données)
  if (forceDelete && colsCacheJson) {
    try {
      const colsCache = JSON.parse(colsCacheJson);
      colsCache.forEach(item => {
        const sh = ss.getSheetByName(item.sheetName);
        if (sh) sh.deleteColumn(item.col);
      });
      sheetTaches.deleteRow(row);
      return true;
    } catch(e) {
      // En cas de cache malformé, on continue vers les vérifications standards
    }
  }

  // --- 1. VÉRIFICATIONS DE SÉCURITÉ ---
  
  // A. Vérification de la protection Système (EDL / OPR)
  if (upperDisc === "EDL" || upperDisc === "OPR") {
    const lastRowTaches = sheetTaches.getLastRow();
    if (lastRowTaches >= 7) {
      const allDisciplines = sheetTaches.getRange(7, 3, lastRowTaches - 6, 1).getValues();
      let count = 0;
      for (let i = 0; i < allDisciplines.length; i++) {
        if (allDisciplines[i][0].toString().trim().toUpperCase() === upperDisc) count++;
      }
      if (count <= 1) return { success: false, isUserNotice: true, message: "Il doit rester au moins une tâche associée à la discipline <b>" + discipline + "</b>." };
    }
  }

  // B. NOUVEAU : Vérification présence dans les Cycles
  const sheetCycles = ss.getSheetByName('Cycles');
  if (sheetCycles) {
    const lastRowCycles = sheetCycles.getLastRow();
    if (lastRowCycles >= 7) {
      // On récupère le Nom (Col B / index 0) et le JSON de la séquence (Col D / index 2)
      const cyclesData = sheetCycles.getRange(7, 2, lastRowCycles - 6, 3).getValues();
      let usedInCycles = [];

      for (let i = 0; i < cyclesData.length; i++) {
        const cycleName = cyclesData[i][0].toString().trim();
        const sequenceJson = cyclesData[i][2];

        if (sequenceJson) {
          try {
            // On décode le JSON de la séquence pour vérifier les tâches à l'intérieur
            const sequence = JSON.parse(sequenceJson);
            // On cherche si au moins une étape utilise notre abréviation
            const isUsed = sequence.some(step => step.taskAbbr === abbrToDelete);
            
            if (isUsed) {
              usedInCycles.push(cycleName);
            }
          } catch (e) {
            console.warn("JSON invalide ignoré lors de la vérification de suppression sur le cycle :", cycleName);
          }
        }
      }

      // Si la tâche est utilisée dans au moins un cycle, on bloque tout
      if (usedInCycles.length > 0) {
        return { success: false, isUserNotice: true, message: `La tâche <b>${abbrToDelete}</b> fait partie des cycles suivants : <b>${usedInCycles.join(", ")}</b>.<br><br>Veuillez d'abord la retirer de ces cycles.` };
      }
    }
  }

  // C. Vérification présence dans TOUS les plannings
  planSheetNames.forEach(sheetName => {
    const sheetPlan = ss.getSheetByName(sheetName);
    if (!sheetPlan) return;
    const lastRowPlan = sheetPlan.getLastRow();
    const lastColPlan = sheetPlan.getLastColumn();
    if (lastRowPlan >= 7 && lastColPlan >= 8) {
      const planData = sheetPlan.getRange(7, 8, lastRowPlan - 6, lastColPlan - 7).getValues();
      for (let r = 0; r < planData.length; r++) {
        for (let c = 0; c < planData[r].length; c++) {
          if (planData[r][c].toString().split('|').includes(abbrToDelete)) {
            return { success: false, isUserNotice: true, message: `La tâche <b>${abbrToDelete}</b> est actuellement utilisée dans le planning <b>${sheetName}</b>.` };
          }
        }
      }
    }
  });

  // --- 2. GESTION DES COLONNES RECAP, AVANCEMENT ET NOTES ---
  const sheetsToClean = ['Recap', 'Recap Communs', 'Recap Facades', 'avancement', 'avancement Communs', 'Avancement Facades', 'Notes', 'Notes Communs', 'Notes Facades'];
  let columnsToDelete  = [];
  let foundDataLocations = [];

  sheetsToClean.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const lastCol = sh.getLastColumn();
    const lastRow = sh.getLastRow();
    if (lastCol < 2 || lastRow < 6) return;

    const allData  = sh.getRange(6, 2, Math.max(lastRow - 5, 1), lastCol - 1).getValues();
    const headers  = allData[0];
    const colIdx   = headers.indexOf(abbrToDelete);
    if (colIdx === -1) return;

    const colNumber = colIdx + 2;

    if (!forceDelete && allData.length > 1) {
      const hasData = allData.slice(1).some(r => r[colIdx] !== "" && r[colIdx] !== null);
      if (hasData) foundDataLocations.push(`Feuille "${name}" (Colonne ${abbrToDelete})`);
    }
    columnsToDelete.push({ sheet: sh, sheetName: name, col: colNumber });
  });

  if (foundDataLocations.length > 0 && !forceDelete) {
    const colsCache = JSON.stringify(columnsToDelete.map(c => ({ sheetName: c.sheetName, col: c.col })));
    return { success: false, isUserNotice: true, isDataFound: true, locations: foundDataLocations.join(" et "), colsCache: colsCache };
  }

  // --- 3. EXÉCUTION DE LA SUPPRESSION ---
  columnsToDelete.forEach(item => item.sheet.deleteColumn(item.col));
  sheetTaches.deleteRow(row);
  return true;
}

// =========================================================
// 5. DISCIPLINE MANAGEMENT (Backend)
// =========================================================

function gsGetDisciplines(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  try {
    const id = PLANNING_SS_ID;
    const ss = SpreadsheetApp.openById(id);
    const sheet = ss.getSheetByName('Disciplines');
    
    if (!sheet) return [{ name: "Erreur : Onglet 'Disciplines' introuvable" }];

    const lastRow = sheet.getLastRow();
    // Si la dernière ligne est < 7, il n'y a pas de données
    if (lastRow < 7) return [];

    // On lit à partir de la ligne 7, colonne 2 (B), sur (lastRow - 6) lignes
    const values = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    const result = [];

    for (let i = 0; i < values.length; i++) {
      const cellValue = values[i][0];
      // On vérifie que la cellule n'est pas vide
      if (cellValue && cellValue.toString().trim() !== "") {
        result.push({
          rowIdx: i + 7, // On garde l'index réel de la ligne pour la suppression/édition
          name: cellValue.toString().trim()
        });
      }
    }
    
    return result;

  } catch (e) {
    console.error("Erreur gsGetDisciplines: " + e.message);
    return [{ name: "Erreur Serveur : " + e.message }];
  }
}

// =========================================================
// SAUVEGARDE RAPIDE (Met à jour Disciplines et libère l'UI)
// =========================================================
function gsSaveDiscipline(token, newName, rowIdx) {
  assertCanEdit_(token, null);

  const id1 = PLANNING_SS_ID;
  const ss1 = SpreadsheetApp.openById(id1);
  const sheetDisc = ss1.getSheetByName('Disciplines');
  const cleanName = newName.trim();
  const lastRow = sheetDisc.getLastRow();
  
  // --- 1. VÉRIFICATION DES DOUBLONS ---
  let existingNames = [];
  if (lastRow >= 7) {
    existingNames = sheetDisc.getRange(7, 2, lastRow - 6, 1).getValues().flat();
  }

  const isDuplicate = existingNames.some((name, index) => {
    if (rowIdx && (index + 7) === parseInt(rowIdx)) return false;
    return name.toString().toLowerCase() === cleanName.toLowerCase();
  });

  if (isDuplicate) {
    return { success: false, isUserNotice: true, message: "Cette discipline existe déjà." };
  }

  let oldName = null;

  // --- 2. ENREGISTREMENT ---
  if (rowIdx) {
    // Mode Édition : on stocke l'ancien nom pour la cascade
    oldName = sheetDisc.getRange(parseInt(rowIdx), 2).getValue().toString().trim();
    const upperOldName = oldName.toUpperCase();
    
    if (upperOldName === "EDL" || upperOldName === "OPR") {
      return { success: false, isUserNotice: true, message: "Action impossible : La discipline <b>" + oldName + "</b> est protégée." };
    }
    sheetDisc.getRange(parseInt(rowIdx), 2).setValue(cleanName);
  } else {
    // Mode Ajout
    let targetRow = (lastRow < 7) ? 7 : lastRow + 1;
    sheetDisc.getRange(targetRow, 2).setValue(cleanName);
  }

  // --- 3. TRI AUTOMATIQUE ---
  const newLastRow = sheetDisc.getLastRow();
  if (newLastRow >= 7) {
    sheetDisc.getRange(7, 2, newLastRow - 6, 1).sort({column: 2, ascending: true});
  }
  
  // On renvoie l'ancien et le nouveau nom pour déclencher la cascade en arrière-plan
  return { oldName: oldName, newName: cleanName };
}


// =========================================================
// MISE À JOUR EN CASCADE (Exécutée de manière asynchrone)
// =========================================================
function gsCascadeDisciplineUpdate(token, oldName, newName) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  if (!oldName || !newName || oldName === newName) return false;

  // --- A. ONGLET "Taches" -> COLONNE C (Index 3), LIGNE 7+ ---
  const ssPlanning = SpreadsheetApp.openById(PLANNING_SS_ID);
  const sheetTaches = ssPlanning.getSheetByName('Taches');
  if (sheetTaches) {
    const lastRowTaches = sheetTaches.getLastRow();
    if (lastRowTaches >= 7) {
      const rangeTaches = sheetTaches.getRange(7, 3, lastRowTaches - 6, 1); // Colonne C = 3 
      const dataTaches = rangeTaches.getValues();
      let changedTaches = false;
      
      for (let i = 0; i < dataTaches.length; i++) {
        if (dataTaches[i][0].toString().trim() === oldName) {
          dataTaches[i][0] = newName;
          changedTaches = true;
        }
      }
      if (changedTaches) rangeTaches.setValues(dataTaches);
    }
  }

  // --- B. CLASSEUR DES RÉSERVES -> COLONNE D (Index 4), LIGNE 7+ ---
  // On ouvre le second classeur grâce à RESERVES_SS_ID (RESERVES_SPREADSHEET_ID)
  const ssReserves = SpreadsheetApp.openById(RESERVES_SS_ID); 
  const targetSheets = [
    "AutoControle", "Reserves", 
    "AutoControle Communs", "Reserves Communs", 
    "AutoControle Facades", "Reserves Facades"
  ];

  targetSheets.forEach(sheetName => {
    const currentSheet = ssReserves.getSheetByName(sheetName);
    if (currentSheet) {
      const lastRowRep = currentSheet.getLastRow();
      if (lastRowRep >= 7) {
        const rangeRep = currentSheet.getRange(7, 4, lastRowRep - 6, 1); // Colonne D = 4
        const dataRep = rangeRep.getValues();
        let changedRep = false;
        
        for (let j = 0; j < dataRep.length; j++) {
          if (dataRep[j][0].toString().trim() === oldName) {
            dataRep[j][0] = newName;
            changedRep = true;
          }
        }
        if (changedRep) rangeRep.setValues(dataRep);
      }
    }
  });

  return true;
}

function gsDeleteDiscipline(token, rowIdx) {
  assertCanEdit_(token, null);

  const id1 = PLANNING_SS_ID;
  const ss1 = SpreadsheetApp.openById(id1);
  const sheetDisc = ss1.getSheetByName('Disciplines');
  const sheetTaches = ss1.getSheetByName('Taches');

  // 1. Récupérer le nom de la discipline à supprimer
  const disciplineName = sheetDisc.getRange(parseInt(rowIdx), 2).getValue().toString().trim();
  const upperName = disciplineName.toUpperCase();

  // VERROU 1 : Protection stricte EDL et OPR
  if (upperName === "EDL" || upperName === "OPR") {
    return { success: false, isUserNotice: true, message: "Action impossible : La discipline <b>" + disciplineName + "</b> est requise par le système et ne peut pas être supprimée." };
  }

  // 2. Vérifier si elle est utilisée dans "Taches"
  const lastRowTaches = sheetTaches.getLastRow();
  if (lastRowTaches >= 7) {
    // La discipline est en colonne C (index 3) dans Taches
    const dataTaches = sheetTaches.getRange(7, 3, lastRowTaches - 6, 1).getValues(); 
    const isUsedInTaches = dataTaches.some(row => row[0].toString().trim() === disciplineName);
    if (isUsedInTaches) {
      return { success: false, isUserNotice: true, message: "Impossible de supprimer : cette discipline est actuellement utilisée dans la liste des Tâches." };
    }
  }

  // 3. OPTIMISATION : Vérification dans l'onglet de synthèse des Réserves
  const id2 = RESERVES_SS_ID;
  const ss2 = SpreadsheetApp.openById(id2);
  const summarySheet = ss2.getSheetByName('Summary');

  if (!summarySheet) {
    throw new Error("Erreur Serveur : L'onglet 'Disciplines_Summary' est introuvable dans le classeur des Réserves.");
  }

  // On récupère toutes les données de la synthèse d'un seul coup (1 appel API au lieu de 6)
  const summaryData = summarySheet.getDataRange().getValues();
  const usedInSheets = [];

  // Mappage des index de colonnes (0 à 5) avec le nom réel des onglets
  const columnToSheetName = [
    "AutoControle",           // Colonne A (0)
    "Reserves",               // Colonne B (1)
    "AutoControle Communs",   // Colonne C (2)
    "Reserves Communs",       // Colonne D (3)
    "AutoControle Facades",   // Colonne E (4)
    "Reserves Facades"        // Colonne F (5)
  ];

  // On scanne les 6 colonnes de la matrice récupérée
  for (let col = 0; col < 6; col++) {
    let foundInColumn = false;
    for (let row = 0; row < summaryData.length; row++) {
      if (summaryData[row][col] && summaryData[row][col].toString().trim() === disciplineName) {
        foundInColumn = true;
        break; // Pas besoin de continuer à chercher dans cette colonne
      }
    }
    // Si trouvée, on mémorise le nom de l'onglet
    if (foundInColumn) {
      usedInSheets.push(columnToSheetName[col]);
    }
  }

  // S'il y a des occurrences, on bloque et on liste tous les onglets concernés
  if (usedInSheets.length > 0) {
    return { success: false, isUserNotice: true, message: "Impossible de supprimer : la discipline <b>" + disciplineName + "</b> est encore utilisée dans : " + usedInSheets.join(", ") + "." };
  }

  // 4. Si non utilisée nulle part, on supprime définitivement
  sheetDisc.deleteRow(parseInt(rowIdx));
  return true;
}

// =========================================================
// 6. Réorganise l'ordre des tâches dans la feuille "Taches"
// =========================================================

function gsReorderTasks(token, orderedRowIndices) {
  assertCanEdit_(token, null);
  try {
    const id = PLANNING_SS_ID;
    const ss = SpreadsheetApp.openById(id);
    const sheetTaches = ss.getSheetByName('Taches');
    
    const lastRow = sheetTaches.getLastRow();
    if (lastRow < 7) return false;
    
    // On récupère de la colonne A (1) à I (9), à partir de la ligne 7
    const range = sheetTaches.getRange(7, 1, lastRow - 6, 9);
    const currentData = range.getValues();
    
    // On reconstruit le tableau de données dans le nouvel ordre
    const newData = [];
    
    for (let i = 0; i < orderedRowIndices.length; i++) {
      const oldRowIdx = orderedRowIndices[i];
      // L'index dans le tableau JS est (Row - 7)
      const arrayIdx = oldRowIdx - 7; 
      
      if (currentData[arrayIdx]) {
        newData.push(currentData[arrayIdx]);
      }
    }
    
    // Sécurité : On vérifie qu'on n'a pas perdu de données en route
    if (newData.length === currentData.length) {
      range.setValues(newData);
      return true;
    } else {
      throw new Error("Erreur d'intégrité : le nombre de lignes ne correspond pas.");
    }
    
  } catch (e) {
    console.error("Erreur gsReorderTasks: " + e.message);
    throw new Error(e.message);
  }
}

// =========================================================
// 7. GESTION DES CYCLES (BACKEND)
// =========================================================

function gsGetCycles(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  try {
    const id = PLANNING_SS_ID;
    const ss = SpreadsheetApp.openById(id);
    const sheet = ss.getSheetByName('Cycles');
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow < 7) return [];

    // Récupération de B (2) à E (5) : Nom, Description, Séquence JSON, Aperçu
    const data = sheet.getRange(7, 2, lastRow - 6, 4).getValues();
    
    return data.map((row, index) => {
      let sequence = [];
      try {
        if (row[2]) {
          sequence = normalizeCycleSequence(JSON.parse(row[2]));
        }
      } catch(e) { console.warn("JSON invalide pour le cycle ligne " + (index+7)); }

      return {
        rowIdx: index + 7,
        nom: row[0],
        description: row[1],
        sequence: sequence,
        apercu: row[3]
      };
    }).filter(c => c.nom && c.nom.toString().trim() !== "");
  } catch (e) {
    console.error("Erreur gsGetCycles: " + e.message);
    return [];
  }
}

function gsSaveCycle(token, cycleData) {
  assertCanEdit_(token, null);

  const id = PLANNING_SS_ID;
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName('Cycles');

  const cleanNom = cycleData.nom.toString().trim();
  const rowIdx = cycleData.rowIdx ? parseInt(cycleData.rowIdx) : null;
  cycleData.sequence = normalizeCycleSequence(cycleData.sequence);
  const sequenceJSON = JSON.stringify(cycleData.sequence);

  // Générer un aperçu visuel texte simple (ex: PLB > ELEC > PEIN)
  const apercu = cycleData.sequence.map(s => s.taskAbbr).join(" > ")

  // 1. Vérification des doublons de nom
  const lastRow = sheet.getLastRow();
  if (lastRow >= 7) {
    const existingNames = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    for (let i = 0; i < existingNames.length; i++) {
      if (rowIdx && (i + 7) === rowIdx) continue;
      if (existingNames[i][0].toString().trim().toLowerCase() === cleanNom.toLowerCase()) {
        return { success: false, isUserNotice: true, message: "Un cycle nommé '" + cleanNom + "' existe déjà." };
      }
    }
  }

  const rowValues = [cleanNom, cycleData.description, sequenceJSON, apercu];

  // 2. Enregistrement
  if (rowIdx) {
    sheet.getRange(rowIdx, 2, 1, 4).setValues([rowValues]);
  } else {
    let targetRow = Math.max(lastRow + 1, 7);
    sheet.getRange(targetRow, 2, 1, 4).setValues([rowValues]);
  }
  return true;
}

function gsDeleteCycle(token, rowIdx) {
  assertCanEdit_(token, null);

  const id = PLANNING_SS_ID;
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName('Cycles');

  sheet.deleteRow(parseInt(rowIdx));
  return true;
}

// =========================================================
// 8. Synchronise les en-têtes des feuilles Recap et Avancement
// =========================================================

function syncTaskHeaders(oldAbbr, newAbbr) {
  
  const id = PLANNING_SS_ID;
  const ss = SpreadsheetApp.openById(id);
  const sheetsToSync = ['Recap', 'Recap Communs', 'Recap Facades', 'avancement', 'avancement Communs', 'Avancement Facades', 'Notes', 'Notes Communs', 'Notes Facades'];
  const HEADER_ROW = 6; // Ligne où se trouvent les abréviations
  const START_COL = 2;  // On commence à chercher à partir de la colonne B (A = IDs)

  sheetsToSync.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    const lastCol = Math.max(sheet.getLastColumn(), START_COL);
    const headersRange = sheet.getRange(HEADER_ROW, START_COL, 1, lastCol);
    const headers = headersRange.getValues()[0];
    
    let foundIndex = -1;
    if (oldAbbr) {
      // On cherche l'ancienne abréviation pour la mettre à jour
      foundIndex = headers.indexOf(oldAbbr);
    }

    if (foundIndex !== -1) {
      // CAS 1 : Mise à jour d'une tâche existante
      sheet.getRange(HEADER_ROW, START_COL + foundIndex).setValue(newAbbr);
    } else {
      // CAS 2 : Nouvelle tâche (ou ancienne non trouvée)
      // On vérifie d'abord si newAbbr n'existe pas déjà
      if (headers.indexOf(newAbbr) === -1) {
        const nextCol = sheet.getLastColumn() + 1;
        sheet.getRange(HEADER_ROW, nextCol).setValue(newAbbr);
      }
    }
  });
}

// =========================================================
// 9. Récupère la liste combinée des tâches et des cycles pour le menu d'ajout
// =========================================================

function gsGetComponentsForMenu(token, projectId) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const tasks = gsGetTasks(); // Votre fonction existante
  const cycles = gsGetCycles(); // Votre fonction existante
  
  return {
    tasks: tasks,
    cycles: cycles
  };
}

// =========================================================
// 10. Analyse la faisabilité de l'intervention et remonte les conflits au frontend.
// =========================================================

function gsAnalyzeIntervention(token, payload) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  try {
    const names = getSheetNames(payload.currentView);
    
    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    const shRecap = ss.getSheetByName(names.recap);
    const shAvanc = ss.getSheetByName(names.avancement);
    const shPlan  = ss.getSheetByName(names.plan);
    const shNotes = ss.getSheetByName(names.notes);

    // Chargement des grilles et en-têtes
    const headers = shRecap.getRange(6, 2, 1, shRecap.getLastColumn() - 1).getValues()[0];
    const ids     = shRecap.getRange(7, 1, shRecap.getLastRow() - 6, 1).getValues().map(r => String(r[0]));

    const lastColPlan   = shPlan.getLastColumn();
    const planDatesRaw  = shPlan.getRange(2, 8, 1, lastColPlan - 7).getValues()[0];
    const workingDaysRaw = shPlan.getRange(1, 8, 1, lastColPlan - 7).getValues()[0];
    const tz = ss.getSpreadsheetTimeZone();

    // Previously each (cell × step) made 3 individual getRange calls — up to 150 API calls
    // for 10 cells × 5 steps. Now we index into these in-memory arrays instead.
    const recapData = shRecap.getDataRange().getDisplayValues();
    const avancData = shAvanc.getDataRange().getValues();
    const notesData = shNotes ? shNotes.getDataRange().getDisplayValues() : null;

    // Previously the working-day check was an O(n) scan of planDatesRaw run inside the
    // date-building while-loop — O(n²) total. The Map makes each lookup O(1).
    const workingDayMap = new Map();
    planDatesRaw.forEach((d, i) => {
      if (d instanceof Date) {
        workingDayMap.set(Utilities.formatDate(d, tz, "yyyy-MM-dd"), workingDaysRaw[i] != 0);
      }
    });

    // Récupération des durées des tâches
    const shTaches = ss.getSheetByName('Taches');
    const taskDurations = {};
    if (shTaches.getLastRow() >= 7) {
      shTaches.getRange(7, 2, shTaches.getLastRow() - 6, 7).getValues().forEach(r => {
        if (r[0]) taskDurations[r[0].toString().trim()] = parseInt(r[6]) || 1;
      });
    }

    // Construction de la séquence
    let sequence = [];
    if (payload.type === 'task') {
      let baseAbbr  = payload.itemName.split('@')[0];
      let dureeToUse = payload.customDuree || taskDurations[baseAbbr] || 1;
      sequence.push({ id: 'step_1', taskAbbr: payload.itemName, dependsOn: '', linkType: 'START', lag: 0, duree: dureeToUse });
    } else {
      sequence = gsGetCycleSequence(payload.itemName);
    }

    const response = { validActions: [], conflicts: [] };

    payload.cells.forEach(cell => {
      let rowIdx = ids.indexOf(String(cell.logementId));
      if (rowIdx === -1) return;

      let computedDates = {};

      sequence.forEach(step => {
        let baseTask = step.taskAbbr.includes('@') ? step.taskAbbr.split('@')[0] : step.taskAbbr;
        let colIdx   = headers.indexOf(baseTask);
        if (colIdx === -1) return;

        let startDate;
        let lag = parseInt(step.lag) || 0;

        if (!step.dependsOn || !computedDates[step.dependsOn]) {
          startDate = new Date(cell.date);
          if (lag !== 0) startDate = addWorkingDays(startDate, lag, workingDaysRaw, planDatesRaw, tz);
        } else {
          let pred = computedDates[step.dependsOn];
          if (step.linkType === 'SS') {
            startDate = addWorkingDays(pred.start, lag, workingDaysRaw, planDatesRaw, tz);
          } else {
            startDate = addWorkingDays(pred.end, lag + 1, workingDaysRaw, planDatesRaw, tz);
          }
        }

        startDate = addWorkingDays(startDate, 0, workingDaysRaw, planDatesRaw, tz);

        let duration = parseInt(step.duree) || taskDurations[baseTask] || 1;
        let endDate  = addWorkingDays(startDate, duration - 1, workingDaysRaw, planDatesRaw, tz);
        computedDates[step.id] = { start: startDate, end: endDate };

        // FIX A2: Use the pre-built Map for O(1) working-day lookup instead of
        // rescanning planDatesRaw from index 0 on every loop iteration.
        let taskDates = [];
        let curr = new Date(startDate);
        let daysAdded = 0;
        while (daysAdded < duration) {
          const dStr = Utilities.formatDate(curr, tz, "yyyy-MM-dd");
          if (workingDayMap.get(dStr) !== false) {
            taskDates.push(dStr);
            daysAdded++;
          }
          curr.setDate(curr.getDate() + 1);
        }

        let rIdx = rowIdx + 7;
        let cIdx = colIdx + 2;

        // FIX A1: Index into in-memory arrays — zero extra API calls per cell/step.
        const existingDate = recapData[rIdx - 1]?.[cIdx - 1] ?? "";
        const valAvanc     = avancData[rIdx - 1]?.[cIdx - 1] ?? "";
        const noteVal      = notesData ? (notesData[rIdx - 1]?.[cIdx - 1] ?? "") : "";

        let action = {
          logementId: cell.logementId,
          task:       step.taskAbbr,
          baseTask:   baseTask,
          newDate:    Utilities.formatDate(startDate, tz, "yyyy-MM-dd"),
          allDates:   taskDates,
          duration:   duration,
          status:     valAvanc ? String(valAvanc) : "Non commencé",
          note:       noteVal  ? String(noteVal)  : "",
          rowIdx:     rIdx,
          colIdx:     cIdx,
          oldValue:   existingDate
        };

        if (existingDate && existingDate !== "") {
          action.status = valAvanc && valAvanc !== "" ? String(valAvanc) : "Vide";
          response.conflicts.push(action);
        } else {
          response.validActions.push(action);
        }
      });
    });

    return { success: true, validActions: response.validActions, conflicts: response.conflicts, currentView: payload.currentView };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// =========================================================
// 11. Exécute l'écriture finale des dates et tâches dans les feuilles Google Sheets.
// =========================================================

function gsExecuteIntervention(token, actions, currentView) {
  assertCanEdit_(token, null);
  try {
    const names = getSheetNames(currentView);

    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);

    const shPlan = ss.getSheetByName(names.plan);
    const shRecap = ss.getSheetByName(names.recap);
    const shAvanc = ss.getSheetByName(names.avancement);
    const shNotes = ss.getSheetByName(names.notes);

    // 1. CHARGEMENT EN MASSE
    const rangePlan = shPlan.getDataRange();
    const planData = rangePlan.getValues();

    const rangeRecap = shRecap.getDataRange();
    const recapData = rangeRecap.getDisplayValues();

    const rangeAvanc = shAvanc.getDataRange();
    const avancData = rangeAvanc.getValues();

    let notesData = null;
    let rangeNotes = null;
    if (shNotes) {
        rangeNotes = shNotes.getDataRange();
        notesData = rangeNotes.getValues();
    }

    const tz = ss.getSpreadsheetTimeZone();
    const planDatesRaw = planData[1].slice(7); // Extraction dates
    
    let dateColMap = {};
    planDatesRaw.forEach((d, i) => {
      if (d instanceof Date) {
        dateColMap[Utilities.formatDate(d, tz, "yyyy-MM-dd")] = i + 7;
      }
    });

    const planIds = planData.map(r => String(r[0]));

    let planModified = false;
    let recapModified = false;
    let avancModified = false;
    let notesModified = false;

    // 2. MODIFICATIONS EN MÉMOIRE
    actions.forEach(action => {
      let planRowIdx = planIds.indexOf(String(action.logementId));
      if (planRowIdx === -1) return;

      // A. PLANNING : Suppression de l'existant si mode replace
      if (action.mode === 'replace') {
        for(let c = 7; c < planData[planRowIdx].length; c++) {
          if (planData[planRowIdx][c]) {
            let cellTasks = planData[planRowIdx][c].toString().split('|').filter(t => t.trim() !== '');
            let originalLength = cellTasks.length;
            cellTasks = cellTasks.filter(t => (t.includes('@') ? t.split('@')[0] : t).trim() !== action.baseTask);
            if (cellTasks.length !== originalLength) {
              planData[planRowIdx][c] = cellTasks.join('|');
              planModified = true;
            }
          }
        }
      }

      // Ajout de la tâche aux nouvelles dates
      let validDates = (action.allDates && Array.isArray(action.allDates)) ? action.allDates : [action.newDate];
      validDates.forEach(dateStr => {
        let colIdx = dateColMap[dateStr];
        // Si la date est au-delà du calendrier créé dans l'Excel, colIdx sera undefined. 
        // L'action est ignorée au lieu de faire planter le script.
        if (colIdx !== undefined) {
          let cellTasks = planData[planRowIdx][colIdx] ? planData[planRowIdx][colIdx].toString().split('|') : [];
          if (!cellTasks.includes(action.task)) {
            cellTasks.push(action.task);
            planData[planRowIdx][colIdx] = cellTasks.filter(t => t.trim() !== '').join('|');
            planModified = true;
          }
        }
      });

      // B. RECAP, AVANCEMENT, NOTES
      let r = action.rowIdx - 1;
      let c = action.colIdx - 1;

      let newDatesStr = validDates.map(d => {
        let p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0];
      }).join(' | ');

      if (recapData[r] && recapData[r][c] !== undefined) {
          if (action.mode === 'keep') {
              let currentRecap = String(recapData[r][c] || "").replace(/^'/, '');
              let finalStr = currentRecap ? currentRecap + " | " + newDatesStr : newDatesStr;
              recapData[r][c] = "'" + finalStr;
          } else {
              recapData[r][c] = "'" + newDatesStr;
          }
          recapModified = true;
      }

      if (avancData[r] && avancData[r][c] !== undefined) {
          avancData[r][c] = "Planifié";
          avancModified = true;
      }

      if (action.noteAction === 'clear' && notesData && notesData[r] && notesData[r][c] !== undefined) {
          notesData[r][c] = "";
          notesModified = true;
      }
    });

    // 3. ÉCRITURE EN MASSE
    if (planModified) rangePlan.setValues(planData);
    if (recapModified) rangeRecap.setValues(recapData);
    if (avancModified) rangeAvanc.setValues(avancData);
    if (notesModified && rangeNotes) rangeNotes.setValues(notesData);

    return true;
  } catch (e) {
    throw new Error(e.toString());
  }
}

// =========================================================
// 12. Récupère la séquence JSON d'un cycle à partir de son nom
// =========================================================

function gsGetCycleSequence(cycleName) {
  
  const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
  const sheet = ss.getSheetByName('Cycles');
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 7) return [];

  const data = sheet.getRange(7, 2, lastRow - 6, 3).getValues(); // Nom, Desc, JSON
  for (let i = 0; i < data.length; i++) {
    if (data[i][0].toString().trim().toLowerCase() === cycleName.trim().toLowerCase()) {
      try {
        return normalizeCycleSequence(JSON.parse(data[i][2]));
      } catch (e) {
        console.error("Erreur parsing JSON pour le cycle", cycleName);
        return [];
      }
    }
  }
  return [];
}

// =========================================================
// 13. Calcule une date en ajoutant/soustrayant des jours OUVRÉS uniquement
// =========================================================

function addWorkingDays(baseDate, daysToAdd, workingDaysRaw, planDatesRaw, tz) {
  let resultDate = new Date(baseDate);
  
  // Fonction utilitaire pour vérifier si une date donnée est un jour ouvré
  const isDateWorking = (dateObj) => {
    const dStr = Utilities.formatDate(dateObj, tz, "yyyy-MM-dd");
    for(let i=0; i < planDatesRaw.length; i++){
      if(planDatesRaw[i] instanceof Date){
        if(Utilities.formatDate(planDatesRaw[i], tz, "yyyy-MM-dd") === dStr){
          return (workingDaysRaw[i] != 0);
        }
      }
    }
    return true; // Par défaut si hors de la grille
  };

  // 1. Si on demande 0 jour à ajouter, on s'assure juste que le jour de départ est ouvré
  if (daysToAdd === 0) {
    while (!isDateWorking(resultDate)) {
      resultDate.setDate(resultDate.getDate() + 1);
    }
    return resultDate;
  }

  // 2. Si on ajoute/soustrait des jours
  let added = 0;
  let direction = daysToAdd > 0 ? 1 : -1;
  let totalSteps = Math.abs(daysToAdd);

  while (added < totalSteps) {
    resultDate.setDate(resultDate.getDate() + direction);
    if (isDateWorking(resultDate)) {
      added++;
    }
  }
  
  return resultDate;
}

// =========================================================
// 14. Normalise une séquence de cycle
// =========================================================

function normalizeCycleSequence(sequence) {
  if (!Array.isArray(sequence)) return [];

  // 1) s'assure que chaque step est un objet
  const seq = sequence
    .filter(s => s && typeof s === 'object')
    .map(s => ({ ...s }));

  // 2) Génère un id stable si manquant
  // (Stable = basé sur index + taskAbbr. Suffisant pour migrations; si tu veux UUID, dis-moi.)
  seq.forEach((step, i) => {
    if (!step.id || String(step.id).trim() === "") {
      const base = (step.taskAbbr || "STEP").toString().trim().toUpperCase();
      step.id = `step_${i}_${base}`;
    }
    if (step.dependsOn === undefined) step.dependsOn = "";
    if (!step.linkType || String(step.linkType).trim() === "") step.linkType = "FS";
    if (step.lag === undefined || step.lag === null || step.lag === "") step.lag = 0;

    // Normalisation types
    step.lag = parseInt(step.lag, 10) || 0;
    step.duree = parseInt(step.duree, 10) || 0;
  });

  // 3) Répare dependsOn si invalide (id inexistant)
  const ids = new Set(seq.map(s => s.id));
  seq.forEach(step => {
    if (step.dependsOn && !ids.has(step.dependsOn)) step.dependsOn = "";
  });

  return seq;
}

// =========================================================
// 15. GESTION DES EQUIPES (Backend)
// =========================================================

function gsGetEquipes(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  try {
    const id = PLANNING_SS_ID;
    const ss = SpreadsheetApp.openById(id);
    const sheet = ss.getSheetByName('Equipes');
    
    if (!sheet) return [{ name: "Erreur : Onglet 'Equipes' introuvable" }];

    const lastRow = sheet.getLastRow();
    if (lastRow < 7) return [];
    
    const values = sheet.getRange(7, 2, lastRow - 6, 1).getValues();
    const result = [];

    for (let i = 0; i < values.length; i++) {
      const cellValue = values[i][0];
      if (cellValue && cellValue.toString().trim() !== "") {
        result.push({
          rowIdx: i + 7,
          name: cellValue.toString().trim()
        });
      }
    }
    return result;
  } catch (e) {
    console.error("Erreur gsGetEquipes: " + e.message);
    return [{ name: "Erreur Serveur : " + e.message }];
  }
}

// =========================================================
// 1. SAUVEGARDE RAPIDE DES ÉQUIPES (Libère l'UI)
// =========================================================
function gsSaveEquipe(token, newName, rowIdx) {
  assertCanEdit_(token, null);

  const id1 = PLANNING_SS_ID;
  const ss1 = SpreadsheetApp.openById(id1);
  const sheetEq = ss1.getSheetByName('Equipes');
  const cleanName = newName.trim();
  const lastRow = sheetEq.getLastRow();

  // --- VÉRIFICATION DES DOUBLONS ---
  let existingNames = [];
  if (lastRow >= 7) {
    existingNames = sheetEq.getRange(7, 2, lastRow - 6, 1).getValues().flat();
  }

  const isDuplicate = existingNames.some((name, index) => {
    if (rowIdx && (index + 7) === parseInt(rowIdx)) return false;
    return name.toString().toLowerCase() === cleanName.toLowerCase();
  });

  if (isDuplicate) {
    return { success: false, isUserNotice: true, message: "Cette équipe existe déjà." };
  }

  let oldName = null;

  // --- ENREGISTREMENT ---
  if (rowIdx) {
    oldName = sheetEq.getRange(parseInt(rowIdx), 2).getValue().toString().trim();
    sheetEq.getRange(parseInt(rowIdx), 2).setValue(cleanName);
  } else {
    let targetRow = (lastRow < 7) ? 7 : lastRow + 1;
    sheetEq.getRange(targetRow, 2).setValue(cleanName);
  }

  // --- TRI AUTOMATIQUE ---
  const newLastRow = sheetEq.getLastRow();
  if (newLastRow >= 7) {
    sheetEq.getRange(7, 2, newLastRow - 6, 1).sort({column: 2, ascending: true});
  }

  return { oldName: oldName, newName: cleanName };
}

// =========================================================
// 2. MISE À JOUR EN CASCADE DES ÉQUIPES (Arrière-plan)
// =========================================================
function gsCascadeEquipeUpdate(token, oldName, newName) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  if (!oldName || !newName || oldName === newName) return false;

  // A. MISE À JOUR DANS "TACHES" -> COLONNE D (Index 4)
  const ssPlanning = SpreadsheetApp.openById(PLANNING_SS_ID);
  const sheetTaches = ssPlanning.getSheetByName('Taches');
  if (sheetTaches) {
    const lastRowTaches = sheetTaches.getLastRow();
    if (lastRowTaches >= 7) {
      const rangeTaches = sheetTaches.getRange(7, 4, lastRowTaches - 6, 1); // Col D
      const dataTaches = rangeTaches.getValues();
      let changedTaches = false;
      for (let i = 0; i < dataTaches.length; i++) {
        if (dataTaches[i][0].toString().trim() === oldName) {
          dataTaches[i][0] = newName;
          changedTaches = true;
        }
      }
      if (changedTaches) rangeTaches.setValues(dataTaches);
    }
  }

  // B. MISE À JOUR DANS LES RÉSERVES -> COLONNE H (Index 8)
  const ssReserves = SpreadsheetApp.openById(RESERVES_SS_ID);
  const repairSheets = [
    "AutoControle",           // Colonne H (7)
    "Reserves",               // Colonne I (8)
    "AutoControle Communs",   // Colonne J (9)
    "Reserves Communs",       // Colonne K (10)
    "AutoControle Facades",   // Colonne L (11)
    "Reserves Facades"        // Colonne M (12)
  ];

  repairSheets.forEach(sheetName => {
    const currentSheet = ssReserves.getSheetByName(sheetName);
    if (currentSheet) {
      const lastRowRep = currentSheet.getLastRow();
      if (lastRowRep >= 7) {
        const rangeRep = currentSheet.getRange(7, 8, lastRowRep - 6, 1); // Col H
        const dataRep = rangeRep.getValues();
        let changedRep = false;

        for (let j = 0; j < dataRep.length; j++) {
          if (dataRep[j][0].toString().trim() === oldName) {
            dataRep[j][0] = newName;
            changedRep = true;
          }
        }
        if (changedRep) rangeRep.setValues(dataRep);
      }
    }
  });

  return true;
}

// =========================================================
// 3. SUPPRESSION OPTIMISÉE DES ÉQUIPES (Via Summary)
// =========================================================
function gsDeleteEquipe(token, rowIdx) {
  assertCanEdit_(token, null);

  const id1 = PLANNING_SS_ID;
  const ss1 = SpreadsheetApp.openById(id1);
  const sheetEq = ss1.getSheetByName('Equipes');
  const sheetTaches = ss1.getSheetByName('Taches');

  const equipeName = sheetEq.getRange(parseInt(rowIdx), 2).getValue().toString().trim();

  // 1. Vérifier dans "Taches" (Colonne D)
  const lastRowTaches = sheetTaches.getLastRow();
  if (lastRowTaches >= 7) {
    const dataTaches = sheetTaches.getRange(7, 4, lastRowTaches - 6, 1).getValues();
    const isUsedInTaches = dataTaches.some(row => row[0].toString().trim() === equipeName);
    if (isUsedInTaches) {
      throw new Error("Impossible de supprimer : cette équipe est utilisée dans la liste des Tâches.");
    }
  }

  // 2. Vérifier dans la synthèse des Réserves (Colonnes H à M)
  const ssReserves = SpreadsheetApp.openById(RESERVES_SS_ID);
  const summarySheet = ssReserves.getSheetByName('Summary');

  if (!summarySheet) {
    throw new Error("Erreur Serveur : L'onglet 'Disciplines_Summary' est introuvable.");
  }

  const summaryData = summarySheet.getDataRange().getValues();
  const usedInSheets = [];

  const columnToSheetName = [
    "AutoControle",           // Col H (index JS: 7)
    "AutoControle Communs",   // Col I (index JS: 8)
    "AutoControle Facades",   // Col J (index JS: 9)
    "Reserves",               // Col K (index JS: 10)
    "Reserves Communs",       // Col L (index JS: 11)
    "Reserves Facades"        // Col M (index JS: 12)
  ];

  // Scanne les colonnes de l'index 7 (H) à 12 (M)
  for (let colOffset = 0; colOffset < 6; colOffset++) {
    let colIndex = 7 + colOffset; 
    let foundInColumn = false;

    for (let row = 0; row < summaryData.length; row++) {
      if (summaryData[row][colIndex] && summaryData[row][colIndex].toString().trim() === equipeName) {
        foundInColumn = true;
        break; // Équipe trouvée, on arrête de lire cette colonne
      }
    }

    if (foundInColumn) {
      usedInSheets.push(columnToSheetName[colOffset]);
    }
  }

  // Blocage et notification si utilisée
  if (usedInSheets.length > 0) {
    return { success: false, isUserNotice: true, message: "Impossible de supprimer : l'équipe <b>" + equipeName + "</b> est encore utilisée dans : " + usedInSheets.join(", ") + "." };
  }

  // 3. Suppression
  sheetEq.deleteRow(parseInt(rowIdx));
  return true;
}

// =========================================================
// 16. Clear tasks from multiple cells
// =========================================================

/**
 * Analyse l'avancement ET récupère les dates du Recap avant suppression.
 */
function gsAnalyzeDeletion(token, cellsData, currentView) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  try {
    const names = getSheetNames(currentView);

    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    const shAvanc = ss.getSheetByName(names.avancement);
    const shRecap = ss.getSheetByName(names.recap);
    const shNotes = ss.getSheetByName(names.notes);

    const avancData = shAvanc.getDataRange().getValues(); 
    const headers = avancData[5].map(h => String(h).trim()); 

    let conflicts = [];
    let validActions = [];

    cellsData.forEach(cell => {
      const logId = String(cell.logementId).trim();
      const taskStr = String(cell.cellContent).trim();
      if (!taskStr) return;

      const baseTask = taskStr.split('@')[0].trim();
      let rowIdx = -1;
      for (let i = 6; i < avancData.length; i++) {
        if (String(avancData[i][0]).trim() === logId) { rowIdx = i; break; }
      }

      if (rowIdx !== -1) {
        const colIdx = headers.indexOf(baseTask);
        if (colIdx !== -1) {
          const status = avancData[rowIdx][colIdx];
          
          // CORRECTION 1 : Utilisation de getDisplayValue() au lieu de getValue()
          // Cela force la récupération sous forme de texte, empêchant l'erreur "Réponse invalide"
          const recapDates = shRecap.getRange(rowIdx + 1, colIdx + 1).getDisplayValue();

          const noteVal = shNotes ? shNotes.getRange(rowIdx + 1, colIdx + 1).getDisplayValue() : "";

          const taskObj = {
            logementId: logId,
            baseTask: baseTask,
            date: cell.date,
            rowIdx: rowIdx + 1, 
            colIdx: colIdx + 1,
            status: status || "Vide",
            note: noteVal || "",
            recapDates: recapDates || "Aucune date"
          };

          // On ignore le statut s'il s'agit uniquement de "Planifié" (sans note associée)
          if ((status !== "" && status !== null && status !== undefined && String(status).trim() !== "Planifié") || noteVal !== "") {
            conflicts.push(taskObj);
          } else {
            validActions.push(taskObj);
          }
        }
      }
    });

    return { success: true, validActions: validActions, conflicts: conflicts };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Exécute la suppression en balayant directement la ligne du Planning.
 */
function gsExecuteDeletion(token, tasks, currentView) {
  assertCanEdit_(token, null);
  try {
    const names = getSheetNames(currentView);
    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    const shPlan = ss.getSheetByName(names.plan);
    const shRecap = ss.getSheetByName(names.recap);
    const shAvanc = ss.getSheetByName(names.avancement);
    const shNotes = ss.getSheetByName(names.notes);

    // 1. CHARGEMENT EN MASSE (LIT TOUTE LA FEUILLE, MÊME HORS FENÊTRE)
    const rangePlan = shPlan.getDataRange();
    const planData = rangePlan.getValues();

    const rangeRecap = shRecap.getDataRange();
    const recapData = rangeRecap.getDisplayValues(); // Garde le format texte ("12/05/2026")

    const rangeAvanc = shAvanc.getDataRange();
    const avancData = rangeAvanc.getValues();

    let notesData = null;
    let rangeNotes = null;
    if (shNotes) {
        rangeNotes = shNotes.getDataRange();
        notesData = rangeNotes.getValues();
    }

    const tz = ss.getSpreadsheetTimeZone();
    const planDatesRaw = planData[1].slice(7); // Extraction de la ligne de date (Ligne 2, après les colonnes fixes)
    
    let dateColMap = {};
    planDatesRaw.forEach((d, i) => { 
      if (d instanceof Date) dateColMap[Utilities.formatDate(d, tz, "yyyy-MM-dd")] = i + 7; // Indexation JS (colonne 8 = index 7)
    });

    let planModified = false;
    let recapModified = false;
    let avancModified = false;
    let notesModified = false;

    // 2. MODIFICATIONS EN MÉMOIRE (INSTANTANÉ)
    tasks.forEach(task => {
      // A. Nettoyage du Planning
      for (let i = 6; i < planData.length; i++) {
        if (String(planData[i][0]).trim() === task.logementId) {
          task.planRowIndex = i;
          let colIdx = dateColMap[task.date];
          if (colIdx !== undefined) {
            let cellVal = String(planData[i][colIdx]);
            let updated = cellVal.split('|').filter(t => (t.includes('@') ? t.split('@')[0] : t).trim() !== task.baseTask);
            planData[i][colIdx] = updated.join('|');
            planModified = true;
          }
          break;
        }
      }

      // B. Nettoyage Recap, Avancement et Notes
      // RowIdx/ColIdx venant du frontend correspondent au numéro de ligne Google Sheets (base 1).
      // En JS, on indexe à partir de 0, donc on fait -1.
      let r = task.rowIdx - 1;
      let c = task.colIdx - 1;

      if (recapData[r] && recapData[r][c] !== undefined) {
          let valRecap = String(recapData[r][c]);
          let p = task.date.split('-');
          let dateToRemove = p[2] + '/' + p[1] + '/' + p[0];

          let remainingDates = valRecap.split('|')
            .map(d => d.trim())
            .filter(d => d !== dateToRemove && d !== "" && !d.startsWith("'")); 

          recapData[r][c] = remainingDates.length > 0 ? "'" + remainingDates.join(' | ') : "";
          recapModified = true;
      }

      // Vérifier si la tâche existe encore ailleurs sur la ligne du planning
      let stillExists = false;
      if (task.planRowIndex !== undefined) {
         const rowValues = planData[task.planRowIndex];
         for (let col = 7; col < rowValues.length; col++) {
           if (String(rowValues[col]).includes(task.baseTask)) {
             let tasksInCell = String(rowValues[col]).split('|').map(t => (t.includes('@') ? t.split('@')[0] : t).trim());
             if (tasksInCell.includes(task.baseTask)) {
               stillExists = true;
               break;
             }
           }
         }
      }

      // Supprimer l'avancement seulement si la tâche a totalement disparu
      if (task.mode === 'full' && !stillExists) {
        if (avancData[r] && avancData[r][c] !== undefined) {
            avancData[r][c] = "";
            avancModified = true;
        }
        if (notesData && notesData[r] && notesData[r][c] !== undefined) {
            notesData[r][c] = "";
            notesModified = true;
        }
      }
    });

    // 3. ÉCRITURE EN MASSE (UNE SEULE OPÉRATION PAR ONGLET)
    if (planModified) rangePlan.setValues(planData);
    if (recapModified) rangeRecap.setValues(recapData);
    if (avancModified) rangeAvanc.setValues(avancData);
    if (notesModified && rangeNotes) rangeNotes.setValues(notesData);

    return true;
  } catch (e) {
    throw new Error(e.toString());
  }
}







// =========================================================
// 17. Edit mode
// =========================================================

/**
 * Met à jour UNIQUEMENT le Statut Global d'un Logement au changement (Auto-save)
 */
function gsUpdateGlobalStatus(token, logId, newStatus, currentView, rowHint) {
  assertCanEdit_(token, null);
  try {
    const names = getSheetNames(currentView);
    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    const sh = ss.getSheetByName(names.plan);
    
    if (!sh) throw new Error("Onglet planning introuvable pour la vue : " + currentView);

    let rowIdx = rowHint ? parseInt(rowHint) : -1;

    // FIX E5: Use the rowHint from the client cache to skip the full column-A scan.
    // Fall back to scan only if hint is missing or mismatches (safety net).
    if (!rowIdx || rowIdx < 7) {
      const data = sh.getRange(7, 1, sh.getLastRow() - 6, 1).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(logId).trim()) { rowIdx = i + 7; break; }
      }
    }

    if (rowIdx === -1) {
      return { success: false, isUserNotice: true, message: "Logement introuvable dans le planning. La ligne a peut-être été supprimée ou déplacée." };
    }

    // Colonne B (Index 2) = Statut Global
    sh.getRange(rowIdx, 2).setValue(newStatus);

    return true;
  } catch (e) {
    console.error("[DEBUG ERREUR] " + e.toString());
    throw new Error("Erreur gsUpdateGlobalStatus: " + e.toString());
  }
}

/**
 * Met à jour UNIQUEMENT les Notes d'un Logement (Colonne C du Planning principal)
 */
function gsUpdateIdNotes(token, logId, noteValue, currentView, rowHint) {
  assertCanEdit_(token, null);
  try {
    const names = getSheetNames(currentView);
    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    
    const sh = ss.getSheetByName(names.plan);
    if (!sh) throw new Error("Onglet planning introuvable : " + names.plan);
    
    let rowIdx = rowHint ? parseInt(rowHint) : -1;

    // FIX E5: Use rowHint from client cache; fall back to scan only as safety net.
    if (!rowIdx || rowIdx < 7) {
      const data = sh.getRange(7, 1, sh.getLastRow() - 6, 1).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(logId).trim()) { rowIdx = i + 7; break; }
      }
    }

    if (rowIdx === -1) {
      return { success: false, isUserNotice: true, message: "Logement introuvable dans le planning. La ligne a peut-être été supprimée ou déplacée." };
    }

    // Col 3 (C) : Colonne des commentaires globaux
    if (noteValue === '{"pub":"","priv":""}' || noteValue === '{"pub":"","int":""}' || noteValue === "") {
      sh.getRange(rowIdx, 3).clearContent();
    } else {
      sh.getRange(rowIdx, 3).setValue(noteValue);
    }
    return true;
  } catch (e) { 
    throw new Error("Erreur gsUpdateIdNotes: " + e.message);
  }
}

// =========================================================
// TÂCHES : SAUVEGARDE STRICTE DANS AVANCEMENT ET NOTES
// =========================================================

/**
 * OUTIL DE POINTAGE : Trouve l'ID (Col A) et l'Abréviation (Ligne 6) et écrit la valeur.
 */
function _writeToTaskSheet(view, logId, taskAbbr, value, sheetType) {
  
  const names = getSheetNames(view);
  const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
  
  const sheetName = (sheetType === 'avancement') ? names.avancement : names.notes;
  const sh = ss.getSheetByName(sheetName);
  
  if (!sh) throw new Error(`Feuille introuvable : ${sheetName}`);
  
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 7 || lastCol < 2) return false;

  // FIX E4: One batched read covers both the header row (row 6) and all ID rows (col A).
  // Previously: two separate getRange calls (headers row + full ID column).
  const block   = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = block[5]; // Row 6 (0-indexed = 5)
  const colIdx  = headers.findIndex(h => String(h).trim() === String(taskAbbr).trim());

  let rowIdx = -1;
  for (let i = 6; i < block.length; i++) {
    if (String(block[i][0]).trim() === String(logId).trim()) { rowIdx = i; break; }
  }

  if (colIdx === -1 || rowIdx === -1) {
    return { success: false, isUserNotice: true, message: `Cible introuvable : Tâche <b>${taskAbbr}</b> ou Logement <b>${logId}</b> introuvable dans le planning.` };
  }

  // Nettoyage : Si le JSON est vide, on le transforme en chaîne vide
  if (value === '{"pub":"","int":""}' || value === '{"pub":"","priv":""}') value = "";

  // rowIdx + 1 et colIdx + 1 car getRange() commence à 1
  if (value === "") {
    sh.getRange(rowIdx + 1, colIdx + 1).clearContent();
  } else {
    sh.getRange(rowIdx + 1, colIdx + 1).setValue(value);
  }
  return true;
}

/**
 * SAUVEGARDE DU STATUT (Va dans "Avancement")
 */
function gsUpdateTaskStatus(token, logId, dateStr, baseTaskAbbr, newStatus, currentView) {
  assertCanEdit_(token, null);
  try {
    return _writeToTaskSheet(currentView, logId, baseTaskAbbr, newStatus, 'avancement');
  } catch (e) { throw new Error("gsUpdateTaskStatus: " + e.message); }
}

/**
 * SAUVEGARDE DES NOTES (Va dans "Notes")
 */
function gsUpdateTaskNotes(token, logId, dateStr, baseTaskAbbr, notesJSON, currentView) {
  assertCanEdit_(token, null);
  try {
    return _writeToTaskSheet(currentView, logId, baseTaskAbbr, notesJSON, 'notes');
  } catch (e) { throw new Error("gsUpdateTaskNotes: " + e.message); }
}

/**
 * SAUVEGARDE AM/PM (Modifie le texte de la cellule dans "Planning")
 * Extrait "TACHE@AM" ou "TACHE@PM" et nettoie les résidus de statut/notes de la feuille planning.
 */
function gsUpdateTaskAMPM(token, logId, dateStr, baseTaskAbbr, newAMPM, currentView) {
  assertCanEdit_(token, null);
  try {
    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    const shPlan = ss.getSheetByName(getSheetNames(currentView).plan);
    
    const lastRow = shPlan.getLastRow();
    const lastCol = shPlan.getLastColumn();
    
    const headers = shPlan.getRange(2, 1, 1, lastCol).getValues()[0];
    const ids = shPlan.getRange(1, 1, lastRow, 1).getValues();
    const tz = ss.getSpreadsheetTimeZone();
    
    const colIdx = headers.findIndex(h => (h instanceof Date ? Utilities.formatDate(h, tz, "yyyy-MM-dd") : String(h)) === dateStr);
    
    let rowIdx = -1;
    for (let i = 6; i < ids.length; i++) {
       if (String(ids[i][0]).trim() === String(logId).trim()) { rowIdx = i; break; }
    }
    
    if (colIdx !== -1 && rowIdx !== -1) {
      let cellValue = String(shPlan.getRange(rowIdx + 1, colIdx + 1).getValue() || "");
      let parts = cellValue ? cellValue.split('|').filter(p => p.trim() !== '') : [];
      let found = false;
      
      let updatedParts = parts.map(p => {
        if (p.split('@')[0].trim() === baseTaskAbbr) {
          found = true;
          // Ne laisse que la tâche et son créneau horaire
          return newAMPM ? `${baseTaskAbbr}@${newAMPM}` : baseTaskAbbr; 
        }
        return p;
      });
      
      if (!found) updatedParts.push(newAMPM ? `${baseTaskAbbr}@${newAMPM}` : baseTaskAbbr);
      shPlan.getRange(rowIdx + 1, colIdx + 1).setValue(updatedParts.join('|'));
    }
    return true;
  } catch (e) { throw new Error("gsUpdateTaskAMPM: " + e.message); }
}

/**
 * Shared date-normalisation utility — used by gsSaveTaskDateUpdate,
 * gsSaveInterventionDetails and gsShiftTaskWithDomino.
 * Accepts a Date object, a yyyy-MM-dd string, or a dd/MM/yyyy string.
 * Returns a yyyy-MM-dd string, or "" if the value is empty / unrecognised.
 */
function _isoDate(val, tz) {
  if (!val) return "";
  if (val instanceof Date) return Utilities.formatDate(val, tz, "yyyy-MM-dd");
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const p = s.split(/[\/\-]/);
  if (p.length === 3) {
    return p[0].length === 4
      ? `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`
      : `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  }
  return "";
}

/**
 * Sauvegarde le changement de date d'une tâche dans la grille horizontale du Google Sheet.
 * @param {string|number} logId - L'identifiant de la ligne (ex: Logement)
 * @param {string} taskAbbr - L'abréviation de la tâche (ex: PE, PL, EL)
 * @param {string} newIsoDateStr - La nouvelle date sélectionnée (au format YYYY-MM-DD)
 * @param {string} oldDateStr - L'ancienne date affichée (format DD/MM/YYYY ou ISO)
 * @param {string} currentView - La vue de planning actuelle ('locataires', 'communs', 'facades')
 */
function gsSaveTaskDateUpdate(token, logId, taskAbbr, newIsoDateStr, oldDateStr, currentView) {
  assertCanEdit_(token, null);
  try {
    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    const names = getSheetNames(currentView);
    const sh = ss.getSheetByName(names.plan);
    
    const lastCol = sh.getLastColumn();
    if (lastCol < 8) throw new Error("La feuille ne contient pas de colonnes de dates valides (colonne 8+).");
    
    const data = sh.getDataRange().getValues();
    const tz = ss.getSpreadsheetTimeZone();
    
    // 1. Trouver la ligne correspondant au logId (Colonne A, index 0)
    let rowIdx = -1;
    for (let i = 2; i < data.length; i++) { // Débute après les en-têtes
      if (String(data[i][0]).trim() === String(logId).trim()) {
        rowIdx = i + 1; // Index 1-based pour les plages Google Sheets
        break;
      }
    }
    
    if (rowIdx === -1) return { success: false, isUserNotice: true, message: "Logement introuvable pour l'ID : <b>" + logId + "</b>." };
    
    // 2. Récupérer la ligne des dates (Ligne 2, index 1)
    const headerDatesRow = data[1]; 
    
    // Using shared _isoDate() utility — replaces inline normalizeToIso definition.
    const targetIso = _isoDate(newIsoDateStr, tz);
    const oldIso    = _isoDate(oldDateStr, tz);
    
    let newColIdx = -1;
    
    // 3. Parcourir la ligne d'en-tête à partir de la colonne H (colonne 8, index 7)
    for (let j = 7; j < headerDatesRow.length; j++) {
      const currentIso = _isoDate(headerDatesRow[j], tz);
      
      // Nettoyage : si cette colonne correspond à l'ancienne date, on efface l'ancienne abréviation
      if (currentIso === oldIso || (!oldIso && String(data[rowIdx - 1][j]).trim() === String(taskAbbr).trim())) {
        if (String(data[rowIdx - 1][j]).trim() === String(taskAbbr).trim()) {
          sh.getRange(rowIdx, j + 1).setValue(""); 
        }
      }
      
      // On stocke la colonne cible pour inscrire la nouvelle position de la tâche
      if (currentIso === targetIso) {
        newColIdx = j + 1;
      }
    }
    
    // 4. Écriture de la tâche à sa nouvelle place
    if (newColIdx !== -1) {
      sh.getRange(rowIdx, newColIdx).setValue(taskAbbr);
    } else {
      return { success: false, isUserNotice: true, message: "La date sélectionnée (" + newIsoDateStr + ") n'est pas présente dans le planning." };
    }
    
    return true;
  } catch (e) {
    throw new Error("Erreur gsSaveTaskDateUpdate : " + e.toString());
  }
}

/**
 * Décale une tâche ou applique un effet domino (cascade) sur les tâches suivantes d'un logement,
 * en s'appuyant strictement sur le calendrier et les jours ouvrés configurés en lignes 1 et 2.
 *
 * @param {string} logId - Identifiant du logement
 * @param {string} taskAbbr - Abréviation de la tâche modifiée
 * @param {string} oldDateStr - Date d'origine (Format ISO: YYYY-MM-DD)
 * @param {string} newDateStr - Nouvelle date cible (Format ISO: YYYY-MM-DD)
 * @param {string} currentView - Vue active ('locataires', 'communs', etc.)
 * @param {string} mode - Stratégie choisie ('only-this' | 'this-and-successors' | 'cascade-all')
 */

function gsShiftTaskWithDomino(token, logId, taskAbbr, oldDateStr, newDateStr, currentView, mode) {
  assertCanEdit_(token, null);
  try {
    if (!logId || !oldDateStr || !newDateStr) return { success: false, isUserNotice: true, message: "Paramètres manquants pour le déplacement." };
    if (oldDateStr === newDateStr) return { success: true, msg: "Même date." };

    const activeMode = mode || 'only-this';
    const names = getSheetNames(currentView);
    
    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    const sh = ss.getSheetByName(names.plan);
    const shRecap = ss.getSheetByName(names.recap);
    const shAvanc = ss.getSheetByName(names.avancement);

    if (!sh) throw new Error("Onglet planning introuvable : " + names.plan);
    const lastCol = sh.getLastColumn();
    if (lastCol < 8) throw new Error("Aucune colonne de date détectée (colonne H minimum).");
    const tz = ss.getSpreadsheetTimeZone();
    const workingDaysRaw = sh.getRange(1, 8, 1, lastCol - 7).getValues()[0];
    const planDatesRaw = sh.getRange(2, 8, 1, lastCol - 7).getValues()[0];

    // MAPPING DU CALENDRIER
    const timeline = planDatesRaw.map((d, i) => {
      if (d instanceof Date) {
        return { iso: Utilities.formatDate(d, tz, "yyyy-MM-dd"), col: i + 8, isWorking: workingDaysRaw[i] != 0, index: i };
      }
      return null;
    });
    const dateToTimeline = {};
    timeline.forEach(item => { if (item) dateToTimeline[item.iso] = item; });
    const oldItem = dateToTimeline[oldDateStr];
    const newItem = dateToTimeline[newDateStr];

    if (!oldItem || !newItem) return { success: false, isUserNotice: true, message: "Date introuvable dans le calendrier." };

    // CALCUL DU DÉCALAGE EN JOURS OUVRÉS
    let workingDaysDelta = 0;
    if (oldItem.index !== newItem.index) {
      const step = oldItem.index <= newItem.index ? 1 : -1;
      let curr = oldItem.index;
      while (curr !== newItem.index) {
        curr += step;
        if (timeline[curr] && timeline[curr].isWorking) workingDaysDelta += step;
      }
    }

    // RECHERCHE DU LOGEMENT
    const data = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
    let rowIdx = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(logId).trim()) { rowIdx = i + 1; break; }
    }
    if (rowIdx === -1) return { success: false, isUserNotice: true, message: "Logement introuvable dans le planning : <b>" + logId + "</b>." };

    // --- NOUVELLE LOGIQUE : IDENTIFICATION DES INDEX À DÉPLACER ---
    const oldTimelineIdx = timeline.findIndex(t => t && t.iso === oldDateStr);
    if (oldTimelineIdx === -1) return { success: false, isUserNotice: true, message: "Date d'origine introuvable." };

    const targetBaseTaskUpper = taskAbbr.toUpperCase().split('@')[0].trim();
    const rowValues = sh.getRange(rowIdx, 8, 1, lastCol - 7).getValues()[0];

    // Fonctions utilitaires
    const getBaseTasks = (idx) => {
        if (!timeline[idx] || !rowValues[idx]) return [];
        return String(rowValues[idx]).split('|').map(t => t.trim()).filter(t => t.length > 0);
    };
    const hasBaseTask = (idx, base) => getBaseTasks(idx).some(t => t.toUpperCase().split('@')[0] === base);
    const hasAnyTask = (idx) => getBaseTasks(idx).length > 0;
    const isWorking = (idx) => timeline[idx] && timeline[idx].isWorking;

    let indices = [];

    // Capture des blocs selon les 5 modes choisis par l'UI
    if (activeMode === 'only-this') {
        indices.push(oldTimelineIdx);
    } 
    else if (activeMode === 'entire-task') {
        for (let i = oldTimelineIdx; i >= 0; i--) {
            if (!isWorking(i)) continue;
            if (hasBaseTask(i, targetBaseTaskUpper)) indices.push(i); else break;
        }
        for (let i = oldTimelineIdx + 1; i < timeline.length; i++) {
            if (!isWorking(i)) continue;
            if (hasBaseTask(i, targetBaseTaskUpper)) indices.push(i); else break;
        }
    } 
    else if (activeMode === 'task-from-here') {
        for (let i = oldTimelineIdx; i < timeline.length; i++) {
            if (!isWorking(i)) continue;
            if (hasBaseTask(i, targetBaseTaskUpper)) indices.push(i); else break;
        }
    } 
    else if (activeMode === 'entire-block') {
        for (let i = oldTimelineIdx; i >= 0; i--) {
            if (!isWorking(i)) continue;
            if (hasAnyTask(i)) indices.push(i); else break;
        }
        for (let i = oldTimelineIdx + 1; i < timeline.length; i++) {
            if (!isWorking(i)) continue;
            if (hasAnyTask(i)) indices.push(i); else break;
        }
    } 
    else if (activeMode === 'this-and-all-successors') {
        for (let i = oldTimelineIdx; i < timeline.length; i++) {
            if (!isWorking(i)) continue;
            if (hasAnyTask(i)) indices.push(i); else break;
        }
    }

    // Dédoublonnage et tri chronologique
    indices = [...new Set(indices)].sort((a, b) => a - b);

    let tasksToRemove = [];
    let tasksToAdd = [];

    indices.forEach(idx => {
        const cellTasks = getBaseTasks(idx);
        cellTasks.forEach(t => {
            const tBase = t.toUpperCase().split('@')[0];
            let shouldMove = false;

            // Règle de protection : Si on est dans un mode restrictif (1, 2, 3), on ne bouge QUE la tâche cible.
            if (activeMode === 'only-this' || activeMode === 'entire-task' || activeMode === 'task-from-here') {
                if (tBase === targetBaseTaskUpper) shouldMove = true;
            } else {
                // Modes englobants (4 et 5) : on bouge tout ce qu'on a capturé
                shouldMove = true;
            }

            if (shouldMove) {
                tasksToRemove.push({ originalIdx: idx, task: t });

                let targetIdx = idx;
                if (workingDaysDelta !== 0) {
                    let remaining = Math.abs(workingDaysDelta);
                    const step = workingDaysDelta > 0 ? 1 : -1;
                    while (remaining > 0) {
                        targetIdx += step;
                        if (targetIdx < 0 || targetIdx >= timeline.length) break;
                        if (timeline[targetIdx] && timeline[targetIdx].isWorking) remaining--;
                    }
                }

                // Si on atterrit sur un week-end en fin de course, on pousse au prochain jour ouvré
                while (targetIdx < timeline.length && targetIdx >= 0 && timeline[targetIdx] && !timeline[targetIdx].isWorking) {
                    targetIdx += workingDaysDelta > 0 ? 1 : -1;
                }

                if (targetIdx >= 0 && targetIdx < timeline.length && timeline[targetIdx]) {
                    tasksToAdd.push({ targetIdx: targetIdx, task: t });
                }
            }
        });
    });

    // --- MANIPULATION DE LA MATRICE EN MÉMOIRE (Ultra Rapide & Sans erreur de boucle) ---
    let updatedRowValues = [...rowValues];

    // 1. Suppression
    tasksToRemove.forEach(item => {
        let arr = String(updatedRowValues[item.originalIdx] || "").split('|').map(t => t.trim()).filter(t => t.length > 0);
        const idx = arr.findIndex(t => t.toUpperCase() === item.task.toUpperCase());
        if (idx !== -1) {
            arr.splice(idx, 1);
            updatedRowValues[item.originalIdx] = arr.join(' | ');
        }
    });

    // 2. Ajout
    tasksToAdd.forEach(item => {
        let arr = String(updatedRowValues[item.targetIdx] || "").split('|').map(t => t.trim()).filter(t => t.length > 0);
        if (arr.indexOf(item.task) === -1) {
            arr.push(item.task);
            updatedRowValues[item.targetIdx] = arr.join(' | ');
        }
    });

    // 3. Écriture en bloc unique (1 seul appel API = pas de crash/bug)
    sh.getRange(rowIdx, 8, 1, lastCol - 7).setValues([updatedRowValues]);

    // --- SYNCHRONISATION DU RECAP ET AVANCEMENT ---
    if (shRecap && shAvanc) {
      const baseTaskAbbr = taskAbbr.split('@')[0].trim();
      const recapHeaders = shRecap.getRange(6, 2, 1, shRecap.getLastColumn() - 1).getValues()[0];
      const colIdx = recapHeaders.indexOf(baseTaskAbbr);

      if (colIdx !== -1) {
        const recapCol = colIdx + 2;
        const newDatesList = [];

        // On utilise notre tableau mis à jour en mémoire (updatedRowValues) pour éviter une requête lente
        for (let i = 0; i < updatedRowValues.length; i++) {
          const cellContent = String(updatedRowValues[i]).trim();
          if (!cellContent) continue;
          
          const cellTasks = cellContent.split('|').map(t => t.trim());
          const hasTask = cellTasks.some(t => t.split('@')[0].trim() === baseTaskAbbr);
          
          if (hasTask && planDatesRaw[i] instanceof Date) {
            newDatesList.push(Utilities.formatDate(planDatesRaw[i], tz, "dd/MM/yyyy"));
          }
        }

        const recapCell = shRecap.getRange(rowIdx, recapCol);
        if (newDatesList.length > 0) {
          recapCell.setValue("'" + newDatesList.join(' | '));
        } else {
          recapCell.clearContent();
          // Conformément à votre précédente demande, on ne supprime le statut que si la tâche disparaît du planning
          shAvanc.getRange(rowIdx, recapCol).clearContent();
        }
      }
    }

    return { success: true };
  } catch (err) {
    throw new Error(err.message);
  }
}


// =========================================================
// INTERVENTIONS (Réserves & Autocontrôles)
// =========================================================

function gsGetInterventionDetails(token, interId, currentView, isClient) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  
  // SECURITY: Block clients from fetching Autocontrôle details
  if (isClient && interId.startsWith('A-')) {
    return null; 
  }
  
  try {
    const names = getSheetNames(currentView);
    const isReserve = interId.startsWith('R-');
    const sheetName = isReserve ? names.reserves : names.autocontroles;
    
    const ss = SpreadsheetApp.openById(RESERVES_SS_ID);
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return null;

    const tz = ss.getSpreadsheetTimeZone();
    const lastRow = sh.getLastRow();
    if (lastRow < 7) return null;

    // FIX E2: Read only the ID column (col B) to locate the row
    const idsCol = sh.getRange(7, 2, lastRow - 6, 1).getValues();
    let rowIdx = -1;
    for (let i = 0; i < idsCol.length; i++) {
      if (String(idsCol[i][0]).trim() === interId) { rowIdx = i + 7; break; }
    }
    if (rowIdx === -1) return null;

    // UPDATED: Read 14 columns instead of 11. 
    // This allows us to capture up to Column N (14th column).
    const row = sh.getRange(rowIdx, 1, 1, 14).getValues()[0];

    let dateStr = "";
    if (row[8] && String(row[8]).trim() !== "") {
      const d = new Date(row[8]);
      if (!isNaN(d.valueOf())) dateStr = Utilities.formatDate(d, tz, "dd/MM/yyyy");
    }

    let dueDateStr = "";
    if (row[10] && String(row[10]).trim() !== "") {
      const d = new Date(row[10]);
      if (!isNaN(d.valueOf())) dueDateStr = Utilities.formatDate(d, tz, "dd/MM/yyyy");
    }

    // Return the object, now including our newly fetched columns
    return {
      id:              row[1],   // Col B: ID
      logement:        row[2],   // Col C: Logement
      discipline:      row[3],   // Col D: Discipline
      description:     row[4],   // Col E: Notes / Description
      status:          row[6],   // Col G: Statut
      equipe:          row[7],   // Col H: Equipe
      dateStr:         dateStr,  // Col I: Date prévue (formatted)
      creneau:         row[9],   // Col J: Heure / Créneau
      dueDateStr:      dueDateStr, // Col K: Due date (formatted)
      needValidation:  row[12],  // Col M: Need validation
      secondaryStatut: row[13]   // Col N: Secondary status
    };
  } catch (e) { throw new Error("Erreur gsGetInterventionDetails: " + e.message); }
}

function gsSaveInterventionDetails(token, interId, payload, currentView) {
  assertCanEdit_(token, null);
  try {
    const names = getSheetNames(currentView);
    const isReserve = interId.startsWith('R-');
    const sheetName = isReserve ? names.reserves : names.autocontroles;

    // --- PARTIE 1 : METTRE À JOUR LE CLASSEUR DES RÉSERVES ---
    const ssReserves = SpreadsheetApp.openById(RESERVES_SS_ID);
    const shReserves = ssReserves.getSheetByName(sheetName);
    if (!shReserves) throw new Error("Onglet introuvable : " + sheetName);

    // FIX E3a: Read only the ID column to locate the row (same pattern as gsGetInterventionDetails).
    const lastRow = shReserves.getLastRow();
    const idsCol  = shReserves.getRange(7, 2, lastRow - 6, 1).getValues();
    let rowIdx = -1;
    for (let i = 0; i < idsCol.length; i++) {
      if (String(idsCol[i][0]).trim() === interId) { rowIdx = i + 7; break; }
    }
    if (rowIdx === -1) return { success: false, isUserNotice: true, message: "Intervention introuvable dans la base de données."};

    // FIX E3b: Read the full row once — gets logId (col C) and oldDate (col I) in one call,
    // replacing the two separate single-cell getRange reads that were here before.
    const existingRow = shReserves.getRange(rowIdx, 1, 1, 11).getValues()[0];
    const logId      = String(existingRow[2]).trim(); // Col C
    const oldDateObj = existingRow[8];               // Col I

    // GESTION ET FORÇAGE DU FORMAT DE DATE
    if (payload.dateStr !== undefined) {
      let parts = payload.dateStr.split('/');
      let newIsoDate = "";

      if (parts.length === 3) {
        let d = new Date(parts[2], parts[1] - 1, parts[0]);
        let dateCell = shReserves.getRange(rowIdx, 9);
        dateCell.setValue(d);
        dateCell.setNumberFormat("dd/MM/yyyy");
        newIsoDate = Utilities.formatDate(d, ssReserves.getSpreadsheetTimeZone(), "yyyy-MM-dd");
      }

      // --- PARTIE 2 : DÉPLACER L'ID DANS LE PLANNING DES RÉSERVES ---
      const ssPlan = SpreadsheetApp.openById(PLANNING_SS_ID);
      const shPlanReserves = ssPlan.getSheetByName(names.planReserves);
      
      if (shPlanReserves && logId && newIsoDate) {
        const tz = ssPlan.getSpreadsheetTimeZone();
        const datesHeader = shPlanReserves.getRange(2, 8, 1, shPlanReserves.getLastColumn() - 7).getValues()[0];
        
        // Using shared _isoDate() utility — replaces inline normalizeDate definition.
        let oldIsoDate = _isoDate(oldDateObj, tz);
        let oldColIdx = -1;
        let newColIdx = -1;

        datesHeader.forEach((d, idx) => {
          let iso = _isoDate(d, tz);
          if (iso === oldIsoDate) oldColIdx = idx + 8;
          if (iso === newIsoDate) newColIdx = idx + 8;
        });
        
        const planIds = shPlanReserves.getRange(1, 1, shPlanReserves.getLastRow(), 1).getValues();
        let planRowIdx = -1;
        for (let j = 6; j < planIds.length; j++) {
          if (String(planIds[j][0]).trim() === String(logId).trim()) { planRowIdx = j + 1; break; }
        }
        
        if (planRowIdx !== -1) {
          if (oldColIdx !== -1 && oldColIdx !== newColIdx) {
            let oldCell = shPlanReserves.getRange(planRowIdx, oldColIdx);
            let arr = String(oldCell.getValue()).split('|').map(x => x.trim()).filter(x => x !== "" && x !== interId);
            oldCell.setValue(arr.join(' | '));
          }
          if (newColIdx !== -1 && oldColIdx !== newColIdx) {
            let newCell = shPlanReserves.getRange(planRowIdx, newColIdx);
            let arr = String(newCell.getValue()).split('|').map(x => x.trim()).filter(x => x !== "");
            if (!arr.includes(interId)) arr.push(interId);
            newCell.setValue(arr.join(' | '));
          }
        }
      }
    }

    // FIX E3c: Batch contiguous column writes.
    // Cols 4–5 (discipline + description) and cols 7–8 (status + equipe) are written as pairs.
    // Col 10 (créneau) remains a single write as it is non-contiguous.
    const cleanDesc = (v) => (v === '{"pub":"","priv":""}' || v === '{"pub":"","int":""}' || v === "") ? "" : v;

    if (payload.discipline !== undefined || payload.description !== undefined) {
      const disc = payload.discipline !== undefined ? payload.discipline : existingRow[3];
      const desc = payload.description !== undefined ? cleanDesc(payload.description) : existingRow[4];
      shReserves.getRange(rowIdx, 4, 1, 2).setValues([[disc, desc]]);
    }

    if (payload.status !== undefined || payload.equipe !== undefined) {
      const stat  = payload.status !== undefined ? payload.status : existingRow[6];
      const equip = payload.equipe !== undefined ? payload.equipe : existingRow[7];
      shReserves.getRange(rowIdx, 7, 1, 2).setValues([[stat, equip]]);
    }

    if (payload.creneau !== undefined) {
      shReserves.getRange(rowIdx, 10).setValue(payload.creneau);
    }

    return true;

  } catch (e) { 
    throw new Error("Erreur gsSaveInterventionDetails: " + e.message);
  }
}

// =========================================================
// Fonction pour récupérer le calendrier complet du projet (Jours ouvrés)
// =========================================================
function gsGetProjectCalendar(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
  const sh = ss.getSheetByName('Planning'); // L'onglet principal
  const lastCol = sh.getLastColumn();
  
  if (lastCol < 8) return {};

  const workingDaysRaw = sh.getRange(1, 8, 1, lastCol - 7).getValues()[0];
  const planDatesRaw = sh.getRange(2, 8, 1, lastCol - 7).getValues()[0];
  const tz = ss.getSpreadsheetTimeZone();
  
  const calendarMap = {};
  
  for (let i = 0; i < planDatesRaw.length; i++) {
    if (planDatesRaw[i] instanceof Date) {
      const dateISO = Utilities.formatDate(planDatesRaw[i], tz, "yyyy-MM-dd");
      // Stocke 1 (Ouvré) ou 0 (Non ouvré) pour chaque date
      calendarMap[dateISO] = workingDaysRaw[i] == 0 ? 0 : 1; 
    }
  }
  
  return calendarMap;
}


// =========================================================
// 18. FETCH PENDING INTERVENTIONS (OPTIMISÉ VIA SHEETS API)
// =========================================================

function gsGetPendingInterventions(token, logId, currentView) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  
  try {
    const names = getSheetNames(currentView);
    const targetLogId = String(logId).trim();

    // On prépare la requête groupée pour cibler les deux onglets simultanément
    const ranges = [
      `'${names.reserves}'!A7:K`,
      `'${names.autocontroles}'!A7:K`
    ];

    const response = Sheets.Spreadsheets.Values.batchGet(RESERVES_SS_ID, {
      ranges: ranges,
      valueRenderOption: 'FORMATTED_VALUE' // Maintient les dates au format texte ("dd/MM/yyyy")
    });

    let results = [];

    // Fonction d'aide pour traiter les données reçues
    const processSheetData = (rows, isReserve) => {
      if (!rows) return;
      
      rows.forEach(row => {
        const rowLogId = String(row[2] || "").trim(); // Colonne C
        const status = String(row[6] || "").trim();   // Colonne G

        // Si le logement ne correspond pas ou que c'est fini, on ignore immédiatement
        if (rowLogId !== targetLogId || status.toLowerCase() === 'fini') return;

        // L'API Sheets renvoie les dates déjà formatées en texte grâce à FORMATTED_VALUE
        results.push({
          id:          String(row[1] || ""),
          logement:    rowLogId,
          discipline:  String(row[3] || ""),
          description: String(row[4] || ""),
          status:      status,
          equipe:      String(row[7] || ""),
          dateStr:     String(row[8] || ""), // Date Prévue (Col I)
          creneau:     String(row[9] || ""),
          dueDateStr:  String(row[10] || ""), // Date Limite (Col K)
          isReserve:   isReserve
        });
      });
    };

    // Traitement instantané en mémoire
    processSheetData(response.valueRanges[0].values, true);  // Traite les Réserves
    processSheetData(response.valueRanges[1].values, false); // Traite les Autocontrôles

    return { success: true, data: results };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// =========================================================
// 19. Batch all initial data into one call (OPTIMISÉ VIA SHEETS API)
// =========================================================

function gsGetAppStartupData(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  // 1. Récupération des bornes temporelles (inchangé)
  const bounds = getProjectDateBounds(token);

  // 2. Requête groupée (batchGet) pour les 4 onglets de paramètres
  const ranges = [
    'Taches!A7:I',
    'Cycles!B7:E',
    'Disciplines!B7:B',
    'Equipes!B7:B'
  ];

  const response = Sheets.Spreadsheets.Values.batchGet(PLANNING_SS_ID, {
    ranges: ranges
  });

  const valueRanges = response.valueRanges;
  const getRows = (index) => (valueRanges[index].values || []);

  // --- PARSING RAPIDE EN MÉMOIRE ---

  const tasks = getRows(0).map((row, index) => ({
    rowIdx: index + 7,
    abbr: row[1] || "",
    type: row[2] || "",
    equipe: row[3] || "",
    desc: row[4] || "",
    descCourte: row[5] || "",
    bgColor: row[6] || "",
    duree: row[7] || "",
    unite: row[8] || ""
  })).filter(t => t.abbr && t.abbr.trim() !== "");

  const cycles = getRows(1).map((row, index) => {
    let sequence = [];
    try {
      if (row[2]) sequence = normalizeCycleSequence(JSON.parse(row[2]));
    } catch(e) {}
    return {
      rowIdx: index + 7,
      nom: row[0] || "",
      description: row[1] || "",
      sequence: sequence,
      apercu: row[3] || ""
    };
  }).filter(c => c.nom && c.nom.trim() !== "");

  const disciplines = getRows(2).map((row, index) => ({
    rowIdx: index + 7,
    name: row[0] || ""
  })).filter(d => d.name && d.name.trim() !== "");

  const equipes = getRows(3).map((row, index) => ({
    rowIdx: index + 7,
    name: row[0] || ""
  })).filter(e => e.name && e.name.trim() !== "");

  return {
    bounds: bounds,
    tasks: tasks,
    cycles: cycles,
    disciplines: disciplines,
    equipes: equipes
  };
}

// =========================================================
// 20. Toggle Working / Non-Working Days
// =========================================================

function gsToggleWorkingDay(token, dateStr, newStatusValue) {
  assertCanEdit_(token, null);
  try {
    // Validation: Bloquer le passage en non-ouvré si des tâches existent
    if (newStatusValue === 0) {
      if (hasTasksOnDate(dateStr)) {
        return { success: false, message: "Impossible : Il y a des tâches ou interventions planifiées à cette date sur l'un des plannings." };
      }
    }

    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    const views = ['locataires', 'communs', 'facades'];
    const tz = ss.getSpreadsheetTimeZone();
    let updated = false;

    // On applique le statut (1 ou 0) sur la ligne 1 des TROIS plannings
    views.forEach(view => {
      const names = getSheetNames(view);
      const shPlan = ss.getSheetByName(names.plan);
      if (!shPlan) return;
      
      const lastCol = shPlan.getLastColumn();
      if (lastCol < 8) return;
      
      const datesRaw = shPlan.getRange(2, 8, 1, lastCol - 7).getValues()[0];
      let colIndex = -1;
      for (let i = 0; i < datesRaw.length; i++) {
        if (datesRaw[i] instanceof Date) {
          if (Utilities.formatDate(datesRaw[i], tz, "yyyy-MM-dd") === dateStr) {
            colIndex = i + 8;
            break;
          }
        }
      }

      if (colIndex !== -1) {
        shPlan.getRange(1, colIndex).setValue(newStatusValue);
        updated = true;
      }
    });

    if (updated) {
      return { success: true };
    } else {
      return { success: false, message: "Date introuvable dans le calendrier." };
    }
  } catch (e) {
    throw new Error("Erreur gsToggleWorkingDay: " + e.message);
  }
}

// =========================================================
// 21. Helper: Check if date has tasks or interventions across all sheets
// =========================================================

function hasTasksOnDate(dateStr) {
  const views = ['locataires', 'communs', 'facades'];
  const ssPlan = SpreadsheetApp.openById(PLANNING_SS_ID);
  const ssRes = SpreadsheetApp.openById(RESERVES_SS_ID);
  const tz = ssPlan.getSpreadsheetTimeZone();
  
  // --- 1. VÉRIFICATION DES TÂCHES (Dans les 3 vues) ---
  for (let view of views) {
    const names = getSheetNames(view);
    const sheetName = names.plan;
    const sh = ssPlan.getSheetByName(sheetName);
    if (!sh) continue;

    const lastCol = sh.getLastColumn();
    if (lastCol < 8) continue;

    const datesRow = sh.getRange(2, 8, 1, lastCol - 7).getValues()[0];
    let colIndex = -1;
    
    for (let i = 0; i < datesRow.length; i++) {
      if (datesRow[i] instanceof Date) {
        const iso = Utilities.formatDate(datesRow[i], tz, "yyyy-MM-dd");
        if (iso === dateStr) {
          colIndex = i + 8;
          break;
        }
      }
    }
    
    if (colIndex !== -1) {
      const lastRow = sh.getLastRow();
      if (lastRow >= 7) { 
        const colData = sh.getRange(7, colIndex, lastRow - 6, 1).getValues();
        for (let r = 0; r < colData.length; r++) {
          if (colData[r][0] !== "" && colData[r][0] !== null) return true;
        }
      }
    }
  }

  // --- 2. VÉRIFICATION DES INTERVENTIONS ---
  const interSheets = [
    "AutoControle", "Reserves", 
    "AutoControle Communs", "Reserves Communs", 
    "AutoControle Facades", "Reserves Facades"
  ];

  for (let sName of interSheets) {
    const sh = ssRes.getSheetByName(sName);
    if (!sh) continue;
    
    const lastRow = sh.getLastRow();
    if (lastRow < 7) continue;
    
    const dateCol = sh.getRange(7, 9, lastRow - 6, 1).getValues();
    for (let r = 0; r < dateCol.length; r++) {
      if (dateCol[r][0] instanceof Date) {
        const iso = Utilities.formatDate(dateCol[r][0], tz, "yyyy-MM-dd");
        if (iso === dateStr) return true;
      }
    }
  }
  
  return false;
}
// FIN DU FICHIER - NE RAJOUTEZ AUCUNE ACCOLADE EN DESSOUS