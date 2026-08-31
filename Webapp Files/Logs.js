/**
 * =================================================================
 * LOGGING — UNIVERSAL & ERROR
 * =================================================================
 *
 * Canonical columns for a freshly-created Logs_<module> sheet (order
 * doesn't matter for existing sheets — both read and write sides look up
 * each column by name via _findLogCol(), not position, so a sheet with
 * extra/reordered/migrated columns still works):
 *   Log_ID, Timestamp, Entity_ID, Visibility, Type, User, Role, Action,
 *   Payload
 *
 * "Field changed / old value / new value" (agents/edl-page-spec.md section
 * 1.6) is deliberately NOT a set of dedicated columns here — that
 * requirement is already met by an existing convention: a `details` entry
 * shaped like `{ "Ancien": x, "Nouveau": y }` (2 keys, before/after) is
 * auto-detected and rendered as a struck-through→bold diff by
 * ClientLib.html's _detectBeforeAfter()/_renderDetailRow(). Building flat
 * OldValue/NewValue columns on top of that would itself be the kind of
 * parallel logging mechanism this system is supposed to avoid (decided
 * 2026-08-26, see agents/edl-todo.md's "Resolved" section) — one entry can
 * already carry several such before/after pairs (one per changed field),
 * which flat columns couldn't represent anyway. Use that `details` shape
 * for any new "what changed" logging rather than inventing another one.
 *
 * BUG FIXED 2026-08-26: the read side (gsGetUniversalLog) used to look for
 * headers on row 4 / data from row 5, while the write side has always put
 * headers on row 1 / data from row 2 — a real, longstanding read/write
 * mismatch (unrelated to the Role-column addition below). Both now agree
 * on row 1 / row 2.
 */

/**
 * Resolves the sheet a given module's entries live in — the ONE place that
 * decides "Logs_<module>", shared by the write side (gsWriteUniversalLog,
 * below) and the read side (gsGetUniversalLog, further down) so they can
 * never drift apart. Any module gets its own sheet (edl, travaux, elec,
 * sanit, reserves, formulaires, locataires, communs, facades, or anything
 * added later) — there is no whitelist to keep updated as the app grows.
 * A blank/missing module is the only case that falls back to "Logs_system".
 */
