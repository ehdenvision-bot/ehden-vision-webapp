/**
 * =================================================================
 * ONE-TIME DATA MIGRATION — Locataires / Bâtiments / Planning notes
 *   Google Sheets  ->  Postgres  (via the Node bridge)
 * =================================================================
 *
 * Run ONCE, by hand, from the Apps Script editor, when cutting the
 * Locataires module over to the API. It reads the same sheets the live
 * app reads (reusing Locataires_Code.js's readers) and POSTs them to the
 * server's importLocatairesBundle RPC, which TRUNCATEs + reloads the 5
 * Postgres tables in one transaction.
 *
 * Prerequisites:
 *   - Script Properties API_BASE_URL + API_SHARED_SECRET set (see ApiClient.js).
 *   - Server started with  ALLOW_BULK_IMPORT=true  (it refuses otherwise).
 *   - Server reachable over public HTTPS (UrlFetchApp can't hit localhost).
 *
 * After a verified load: set ALLOW_BULK_IMPORT back to unset/false on the
 * server and restart, so an accidental re-run can't wipe rows edited
 * through the API.
 *
 * Safe to re-run from the same sheets (idempotent) while the flag is on.
 * This file is never called automatically and can be deleted once the
 * Locataires cutover is done and verified.
 */

/**
 * Dry run — logs what WOULD be sent (row counts + one sample of each),
 * makes no network call. Use this first to sanity-check the read.
 */
function previewLocatairesImport_() {
  var bundle = buildLocatairesBundle_();
  var summary = {
    locataires: bundle.locataires.length,
    communs: bundle.communs.length,
    facades: bundle.facades.length,
    configFacades: bundle.configFacades.length,
    planningNotes: bundle.planningNotes.length,
    sample: {
      locataire: bundle.locataires[0] || null,
      planningNote: bundle.planningNotes[0] || null
    }
  };
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

/**
 * The real thing — reads the sheets and POSTs to importLocatairesBundle.
 * Logs the server's per-table inserted counts.
 */
function importLocatairesToApi_() {
  var bundle = buildLocatairesBundle_();
  var result = callApi_('importLocatairesBundle', [bundle]);
  Logger.log('Import terminé : ' + JSON.stringify(result, null, 2));
  return result;
}

/**
 * Assembles the bundle. Field names match Locataires_Code.js's
 * fetchSheetData() output (getLocatairesPageData sends the same shapes),
 * so the server stores exactly what the Sheets read path would have
 * returned. nom/prenom/phones get re-normalised server-side.
 */
function buildLocatairesBundle_() {
  return {
    locataires: fetchSheetData('Locataires'),
    communs: fetchSheetData('Parties communes'),
    facades: fetchSheetData('Facades'),
    configFacades: fetchSheetData('Config Facades'),
    planningNotes: fetchPlanningNotesRaw_()
  };
}

/**
 * Reads the 3 Planning-notes sheets (columns A-C from row 7), keeping
 * track of which sheet each row came from — unlike fetchAllNotes(), which
 * merges them into one id-keyed map and drops the source. Same cell
 * parsing as fetchAllNotes(): column C is either JSON {"pub":..,"priv":..}
 * or a plain public-note string.
 */
function fetchPlanningNotesRaw_() {
  if (typeof PLANNING_SS_ID === 'undefined' || !PLANNING_SS_ID) return [];

  var ss = SpreadsheetApp.openById(PLANNING_SS_ID);
  var views = ['Planning', 'Planning Communs', 'Planning Facades'];
  var out = [];

  views.forEach(function (view) {
    var sheet = ss.getSheetByName(view);
    if (!sheet || sheet.getLastRow() < 7) return;

    var data = sheet.getRange(7, 1, sheet.getLastRow() - 6, 3).getValues();
    data.forEach(function (row) {
      var id = String(row[0] || '').trim();
      if (!id) return;

      var status = String(row[1] || '').trim();
      var rawNote = String(row[2] || '').trim();

      var pub = '';
      var priv = '';
      if (rawNote.charAt(0) === '{' && rawNote.charAt(rawNote.length - 1) === '}') {
        try {
          var parsed = JSON.parse(rawNote);
          pub = parsed.pub || '';
          priv = parsed.priv || parsed.int || '';
        } catch (e) {
          pub = rawNote;
        }
      } else {
        pub = rawNote;
      }

      out.push({ id: id, view: view, status: status, notePub: pub, notePriv: priv });
    });
  });

  return out;
}
