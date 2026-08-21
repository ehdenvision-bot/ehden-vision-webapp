import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCurrentProject } from "../lib/useCurrentProject";
import { api } from "../lib/api";
import StatusChip from "../components/StatusChip";

export default function Reserves() {
  const { projectId } = useCurrentProject();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ kind: "reserve", description: "", status: "open" });

  const { data: reserves = [], isLoading } = useQuery({
    queryKey: ["reserves", projectId],
    queryFn: () => api(`/reserves?projectId=${projectId}`),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: (payload) => api("/reserves", { method: "POST", body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reserves", projectId] });
      setShowForm(false);
      setForm({ kind: "reserve", description: "", status: "open" });
    },
  });

  if (!projectId) return <p className="text-slate-500 text-sm">Sélectionnez un projet depuis le portefeuille.</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold m-0">Réserves</h1>
          <p className="text-xs text-slate-500 m-0">Suivi des réserves / défauts</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-xl px-4 py-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Nouvelle réserve
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Type
              <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm">
                <option value="reserve">Réserve</option>
                <option value="autocontrole">Auto-contrôle</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Unit ID
              <input value={form.unitId || ""} onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))} placeholder="Identifiant unité (optionnel)" className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
          </div>
          <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1 mb-3">
            Description
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100">Annuler</button>
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-60"
            >
              Créer
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["Code", "Type", "Unité", "Description", "Statut", "Levée"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 font-bold uppercase text-slate-400 text-[10px] tracking-wide border-b border-slate-100">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reserves.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50 border-b border-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-2.5 capitalize">{r.kind}</td>
                <td className="px-4 py-2.5">{r.unit?.identifiant || r.commonArea?.identifiant || r.facade?.identifiant || "—"}</td>
                <td className="px-4 py-2.5">{r.description || "—"}</td>
                <td className="px-4 py-2.5"><StatusChip status={r.status} /></td>
                <td className="px-4 py-2.5">{r.cleared ? "Oui" : "Non"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="text-center text-slate-400 text-sm py-8">Chargement…</p>}
        {!isLoading && reserves.length === 0 && <p className="text-center text-slate-400 text-sm py-8">Aucune réserve.</p>}
      </div>
    </div>
  );
}
