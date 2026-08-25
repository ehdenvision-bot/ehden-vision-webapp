/**
 * =================================================================
 * 1. CONFIGURATION & CONSTANTS
 * =================================================================
 */
const START_ROW = 5;
const STATUS_ACTIVE = 'Actif';
const STATUS_BLOCKED = 'Bloqué';

function getCompanyName_() {
  return getProp_('COMPANY_NAME') || "Ehden Vision";
}

// Column mapping for the Users Sheet
const COL = {
  NAME: 2,       // Column B
  ENTERPRISE: 3, // Column C
  EMAIL: 4,      // Column D
  PASSWORD: 5,   // Column E
  ROLE: 6,       // Column F
  TEAM: 7,       // Column G
  STATUS: 8      // Column H
};

// Cache & Token Lifespan (in seconds)
const SESSION_TTL = 6 * 60 * 60;   // 6 hours
const RESET_TOKEN_TTL = 3600;      // 1 hour

// Prefix keys for CacheService
const SESSION_CACHE_PREFIX = "SESSION_";
const RESET_CACHE_PREFIX = "RESET_TOKEN_";
const HASH_PREFIX = "HASHv1";

/**
 * =================================================================
 * 2. TEMPLATE RENDERING ENGINE
 * =================================================================
 */

/**
 * Renders an HTML file with the provided data object.
 */
function render_(file, data) {
  const t = HtmlService.createTemplateFromFile(file);
  t.data = data || {};
  return t.evaluate()
    .setTitle(getCompanyName_())
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Includes a sub-template into a main template (used for CSS/JS separation).
 */
function include_(f, data) {
  const t = HtmlService.createTemplateFromFile(f);
  t.data = data || {};
  return t.evaluate().getContent();
}

/**
 * Returns the current Web App deployment URL.
 */
function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * =================================================================
 * 3. PROPERTIES & SHEET ACCESS
 * =================================================================
 */

/**
 * Helper to fetch Script Properties.
 */
function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || "";
}

/**
 * Opens the Spreadsheet and finds the Users sheet.
 */
function getUsersSheet_() {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(props.getProperty("PERMISSIONS_SPREADSHEET_ID"));
  const sheet = ss.getSheetByName('Utilisateurs');
  if (!sheet) {
    throw new Error("Sheet 'Utilisateurs' not found in the spreadsheet.");
  }
  return sheet;
}

/**
 * Searches for a user row based on their email.
 */
function findUserByEmail_(email) {
  if (!email) return null;

  const sh = getUsersSheet_();
  const last = sh.getLastRow();
  if (last < START_ROW) return null;

  const values = sh.getRange(START_ROW, 1, last - START_ROW + 1, sh.getLastColumn()).getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const rowEmail = String(row[COL.EMAIL - 1]).trim().toLowerCase();
    if (rowEmail === email.toLowerCase()) {
      return {
        rowIndex: START_ROW + i,
        name: row[COL.NAME - 1],
        enterprise: row[COL.ENTERPRISE - 1],
        email: rowEmail,
        passwordCell: row[COL.PASSWORD - 1],
        role: row[COL.ROLE - 1],
        team: row[COL.TEAM - 1],
        status: row[COL.STATUS - 1]
      };
    }
  }
  return null;
}

/**
 * =================================================================
 * 4. SECURITY & PASSWORD HASHING
 * =================================================================
 */

/**
 * Generates a SHA-256 salted hash for a plain text password.
 */
function hashPassword_(plain, saltBytes) {
  let salt = saltBytes;
  if (!salt) {
    salt = [];
    for (let i = 0; i < 16; i++) {
      salt.push(Math.floor(Math.random() * 256) - 128);
    }
  }

  const plainBytes = Utilities.newBlob(plain).getBytes();
  const combined = salt.concat(plainBytes);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combined);

  return HASH_PREFIX + ":" + toHex_(salt) + ":" + toHex_(digest);
}

/**
 * Converts byte array to Hexadecimal string.
 */
function toHex_(bytes) {
  return bytes.reduce((str, byte) => {
    return str + ("0" + (byte & 0xFF).toString(16)).slice(-2);
  }, "");
}

/**
 * Converts Hexadecimal string back to byte array.
 */
function fromHex_(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    let byte = parseInt(hex.substr(i, 2), 16);
    if (byte > 127) byte -= 256;
    bytes.push(byte);
  }
  return bytes;
}

/**
 * Compares a plain password against a stored hash.
 */
function checkPassword_(plain, hashedFull) {
  if (!hashedFull || !hashedFull.includes(":")) return false;
  const parts = hashedFull.split(":");
  if (parts.length !== 3) return false;

  const saltHex = parts[1];
  const saltBytes = fromHex_(saltHex);
  const attemptHashFull = hashPassword_(plain, saltBytes);
  const attemptHashHex = attemptHashFull.split(":")[2];
  const storedHashHex = parts[2];

  return attemptHashHex === storedHashHex;
}

