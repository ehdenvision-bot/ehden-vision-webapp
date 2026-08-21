import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCurrentProject } from "../lib/useCurrentProject";
import { api, apiUpload } from "../lib/api";
import StatusChip from "../components/StatusChip";

const TABS = [
  { key: "notes", label: "Notes", icon: "photo_camera" },
  { key: "travaux", label: "Travaux", icon: "checklist" },
  { key: "reserves", label: "Réserves", icon: "sell" },
];

const DEFAULT_ROOMS = ["Général", "Entrée", "Séjour", "Cuisine", "Chambre 1", "Chambre 2", "Salle de bain", "WC"];

export default function Edl() {
  const { projectId } = useCurrentProject();
  const [unitId, setUnitId] = useState("");
  const [tab, setTab] = useState("notes");

  const { data: locData, isLoading: locLoading } = useQuery({
    queryKey: ["locataires", projectId],
    queryFn: () => api(`/buildings/locataires/${projectId}`),
    enabled: !!projectId,
  });

  const units = locData?.units || [];
  const unit = units.find((u) => u.id === unitId) || null;

  if (!projectId) return <p className="text-slate-500 text-sm">Sélectionnez un projet depuis le portefeuille.</p>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="material-symbols-outlined text-slate-400">apartment</span>
        <select
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          className="bg-white border border-slate-200 rounded-xl text-sm px-3 py-2 min-w-[280px]"
        >
          <option value="">{locLoading ? "Chargement..." : "Sélectionner un logement…"}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.building?.code ? `${u.building.code} — ` : ""}{u.identifiant}
            </option>
          ))}
        </select>
        {unitId && (
          <button onClick={() => setUnitId("")} className="text-slate-400" title="Réinitialiser">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>

      {!unitId && <p className="text-slate-400 text-sm text-center py-16">Choisissez un logement pour afficher son EDL.</p>}

      {unitId && (
        <>
          <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold ${
                  tab === t.key ? "bg-white shadow-sm text-primary" : "text-slate-500"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "notes" && <NotesTab unitId={unitId} unit={unit} />}
          {tab === "travaux" && <TravauxTab unitId={unitId} />}
          {tab === "reserves" && <ReservesTab unitId={unitId} />}
        </>
      )}
    </div>
  );
}

// ---- Notes tab: room-by-room public/private notes + photo upload/gallery ----

