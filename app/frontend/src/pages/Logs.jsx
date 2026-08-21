import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const TABS = [
  { key: "activity", label: "Activité" },
  { key: "errors", label: "Erreurs" },
];

function fmt(date) {
  return new Date(date).toLocaleString("fr-FR");
}

export default function Logs() {
  const [tab, setTab] = useState("activity");

  const { data: activity = [], isLoading: loadingActivity } = useQuery({
    queryKey: ["logs"],
    queryFn: () => api("/logs"),
  });

  const { data: errors = [], isLoading: loadingErrors } = useQuery({
    queryKey: ["error-logs"],
    queryFn: () => api("/logs/errors"),
  });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold m-0">Logs</h1>
        <p className="text-xs text-slate-500 m-0">Historique d&apos;activité</p>
      </div>

      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold ${
              tab === t.key ? "bg-white shadow-sm text-primary" : "text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "activity" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Date", "Utilisateur", "Action", "Entité"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-bold uppercase text-slate-400 text-[10px] tracking-wide border-b border-slate-100">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activity.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 border-b border-slate-50">
                  <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmt(l.createdAt)}</td>
                  <td className="px-4 py-2.5">{l.userEmail || "—"}</td>
                  <td className="px-4 py-2.5">{l.action}</td>
                  <td className="px-4 py-2.5 capitalize">{l.entityKind}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loadingActivity && <p className="text-center text-slate-400 text-sm py-8">Chargement…</p>}
          {!loadingActivity && activity.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-8">Aucune activité enregistrée.</p>
          )}
        </div>
      )}

      {tab === "errors" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Date", "Utilisateur", "Message", "Traité"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-bold uppercase text-slate-400 text-[10px] tracking-wide border-b border-slate-100">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50 border-b border-slate-50">
                  <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{fmt(e.createdAt)}</td>
                  <td className="px-4 py-2.5">{e.userEmail || "—"}</td>
                  <td className="px-4 py-2.5">{e.errorMessage}</td>
                  <td className="px-4 py-2.5">{e.treated ? "Oui" : "Non"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loadingErrors && <p className="text-center text-slate-400 text-sm py-8">Chargement…</p>}
          {!loadingErrors && errors.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-8">Aucune erreur enregistrée.</p>
          )}
        </div>
      )}
    </div>
  );
}