/**
 * =================================================================
 * 5. SESSION MANAGEMENT
 * =================================================================
 *
 * NOTE: getSession_() is defined in Security_gs — do NOT redefine it here.
 */

/**
 * Génère un jeton unique et stocke le profil utilisateur nettoyé dans CacheService.
 * Stores only identity/display data — never passwords or raw permissions.
 * Role enforcement always happens server-side via getSession_() + assertCanEdit_().
 */
function createSession_(u) {
  const token = Utilities.getUuid();

  const sessionData = {
    email: u.email,
    role: u.role,
    name: u.name,
    enterprise: u.enterprise,
    team: u.team,
    expiresAt: Date.now() + (SESSION_TTL * 1000)   // <-- add this
  };

  CacheService.getScriptCache().put(
    SESSION_CACHE_PREFIX + token,
    JSON.stringify(sessionData),
    SESSION_TTL
  );
  return token;
}

/**
 * =================================================================
 * 6. AUTHENTICATION & PASSWORD ACTIONS
 * =================================================================
 */

/**
 * Validates credentials and returns a session token.
 */
function gsLoginWithEmailPassword(email, password) {
  const u = findUserByEmail_(email);

  if (!u || !checkPassword_(password, u.passwordCell)) {
    throw new Error("Email ou mot de passe incorrect.");
  }

  if (u.status !== STATUS_ACTIVE) {
    throw new Error("Votre compte est suspendu. Contactez le support.");
  }

  return {
    sessionToken: createSession_(u)
  };
}

/**
 * Invalidates a session token server-side on logout.
 * Removes it from CacheService AND PropertiesService (the fallback
 * store getSession_() also checks), so a leaked/old token can't be
 * reused after the user has explicitly signed out.
 */
function gsLogout(token) {
  if (!token) return { ok: true };

  const key = SESSION_CACHE_PREFIX + token;
  try {
    CacheService.getScriptCache().remove(key);
    PropertiesService.getScriptProperties().deleteProperty(key);
  } catch (e) {
    console.error("gsLogout: " + e.message);
  }
  return { ok: true };
}

/**
 * Generates a reset token and sends a link via email.
 */
function gsRequestPasswordReset(email) {
  const u = findUserByEmail_(email);
  // Security best practice: don't reveal if email doesn't exist
  if (!u) return { ok: true };

  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    RESET_CACHE_PREFIX + token,
    JSON.stringify({ email: u.email, rowIndex: u.rowIndex }),
    RESET_TOKEN_TTL
  );

  const base = getScriptUrl();
  const link = base + "?page=reset&token=" + encodeURIComponent(token);
  const companyName = getCompanyName_();

  MailApp.sendEmail({
    to: u.email,
    subject: "Réinitialisation du mot de passe - " + companyName,
    htmlBody:
      '<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px;">' +
      '<div style="text-align: center; margin-bottom: 20px;">' +
      '<h2 style="color: #0d59f2; margin: 0;">' + companyName + '</h2>' +
      "</div>" +
      "<p>Bonjour <strong>" + u.name + "</strong>,</p>" +
      "<p>Vous avez demandé la réinitialisation de votre mot de passe pour votre espace projet.</p>" +
      '<div style="text-align: center; margin: 30px 0;">' +
      '<a href="' + link + '" style="background-color: #0d59f2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Réinitialiser mon mot de passe</a>' +
      "</div>" +
      '<p style="font-size: 14px; color: #64748b;">Ce lien est valable pendant 1 heure.</p>' +
      '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">' +
      '<div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #0d59f2;">' +
      '<p style="font-size: 12px; color: #475569; margin: 0;"><strong>Astuce technique :</strong> Si vous rencontrez une erreur "Google Drive", faites un clic droit sur le bouton bleu et choisissez "Ouvrir dans une fenêtre de navigation privée".</p>' +
      "</div>" +
      '<p style="font-size: 12px; color: #94a3b8; margin-top: 20px; text-align: center;">Ceci est un message automatique, merci de ne pas y répondre.</p>' +
      "</div>"
  });

  return { ok: true };
}

/**
 * Finalizes the password reset by updating the spreadsheet.
 */
function gsResetPassword(token, newPassword) {
  const cacheKey = RESET_CACHE_PREFIX + token;
  const cache = CacheService.getScriptCache().get(cacheKey);

  if (!cache) {
    throw new Error("Le lien a expiré ou est invalide.");
  }

  const data = JSON.parse(cache);
  const newHashedPassword = hashPassword_(newPassword);

  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(props.getProperty("PERMISSIONS_SPREADSHEET_ID"));
  const sheet = ss.getSheetByName('Utilisateurs');

  sheet.getRange(data.rowIndex, COL.PASSWORD).setValue(newHashedPassword);

  // Clear token from cache after successful reset — one-time use
  CacheService.getScriptCache().remove(cacheKey);

  return { ok: true };
}