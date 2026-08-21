import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuthCardShell from "../components/AuthCardShell";
import { api } from "../lib/api";

export default function Reset() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("8 caractères minimum.");
    if (password !== confirm) return setError("Les mots de passe ne correspondent pas.");
    setBusy(true);
    try {
      await api("/auth/reset", { method: "POST", body: { token, newPassword: password } });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCardShell icon="lock_reset" title="Réinitialisation" subtitle="Définissez votre nouveau mot de passe. Le lien expire dans 1 heure.">
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
          Nouveau mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <span className="text-[11px] text-slate-400 font-normal">8 caractères minimum.</span>
        </label>
        <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
          Confirmer le mot de passe
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </label>
        {error && <p className="text-red-700 text-xs m-0">{error}</p>}
        {success && <p className="text-emerald-700 text-xs bg-emerald-50 rounded-lg p-2 m-0">Succès — redirection en cours...</p>}
        <button
          type="submit"
          disabled={busy || !token}
          className="bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-semibold rounded-xl h-11 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
        >
          Mettre à jour
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
        </button>
        {!token && <p className="text-red-700 text-xs m-0">Lien invalide — aucun token trouvé.</p>}
      </form>
    </AuthCardShell>
  );
}
