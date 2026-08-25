// =========================================================
// MOBILE API : Version corrigée et complétée
// =========================================================
// Dépend des constantes/fonctions partagées définies ailleurs dans le projet
// (Planning_gs) : PLANNING_SS_ID, BATIMENTS_SS_ID, RESERVES_SS_ID, getSession_,
// assertCanEdit_, getSheetNames. La sauvegarde du statut/des notes réutilise
// directement gsUpdateTaskStatus / gsUpdateTaskNotes / gsSaveInterventionDetails
// (déjà génériques, déjà dans Planning_gs) — aucune fonction de sauvegarde n'est
// dupliquée ici.
//
// INTERVENTIONS (Réserves / Autocontrôles) — AJOUTÉ :
// Comme le desktop (gsGetPlanningWindow), les deux workflows mobiles lisent les
// feuilles "Planning Reserves" / "Planning Reserves Communs" / "Planning Reserves
// Facades" (classeur PLANNING_SS_ID, clé getSheetNames().planReserves) pour savoir
// quels points R-xxx (Réserve) / A-xxx (Autocontrôle) sont placés sur quelle date
// pour quel lot. Ces feuilles ne contiennent QUE des identifiants ; les détails
// (discipline, statut, équipe, description, créneau, date limite) vivent dans un
// classeur SÉPARÉ (RESERVES_SS_ID), feuilles "Reserves"/"AutoControle" (+ variantes
// Communs/Facades), et sont récupérés via les mêmes clés reserves/autocontroles
// que gsGetInterventionDetails côté desktop. Mêmes hypothèses que le desktop :
// "Planning Reserves" partage exactement le même quadrillage colonnes/dates que
// "Planning" (voir gsSaveInterventionDetails, gsGetPlanningWindow), et l'ordre des
// lignes peut différer de "Planning" (on relocalise donc l'ID à chaque fois).

/**
 * Utilitaire partagé : lit une feuille "avancement" ou "Notes" (en-têtes en
 * ligne 6 à partir de la colonne B, ID en colonne A à partir de la ligne 7)
 * et retourne { [id]: { [tacheAbbr]: valeur } }.
 * Même logique que la fonction extractTaskData() locale à gsGetPlanningWindow
 * (Planning_gs.gs) ; dupliquée ici en fonction privée partagée car cette
 * dernière est en closure et n'est pas exportable telle quelle.
 *
 * PERF : en-têtes (ligne 6) et grille (ligne 7+) sont lus en UNE seule
 * requête (getRange(6, ...)) plutôt que deux, pour économiser un aller-retour
 * réseau à chaque appel (voir extractMobileTaskDataCached_ pour la mise en
 * cache, qui élimine la plupart de ces appels au-delà du premier).
 */
function extractMobileTaskData_(ss, sheetName) {
  const dataMap = {};
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return dataMap;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 7 || lastCol < 2) return dataMap;

  // Une seule lecture couvrant à la fois la ligne d'en-têtes (6) et la
  // grille de données (7 à lastRow), au lieu de deux appels séparés.
  const full = sheet.getRange(6, 1, lastRow - 5, lastCol).getValues();
  const hdrs = full[0].slice(1);   // colonne B onward, ligne 6
  const grid = full.slice(1);      // lignes 7+

  for (let r = 0; r < grid.length; r++) {
    const id = String(grid[r][0]).trim();
    if (!id) continue;
    for (let c = 1; c < grid[r].length; c++) {
      const cellVal = String(grid[r][c]).trim();
      if (cellVal !== "") {
        if (!dataMap[id]) dataMap[id] = {};
        dataMap[id][String(hdrs[c - 1]).trim()] = cellVal; // dataMap["Appt 102"]["PLOMB"] = "En cours"
      }
    }
  }
  return dataMap;
}

// =========================================================
// PERF : cache mémoire pour les feuilles "avancement"/"Notes"
// =========================================================
// Ces deux feuilles sont relues intégralement à CHAQUE appel mobile
// (Workflow 1 comme Workflow 2), alors qu'elles ne changent que quand
// quelqu'un enregistre un statut ou une note. On les met donc en cache
// script (CacheService) sur une courte durée : la plupart des requêtes
// consécutives (l'utilisateur qui bascule Aujourd'hui/Demain/Hier, ou qui
// recherche plusieurs lots à la suite) tombent alors sur le cache au lieu
// de refaire une lecture complète de la feuille.
//
// Compromis : une donnée modifiée peut mettre jusqu'à MOBILE_CACHE_TTL_SECONDS
// avant d'être visible depuis un autre appareil (elle est immédiate pour
// l'auteur du changement si vous appelez invalidateMobileTaskCache_ juste
// après l'écriture — voir note plus bas).

