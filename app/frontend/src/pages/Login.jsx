import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email || password.length < 8) {
      setError("Merci de renseigner un email et un mot de passe (8 caractères minimum).");
      return;
    }
    setBusy(true);
    try {
      await login(email, password);
      navigate("/portfolio");
    } catch (err) {
      setError(err.message || "Échec de connexion");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5"
      style={{ background: "linear-gradient(160deg, #004595 0%, #0d59f2 45%, #1e293b 100%)" }}
    >
      <div className="fixed top-0 inset-x-0 flex justify-between items-center px-6 py-4 text-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">domain</span>
          </div>
          <span className="font-bold drop-shadow">Ehden Vision</span>
        </div>
        <Link to="/support-login" className="flex items-center gap-1 text-sm bg-white/15 rounded-full px-3 py-1.5">
          <span className="material-symbols-outlined text-[16px]">help</span>
          Support
        </Link>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-xl p-8 md:p-10 w-full max-w-md flex flex-col gap-3.5">
        <div className="w-13 h-13 rounded-xl bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center mb-1">
          <span className="material-symbols-outlined text-primary text-[26px]">engineering</span>
        </div>
        <h1 className="text-2xl font-black m-0">Bienvenue</h1>
        <p className="text-sm text-slate-500 m-0 mb-2">Connectez-vous à votre espace projet</p>

        <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
          Email
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </label>

        <label className="text-xs font-semibold text-slate-500 flex flex-col gap-1">
          Mot de passe
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">lock</span>
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="current-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <span className="material-symbols-outlined text-[18px]">{showPwd ? "visibility_off" : "visibility"}</span>
            </button>
          </div>
        </label>

        <Link to="/reset-request" className="text-xs text-primary font-semibold self-end -mt-2">
          Mot de passe oublié ?
        </Link>

        {error && <p className="text-red-700 text-xs m-0">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-semibold rounded-xl h-11 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
        >
          {busy ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
              Vérification en cours…
            </>
          ) : (
            <>
              Se connecter
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </>
          )}
        </button>
      </form>

      <div className="fixed bottom-0 inset-x-0 text-center text-white/70 text-xs py-4">
        © 2026 Ehden Vision. Tous droits réservés.
      </div>
    </div>
  );
}
