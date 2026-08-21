import { useNavigate } from "react-router-dom";
import { useCurrentProject } from "../lib/useCurrentProject";
import StatusChip from "../components/StatusChip";

export default function Dashboard() {
  const navigate = useNavigate();
  const { project, isLoading } = useCurrentProject();

  if (isLoading) return <p className="text-slate-500 text-sm">Chargement…</p>;
  if (!project) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 mb-3">Aucun projet sélectionné.</p>
        <button onClick={() => navigate("/portfolio")} className="text-primary font-semibold text-sm">
          ← Retour au portefeuille
        </button>
      </div>
    );
  }

  const stats = [
    { label: "Nombre de Logements", value: project.units ?? "—" },
    {
      label: "Calendrier",
      value: project.startDate ? new Date(project.startDate).toLocaleDateString("fr-FR") : "—",
      sub: project.endDate ? `Échéance: ${new Date(project.endDate).toLocaleDateString("fr-FR")}` : "",
    },
    { label: "MOA", value: project.owner || "—" },
    { label: "Progression", value: `${project.progressPct ?? 0}%`, progress: project.progressPct ?? 0 },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <StatusChip status={project.status} />
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Projet #{project.code}</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight m-0">{project.name}</h1>
        {project.description && (
          <p className="italic text-slate-500 border-l-2 border-primary/20 pl-3 mt-3">{project.description}</p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100 bg-white rounded-2xl border border-slate-200 shadow-sm mb-8">
        {stats.map((s) => (
          <div key={s.label} className="p-5">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">{s.label}</div>
            <div className="text-lg font-bold">{s.value}</div>
            {s.sub && <div className="text-xs text-slate-500">{s.sub}</div>}
            {s.progress !== undefined && (
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-primary" style={{ width: `${s.progress}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">Actions Rapides</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => navigate(`/planning?projectId=${project.id}`)}
          className="aspect-4/3 rounded-2xl border border-slate-200 bg-white shadow-sm hover:-translate-y-1 hover:shadow-lg hover:border-primary/30 transition flex flex-col items-center justify-center gap-2 text-left p-4"
        >
          <div className="w-11 h-11 rounded-xl bg-primary/5 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined">calendar_today</span>
          </div>
          <div className="text-sm font-bold text-center">Gantt &amp; Planning</div>
          <div className="text-[11px] text-slate-500 text-center">Visualisation temporelle du chantier.</div>
        </button>
      </div>
    </div>
  );
}