const MOBILE_CACHE_TTL_SECONDS = 45; // ajuster selon la fraîcheur souhaitée

function mobileCacheKey_(ss, sheetName) {
  return 'mobtask_' + ss.getId() + '_' + sheetName;
}

/**
 * Variante mise en cache de extractMobileTaskData_. À utiliser à la place de
 * extractMobileTaskData_ dans les deux workflows mobiles.
 */
function extractMobileTaskDataCached_(ss, sheetName) {
  const cache = CacheService.getScriptCache();
  const key = mobileCacheKey_(ss, sheetName);

  const cached = cache.get(key);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // Cache corrompu ou format inattendu : on retombe sur une lecture fraîche.
    }
  }

  const data = extractMobileTaskData_(ss, sheetName);
  try {
    cache.put(key, JSON.stringify(data), MOBILE_CACHE_TTL_SECONDS);
  } catch (e) {
    // La feuille peut dépasser la limite de 100 Ko par clé du CacheService.
    // Pas bloquant : on continue sans cache pour cette feuille.
    console.error('Cache mobile ignoré pour ' + sheetName + ' (trop volumineux ?) : ' + e.message);
  }
  return data;
}

/**
 * À appeler juste après une écriture sur "avancement" ou "Notes" — typiquement
 * en toute fin de gsUpdateTaskStatus / gsUpdateTaskNotes (Planning_gs.js) —
 * pour invalider immédiatement le cache mobile correspondant, sans attendre
 * l'expiration du TTL. Sans cet appel, un changement met jusqu'à
 * MOBILE_CACHE_TTL_SECONDS avant d'apparaître côté mobile pour un autre
 * utilisateur (l'auteur du changement, lui, voit sa modif immédiatement car
 * le frontend met à jour son état local sans recharger depuis le serveur).
 *
 * Exemple d'utilisation dans Planning_gs.js :
 *   function gsUpdateTaskStatus(token, ..., sheetName) {
 *     ... écriture dans la feuille avancement ...
 *     invalidateMobileTaskCache_(SpreadsheetApp.openById(PLANNING_SS_ID), sheetName);
 *   }
 */
function invalidateMobileTaskCache_(ss, sheetName) {
  CacheService.getScriptCache().remove(mobileCacheKey_(ss, sheetName));
}

/**
 * Convertit la valeur brute d'une cellule "Notes" (JSON {pub,int}, ancien
 * format {pub,priv}, ou parfois un texte hérité non-JSON) en objet {pub, int} sûr.
 */
function parseMobileNote_(rawNote) {
  if (!rawNote) return { pub: "", int: "" };
  try {
    const parsed = JSON.parse(rawNote);
    return { pub: parsed.pub || "", int: parsed.int || parsed.priv || "" };
  } catch (e) {
    // Valeur héritée non-JSON : on la traite comme une note interne.
    return { pub: "", int: String(rawNote) };
  }
}

// =========================================================
// INTERVENTIONS (Réserves / Autocontrôles) — lecture + cache
// =========================================================
// Les feuilles "Reserves"/"AutoControle" (classeur RESERVES_SS_ID) partagent le
// même quadrillage colonnes A→K que celui déjà lu par gsGetInterventionDetails /
// gsGetPendingInterventions côté desktop (Planning_gs.js) : ID en colonne B, lot
// en C, discipline en D, description en E, statut en G, équipe en H, date prévue
// en I, créneau en J, date limite en K. On reproduit ici le même mapping colonne
// par colonne, mais en lisant la feuille ENTIÈREMENT (comme extractMobileTaskData_)
// plutôt qu'un ID à la fois, pour pouvoir en mettre le résultat en cache et servir
// plusieurs interventions par appel mobile sans un aller-retour réseau par ID.

/**
 * Lit intégralement une feuille "Reserves" ou "AutoControle" (classeur
 * RESERVES_SS_ID) et retourne { [interId]: { logement, discipline, description,
 * status, equipe, dateStr, creneau, dueDateStr } }. Mêmes colonnes et même
 * formatage de date (dd/MM/yyyy) que gsGetInterventionDetails.
 */
