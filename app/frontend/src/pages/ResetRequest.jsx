import { useState } from "react";
import AuthCardShell from "../components/AuthCardShell";
import { api } from "../lib/api";

export default function ResetRequest() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api("/auth/reset-request", { method: "POST", body: { email } });
      setMessage(res.message);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCardShell icon="mail" title="Mot de passe oublié" subtitle="Entrez votre adresse email. Nous vous enverrons un lien pour réinitialiser votre accès.">
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
          Email professionnel
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nom@entreprise.fr"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </label>
        {message && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 m-0">{message}</p>}
        <button
          type="submit"
          disabled={busy}
          className="bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-semibold rounded-xl h-11 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
        >
          Envoyer le lien
          <span className="material-symbols-outlined text-[18px]">send</span>
        </button>
      </form>
    </AuthCardShell>
  );
}
