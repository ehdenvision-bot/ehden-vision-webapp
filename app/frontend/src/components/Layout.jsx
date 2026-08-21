import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

// Exact order/icons from the legacy Sidebar.html. `to: null` items are real
// legacy nav destinations that have no page built yet in this rewrite —
// shown for visual/structural fidelity but rendered disabled ("Bientôt
// disponible") instead of silently omitted or faked.
const PRINCIPAL = [{ label: "Tableau de bord", icon: "dashboard", to: "/dashboard" }];

const OUTILS_PROJET = [
  { label: "Info Bâtiments", icon: "group", to: "/locataires" },
  { label: "Planning", icon: "calendar_month", to: "/planning" },
  { label: "Avis de Passage", icon: "mail", to: null },
  { label: "EDL", icon: "assignment_turned_in", to: "/edl" },
  { label: "Travaux", icon: "construction", to: null },
  { label: "Sous-Traitants", icon: "engineering", to: null },
  { label: "Auto contrôles", icon: "fact_check", to: null },
  { label: "Avancement", icon: "trending_up", to: null },
  { label: "OPR", icon: "rule", to: null },
  { label: "Synoptiques", icon: "account_tree", to: null },
  { label: "Réserves", icon: "warning", to: "/reserves" },
  { label: "Quitus", icon: "verified", to: null },
  { label: "Rapport", icon: "assessment", to: null },
  { label: "Réclamations", icon: "feedback", to: null },
  { label: "Satisfaction", icon: "sentiment_satisfied", to: null },
  { label: "Plans", icon: "architecture", to: null },
  { label: "Documents", icon: "description", to: null },
];

function NavItem({ item }) {
  if (!item.to) {
    return (
      <span
        className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-[13.5px] font-medium text-slate-300 cursor-not-allowed"
        title="Bientôt disponible"
      >
        <span className="material-symbols-outlined text-[19px]">{item.icon}</span>
        {item.label}
      </span>
    );
  }
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-[13.5px] font-medium ${
          isActive ? "bg-primary/10 text-primary font-bold" : "text-slate-600 hover:bg-slate-50"
        }`
      }
    >
      <span className="material-symbols-outlined text-[19px]">{item.icon}</span>
      {item.label}
    </NavLink>
  );
}

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const PAGE_META = {
  "/dashboard": ["Tableau de bord", "Vue d'ensemble du projet"],
  "/portfolio": ["Projects", "Portfolio overview"],
  "/locataires": ["Info Bâtiments", "Logements, parties communes & façades"],
  "/planning": ["Planning", "Gantt & suivi des tâches"],
  "/edl": ["EDL", "État des lieux — notes, photos & travaux"],
  "/reserves": ["Réserves", "Suivi des réserves / défauts"],
  "/users": ["Utilisateurs", "Gestion des comptes & rôles"],
  "/settings": ["Paramètres", "Calendrier & configuration"],
  "/logs": ["Logs", "Historique d'activité"],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [title, subtitle] = PAGE_META[location.pathname] || [location.pathname, ""];
  const canSeeAdmin = user?.role === "Admin" || user?.role === "Directeur";

  return (
    <div className="flex h-screen overflow-hidden bg-background-light">
      <aside className="w-[260px] shrink-0 bg-background-light border-r border-slate-200 flex flex-col">
        <button
          onClick={() => navigate("/portfolio")}
          className="bg-corporate-blue text-white px-5 py-4 flex items-center gap-2.5 text-left"
        >
          <img src="/assets/logo.png" alt="Ehden Vision" className="h-7 w-auto" />
          <span className="font-black uppercase text-sm tracking-tight">Ehden Vision</span>
        </button>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-3 pt-3 pb-1.5">
            Principal
          </div>
          {PRINCIPAL.map((item) => (
            <NavItem key={item.label} item={item} />
          ))}

          <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 px-3 pt-3 pb-1.5">
            Outils Projet
          </div>
          {OUTILS_PROJET.map((item) => (
            <NavItem key={item.label} item={item} />
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          {canSeeAdmin && (
            <>
              <NavItem item={{ label: "Utilisateurs", icon: "group_add", to: "/users" }} />
              <NavItem item={{ label: "Paramètres", icon: "settings", to: "/settings" }} />
            </>
          )}
          <NavItem item={{ label: "Logs", icon: "history", to: "/logs" }} />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 flex justify-between items-center px-6 border-b border-slate-200 bg-primary-light">
          <div>
            <p className="text-lg font-extrabold m-0">{title}</p>
            <p className="text-[11px] text-slate-500 m-0">{subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-[13px] font-bold">{user?.fullName}</div>
              <div className="text-[11px] text-slate-500">{user?.role || "—"}</div>
            </div>
            <div className="w-[34px] h-[34px] rounded-full bg-corporate-blue text-white flex items-center justify-center text-xs font-bold shrink-0">
              {initials(user?.fullName)}
            </div>
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="flex items-center gap-1 text-red-700 text-xs font-semibold"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              Se déconnecter
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
