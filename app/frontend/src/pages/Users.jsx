import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import StatusChip from "../components/StatusChip";

const EMPTY_FORM = { fullName: "", company: "", email: "", password: "", roleId: "", team: "", status: "Actif" };

export default function Users() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api("/users"),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api("/users/roles"),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => api("/users", { method: "POST", body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => api(`/users/${id}`, { method: "PUT", body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      closeForm();
    },
  });

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(u) {
    const role = roles.find((r) => r.name === u.role);
    setForm({
      fullName: u.fullName || "",
      company: u.company || "",
      email: u.email || "",
      password: "",
      roleId: role?.id || "",
      team: u.team || "",
      status: u.status || "Actif",
    });
    setEditingId(u.id);
    setShowForm(true);
  }

  function submit() {
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        payload: { fullName: form.fullName, company: form.company, roleId: form.roleId, team: form.team, status: form.status },
      });
    } else {
      createMutation.mutate(form);
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold m-0">Utilisateurs</h1>
          <p className="text-xs text-slate-500 m-0">Gestion des comptes &amp; rôles</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-xl px-4 py-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Nouvel utilisateur
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Nom complet
              <input
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Entreprise
              <input
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Email
              <input
                type="email"
                value={form.email}
                disabled={!!editingId}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />
            </label>
            {!editingId && (
              <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
                Mot de passe
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                />
              </label>
            )}
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Rôle
              <select
                value={form.roleId}
                onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
              >
                <option value="">—</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
              Équipe
              <input
                value={form.team}
                onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
              />
            </label>
            {editingId && (
              <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
                Statut
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                >
                  <option value="Actif">Actif</option>
                  <option value="Bloqué">Bloqué</option>
                </select>
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={closeForm} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100">
              Annuler
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-60"
            >
              {editingId ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {["Nom", "Email", "Entreprise", "Rôle", "Équipe", "Statut", ""].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 font-bold uppercase text-slate-400 text-[10px] tracking-wide border-b border-slate-100">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50 border-b border-slate-50">
                <td className="px-4 py-2.5 font-semibold">{u.fullName}</td>
                <td className="px-4 py-2.5">{u.email}</td>
                <td className="px-4 py-2.5">{u.company || "—"}</td>
                <td className="px-4 py-2.5">{u.role || "—"}</td>
                <td className="px-4 py-2.5">{u.team || "—"}</td>
                <td className="px-4 py-2.5"><StatusChip status={u.status} /></td>
                <td className="px-4 py-2.5">
                  <button onClick={() => openEdit(u)} className="text-primary">
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="text-center text-slate-400 text-sm py-8">Chargement…</p>}
        {!isLoading && users.length === 0 && <p className="text-center text-slate-400 text-sm py-8">Aucun utilisateur.</p>}
      </div>
    </div>
  );
}
