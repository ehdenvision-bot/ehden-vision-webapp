import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import StatusChip from "../components/StatusChip";

const FILTERS = [
  { label: "Tous les projets", value: "all" },
  { label: "Actifs", value: "Active" },
  { label: "Bloqués", value: "Blocked" },
  { label: "Terminés", value: "Ended" },
  { label: "Archivés", value: "Archived" },
];

export default function Portfolio() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api("/projects"),
  });

  const filtered = projects.filter((p) => {
    if (filter === "all" && p.status === "Archived") return false;
    if (filter !== "all" && p.status !== filter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return [p.name, p.code, p.city, p.country].some((v) => (v || "").toLowerCase().includes(q));
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-black m-0">Sélection du projet</h1>
        <p className="text-sm text-slate-500 mt-1">Gérez vos chantiers en cours ou accédez aux archives.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, ID ou lieu…"
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border ${
              filter === f.value ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Chargement…</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((p) => {
          const blocked = p.status === "Blocked";
          return (
            <div
              key={p.id}
              onClick={() => !blocked && navigate(`/dashboard?projectId=${p.id}`)}
              className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${
                blocked ? "cursor-not-allowed opacity-75" : "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg transition"
              }`}
            >
              <div className="h-32 bg-slate-100 relative flex items-center justify-center">
                <span className="material-symbols-outlined text-slate-300 text-5xl">apartment</span>
                <div className="absolute bottom-2 left-2">
                  <StatusChip status={p.status} />
                </div>
              </div>
              <div className="p-4">
                <div className="font-bold uppercase text-sm">{p.name}</div>
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                  <span className="material-symbols-outlined text-[14px]">location_on</span>
                  {p.city || "—"}{p.country ? `, ${p.country}` : ""}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${p.progressPct || 0}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-500">{p.progressPct != null ? `${p.progressPct}%` : "—"}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {p.startDate ? `Début ${new Date(p.startDate).toLocaleDateString("fr-FR")}` : ""}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && filtered.length === 0 && (
        <p className="text-slate-400 text-sm text-center py-12">Aucun projet ne correspond à ces critères.</p>
      )}
    </div>
  );
}