function extractMobileInterventionData_(ssReserves, sheetName) {
  const dataMap = {};
  const sh = ssReserves.getSheetByName(sheetName);
  if (!sh) return dataMap;

  const lastRow = sh.getLastRow();
  if (lastRow < 7) return dataMap;

  const tz = ssReserves.getSpreadsheetTimeZone();
  const rows = sh.getRange(7, 1, lastRow - 6, 11).getValues(); // Col A → K

  rows.forEach(row => {
    const interId = String(row[1] || "").trim(); // Col B
    if (!interId) return;

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

    dataMap[interId] = {
      logement:    String(row[2] || ""),  // Col C
      discipline:  String(row[3] || ""),  // Col D
      description: row[4] || "",          // Col E (JSON pour les Réserves, texte brut pour les Autocontrôles)
      status:      String(row[6] || ""),  // Col G
      equipe:      String(row[7] || ""),  // Col H
      dateStr:     dateStr,               // Col I
      creneau:     String(row[9] || ""),  // Col J
      dueDateStr:  dueDateStr             // Col K
    };
  });

  return dataMap;
}

function mobileInterventionCacheKey_(ssReserves, sheetName) {
  return 'mobinter_' + ssReserves.getId() + '_' + sheetName;
}

/**
 * Variante mise en cache de extractMobileInterventionData_ — même TTL et même
 * stratégie de repli que extractMobileTaskDataCached_ (voir plus haut).
 */
function extractMobileInterventionDataCached_(ssReserves, sheetName) {
  const cache = CacheService.getScriptCache();
  const key = mobileInterventionCacheKey_(ssReserves, sheetName);

  const cached = cache.get(key);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // Cache corrompu ou format inattendu : on retombe sur une lecture fraîche.
    }
  }

  const data = extractMobileInterventionData_(ssReserves, sheetName);
  try {
    cache.put(key, JSON.stringify(data), MOBILE_CACHE_TTL_SECONDS);
  } catch (e) {
    console.error('Cache mobile ignoré pour ' + sheetName + ' (trop volumineux ?) : ' + e.message);
  }
  return data;
}

/**
 * À appeler juste après une écriture sur "Reserves"/"AutoControle" — voir
 * gsSaveInterventionDetailsMobile plus bas — pour invalider immédiatement le
 * cache mobile correspondant, sans attendre l'expiration du TTL.
 */
function invalidateMobileInterventionCache_(ssReserves, sheetName) {
  CacheService.getScriptCache().remove(mobileInterventionCacheKey_(ssReserves, sheetName));
}

/**
 * Convertit la description brute d'une intervention en { pub, int } sûr.
 * IMPORTANT : contrairement à parseMobileNote_ (notes de tâches), une valeur non-
 * JSON hérite ici de "pub" et non de "int" — c'est exactement le comportement du
 * desktop (drawInterventionUI : `notesObj = { pub: data.description, priv: "" }`
 * en cas d'échec de JSON.parse), car une Réserve texte-brut hérité était toujours
 * traitée comme visible/publique, jamais comme une note d'équipe.
 *
 * - Réserve (R-xxx) : description stockée en JSON {pub, priv} — on republie "priv"
 *   sous la clé "int" utilisée partout ailleurs côté mobile.
 * - Autocontrôle (A-xxx) : champ texte unique, jamais de volet privé côté desktop
 *   (les autocontrôles ne sont de toute façon jamais montrés aux clients) — tout
 *   va dans "pub", "int" reste vide.
 */
function parseMobileInterventionNote_(rawDescription, isReserve) {
  if (!isReserve) {
    return { pub: rawDescription ? String(rawDescription) : "", int: "" };
  }
  if (!rawDescription) return { pub: "", int: "" };
  try {
    const parsed = JSON.parse(rawDescription);
    return { pub: parsed.pub || "", int: parsed.priv || parsed.int || "" };
  } catch (e) {
    return { pub: String(rawDescription), int: "" };
  }
}

/**
 * Construit l'entrée mobile pour une intervention (Réserve/Autocontrôle) à partir
 * de son ID et de sa fiche détail (issue de extractMobileInterventionDataCached_).
 * `extra` porte les champs propres à chaque workflow (id/view/viewLabel/context
 * pour le Workflow 1, date/displayDate pour le Workflow 2 — voir gsGetMobileDailyTasks
 * / gsGetMobileEntityTimeline). Retourne null si la fiche détail est introuvable
 * (référence orpheline dans "Planning Reserves" — on l'ignore silencieusement
 * plutôt que de casser l'affichage de toute la liste).
 */
