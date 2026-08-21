// Functional-v1 rebuild of the legacy Planning page (Gantt/scheduling
// engine). Deliberately scoped down from the legacy app's full feature
// set — see agents/decisions.md for the agreed v1 scope. Deferred to a
// later pass (do not build here without a fresh scoping decision):
//   - the contiguity-radar reschedule strategy picker (5 shift modes)
//   - the Cycles dependency-link editor (FS/SS links + lag days)
//   - the Interventions sub-system (plan-image pin marking)
//   - drag-and-drop / multi-cell selection, Excel export, print view, mobile
// This page instead offers: a read-only grid of ScheduleEntry rows grouped
// by entity × task type, a click-to-open panel to reschedule one entry via
// the already-ported domino-shift service, and 3 straightforward CRUD
// modals (Disciplines, Équipes, Tâches).

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useCurrentProject } from "../lib/useCurrentProject";

function entityLabel(entry) {
  return entry.unit?.identifiant || entry.commonArea?.identifiant || entry.facade?.identifiant || "—";
}

function entityKey(entry) {
  return entry.unitId || entry.commonAreaId || entry.facadeId || entry.id;
}

export default function Planning() {
  const { projectId } = useCurrentProject();
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState(null); // "disciplines" | "teams" | "taskTypes" | null
  const [selectedEntry, setSelectedEntry] = useState(null);

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["schedule-entries", projectId],
    queryFn: () => api(`/schedule/entries?projectId=${projectId}`),
    enabled: !!projectId,
  });

  const { data: disciplines = [] } = useQuery({
    queryKey: ["disciplines", projectId],
    queryFn: () => api(`/schedule/disciplines?projectId=${projectId}`),
    enabled: !!projectId,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams", projectId],
    queryFn: () => api(`/schedule/teams?projectId=${projectId}`),
    enabled: !!projectId,
  });

  const { data: taskTypes = [] } = useQuery({
    queryKey: ["task-types", projectId],
    queryFn: () => api(`/schedule/task-types?projectId=${projectId}`),
    enabled: !!projectId,
  });

  // Group entries into rows (one per entity) × columns (one per distinct
  // task-type abbreviation present in the data) — a simple table stands in
  // for the legacy day-by-day Gantt grid, per the agreed v1 scope.
  const { rows, columns } = useMemo(() => {
    const rowMap = new Map();
    const colSet = new Set();
    for (const entry of entries) {
      const key = entityKey(entry);
      if (!rowMap.has(key)) rowMap.set(key, { key, label: entityLabel(entry), cells: {} });
      const abbr = entry.taskType?.abbreviation || "?";
      colSet.add(abbr);
      rowMap.get(key).cells[abbr] = entry;
    }
    return { rows: [...rowMap.values()], columns: [...colSet].sort() };
  }, [entries]);

  if (!projectId) return <p className="text-slate-500 text-sm">Sélectionnez un projet depuis le portefeuille.</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold m-0">Planning</h1>
          <p className="text-xs text-slate-500 m-0">Gantt &amp; suivi des tâches</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setOpenModal("disciplines")}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl px-3 py-2"
          >
            <span className="material-symbols-outlined text-[18px]">engineering</span>
            Disciplines
          </button>
          <button
            onClick={() => setOpenModal("teams")}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl px-3 py-2"
          >
            <span className="material-symbols-outlined text-[18px]">groups</span>
            Équipes
          </button>
          <button
            onClick={() => setOpenModal("taskTypes")}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl px-3 py-2"
          >
            <span className="material-symbols-outlined text-[18px]">checklist</span>
            Tâches
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        {entriesLoading && <p className="text-center text-slate-400 text-sm py-10">Chargement…</p>}
        {!entriesLoading && rows.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-10">Aucune tâche planifiée pour ce projet.</p>
        )}
        {!entriesLoading && rows.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left px-3 py-2 font-bold uppercase text-slate-400 text-[10px] tracking-wide border-b border-slate-100 sticky left-0 bg-white">
                  Unité
                </th>
                {columns.map((abbr) => (
                  <th key={abbr} className="text-left px-3 py-2 font-bold uppercase text-slate-400 text-[10px] tracking-wide border-b border-slate-100">
                    {abbr}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50 border-b border-slate-50">
                  <td className="px-3 py-2 font-mono sticky left-0 bg-white">{row.label}</td>
                  {columns.map((abbr) => {
                    const entry = row.cells[abbr];
                    if (!entry) return <td key={abbr} className="px-3 py-2 text-slate-300">—</td>;
                    return (
                      <td key={abbr} className="px-2 py-2">
                        <button
                          onClick={() => setSelectedEntry(entry)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-white w-full text-left"
                          style={{ background: entry.taskType?.color || "#94a3b8" }}
                        >
                          {new Date(entry.scheduledDate).toLocaleDateString("fr-FR")}
                          {entry.status ? ` · ${entry.status}` : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedEntry && (
        <EntryPanel entry={selectedEntry} projectId={projectId} onClose={() => setSelectedEntry(null)} />
      )}

      {openModal === "disciplines" && (
        <CrudModal
          title="Disciplines"
          items={disciplines}
          projectId={projectId}
          basePath="/schedule/disciplines"
          queryKey={["disciplines", projectId]}
          queryClient={queryClient}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "teams" && (
        <CrudModal
          title="Équipes"
          items={teams}
          projectId={projectId}
          basePath="/schedule/teams"
          queryKey={["teams", projectId]}
          queryClient={queryClient}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "taskTypes" && (
        <TaskTypeModal
          items={taskTypes}
          teams={teams}
          projectId={projectId}
          queryClient={queryClient}
          onClose={() => setOpenModal(null)}
        />
      )}
    </div>
  );
}

function EntryPanel({ entry, projectId, onClose }) {
  const queryClient = useQueryClient();
  const [newDate, setNewDate] = useState("");
  const [result, setResult] = useState(null);

  const shiftMutation = useMutation({
    mutationFn: () => api("/schedule/shift-task", { method: "POST", body: { scheduleEntryId: entry.id, newDate } }),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["schedule-entries", projectId] });
    },
  });

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-1">{entityLabel(entry)}</h2>
        <p className="text-sm text-slate-500 mb-4">{entry.taskType?.description || entry.taskType?.abbreviation}</p>

        <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1 mb-3">
          Statut
          <input
            value={entry.status || ""}
            disabled
            title="La mise à jour du statut n'est pas encore disponible côté serveur."
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-slate-50 text-slate-400"
          />
        </label>

        <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1 mb-3">
          Nouvelle date
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
          />
        </label>

        {shiftMutation.isError && <p className="text-red-700 text-xs mb-3">{shiftMutation.error.message}</p>}

        {result && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 mb-3">
            {result.changes.length} tâche(s) décalée(s) ({result.workingDaysDelta > 0 ? "+" : ""}
            {result.workingDaysDelta} jour(s) ouvré(s)).
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100">
            Fermer
          </button>
          <button
            onClick={() => shiftMutation.mutate()}
            disabled={!newDate || shiftMutation.isPending}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-60"
          >
            {shiftMutation.isPending ? "Décalage..." : "Décaler"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Shared simple list-CRUD modal for Disciplines / Équipes (name-only entities).
function CrudModal({ title, items, projectId, basePath, queryKey, queryClient, onClose }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const createMutation = useMutation({
    mutationFn: (name) => api(basePath, { method: "POST", body: { projectId, name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setNewName("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }) => api(`${basePath}/${id}`, { method: "PUT", body: { name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api(`${basePath}/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-4">{title}</h2>

        <div className="flex flex-col gap-2 mb-4 max-h-64 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 border border-slate-100 rounded-lg px-3 py-2">
              {editingId === item.id ? (
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="flex-1 border border-slate-200 rounded px-2 py-1 text-sm"
                  autoFocus
                />
              ) : (
                <span className="flex-1 text-sm">{item.name}</span>
              )}
              {editingId === item.id ? (
                <>
                  <button
                    onClick={() => updateMutation.mutate({ id: item.id, name: editingName })}
                    className="text-emerald-600"
                  >
                    <span className="material-symbols-outlined text-[16px]">check</span>
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-slate-400">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setEditingId(item.id); setEditingName(item.name); }}
                    className="text-slate-400"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                  <button onClick={() => deleteMutation.mutate(item.id)} className="text-red-500">
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </>
              )}
            </div>
          ))}
          {items.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Aucun élément.</p>}
        </div>

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nouveau nom"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => newName.trim() && createMutation.mutate(newName.trim())}
            disabled={createMutation.isPending}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-60"
          >
            Ajouter
          </button>
        </div>

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// Task types (Tâches) have more fields than Disciplines/Équipes, so they get
// their own modal rather than reusing CrudModal.
function TaskTypeModal({ items, teams, projectId, queryClient, onClose }) {
  const emptyForm = { abbreviation: "", activityType: "", teamId: "", description: "", shortDescription: "", color: "#0d59f2", defaultDuration: "", durationType: "journée" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [impact, setImpact] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const createMutation = useMutation({
    mutationFn: (payload) => api("/schedule/task-types", { method: "POST", body: { projectId, ...payload } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-types", projectId] });
      setForm(emptyForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api(`/schedule/task-types/${id}`, { method: "PUT", body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-types", projectId] });
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api(`/schedule/task-types/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-types", projectId] });
      queryClient.invalidateQueries({ queryKey: ["schedule-entries", projectId] });
      setImpact(null);
      setPendingDeleteId(null);
    },
  });

  async function requestDelete(id) {
    const data = await api(`/schedule/task-types/${id}/deletion-impact`);
    if (data.counts.scheduleEntries > 0 || data.counts.taskProgress > 0) {
      setImpact(data);
      setPendingDeleteId(id);
    } else {
      deleteMutation.mutate(id);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      abbreviation: item.abbreviation || "",
      activityType: item.activityType || "",
      teamId: item.teamId || "",
      description: item.description || "",
      shortDescription: item.shortDescription || "",
      color: item.color || "#0d59f2",
      defaultDuration: item.defaultDuration || "",
      durationType: item.durationType || "journée",
    });
  }

  function submit() {
    if (!form.abbreviation.trim()) return;
    if (editingId) updateMutation.mutate({ id: editingId, payload: form });
    else createMutation.mutate(form);
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold mb-4">Tâches</h2>

        <table className="w-full text-xs mb-4">
          <thead>
            <tr>
              {["Abrév.", "Activité", "Équipe", "Description courte", "Durée", "", ""].map((h) => (
                <th key={h} className="text-left px-2 py-1.5 font-bold uppercase text-slate-400 text-[10px] border-b border-slate-100">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-50">
                <td className="px-2 py-1.5">
                  <span className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle" style={{ background: item.color || "#94a3b8" }} />
                  {item.abbreviation}
                </td>
                <td className="px-2 py-1.5">{item.activityType || "—"}</td>
                <td className="px-2 py-1.5">{item.team?.name || "—"}</td>
                <td className="px-2 py-1.5">{item.shortDescription || "—"}</td>
                <td className="px-2 py-1.5">{item.defaultDuration ? `${item.defaultDuration} (${item.durationType})` : "—"}</td>
                <td className="px-2 py-1.5">
                  <button onClick={() => startEdit(item)} className="text-slate-400">
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                </td>
                <td className="px-2 py-1.5">
                  <button onClick={() => requestDelete(item.id)} className="text-red-500">
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-400 py-4">Aucune tâche.</td></tr>
            )}
          </tbody>
        </table>

        {impact && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-4">
            <p className="font-semibold mb-1">Attention : cette tâche est utilisée.</p>
            <p>{impact.counts.scheduleEntries} entrée(s) de planning et {impact.counts.taskProgress} avancement(s) seront supprimés.</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { setImpact(null); setPendingDeleteId(null); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-amber-300"
              >
                Annuler
              </button>
              <button
                onClick={() => deleteMutation.mutate(pendingDeleteId)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white"
              >
                Supprimer quand même
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
            {editingId ? "Modifier la tâche" : "Nouvelle tâche"}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Abréviation (max 5)
              <input
                value={form.abbreviation}
                maxLength={5}
                onChange={(e) => setForm((f) => ({ ...f, abbreviation: e.target.value.toUpperCase() }))}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Équipe
              <select
                value={form.teamId}
                onChange={(e) => setForm((f) => ({ ...f, teamId: e.target.value }))}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
              >
                <option value="">—</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Type d'activité
              <input value={form.activityType} onChange={(e) => setForm((f) => ({ ...f, activityType: e.target.value }))} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Description courte
              <input value={form.shortDescription} onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1 col-span-2">
              Description
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Durée par défaut
              <input type="number" value={form.defaultDuration} onChange={(e) => setForm((f) => ({ ...f, defaultDuration: e.target.value }))} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Unité
              <select value={form.durationType} onChange={(e) => setForm((f) => ({ ...f, durationType: e.target.value }))} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm">
                <option value="journée">journée</option>
                <option value="AM/PM">AM/PM</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Couleur
              <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="border border-slate-200 rounded-lg h-9 w-16" />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            {editingId && (
              <button onClick={() => { setEditingId(null); setForm(emptyForm); }} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100">
                Annuler
              </button>
            )}
            <button
              onClick={submit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-60"
            >
              {editingId ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
