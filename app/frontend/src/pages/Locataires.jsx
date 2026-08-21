import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCurrentProject } from "../lib/useCurrentProject";
import { api } from "../lib/api";

const TABS = [
  { key: "locataires", label: "LOCATAIRES" },
  { key: "communs", label: "COMMUNS" },
  { key: "facades", label: "FAÇADES" },
];

const STATUS_OPTIONS = ["", "Info", "Attention", "Bloquant"];
const STATUS_CLASS = {
  Info: "bg-blue-100 text-blue-700",
  Attention: "bg-amber-100 text-amber-700",
  Bloquant: "bg-red-100 text-red-700",
};

function FilterSelect({ label, options, value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white border border-slate-200 rounded-lg text-xs px-2 py-1.5"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

export default function Locataires() {
  const { projectId } = useCurrentProject();
  const queryClient = useQueryClient();
  const [view, setView] = useState("locataires");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [editing, setEditing] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["locataires", projectId],
    queryFn: () => api(`/buildings/locataires/${projectId}`),
    enabled: !!projectId,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    if (view === "locataires") return data.units;
    if (view === "communs") return data.commonAreas;
    return data.facades;
  }, [data, view]);

  const filterKeys = {
    locataires: ["Bâtiment", "Hall", "Etage", "Empil.", "Type", "Config"],
    communs: ["Bâtiment", "Hall", "Description"],
    facades: ["Bâtiment", "Hall", "Orientation", "Trame", "Type"],
  }[view];

  function fieldFor(row, key) {
    switch (key) {
      case "Bâtiment": return row.building?.code;
      case "Hall": return row.hall;
      case "Etage": return row.floor;
      case "Empil.": return row.stackNumber;
      case "Type": return view === "locataires" ? row.type : row.type;
      case "Config": return row.unitTypeConfig;
      case "Description": return row.description;
      case "Orientation": return row.orientation;
      case "Trame": return row.trame;
      default: return "";
    }
  }

  const filtered = rows.filter((r) => {
    for (const [key, val] of Object.entries(filters)) {
      if (val && String(fieldFor(r, key) || "") !== val) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const haystack = [r.identifiant, r.hall, r.floor, r.description, r.tenants?.[0]?.lastName, r.tenants?.[0]?.firstName]
        .filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const uniqueOptions = (key) => [...new Set(rows.map((r) => fieldFor(r, key)).filter(Boolean))].sort();

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (view === "locataires") {
        return api(`/buildings/units/${payload.id}/contact`, { method: "PUT", body: payload });
      }
      const path = view === "communs" ? "common-areas" : "facades";
      return api(`/buildings/${path}/${payload.id}/planning`, { method: "PUT", body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locataires", projectId] });
      setEditing(null);
    },
  });

  if (!projectId) return <p className="text-slate-500 text-sm">Sélectionnez un projet depuis le portefeuille.</p>;

  return (
    <div>
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setView(t.key); setFilters({}); }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold ${view === t.key ? "bg-white shadow-sm text-primary" : "text-slate-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap items-center gap-2 sticky top-0 z-10">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer..."
          className="bg-slate-50 border border-slate-200 rounded-lg text-xs px-3 py-1.5 flex-1 min-w-[160px]"
        />
        {filterKeys.map((key) => (
          <FilterSelect
            key={key}
            label={key}
            options={uniqueOptions(key)}
            value={filters[key] || ""}
            onChange={(v) => setFilters((f) => ({ ...f, [key]: v }))}
          />
        ))}
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({})} className="text-xs text-primary font-semibold">Effacer</button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{isLoading ? "Chargement..." : `${filtered.length} résultat(s)`}</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white shadow-sm">
            {view === "locataires" && (
              <tr>
                {["Editer", "ID", "Bâtiment", "Hall", "Etage", "Empil.", "Porte", "Type", "Config. Logement", "Surface", "Occupant", "Téléphones", "Emails"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-bold uppercase text-slate-400 text-[10px] tracking-wide border-b border-slate-100">{h}</th>
                ))}
              </tr>
            )}
            {view === "communs" && (
              <tr>
                {["ID", "Bâtiment", "Hall", "Etage", "Description", "Ref"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-bold uppercase text-slate-400 text-[10px] tracking-wide border-b border-slate-100">{h}</th>
                ))}
              </tr>
            )}
            {view === "facades" && (
              <tr>
                {["ID", "Bâtiment", "Hall", "Orientation", "Trame", "Partie", "Type"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-bold uppercase text-slate-400 text-[10px] tracking-wide border-b border-slate-100">{h}</th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {view === "locataires" && filtered.map((u) => {
              const t = u.tenants?.[0];
              return (
                <tr key={u.id} className="hover:bg-slate-50 border-b border-slate-50">
                  <td className="px-3 py-2">
                    <button onClick={() => setEditing(u)} className="text-primary">
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono">{u.identifiant}</td>
                  <td className="px-3 py-2">{u.building?.code}</td>
                  <td className="px-3 py-2">{u.hall || "—"}</td>
                  <td className="px-3 py-2">{u.floor || "—"}</td>
                  <td className="px-3 py-2">{u.stackNumber || "—"}</td>
                  <td className="px-3 py-2">{u.doorNumber || "—"}</td>
                  <td className="px-3 py-2">{u.type ? `L${u.type}` : "—"}</td>
                  <td className="px-3 py-2">{u.unitTypeConfig || "—"}</td>
                  <td className="px-3 py-2">{u.surfaceM2 ? `${u.surfaceM2}m²` : "—"}</td>
                  <td className="px-3 py-2">{t ? `${t.lastName || ""} ${t.firstName || ""}`.trim() : "—"}</td>
                  <td className="px-3 py-2 whitespace-pre-line">{[t?.phoneFixed, t?.phoneMobile1, t?.phoneMobile2].filter(Boolean).join("\n") || "—"}</td>
                  <td className="px-3 py-2 whitespace-pre-line">{[t?.email, t?.email2].filter(Boolean).join("\n") || "—"}</td>
                </tr>
              );
            })}
            {view === "communs" && filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 border-b border-slate-50 cursor-pointer" onClick={() => setEditing(c)}>
                <td className="px-3 py-2 font-mono">{c.identifiant}</td>
                <td className="px-3 py-2">{c.building?.code}</td>
                <td className="px-3 py-2">{c.hall || "—"}</td>
                <td className="px-3 py-2">{c.floor || "—"}</td>
                <td className="px-3 py-2">{c.description || "—"}</td>
                <td className="px-3 py-2">{c.abbreviation || "—"}</td>
              </tr>
            ))}
            {view === "facades" && filtered.map((f) => (
              <tr key={f.id} className="hover:bg-slate-50 border-b border-slate-50 cursor-pointer" onClick={() => setEditing(f)}>
                <td className="px-3 py-2 font-mono">{f.identifiant}</td>
                <td className="px-3 py-2">{f.building?.code}</td>
                <td className="px-3 py-2">{f.hall || "—"}</td>
                <td className="px-3 py-2">{f.orientation || "—"}</td>
                <td className="px-3 py-2">{f.trame || "—"}</td>
                <td className="px-3 py-2">{f.part || "—"}</td>
                <td className="px-3 py-2">{f.type || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-10">Aucun résultat.</p>
        )}
      </div>

      {editing && (
        <EditModal
          view={view}
          row={editing}
          onClose={() => setEditing(null)}
          onSave={(payload) => saveMutation.mutate(payload)}
          saving={saveMutation.isPending}
        />
      )}
    </div>
  );
}