function buildMobileInterventionEntry_(interId, detail, extra) {
  if (!detail) return null;
  const isReserve = interId.indexOf('R-') === 0;
  const base = {
    type: 'intervention',
    interId: interId,
    isReserve: isReserve,
    discipline: detail.discipline || "",
    equipe: detail.equipe || "",
    status: detail.status || "Planifié",
    creneau: detail.creneau || "",
    dueDateStr: detail.dueDateStr || "",
    note: parseMobileInterventionNote_(detail.description, isReserve)
  };
  return Object.assign(base, extra);
}

/**
 * Ouvre RESERVES_SS_ID sans jamais faire planter l'appelant. Contrairement au
 * desktop — qui n'ouvre ce classeur qu'à la demande, au clic sur un point précis
 * (gsGetInterventionDetails/gsGetPendingInterventions) — les deux workflows
 * mobiles l'ouvrent systématiquement à chaque chargement pour fusionner les
 * interventions avec les tâches. Si RESERVES_SS_ID est mal configuré ou
 * inaccessible, on ne veut PAS que ça casse l'affichage des tâches (qui, elles,
 * n'en dépendent pas) : on journalise et on retourne null, et les deux workflows
 * sautent simplement le bloc "interventions" dans ce cas (voir leurs `if
 * (ssReserves && shPlanReserves)`).
 */
function openReservesSpreadsheetSafe_() {
  try {
    return SpreadsheetApp.openById(RESERVES_SS_ID);
  } catch (e) {
    console.error('RESERVES_SS_ID inaccessible, interventions ignorées pour cet appel : ' + e.message);
    return null;
  }
}

/**
 * Workflow 1 : Time-Based (Par Date)
 * Récupère toutes les tâches de toutes les vues pour une journée spécifique,
 * enrichies avec le VRAI statut (feuille "avancement") et les VRAIES notes
 * (feuille "Notes") — exactement comme gsGetPlanningWindow côté desktop.
 * Auparavant, le statut était figé à "Planifié" pour toutes les tâches.
 */
