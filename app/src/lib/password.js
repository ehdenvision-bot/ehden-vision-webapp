const crypto = require('crypto');
const bcrypt = require('bcrypt');

const LEGACY_PREFIX = 'HASHv1';
const BCRYPT_ROUNDS = 12;

/**
 * Verifies a legacy hash produced by Webapp Files/Login_Code.js's
 * hashPassword_(): "HASHv1:<saltHex>:<digestHex>", salted SHA-256.
 *
 * Apps Script's Utilities.computeDigest() treats the byte array as signed
 * bytes (-128..127, Java semantics); Node's Buffer is unsigned (0..255).
 * That distinction doesn't change the resulting hash — a byte's bit
 * pattern is identical either way (e.g. signed -1 and unsigned 255 are
 * both 0xFF) — so decoding the stored hex straight into a Buffer and
 * hashing with Node's crypto reproduces the exact same digest.
 */
function verifyLegacy(plain, storedHash) {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== LEGACY_PREFIX) return false;

  const saltHex = parts[1];
  const expectedDigestHex = parts[2];

  const saltBytes = Buffer.from(saltHex, 'hex');
  const plainBytes = Buffer.from(plain, 'utf8');
  const combined = Buffer.concat([saltBytes, plainBytes]);

  const actualDigestHex = crypto.createHash('sha256').update(combined).digest('hex');

  // Constant-time comparison.
  const a = Buffer.from(actualDigestHex, 'hex');
  const b = Buffer.from(expectedDigestHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verifies a plaintext password against a stored hash, whichever format
 * it's in — legacy "HASHv1:..." (rows carried over from the sheet) or
 * bcrypt (accounts created or reset since the migration).
 */
async function verifyPassword(plain, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith(LEGACY_PREFIX + ':')) {
    return verifyLegacy(plain, storedHash);
  }
  return bcrypt.compare(plain, storedHash);
}

/**
 * Hashes a new password. Always produces bcrypt — HASHv1 is read-only
 * compat for migrated rows, never written going forward.
 */
async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

module.exports = { verifyPassword, hashPassword };