function EditModal({ view, row, onClose, onSave, saving }) {
  const tenant = row.tenants?.[0] || {};
  const [form, setForm] = useState({
    id: row.id,
    lastName: tenant.lastName || "",
    firstName: tenant.firstName || "",
    email: tenant.email || "",
    email2: tenant.email2 || "",
    phoneFixed: tenant.phoneFixed || "",
    phoneMobile1: tenant.phoneMobile1 || "",
    phoneMobile2: tenant.phoneMobile2 || "",
    planningStatus: row.planningStatus || "",
    notePublic: row.notePublic || "",
    notePrivate: row.notePrivate || "",
  });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold mb-4">Fiche {view === "locataires" ? "Occupant" : "Élément"} — {row.identifiant}</h2>

        {view === "locataires" && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Nom
              <input value={form.lastName} onChange={(e) => set("lastName", e.target.value.toUpperCase())} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Prénom
              <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Email 1
              <input value={form.email} onChange={(e) => set("email", e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Email 2
              <input value={form.email2} onChange={(e) => set("email2", e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Tél Fixe
              <input value={form.phoneFixed} onChange={(e) => set("phoneFixed", e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Portable 1
              <input value={form.phoneMobile1} onChange={(e) => set("phoneMobile1", e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Portable 2
              <input value={form.phoneMobile2} onChange={(e) => set("phoneMobile2", e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </label>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Suivi &amp; Planning</div>
          <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1 mb-3">
            Statut
            <select
              value={form.planningStatus}
              onChange={(e) => set("planningStatus", e.target.value)}
              className={`border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm w-fit ${STATUS_CLASS[form.planningStatus] || ""}`}
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || "Aucun"}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1 mb-3">
            Note
            <textarea value={form.notePublic} onChange={(e) => set("notePublic", e.target.value)} rows={2} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-semibold text-rose-500 flex flex-col gap-1">
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">lock</span> Privée</span>
            <textarea value={form.notePrivate} onChange={(e) => set("notePrivate", e.target.value)} rows={2} className="border border-rose-200 bg-rose-50 rounded-lg px-2.5 py-1.5 text-sm" />
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100">Annuler</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
