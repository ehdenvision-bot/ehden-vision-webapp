import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCurrentProject } from "../lib/useCurrentProject";
import { api } from "../lib/api";

function todayYear() {
  return new Date().getFullYear();
}

export default function Settings() {
  const { projectId } = useCurrentProject();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(todayYear());
  const [newDate, setNewDate] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["holidays", projectId, year],
    queryFn: () => api(`/settings/holidays/${projectId}?year=${year}`),
    enabled: !!projectId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["holidays", projectId, year] });

  const addMutation = useMutation({
    mutationFn: (payload) => api(`/settings/holidays/${projectId}`, { method: "POST", body: payload }),
    onSuccess: () => {
      invalidate();
      setNewDate("");
      setNewDescription("");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (row) =>
      row.id
        ? api(`/settings/holidays/${row.id}`, { method: "PUT", body: { isWorkingDay: !row.isWorkingDay } })
        : api(`/settings/holidays/${projectId}/override`, {
            method: "POST",
            body: { date: row.date, description: row.description, isWorkingDay: !row.isWorkingDay },
          }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api(`/settings/holidays/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const overrideKey = (d, desc) => `${d}|${desc}`;
    const overrides = new Map((data.fixedOverrides || []).map((o) => [overrideKey(o.date, o.description), o]));

    const fixedRows = (data.fixed || []).map((h) => {
      const override = overrides.get(overrideKey(h.date, h.description));
      return {
        id: override?.id || null,
        date: h.date,
        description: h.description,
        isFixed: true,
        isWorkingDay: override ? override.isWorkingDay : h.isWorkingDay,
      };
    });

    const customRows = (data.custom || []).map((c) => ({
      id: c.id,
      date: c.date,
      description: c.description,
      isFixed: false,
      isWorkingDay: c.isWorkingDay,
    }));

    return [...fixedRows, ...customRows].sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  if (!projectId) return <p className="text-slate-500 text-sm">Sélectionnez un projet depuis le portefeuille.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold m-0">Calendrier des jours fériés</h1>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || todayYear())}
            className="w-16 text-center text-sm font-semibold outline-none"
          />
          <button
            onClick={() => setYear((y) => y + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-3">
          Ajouter un jour férié personnalisé
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newDate || !newDescription) return;
            addMutation.mutate({ date: newDate, description: newDescription });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
            Date
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              required
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1 flex-1 min-w-[180px]">
            Description
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Ex : Pont d'entreprise"
              required
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={addMutation.isPending}
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-4 py-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Ajouter
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["Date", "Description", "Type", "Jour Ouvré", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 font-bold uppercase text-slate-400 text-[10px] tracking-wide border-b border-slate-100">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.date}|${row.description}`} className="hover:bg-slate-50 border-b border-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs">
                  {new Date(row.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </td>
                <td className="px-4 py-2.5">{row.description}</td>
                <td className="px-4 py-2.5">
                  <span className={`status-pill ${row.isFixed ? "chip-ended" : "chip-open"}`}>
                    {row.isFixed ? "Fixe" : "Personnalisé"}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.isWorkingDay}
                      onChange={() => toggleMutation.mutate(row)}
                      className="accent-primary w-4 h-4"
                    />
                    <span className={`status-pill ${row.isWorkingDay ? "chip-active" : "chip-blocked"}`}>
                      {row.isWorkingDay ? "Ouvré" : "Chômé"}
                    </span>
                  </label>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {!row.isFixed && row.id && (
                    <button
                      onClick={() => deleteMutation.mutate(row.id)}
                      className="text-red-600 hover:text-red-700"
                      title="Supprimer"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="text-center text-slate-400 text-sm py-8">Chargement…</p>}
        {!isLoading && rows.length === 0 && <p className="text-center text-slate-400 text-sm py-8">Aucun jour férié pour {year}.</p>}
      </div>
    </div>
  );
}
