/***** === ROUTES === *****/

/**
 * Main entry point for the Web App.
 * Handles URL parameters, authentication, and page routing.
 */
function doGet(e) {

  // --- 1. INITIALISATION & PARSING DES PARAMÈTRES ---
  const params = e && e.parameter ? e.parameter : {};

  // ================================================================
  // ⚠️  DEV MODE — MUST BE SET TO false BEFORE PRODUCTION DEPLOY ⚠️
  // In DEV_MODE a fake session is written to CacheService on every
  // page load. This bypasses all authentication checks intentionally.
  // ================================================================
  const DEV_MODE = true;

  const page      = (params.page || (DEV_MODE ? "project-dashboard" : "login")).toLowerCase();
  const viewType  = (params.view || 'desktop').toLowerCase();
  //const viewType  = (params.view || 'mobile').toLowerCase();
  const token     = params.session || (DEV_MODE ? "TEST_TOKEN_12345" : "");
  const resetToken = params.token || "";

  // Mutable route variables
  let user             = null;
  let projectId        = params.projectId || "";
  let transferId       = params.transferId || "";
  let projectName      = "";
  let projectStatus    = "";
  let canEdit          = false;
  let isAuthorized     = false;
  let isClient         = true;
  let isClientViewActive = params.isClientViewActive === 'true';
  let currentView = params.currentView || "";

  const companyName = PropertiesService.getScriptProperties().getProperty('COMPANY_NAME') || "Ehden Vision";

  // --- 2. AUTHENTICATION & ENVIRONMENT HANDLING ---
  if (DEV_MODE) {
    // === MODE DÉVELOPPEMENT ===
    // Hardcoded user — edit as needed for local testing
    user = {
      email: "michel.s.dahdah@gmail.com",
      name:  "Michel Dahdah",
      role:  "admin"
    };

    // Write fake session so downstream getSession_() calls succeed
    const fakeSession = Object.assign({}, user, { expiresAt: Date.now() + 3600 * 1000 });
    CacheService.getScriptCache().put("SESSION_" + token, JSON.stringify(fakeSession), 3600);

    // Dev defaults — override via URL if needed (?projectId=XXX)
    projectId     = projectId || "2602-0001";
    projectStatus = "active";
    canEdit       = true;
    isAuthorized  = true;
    isClient      = false;

    // In dev mode, fetch the real project name from the DB if a projectId is set,
    // otherwise fall back to a readable default so the UI doesn't show a blank title.
    if (projectId) {
      try {
        const projectRow = getProjectById_(projectId);
        projectName = projectRow ? projectRow.name : "LES GRAVIERS";
      } catch (_) {
        projectName = "LES GRAVIERS";
      }
    }

  } else {
    // === MODE PRODUCTION ===
    user = getSession_(token) || null;

    if (user) {
      const userRole = (user.role || "").toLowerCase();
      const authorizedRoles      = ['admin', 'directeur', 'collaborateur'];
      const clientExcludedRoles  = ['admin', 'directeur', 'collaborateur', 'viseur'];

      isAuthorized = authorizedRoles.includes(userRole);
      isClient     = !clientExcludedRoles.includes(userRole);

      if (projectId) {
        try {
          const projectRow = getProjectById_(projectId);
          if (projectRow) {
            projectName   = projectRow.name;
            projectStatus = (projectRow.status || "").toLowerCase();
            canEdit       = isAuthorized && (projectStatus === 'active');
          }
        } catch (err) {
          console.error("Erreur récupération projet doGet: " + err.message);
        }
      }
    }
  }

  // --- 3. VÉRIFICATION DES PAGES PUBLIQUES ---
  const publicPages = ['login', 'supportlogin', 'reset-request', 'reset'];

  if (!publicPages.includes(page) && !user) {
    return render_("Login", {
      baseUrl:     ScriptApp.getService().getUrl(),
      companyName: companyName,
      message:     "Session expirée ou invalide.",
      token:       "",
      page:        "login"
    });
  }

  // --- 4. PRÉPARATION DU CONTENEUR APP_DATA ---
  const data = {
    baseUrl:            ScriptApp.getService().getUrl(),
    companyName:        companyName,
    page:               page,
    token:              token,
    view:               viewType,
    currentView:        currentView,
    projectId:          projectId,
    transferId:         transferId,
    projectName:        projectName,
    projectStatus:      projectStatus,
    user:               user,
    isAuthorized:       isAuthorized,
    isClient:           isClient,
    canEdit:            canEdit,
    isClientViewActive: isClientViewActive
  };

  // --- 5. ROUTAGE ET RENDU DES PAGES ---
  switch (page) {
    case "login":
      return render_("Login", data);

    case "reset-request":
      return render_("ResetRequest", data);

    case "reset":
      if (!resetToken) {
        data.message = "Lien de réinitialisation manquant.";
        return render_("Login", data);
      }
      data.resetToken = resetToken;
      return render_("Reset", data);

    case "project-portfolio":
      data.title = "Portfolio";
      return render_("ProjectPortfolio", data);

    case "project-dashboard":
      data.title = "Tableau de Bord";
      return (viewType === 'mobile')
        ? render_("ProjectDashboardMobile", data)
        : render_("ProjectDashboard", data);

    case "locataires":
      data.title = "Locataires";
      return (viewType === 'mobile')
        ? render_("LocatairesMobile", data)
        : render_("Locataires", data);

    case "planning":
      data.title = "Planning";
      return (viewType === 'mobile')
        ? render_("Planning_Mobile", data)
        : render_("Planning", data);

    case "edl":
      data.title = "EDL";
      return (viewType === 'mobile')
        ? render_("EDLMobile", data)
        : render_("EDL", data);

    case "rapport":
      data.title = "Rapport";
      return (viewType === 'mobile')
        ? render_("RapportMobile", data)
        : render_("Rapport", data);

    case "settings":
      data.title = "Settings";
      return (viewType === 'mobile')
        ? render_("SettingsMobile", data)
        : render_("Settings", data);

    case "supportlogin":
      data.title = "Support Login";
      return render_("SupportLogin", data);

    case "support":
      data.title = "Support";
      data.returnTo = params.returnTo || 'login';
      return render_("Support", data);

    default:
      return user ? render_("ProjectPortfolio", data) : render_("Login", data);
  }
}