function NotesTab({ unitId }) {
  const queryClient = useQueryClient();
  const [room, setRoom] = useState(DEFAULT_ROOMS[0]);

  const { data: notes = [] } = useQuery({
    queryKey: ["edl-notes", unitId],
    queryFn: () => api(`/edl/notes/${unitId}`),
  });
  const { data: photos = [] } = useQuery({
    queryKey: ["edl-photos", unitId],
    queryFn: () => api(`/edl/photos/${unitId}`),
  });

  const rooms = useMemo(() => {
    const fromNotes = notes.map((n) => n.room);
    return [...new Set([...DEFAULT_ROOMS, ...fromNotes])];
  }, [notes]);

  const currentNote = notes.find((n) => n.room === room) || { notePublic: "", notePrivate: "" };
  const [form, setForm] = useState({ notePublic: currentNote.notePublic || "", notePrivate: currentNote.notePrivate || "" });

  function switchRoom(nextRoom) {
    setRoom(nextRoom);
    const n = notes.find((x) => x.room === nextRoom) || { notePublic: "", notePrivate: "" };
    setForm({ notePublic: n.notePublic || "", notePrivate: n.notePrivate || "" });
  }

  const saveNote = useMutation({
    mutationFn: (payload) => api(`/edl/notes/${unitId}/${encodeURIComponent(room)}`, { method: "PUT", body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["edl-notes", unitId] }),
  });

  const uploadPhoto = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("room", room);
      return apiUpload(`/edl/photos/${unitId}`, fd);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["edl-photos", unitId] }),
  });

  const deletePhoto = useMutation({
    mutationFn: (id) => api(`/edl/photos/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["edl-photos", unitId] }),
  });

  const roomPhotos = photos.filter((p) => p.room === room);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2 h-fit">
        {rooms.map((r) => (
          <button
            key={r}
            onClick={() => switchRoom(r)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${room === r ? "bg-primary/10 text-primary font-bold" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold mb-3">État &amp; Notes — {room}</h2>
          <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1 mb-3">
            Note
            <textarea
              value={form.notePublic}
              onChange={(e) => setForm((f) => ({ ...f, notePublic: e.target.value }))}
              onBlur={() => saveNote.mutate(form)}
              rows={2}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-rose-500 flex flex-col gap-1">
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">lock</span> Note Privée</span>
            <textarea
              value={form.notePrivate}
              onChange={(e) => setForm((f) => ({ ...f, notePrivate: e.target.value }))}
              onBlur={() => saveNote.mutate(form)}
              rows={2}
              className="border border-rose-200 bg-rose-50 rounded-lg px-2.5 py-1.5 text-sm"
            />
          </label>
          {saveNote.isPending && <p className="text-[11px] text-slate-400 mt-1">Enregistrement…</p>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold mb-3">Photos — {room}</h2>
          <label className="block border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 mb-4">
            <span className="material-symbols-outlined text-slate-300 text-3xl block mb-1">add_a_photo</span>
            <span className="text-xs text-slate-500">Cliquez ou glissez une photo (png/jpg/webp)</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => e.target.files[0] && uploadPhoto.mutate(e.target.files[0])}
            />
          </label>
          {uploadPhoto.isPending && <p className="text-[11px] text-slate-400 mb-3">Envoi en cours…</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {roomPhotos.map((p) => (
              <div key={p.id} className="relative group rounded-lg overflow-hidden border border-slate-200">
                <img src={p.filePath} alt="" className="w-full h-24 object-cover" />
                <button
                  onClick={() => deletePhoto.mutate(p.id)}
                  className="absolute top-1 right-1 bg-white/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                >
                  <span className="material-symbols-outlined text-[14px] text-red-600">delete</span>
                </button>
              </div>
            ))}
          </div>
          {roomPhotos.length === 0 && <p className="text-xs text-slate-400">Aucune photo pour cette pièce.</p>}
        </div>
      </div>
    </div>
  );
}

// ---- Travaux tab: dynamic work-fields form ----

function TravauxTab({ unitId }) {
  const queryClient = useQueryClient();
  const { data: fields = [] } = useQuery({
    queryKey: ["edl-work-fields"],
    queryFn: () => api("/edl/work-fields"),
  });
  const { data: values = [] } = useQuery({
    queryKey: ["edl-work-values", unitId],
    queryFn: () => api(`/edl/work-values/${unitId}`),
  });

  const saveValue = useMutation({
    mutationFn: ({ fieldId, value }) => api(`/edl/work-values/${unitId}/${fieldId}`, { method: "PUT", body: { value } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["edl-work-values", unitId] }),
  });

  const grouped = useMemo(() => {
    const byDiscipline = {};
    for (const f of fields) {
      const key = f.discipline || "Autre";
      (byDiscipline[key] ||= []).push(f);
    }
    return byDiscipline;
  }, [fields]);

  function valueFor(fieldId) {
    return values.find((v) => v.fieldId === fieldId)?.value;
  }

  if (fields.length === 0) {
    return <p className="text-slate-400 text-sm bg-white rounded-2xl border border-slate-200 p-6">Aucun champ de travaux configuré (Config Travaux).</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(grouped).map(([discipline, group]) => (
        <div key={discipline} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold mb-3">{discipline}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {group.map((f) => (
              <WorkField key={f.id} field={f} value={valueFor(f.id)} onSave={(value) => saveValue.mutate({ fieldId: f.id, value })} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkField({ field, value, onSave }) {
  const label = field.workType || field.code;

  if (field.fieldType === "Checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!value} onChange={(e) => onSave(e.target.checked)} className="w-4 h-4" />
        {label}
      </label>
    );
  }

  if (field.fieldType === "Menu Deroulant") {
    const options = Array.isArray(field.options) ? field.options : [];
    return (
      <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
        {label}
        <select
          value={value || ""}
          onChange={(e) => onSave(e.target.value)}
          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
        >
          <option value="">—</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }

  return (
    <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
      {label}
      <input
        defaultValue={value || ""}
        onBlur={(e) => onSave(e.target.value)}
        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
      />
    </label>
  );
}

// ---- Réserves tab: list + simple create form ----

function ReservesTab({ unitId }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ kind: "reserve", description: "" });

  const { data: reserves = [], isLoading } = useQuery({
    queryKey: ["reserves-unit", unitId],
    queryFn: () => api(`/reserves?unitId=${unitId}`),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => api("/reserves", { method: "POST", body: { ...payload, unitId, status: "open" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reserves-unit", unitId] });
      setShowForm(false);
      setForm({ kind: "reserve", description: "" });
    },
  });

  return (
    <div>
      <div className="flex justify-end mb-3">
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
          <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1 mb-3">
            Type
            <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm w-fit">
              <option value="reserve">Réserve</option>
              <option value="autocontrole">Auto-contrôle</option>
            </select>
          </label>
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
              {["Code", "Type", "Description", "Statut"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 font-bold uppercase text-slate-400 text-[10px] tracking-wide border-b border-slate-100">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reserves.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50 border-b border-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-2.5 capitalize">{r.kind}</td>
                <td className="px-4 py-2.5">{r.description || "—"}</td>
                <td className="px-4 py-2.5"><StatusChip status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="text-center text-slate-400 text-sm py-8">Chargement…</p>}
        {!isLoading && reserves.length === 0 && <p className="text-center text-slate-400 text-sm py-8">Aucune réserve pour ce logement.</p>}
      </div>
    </div>
  );
}
