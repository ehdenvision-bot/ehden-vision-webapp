/**
 * Phase 2 (Locataires) — mirrors 4 sheets in the "Bâtiments" spreadsheet
 * (Script Property BATIMENTS_SPREADSHEET_ID) plus a shared planning-notes shape read from 3
 * sheets in the "Planning" spreadsheet (PLANNING_SPREADSHEET_ID) — see
 * Webapp Files/Locataires_Code.js, read end-to-end for this exact layout:
 *
 *   fetchSheetData(sheetName), rows from row 7, starting column B:
 *   - 'Locataires' (20 cols, B..U): B=id, C=<unused>, D=batiment, E=hall, F=etage,
 *     G=empilement, H=porte, I=typeLog, J=configLogement, K=surface, L=nom, M=prenom,
 *     N=adresse, O=ville, P=telFixe, Q=telPort1, R=telPort2, S=email, T=email2, U=reference.
 *     (updateLocataireData only ever writes L/M and P..T — nom/prenom/phones/emails.)
 *   - 'Parties communes' (8 cols, B..I): B=id, C=<unused>, D=batiment, E=hall, F=etage,
 *     G=description, H=ref, I=abr.
 *   - 'Facades' (8 cols, B..I): B=id, C=id2, D=batiment, E=hall, F=orientation, G=trame,
 *     H=partie, I=type. (Unlike the other two, column C IS used here.)
 *   - 'Config Facades': B=type, C=description. Simple lookup table.
 *
 *   fetchAllNotes() / updatePlanningData(), rows from row 7, columns A-C, across 'Planning',
 *   'Planning Communs', 'Planning Facades': A=id (COM-/FAC-/unprefixed, matching which of the
 *   three tables above it belongs to), B=status, C=note (JSON `{"pub":...,"priv":...}` or a
 *   plain string for backward compat — normalized into note_pub/note_priv here).
 *
 * Phase 5 (Planning) will model the rest of the Planning spreadsheet (tasks, disciplines, etc.)
 * — planning_notes here is deliberately scoped to just what Locataires needs, not a preview of
 * that larger schema.
 */

exports.up = (pgm) => {
  pgm.createTable('locataires', {
    id: { type: 'text', primaryKey: true },
    batiment: { type: 'text' },
    hall: { type: 'text' },
    etage: { type: 'text' },
    empilement: { type: 'text' },
    porte: { type: 'text' },
    type_log: { type: 'text' },
    config_logement: { type: 'text' },
    surface: { type: 'text' },
    nom: { type: 'text' },
    prenom: { type: 'text' },
    adresse: { type: 'text' },
    ville: { type: 'text' },
    tel_fixe: { type: 'text' },
    tel_port1: { type: 'text' },
    tel_port2: { type: 'text' },
    email: { type: 'text' },
    email2: { type: 'text' },
    reference: { type: 'text' },
  });

  pgm.createTable('parties_communes', {
    id: { type: 'text', primaryKey: true },
    batiment: { type: 'text' },
    hall: { type: 'text' },
    etage: { type: 'text' },
    description: { type: 'text' },
    ref: { type: 'text' },
    abr: { type: 'text' },
  });

  pgm.createTable('facades', {
    id: { type: 'text', primaryKey: true },
    id2: { type: 'text' },
    batiment: { type: 'text' },
    hall: { type: 'text' },
    orientation: { type: 'text' },
    trame: { type: 'text' },
    partie: { type: 'text' },
    type: { type: 'text' },
  });

  pgm.createTable('config_facades', {
    id: 'id',
    type: { type: 'text' },
    description: { type: 'text' },
  });

  pgm.createTable('planning_notes', {
    id: { type: 'text', primaryKey: true }, // matches locataires/parties_communes/facades id
    view: { type: 'text', notNull: true }, // 'Planning' | 'Planning Communs' | 'Planning Facades'
    status: { type: 'text' },
    note_pub: { type: 'text' },
    note_priv: { type: 'text' },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('planning_notes');
  pgm.dropTable('config_facades');
  pgm.dropTable('facades');
  pgm.dropTable('parties_communes');
  pgm.dropTable('locataires');
};