function gsGetMobileDailyTasks(token, dateStr) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  try {
    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    const ssReserves = openReservesSpreadsheetSafe_();
    const tz = ss.getSpreadsheetTimeZone();
    const viewLabels = { locataires: 'Locataires', communs: 'Communs', facades: 'Façades' };

    let dailyTasks = [];

    Object.keys(viewLabels).forEach(viewKey => {
      const names = getSheetNames(viewKey);
      const sh = ss.getSheetByName(names.plan);
      if (!sh) return;

      const lastCol = sh.getLastColumn();
      const lastRow = sh.getLastRow();
      if (lastCol < 8 || lastRow < 7) return;

      const dateRow = sh.getRange(2, 8, 1, lastCol - 7).getValues()[0];
      let targetColIdx = -1;
      for (let i = 0; i < dateRow.length; i++) {
        if (dateRow[i] instanceof Date && Utilities.formatDate(dateRow[i], tz, "yyyy-MM-dd") === dateStr) {
          targetColIdx = i + 8;
          break;
        }
      }
      if (targetColIdx === -1) return;

      // Statut et notes réels, fusionnés comme le fait le desktop.
      // PERF : passage par le cache court-terme (voir extractMobileTaskDataCached_)
      // pour éviter de relire l'intégralité de ces deux feuilles à chaque appel.
      const avancData = extractMobileTaskDataCached_(ss, names.avancement);
      const notesData = extractMobileTaskDataCached_(ss, names.notes);

      // PERF : une seule lecture couvrant colonnes A..targetColIdx au lieu de
      // deux lectures séparées (entityInfo A:C, puis dayData sur la colonne
      // cible) — on récupère id/statut/commentaire ET la valeur du jour dans
      // le même tableau, économisant un aller-retour réseau par vue.
      const wide = sh.getRange(7, 1, lastRow - 6, targetColIdx).getValues();

      // Utilisé aussi bien pour les tâches (ci-dessous) que pour les interventions
      // (bloc "Planning Reserves" plus bas) : "Planning Reserves" n'a pas forcément
      // le même ordre de lignes que "Planning", donc on ne peut pas réutiliser
      // wide[r][2] tel quel pour une ligne d'un autre onglet — ce petit index
      // id -> commentaire global permet aux deux blocs de partager la même lecture.
      const commentById = {};

      for (let r = 0; r < wide.length; r++) {
        const id = String(wide[r][0]).trim();
        if (id) commentById[id] = String(wide[r][2] || "").trim();
        const cellValue = String(wide[r][targetColIdx - 1]).trim();
        if (!id || cellValue === "" || cellValue === "null") continue;

        const tasksInCell = cellValue.split('|').map(t => t.trim()).filter(t => t !== "");

        tasksInCell.forEach(taskStr => {
          const parts = taskStr.split('@');
          const abbr = parts[0].trim();
          const ampm = (parts.length >= 2 && (parts[1] === "AM" || parts[1] === "PM")) ? parts[1] : "";
          const status = (avancData[id] && avancData[id][abbr]) ? avancData[id][abbr] : "Planifié";
          const rawNote = (notesData[id] && notesData[id][abbr]) ? notesData[id][abbr] : "";

          dailyTasks.push({
            id: id,
            view: viewKey,                   // clé technique : 'locataires' | 'communs' | 'facades'
            viewLabel: viewLabels[viewKey],   // libellé d'affichage
            context: String(wide[r][2] || "").trim() || viewLabels[viewKey], // colonne C = commentaire global
            abbr: abbr,
            ampm: ampm,
            status: status,
            note: parseMobileNote_(rawNote)
          });
        });
      }

      // INTERVENTIONS (Réserves / Autocontrôles) — même logique que le bloc
      // "4. RÉSERVES" de gsGetPlanningWindow côté desktop : la même colonne-date
      // (targetColIdx, déjà localisée ci-dessus sur "Planning") est relue sur
      // "Planning Reserves", qui partage le même quadrillage colonnes/dates mais
      // pas forcément le même ordre de lignes — on relocalise donc l'ID par ligne.
      const shPlanReserves = ss.getSheetByName(names.planReserves);
      if (ssReserves && shPlanReserves) {
        const lastRowRes = shPlanReserves.getLastRow();
        const lastColRes = shPlanReserves.getLastColumn();
        if (lastRowRes >= 7 && lastColRes >= targetColIdx) {
          const reservesMap = extractMobileInterventionDataCached_(ssReserves, names.reserves);
          const autocontrolesMap = extractMobileInterventionDataCached_(ssReserves, names.autocontroles);
          const wideRes = shPlanReserves.getRange(7, 1, lastRowRes - 6, targetColIdx).getValues();

          for (let r = 0; r < wideRes.length; r++) {
            const id = String(wideRes[r][0]).trim();
            const cellValue = String(wideRes[r][targetColIdx - 1]).trim();
            if (!id || cellValue === "" || cellValue === "null") continue;

            const interIds = cellValue.split('|').map(x => x.trim()).filter(x => x !== "");
            interIds.forEach(interId => {
              const isReserve = interId.indexOf('R-') === 0;
              const detail = isReserve ? reservesMap[interId] : autocontrolesMap[interId];
              const entry = buildMobileInterventionEntry_(interId, detail, {
                id: id,
                view: viewKey,
                viewLabel: viewLabels[viewKey],
                context: commentById[id] || viewLabels[viewKey]
              });
              if (entry) dailyTasks.push(entry);
            });
          }
        }
      }
    });

    // Confort d'affichage : tâches "toute la journée", puis AM, puis PM
    const rank = t => (t.ampm === 'AM' ? 0 : t.ampm === 'PM' ? 2 : 1);
    dailyTasks.sort((a, b) => rank(a) - rank(b));

    return { success: true, data: dailyTasks };

  } catch (e) {
    console.error("Erreur gsGetMobileDailyTasks: " + e.message);
    throw new Error("Erreur serveur lors de la récupération des tâches.");
  }
}

/**
 * Workflow 2 : Entity-Based (Par Lot)
 * Récupère tout l'historique d'une entité spécifique (ex: Appt 102),
 * enrichi avec le vrai statut et les vraies notes.
 *
 * Important (comportement hérité du desktop, pas une limitation mobile) :
 * statut et notes sont stockés par (entité, tâche) — PAS par date. Modifier
 * le statut depuis une occurrence donnée le modifie donc pour TOUTES les
 * occurrences de cette tâche pour ce lot, quelle que soit la date depuis
 * laquelle on l'a fait. Le frontend affiche un petit rappel de ce comportement.
 */