function _resolveLogSheetName(module) {
  const clean = String(module || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return clean ? "Logs_" + clean : "Logs_system";
}

// Canonical header set for a brand-new sheet, and the full set
// _ensureLogSheetHeaders() below guarantees exists (in some order,
// anywhere) on every sheet before a write.
const LOG_HEADERS = ["Log_ID", "Timestamp", "Entity_ID", "Visibility", "Type", "User", "Role", "Action", "Payload"];

/**
 * Appends any header from LOG_HEADERS that isn't already present (matched
 * name-insensitively via _findLogCol, same normalization as everywhere
 * else in this file) to the right of a sheet's current last column. Never
 * touches/reorders an existing header — old rows stay valid under
 * whatever positions they were originally written at. Migrates an
 * old-schema sheet (pre-Role) forward the first time it's written to
 * again; a no-op on an already-current sheet.
 */
function _ensureLogSheetHeaders(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const missing = LOG_HEADERS.filter(h => _findLogCol(existing, [h]) === -1);
  if (missing.length) {
    const range = sheet.getRange(1, lastCol + 1, 1, missing.length);
    range.setValues([missing]);
    range.setFontWeight("bold").setBackground("#e2e8f0");
  }
}

/**
 * Writes a structured log entry to the appropriate module sheet.
 *
 * @param {string} token   - Session token (required — validates the caller).
 * @param {Object} payload - Log payload object.
 */
function gsWriteUniversalLog(token, payload) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");

  try {
    const props = PropertiesService.getScriptProperties();
    const ssId = props.getProperty("LOG_SPREADSHEET_ID");

    if (!ssId) {
      throw new Error("LOG_SPREADSHEET_ID property is missing.");
    }

    const ss = SpreadsheetApp.openById(ssId);

    // Route to the module's own sheet — same resolver the read side uses.
    const sheetName = _resolveLogSheetName(payload.module);

    let sheet = ss.getSheetByName(sheetName);

    // Auto-create the sheet with headers if it doesn't exist yet; migrate
    // an already-existing sheet forward if it predates a header that's
    // since been added (e.g. Role, 2026-08-26).
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(LOG_HEADERS);
      sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight("bold").setBackground("#e2e8f0");
      sheet.setFrozenRows(1);
    } else {
      _ensureLogSheetHeaders(sheet);
    }

    // Column-name lookup, not fixed positions — so a sheet whose columns
    // ended up in a different order (e.g. Role appended after Payload on
    // an old sheet, instead of between User and Action like a fresh
    // sheet's) still gets every value written to the right place.
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const col = {
      logId:      _findLogCol(headers, ['log_id', 'logid']),
      timestamp:  _findLogCol(headers, ['timestamp', 'date', 'horodatage']),
      entityId:   _findLogCol(headers, ['entity_id', 'entityid']),
      visibility: _findLogCol(headers, ['visibility', 'visibilite', 'visibilité']),
      type:       _findLogCol(headers, ['type']),
      userEmail:  _findLogCol(headers, ['user', 'useremail', 'user email', 'email', 'utilisateur']),
      role:       _findLogCol(headers, ['role']),
      action:     _findLogCol(headers, ['action']),
      payload:    _findLogCol(headers, ['payload', 'details', 'détails'])
    };

    const logId      = Utilities.getUuid();
    const timestamp  = new Date();
    const entityId   = payload.id || "N/A";
    const visibility = payload.visibility || "Private";
    const type       = payload.type || "Detail";
    const logUser    = payload.userEmail || Session.getActiveUser().getEmail() || "Inconnu";
    // Derived from the already-validated session, not the client-supplied
    // payload — a role can't be spoofed this way, and every existing
    // appLog() call site gets it for free with no changes on their end.
    const logRole    = user.role || "Inconnu";
    const logAction  = payload.action || "SANS_ACTION";

    let detailsStr = "{}";
    if (payload.details) {
      detailsStr = (typeof payload.details === 'object')
        ? JSON.stringify(payload.details)
        : String(payload.details);
    }

    const row = new Array(headers.length).fill("");
    const set = (idx, val) => { if (idx !== -1) row[idx] = val; };
    set(col.logId, logId);
    set(col.timestamp, timestamp);
    set(col.entityId, entityId);
    set(col.visibility, visibility);
    set(col.type, type);
    set(col.userEmail, logUser);
    set(col.role, logRole);
    set(col.action, logAction);
    set(col.payload, detailsStr);

    sheet.appendRow(row);

  } catch (e) {
    gsWriteErrorLog(
      e.message || e.toString(),
      e.stack    || "Aucune trace disponible",
      "gsWriteUniversalLog",
      payload
    );
  }
}

/**
 * Writes an error entry to the "Errors" sheet.
 *
 * Columns: A(empty), B(Timestamp), C(Email), D(Message),
 *          E(Stack Trace), F(Context), G(Payload)
 *
 * @param {string} errorMessage - The error message string.
 * @param {string} stackTrace   - The stack trace string.
 * @param {string} context      - The function or location where the error occurred.
 * @param {*}      payload      - Any additional data to record (will be JSON-stringified).
 */
function gsWriteErrorLog(errorMessage, stackTrace, context, payload) {
  try {
    const props = PropertiesService.getScriptProperties();
    const ssId = props.getProperty("LOG_SPREADSHEET_ID");

    if (!ssId) {
      console.error("gsWriteErrorLog: LOG_SPREADSHEET_ID property is missing.");
      return;
    }

    const sheet = SpreadsheetApp.openById(ssId).getSheetByName("Errors");
    if (!sheet) {
      console.error("gsWriteErrorLog: Sheet 'Errors' not found in the target spreadsheet.");
      return;
    }

    const timestamp = new Date();
    const userEmail = Session.getActiveUser().getEmail() || "Inconnu";

    let safePayload = "";
    if (payload) {
      try {
        safePayload = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
      } catch (_) {
        safePayload = "Could not stringify payload";
      }
    }

    sheet.appendRow([
      "",            // Col A: Empty (reserved)
      timestamp,     // Col B: Timestamp
      userEmail,     // Col C: User Email
      errorMessage,  // Col D: Error Message
      stackTrace,    // Col E: Stack Trace
      context,       // Col F: Context / Origin
      safePayload    // Col G: Payload
    ]);

  } catch (loggingError) {
    // Ultimate fallback — if even this fails, at least log to the GAS console
    console.error("gsWriteErrorLog: Critical failure writing to Error sheet: ", loggingError);
  }
}

