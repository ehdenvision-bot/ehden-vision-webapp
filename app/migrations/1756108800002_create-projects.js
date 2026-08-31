/**
 * Mirrors the 'Projects' sheet, as read by Webapp Files/Projects_Code.js's
 * PROJECT_COL map (gsListProjects / getProjectById_):
 *   B=id, C=name, D=owner, E=status, F=start, G=end, H=city, I=country,
 *   J=progress (fraction, e.g. 0.1 -> 10%), K=units, L=description
 *
 * `id` keeps the original sheet's natural string ID (e.g. "PRJ-001") as the
 * primary key rather than introducing a surrogate — every other module
 * (Planning, Locataires, Reserves, EDL, Logs) references projects by this
 * same ID, so preserving it avoids a cross-cutting remap during migration.
 *
 * Photos/thumbnails (PROJECT_PHOTOS_FILE Drive folder in the original) are
 * deliberately NOT modeled yet — file storage strategy for the rewrite is
 * still open, see agents/decisions.md.
 */

exports.up = (pgm) => {
  pgm.createTable('projects', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true },
    owner: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'Active' }, // Active | Ended | Blocked | Archived
    start_date: { type: 'date' },
    end_date: { type: 'date' },
    city: { type: 'text' },
    country: { type: 'text' },
    progress: { type: 'numeric(5,2)', notNull: true, default: 0 }, // 0-100
    units: { type: 'text' },
    description: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('projects', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('projects');
};