function gsGetMobileEntityTimeline(token, viewName, entityId) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  try {
    const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
    const ssReserves = openReservesSpreadsheetSafe_();
    const names = getSheetNames(viewName); // retombe sur 'locataires' si viewName est inconnu (comportement de getSheetNames)
    const sh = ss.getSheetByName(names.plan);
    if (!sh) return { success: false, message: "Feuille introuvable." };

    const lastCol = sh.getLastColumn();
    const lastRow = sh.getLastRow();
    if (lastCol < 8 || lastRow < 7) return { success: true, data: [] };

    const idCol = sh.getRange(7, 1, lastRow - 6, 1).getValues();
    let targetRowIdx = -1;
    for (let r = 0; r < idCol.length; r++) {
      if (String(idCol[r][0]).trim() === String(entityId).trim()) { targetRowIdx = r + 7; break; }
    }
    if (targetRowIdx === -1) {
      return { success: false, message: "Entité introuvable dans ce planning." };
    }

    // PERF : même cache court-terme que le Workflow 1 — les deux workflows
    // partagent la même clé de cache par feuille, donc un utilisateur qui
    // consulte plusieurs lots à la suite (ou qui vient de consulter la vue
    // "par date") bénéficie directement des lectures déjà en cache.
    const avancData = extractMobileTaskDataCached_(ss, names.avancement);
    const notesData = extractMobileTaskDataCached_(ss, names.notes);
    const idKey = String(entityId).trim();

    const tz = ss.getSpreadsheetTimeZone();
    const dates = sh.getRange(2, 8, 1, lastCol - 7).getValues()[0];
    const tasks = sh.getRange(targetRowIdx, 8, 1, lastCol - 7).getValues()[0];

    let timeline = [];

    for (let i = 0; i < tasks.length; i++) {
      const cellValue = String(tasks[i]).trim();
      if (cellValue === "" || cellValue === "null" || !(dates[i] instanceof Date)) continue;

      const tasksInCell = cellValue.split('|').map(t => t.trim()).filter(t => t !== "");

      tasksInCell.forEach(taskStr => {
        const parts = taskStr.split('@');
        const abbr = parts[0].trim();
        const ampm = (parts.length >= 2 && (parts[1] === "AM" || parts[1] === "PM")) ? parts[1] : "";
        const status = (avancData[idKey] && avancData[idKey][abbr]) ? avancData[idKey][abbr] : "Planifié";
        const rawNote = (notesData[idKey] && notesData[idKey][abbr]) ? notesData[idKey][abbr] : "";

        timeline.push({
          date: Utilities.formatDate(dates[i], tz, "yyyy-MM-dd"),
          displayDate: Utilities.formatDate(dates[i], tz, "dd/MM/yyyy"),
          abbr: abbr,
          ampm: ampm,
          status: status,
          note: parseMobileNote_(rawNote)
        });
      });
    }

    // Plus récent en premier : plus utile sur site que l'ordre chronologique
    timeline.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    // INTERVENTIONS (Réserves / Autocontrôles) — même principe que le Workflow 1 :
    // "Planning Reserves" n'a pas forcément le même ordre de lignes que "Planning",
    // donc on relocalise l'entité par son ID plutôt que de réutiliser targetRowIdx.
    const shPlanReserves = ss.getSheetByName(names.planReserves);
    if (ssReserves && shPlanReserves) {
      const lastRowRes = shPlanReserves.getLastRow();
      if (lastRowRes >= 7) {
        const idColRes = shPlanReserves.getRange(7, 1, lastRowRes - 6, 1).getValues();
        let reserveRowIdx = -1;
        for (let r = 0; r < idColRes.length; r++) {
          if (String(idColRes[r][0]).trim() === idKey) { reserveRowIdx = r + 7; break; }
        }

        if (reserveRowIdx !== -1) {
          // "Planning Reserves" est censé partager le même quadrillage colonnes/
          // dates que "Planning" (voir gsSaveInterventionDetails côté desktop) ;
          // on se protège quand même d'un onglet plus étroit avec ce Math.min.
          const lastColRes = shPlanReserves.getLastColumn();
          const resWidth = Math.min(lastCol, lastColRes) - 7;

          if (resWidth > 0) {
            const reservesCells = shPlanReserves.getRange(reserveRowIdx, 8, 1, resWidth).getValues()[0];
            const reservesMap = extractMobileInterventionDataCached_(ssReserves, names.reserves);
            const autocontrolesMap = extractMobileInterventionDataCached_(ssReserves, names.autocontroles);

            for (let i = 0; i < reservesCells.length; i++) {
              const cellValue = String(reservesCells[i]).trim();
              if (cellValue === "" || cellValue === "null" || !(dates[i] instanceof Date)) continue;

              const interIds = cellValue.split('|').map(x => x.trim()).filter(x => x !== "");
              interIds.forEach(interId => {
                const isReserve = interId.indexOf('R-') === 0;
                const detail = isReserve ? reservesMap[interId] : autocontrolesMap[interId];
                const entry = buildMobileInterventionEntry_(interId, detail, {
                  date: Utilities.formatDate(dates[i], tz, "yyyy-MM-dd"),
                  displayDate: Utilities.formatDate(dates[i], tz, "dd/MM/yyyy")
                });
                if (entry) timeline.push(entry);
              });
            }

            // Re-tri : le bloc ci-dessus a pu ajouter des entrées après le tri initial.
            timeline.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
          }
        }
      }
    }

    // NOUVEAU : Récupération des infos globales du lot (Colonne B = Statut, Colonne C = Note)
    const globalStatus = String(sh.getRange(targetRowIdx, 2).getValue()).trim();
    const globalComment = String(sh.getRange(targetRowIdx, 3).getValue()).trim();

    return { 
      success: true, 
      data: timeline, 
      meta: { status: globalStatus, comment: globalComment } // Injecté pour l'UI mobile
    };

  } catch (e) {
    console.error("Erreur gsGetMobileEntityTimeline: " + e.message);
    throw new Error("Erreur serveur lors de la récupération de l'historique.");
  }
}