/**
 * =================================================================
 * UNIVERSAL LOG — READ SIDE (Journal Universel / "Historique")
 * =================================================================
 * Read-side counterpart to gsWriteUniversalLog() above. Generic and
 * cross-module on purpose — this is THE global extraction function: any
 * page's "Historique" button calls this (via ClientLib.txt's
 * fetchHistory()/showHistoryModal()) for any (module, id) pair — EDL,
 * Travaux, Élec, Sanit, Réserves, Formulaires, Locataires, Communs,
 * Facades, or any future module — without needing to know anything about
 * that module beyond its name and the entity's ID.
 *
 * Moved here from EDL_gs.txt so it lives next to its write-side
 * counterpart instead of being tied to one page's server file — that
 * earlier copy (and its UNIVERSAL_LOG_SS_ID / UNIVERSAL_LOG_SHEET_NAME
 * placeholders) has been removed from EDL_gs.txt to avoid two conflicting
 * definitions in the same Apps Script project.
 *
 * Privacy — two independent layers, deliberately kept separate:
 *   A) isClient (real client accounts): enforced HERE, server-side, before
 *      data ever leaves the server. A Private-visibility entry is skipped
 *      entirely for a client session — never sent, not just hidden in the UI.
 *   B) Private notes/fields *inside* a Public entry's payload (e.g. a
 *      "Notes" group holding both a public and a private note) are stripped
 *      by _stripPrivateDetailsDeep() below, recursively, wherever they sit
 *      in the details tree — a flat/top-level-only check would miss a note
 *      nested inside a group like "Note Privée (Interne)". Convention: any
 *      details key whose name contains "priv" (accent/case-insensitive —
 *      matches privateNote, privNote, "Privée", "Private", ...) is treated
 *      as private. Keep using that naming convention for anything that must
 *      stay internal. Mirrored client-side in ClientLib.txt's
 *      PRIVATE_DETAIL_KEYS (that copy is a presentation-only simulation for
 *      the staff ClientView toggle — see ClientLib.txt section 10 — this
 *      one is the real, enforced boundary).
 *   The staff "ClientView" preview toggle never touches this function:
 *   staff sessions always get the full, unfiltered list from here.
 *
 * C) Type is always extracted per entry ('Milestone' or 'Detail') so any
 *    caller can decide how to display it — e.g. ClientLib.txt's
 *    showHistoryModal() shows Milestone rows by default with an expand
 *    button that reveals Detail rows.
 * D) This function itself never filters by type — Milestone and Detail
 *    entries are always returned together; it's purely a display choice
 *    made by whoever renders the list (see C).
 */

// Keys inside a log entry's `details` object that are never shown to a
// client-type session, even when the entry itself is Public — matched as a
// case/accent-insensitive SUBSTRING against each key name, at any nesting
// depth (see _stripPrivateDetailsDeep below). Mirrored client-side in
// ClientLib.txt's PRIVATE_DETAIL_KEYS — keep both lists in sync.
const PRIVATE_DETAIL_KEYS = ['priv'];

/**
 * Resolves a header's column index by trying a list of candidate labels.
 * Both the header and each candidate are normalized (lowercased, accents
 * and non-alphanumeric characters stripped) before comparing, so "Log_ID",
 * "log id" and "logid" all match the same candidate — column order, casing
 * and separators in the sheet don't matter, only the letters/digits do.
 */
