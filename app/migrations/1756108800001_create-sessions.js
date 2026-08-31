/**
 * Replaces Apps Script's CacheService-backed session store
 * (Login_Code.js createSession_ / Security_Code.js getSession_).
 *
 * Same shape as the original: an opaque UUID token maps to a denormalized
 * snapshot of identity/display fields (never the password), with a TTL.
 * The original never persisted sessions past CacheService's eviction /
 * the PropertiesService fallback; here they just live in Postgres and get
 * reaped by expires_at, checked on every request (see src/middleware/session.js).
 */

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('sessions', {
    token: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    email: { type: 'citext', notNull: true },
    role: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    enterprise: { type: 'text' },
    team: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
  });

  pgm.createIndex('sessions', 'expires_at');

  pgm.createTable('password_reset_tokens', {
    token: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    used_at: { type: 'timestamptz' },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('password_reset_tokens');
  pgm.dropTable('sessions');
};