/**
 * Convertit une valeur brute de cellule en chaîne, sans écraser les valeurs
 * falsy légitimes comme le nombre 0 (ex : Étage "0" / RDC).
 * BUG CORRIGÉ : "String(val || '')" transforme à tort 0 en "" car 0 est
 * falsy en JS ; seules les cellules réellement vides (null/undefined)
 * doivent devenir "".
 */
function mobileSafeCell_(val) {
  return (val === null || val === undefined) ? "" : String(val).trim();
}

/**
 * Workflow 2 Setup : Récupère la structure arborescente légère pour les dropdowns mobiles.
 *
 * CORRIGÉ : cette fonction lisait auparavant à partir de la colonne A du
 * classeur BATIMENTS. Or la colonne A n'est PAS l'identifiant utilisé partout
 * ailleurs (Planning, avancement, Notes) — c'est la colonne B, exactement
 * comme le fait gsGetPlanningWindow (shSource.getRange(7, 2, ..., 13)).
 * Toutes les valeurs remontées (id, bâtiment, hall, étage, nom...) étaient
 * donc décalées d'une colonne. Reproduit ici le même mapping de colonnes
 * que gsGetPlanningWindow, colonne par colonne.
 */
function gsGetMobileHierarchy(token) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  try {
    const views = ['locataires', 'communs', 'facades'];
    
    // 1. Préparation des plages pour la requête groupée (Colonnes B à N = 13 colonnes)
    const ranges = views.map(type => {
      const sheetName = getSheetNames(type).source;
      return `'${sheetName}'!B7:N`;
    });

    // 2. Appel unique à l'API Google Sheets
    const response = Sheets.Spreadsheets.Values.batchGet(BATIMENTS_SS_ID, {
      ranges: ranges
    });

    const hierarchy = { locataires: [], communs: [], facades: [] };

    // 3. Traitement instantané en mémoire
    views.forEach((type, index) => {
      const rows = response.valueRanges[index].values || [];

      rows.forEach(row => {
        const id = mobileSafeCell_(row[0]); // Col B
        if (id === "") return;

        const item = {
          id: id,
          batiment: mobileSafeCell_(row[2]), // Col D
          hall: mobileSafeCell_(row[3])      // Col E
        };

        if (type === 'facades') {
          // Les façades n'ont pas d'"étage" : leur 3e niveau de regroupement est la "Trame".
          const colG = mobileSafeCell_(row[5]); // Col G
          const colH = mobileSafeCell_(row[6]); // Col H
          const gNum = parseInt(colG, 10);
          item.groupLabel = "Trame";
          item.groupValue = ("Trame " + (!isNaN(gNum) ? String(gNum).padStart(2, '0') : colG)).trim();
          item.trame = (item.groupValue + (colH ? " - " + colH : "")).trim();
        } else {
          // Locataires et Communs se regroupent par étage (Col F).
          item.groupLabel = "Étage";
          item.groupValue = mobileSafeCell_(row[4]); // Col F
          item.etage = item.groupValue;
        }

        if (type === 'locataires') {
          item.nom = `${mobileSafeCell_(row[10])} ${mobileSafeCell_(row[11])}`.trim(); // Col L + M
        }

        hierarchy[type].push(item);
      });
    });

    return { success: true, data: hierarchy };
  } catch (e) {
    console.error("Erreur gsGetMobileHierarchy: " + e.message);
    throw new Error("Erreur serveur lors de la récupération de la hiérarchie.");
  }
}