function _findLogCol(headers, candidates) {
  const norm = s => String(s).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]/g, '');                        // strip spaces/underscores/punct
  const normalizedHeaders = headers.map(norm);
  for (const c of candidates) {
    const idx = normalizedHeaders.indexOf(norm(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * ⚠️ CONFIRM: adjust if getSession_() names/derives the client flag
 * differently (e.g. user.role === 'client'). Kept as its own one-line
 * function on purpose, so there's exactly one place to fix if it differs.
 * Matches APP_DATA.isClient, which EDL_Script_1.txt reads straight off the
 * same session-derived user object server-side.
 */
function _isClientSession(user) {
  return !!(user && user.isClient === true);
}

/**
 * True if `key`'s normalized name (lowercased, accents stripped) contains
 * one of the PRIVATE_DETAIL_KEYS markers.
 */
function _matchesPrivateKey(key) {
  const k = String(key).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return PRIVATE_DETAIL_KEYS.some(marker => k.includes(marker));
}

/**
 * Recursively strips any key — at any nesting depth, inside plain objects
 * and arrays alike — that matches _matchesPrivateKey(). Needed because a
 * private note can sit several levels down (e.g. a "2. Notes Renseignées"
 * group containing both "Note Publique" and "Note Privée (Interne)"); a
 * flat top-level-only check would miss it and leak the private one to a
 * client session. Returns a NEW value — the input is never mutated.
 */
function _stripPrivateDetailsDeep(value) {
  if (Array.isArray(value)) {
    return value.map(_stripPrivateDetailsDeep);
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => {
      if (_matchesPrivateKey(k)) return; // drop this key (and everything under it) entirely
      out[k] = _stripPrivateDetailsDeep(value[k]);
    });
    return out;
  }
  return value; // primitive — nothing to strip
}

/**
 * Returns the history of a single (module, id) pair, most recent first.
 *
 * `projectId` is accepted for consistency with the rest of the app and to
 * leave room for a future project-scoped permission check; it isn't
 * currently used to pick the spreadsheet, since the Journal is a single
 * cross-project log.
 *
 *   gsGetUniversalLog(token, projectId, 'reserves', 'R-2026-004')
 *   gsGetUniversalLog(token, projectId, 'edl', 'LOT-014')
 *
 * Returns: [{ id, module, entityId, action, visibility, type, details,
 *             userEmail, role, timestamp }, ...]. For a client session, Private
 * entries are omitted entirely (A) and any private field inside `details`
 * is stripped, however deeply nested (B). `type` is always present (C) and
 * is never filtered on here — Milestone and Detail entries both come back
 * together (D); the caller decides how to display each.
 */
function gsGetUniversalLog(token, projectId, module, entityId) {
  const user = getSession_(token);
  if (!user) throw new Error("Sécurité : Session expirée.");
  if (!module || !entityId) return [];

  const isClientUser = _isClientSession(user);

  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty("LOG_SPREADSHEET_ID");
  if (!ssId) throw new Error("LOG_SPREADSHEET_ID property is missing.");

  const ss = SpreadsheetApp.openById(ssId);
  const sheetName = _resolveLogSheetName(module);
  const sheet = ss.getSheetByName(sheetName);

  // No sheet yet simply means nothing has ever been logged for this module
  // — a normal state for a brand-new module/entity, not an error.
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0]; // row 1 — header row (matches gsWriteUniversalLog; was row 4, fixed 2026-08-26)

  const col = {
    logId:      _findLogCol(headers, ['log_id', 'logid']),
    timestamp:  _findLogCol(headers, ['timestamp', 'date', 'horodatage']),
    entityId:   _findLogCol(headers, ['entity_id', 'entityid']),
    visibility: _findLogCol(headers, ['visibility', 'visibilite', 'visibilité']),
    type:       _findLogCol(headers, ['type']),
    userEmail:  _findLogCol(headers, ['user', 'useremail', 'user email', 'email', 'utilisateur']),
    role:       _findLogCol(headers, ['role']),
    action:     _findLogCol(headers, ['action']),
    payload:    _findLogCol(headers, ['payload', 'details', 'détails'])
  };

  if (col.entityId === -1) {
    throw new Error(`Colonne Entity_ID introuvable dans la feuille "${sheetName}".`);
  }

  const targetId = String(entityId).trim();
  const results = [];

  for (let i = 1; i < data.length; i++) { // data starts row 2 (was row 5, fixed 2026-08-26)
    const row = data[i];
    if (String(row[col.entityId]).trim() !== targetId) continue;

    const visibility = col.visibility !== -1 ? String(row[col.visibility]).trim() : 'Public';
    if (isClientUser && visibility === 'Private') continue; // A — fully-private entry: skip entirely

    let details = {};
    if (col.payload !== -1) {
      const raw = row[col.payload];
      try {
        details = raw ? JSON.parse(raw) : {};
      } catch (e) {
        details = { raw: String(raw) }; // legacy/non-JSON cell — surface it rather than losing it silently
      }
    }
    if (isClientUser) {
      details = _stripPrivateDetailsDeep(details); // B — private notes/fields, however deeply nested
    }

    const rawTs = col.timestamp !== -1 ? row[col.timestamp] : null;
    const timestamp = (rawTs instanceof Date) ? rawTs.toISOString() : String(rawTs || '');

    results.push({
      id:         col.logId !== -1 ? String(row[col.logId]) : `${sheetName}-${i + 1}`,
      module:     String(module).trim(),
      entityId:   targetId,
      action:     col.action !== -1 ? String(row[col.action]).trim() : '',
      visibility: visibility,
      type:       (col.type !== -1 && String(row[col.type]).trim()) || 'Milestone', // C — always extracted
      details:    details,
      userEmail:  col.userEmail !== -1 ? String(row[col.userEmail]).trim() : '',
      role:       col.role !== -1 ? String(row[col.role]).trim() : '',
      timestamp:  timestamp
    });
    // D — no type filtering: Milestone and Detail entries both included above.
  }

  results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // most recent first
  return results;
}