// Equivalent of Webapp Files/Security_Code.js's assertCanEdit_(token, projectId): validates
// session + role + (if a project is given) that the project is unlocked, matching exactly what
// every write-operation gs* function calls first. Shared across RPC modules the same way the
// original shared it across every *_Code.js file.

const { pool } = require('./db');
const { getSession } = require('./session');

const EDITOR_ROLES = new Set(['admin', 'directeur', 'collaborateur']);

async function assertCanEdit(token, projectId) {
  if (!token) throw new Error('Sécurité : Jeton de session manquant. Action refusée.');

  const user = await getSession(token);
  if (!user) throw new Error('Sécurité : Votre session a expiré. Veuillez recharger la page.');

  const role = (user.role || '').toLowerCase();
  if (!EDITOR_ROLES.has(role)) {
    throw new Error("Sécurité : Vos droits actuels ne vous permettent pas d'effectuer cette modification.");
  }

  if (projectId) {
    const { rows } = await pool.query('SELECT status FROM projects WHERE id = $1', [projectId]);
    const project = rows[0];
    if (!project) throw new Error('Sécurité : Le projet spécifié est introuvable.');
    if ((project.status || '').toLowerCase() !== 'active') {
      throw new Error('Sécurité : Ce projet est verrouillé (Inactif/Bloqué). Toute modification est impossible.');
    }
  }

  return user;
}

module.exports = { assertCanEdit };
