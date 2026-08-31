/**
 * Mirrors the 'Utilisateurs' sheet's column layout, as read by
 * Webapp Files/Login_Code.js's COL map and findUserByEmail_():
 *   B=name, C=enterprise, D=email, E=password, F=role, G=team, H=status
 *
 * Status values in the sheet are French ('Actif' / 'Bloqué') — kept as-is
 * here rather than translated, so migrated rows need no transformation.
 *
 * password_hash stores either:
 *   - legacy format carried over from the sheet: "HASHv1:<saltHex>:<digestHex>"
 *     (salted SHA-256, see Login_Code.js hashPassword_/checkPassword_)
 *   - new format for accounts created/reset after the migration: bcrypt
 * src/lib/password.js verifies both; only new hashes are ever written.
 */

exports.up = (pgm) => {
  pgm.createExtension('citext', { ifNotExists: true });

  pgm.createTable('users', {
    id: 'id',
    name: { type: 'text', notNull: true },
    enterprise: { type: 'text', notNull: false },
    email: { type: 'citext', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'text', notNull: true }, // admin | directeur | collaborateur | viseur | (other -> read-only client)
    team: { type: 'text', notNull: false },
    status: { type: 'text', notNull: true, default: 'Actif' }, // 'Actif' | 'Bloqué'
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('users', 'role');
};

exports.down = (pgm) => {
  pgm.dropTable('users');
};
