/**
 * =================================================================
 * SÉCURITÉ & CONTRÔLE D'ACCÈS CENTRALISÉ
 * =================================================================
 */

/**
 * Récupère de manière sécurisée la session depuis le CacheService.
 * @param {string} token - Le jeton de session utilisateur.
 * @returns {Object|null} Les données utilisateur nettoyées ou null si expiré/invalide.
 */
function getSession_(token) {
  if (!token) return null;
  try {
    const rawSession = CacheService.getScriptCache().get(SESSION_CACHE_PREFIX + token);
    if (!rawSession) return null;
    return JSON.parse(rawSession);
  } catch (e) {
    console.error("Erreur technique getSession_ : " + e.message);
    return null;
  }
}

/**
 * LE GARDIEN (GATEKEEPER) : Valide la session, le rôle et le statut du projet.
 * À appeler en PREMIÈRE ligne de chaque fonction de modification (écriture/suppression).
 *
 * @param {string} token     - Le jeton de session transmis par le client.
 * @param {string} projectId - L'ID du projet concerné par la modification.
 * @returns {Object} L'objet utilisateur validé si toutes les conditions sont remplies.
 * @throws {Error} Interrompt immédiatement l'exécution si une règle de sécurité est violée.
 */
function assertCanEdit_(token, projectId) {
  // 1. Authentification
  if (!token) {
    throw new Error("Sécurité : Jeton de session manquant. Action refusée.");
  }
  const user = getSession_(token);
  if (!user) {
    throw new Error("Sécurité : Votre session a expiré. Veuillez recharger la page.");
  }

  // 2. Autorisation par rôle
  const authorizedRoles = ['admin', 'directeur', 'collaborateur'];
  const userRole = (user.role || "").toLowerCase();
  if (!authorizedRoles.includes(userRole)) {
    throw new Error("Sécurité : Vos droits actuels ne vous permettent pas d'effectuer cette modification.");
  }

  // 3. Validation de l'état du projet (contre la falsification d'URL)
  if (projectId) {
    const project = getProjectById_(projectId);
    if (!project) {
      throw new Error("Sécurité : Le projet spécifié est introuvable.");
    }
    if ((project.status || "").toLowerCase() !== "active") {
      throw new Error("Sécurité : Ce projet est verrouillé (Inactif/Bloqué). Toute modification est impossible.");
    }
  }

  return user;
}