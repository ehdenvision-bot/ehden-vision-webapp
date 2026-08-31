// Equivalent of Webapp Files/Pages.js's doGet(e) — same routing table, same public-page
// allowlist, same `data` object shape (rendered into APP_DATA client-side, see render.js),
// sourced from Postgres instead of Sheets/CacheService. See agents/decisions.md's second
// 2026-08-25 entry.

const express = require('express');
const { pool } = require('./db');
const { getSession } = require('./session');
const { renderPage } = require('./render');

const router = express.Router();

// DEV_MODE in the live Apps Script app (Webapp Files/Pages.js:17) is hardcoded `true`, bypassing
// all login — flagged there as "MUST BE false BEFORE PRODUCTION" and still unresolved. This
// rewrite does NOT carry that bypass over by default (agents/todo.md's Phase 0 / DEV_MODE item)
// — set DEV_MODE=true in app/.env only for deliberate local testing.
const DEV_MODE = process.env.DEV_MODE === 'true';

const PUBLIC_PAGES = new Set(['login', 'supportlogin', 'reset-request', 'reset']);

// Equivalent of Projects_Code.js's getProjectById_ — only the fields doGet() actually needs.
async function getProjectById(projectId) {
  if (!projectId) return null;
  const { rows } = await pool.query('SELECT id, name, status FROM projects WHERE id = $1', [projectId]);
  return rows[0] || null;
}

router.get('/', async (req, res, next) => {
  try {
    const params = req.query;

    const page = String(params.page || (DEV_MODE ? 'project-dashboard' : 'login')).toLowerCase();
    const viewType = String(params.view || 'desktop').toLowerCase();
    const token = String(params.session || (DEV_MODE ? 'TEST_TOKEN_12345' : ''));
    const resetToken = String(params.token || '');

    let user = null;
    let projectId = String(params.projectId || '');
    const transferId = String(params.transferId || '');
    let projectName = '';
    let projectStatus = '';
    let canEdit = false;
    let isAuthorized = false;
    let isClient = true;
    const isClientViewActive = params.isClientViewActive === 'true';
    const currentView = String(params.currentView || '');

    const companyName = 'Ehden Vision'; // Webapp Files/Login_Code.js's getCompanyName_() default

    if (DEV_MODE) {
      user = { email: 'dev@localhost', name: 'Dev User', role: 'admin' };
      projectId = projectId || '';
      projectStatus = 'active';
      canEdit = true;
      isAuthorized = true;
      isClient = false;
    } else {
      user = await getSession(token);
      if (user) {
        const userRole = (user.role || '').toLowerCase();
        const authorizedRoles = ['admin', 'directeur', 'collaborateur'];
        const clientExcludedRoles = ['admin', 'directeur', 'collaborateur', 'viseur'];
        isAuthorized = authorizedRoles.includes(userRole);
        isClient = !clientExcludedRoles.includes(userRole);

        if (projectId) {
          const project = await getProjectById(projectId);
          if (project) {
            projectName = project.name;
            projectStatus = (project.status || '').toLowerCase();
            canEdit = isAuthorized && projectStatus === 'active';
          }
        }
      }
    }

    if (!PUBLIC_PAGES.has(page) && !user) {
      return res.send(
        renderPage('Login', {
          baseUrl: './',
          companyName,
          message: 'Session expirée ou invalide.',
          token: '',
          page: 'login',
        })
      );
    }

    const data = {
      baseUrl: './', // see render.js's comment on why this is relative, not absolute
      companyName,
      page,
      token,
      view: viewType,
      currentView,
      projectId,
      transferId,
      projectName,
      projectStatus,
      user,
      isAuthorized,
      isClient,
      canEdit,
      isClientViewActive,
    };

    const send = (name, extra) => res.send(renderPage(name, Object.assign(data, extra)));

    switch (page) {
      case 'login':
        return send('Login');
      case 'reset-request':
        return send('ResetRequest');
      case 'reset':
        if (!resetToken) return send('Login', { message: 'Lien de réinitialisation manquant.' });
        return send('Reset', { resetToken });
      case 'project-portfolio':
        return send('ProjectPortfolio', { title: 'Portfolio' });
      case 'project-dashboard':
        return send(viewType === 'mobile' ? 'ProjectDashboardMobile' : 'ProjectDashboard', { title: 'Tableau de Bord' });
      case 'locataires':
        return send(viewType === 'mobile' ? 'LocatairesMobile' : 'Locataires', { title: 'Locataires' });
      case 'planning':
        return send(viewType === 'mobile' ? 'Planning_Mobile' : 'Planning', { title: 'Planning' });
      case 'edl':
        return send(viewType === 'mobile' ? 'EDLMobile' : 'EDL', { title: 'EDL' });
      case 'rapport':
        return send(viewType === 'mobile' ? 'RapportMobile' : 'Rapport', { title: 'Rapport' });
      case 'settings':
        return send(viewType === 'mobile' ? 'SettingsMobile' : 'Settings', { title: 'Settings' });
      case 'supportlogin':
        return send('SupportLogin', { title: 'Support Login' });
      case 'support':
        return send('Support', { title: 'Support', returnTo: String(params.returnTo || 'login') });
      default:
        return user ? send('ProjectPortfolio') : send('Login');
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