// =========================================================
// MOBILE-SAFE WRITE WRAPPERS
// =========================================================
// CORRECTION : le cache mobile (extractMobileTaskDataCached_ / MOBILE_CACHE_TTL_SECONDS
// plus haut dans ce fichier) documentait déjà le besoin d'invalider "avancement"/"Notes"
// juste après une écriture, mais cet appel n'était jamais réellement branché nulle part.
// Résultat concret : après avoir enregistré un statut/une note/un ajout/une suppression/un
// déplacement depuis le mobile, rouvrir la même vue (même pour son propre auteur, quelques
// secondes plus tard) pouvait réafficher l'ancienne valeur jusqu'à MOBILE_CACHE_TTL_SECONDS.
//
// Les fonctions ci-dessous enveloppent les fonctions partagées existantes de Planning_gs.js
// SANS EN MODIFIER UNE SEULE LIGNE : aucune logique d'écriture n'est dupliquée, on appelle
// la fonction originale telle quelle puis on invalide la clé de cache concernée. Le frontend
// mobile doit appeler ces variantes *Mobile à la place des fonctions brutes pour toute
// écriture qui touche "avancement" ou "Notes" (statut, notes, suppression, ajout,
// déplacement). gsUpdateGlobalStatus / gsUpdateIdNotes n'ont pas besoin d'un wrapper : elles
// écrivent dans les colonnes B/C du Planning principal, que le mobile relit toujours en
// direct (jamais via le cache), donc aucune invalidation n'est nécessaire pour ces deux-là.

function gsUpdateTaskStatusMobile(token, logId, dateStr, baseTaskAbbr, newStatus, currentView) {
  const result = gsUpdateTaskStatus(token, logId, dateStr, baseTaskAbbr, newStatus, currentView);
  const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
  invalidateMobileTaskCache_(ss, getSheetNames(currentView).avancement);
  return result;
}

function gsUpdateTaskNotesMobile(token, logId, dateStr, baseTaskAbbr, notesJSON, currentView) {
  const result = gsUpdateTaskNotes(token, logId, dateStr, baseTaskAbbr, notesJSON, currentView);
  const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
  invalidateMobileTaskCache_(ss, getSheetNames(currentView).notes);
  return result;
}

function gsExecuteDeletionMobile(token, tasks, currentView) {
  const result = gsExecuteDeletion(token, tasks, currentView);
  const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
  const names = getSheetNames(currentView);
  invalidateMobileTaskCache_(ss, names.avancement);
  invalidateMobileTaskCache_(ss, names.notes);
  return result;
}

function gsExecuteInterventionMobile(token, actions, currentView) {
  const result = gsExecuteIntervention(token, actions, currentView);
  const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
  const names = getSheetNames(currentView);
  invalidateMobileTaskCache_(ss, names.avancement);
  invalidateMobileTaskCache_(ss, names.notes);
  return result;
}

function gsShiftTaskWithDominoMobile(token, logId, taskAbbr, oldDateStr, newDateStr, currentView, mode) {
  const result = gsShiftTaskWithDomino(token, logId, taskAbbr, oldDateStr, newDateStr, currentView, mode);
  const ss = SpreadsheetApp.openById(PLANNING_SS_ID);
  invalidateMobileTaskCache_(ss, getSheetNames(currentView).avancement);
  return result;
}

/**
 * Enregistre le statut et/ou la description d'une intervention (Réserve/Autocontrôle)
 * — PAS à confondre avec gsExecuteInterventionMobile ci-dessus, qui planifie une
 * TÂCHE/un cycle sur le planning et n'a rien à voir avec les points Réserve/
 * Autocontrôle. Enveloppe gsSaveInterventionDetails (Planning_gs.js, inchangée)
 * puis invalide le cache mobile "Reserves"/"AutoControle" correspondant, comme les
 * wrappers ci-dessus le font déjà pour "avancement"/"Notes".
 * `payload` : { status?, description? } — mêmes clés que côté desktop
 * (autoSaveInterventionField / saveInterventionNotes). Le mobile ne propose pour
 * l'instant que statut + description ; discipline/équipe/date/créneau restent
 * réservés à l'édition desktop.
 */
function gsSaveInterventionDetailsMobile(token, interId, payload, currentView) {
  const result = gsSaveInterventionDetails(token, interId, payload, currentView);
  const ssReserves = SpreadsheetApp.openById(RESERVES_SS_ID);
  const names = getSheetNames(currentView);
  const sheetName = String(interId).indexOf('R-') === 0 ? names.reserves : names.autocontroles;
  invalidateMobileInterventionCache_(ssReserves, sheetName);
  return result;
}