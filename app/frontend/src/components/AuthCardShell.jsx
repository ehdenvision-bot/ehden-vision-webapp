import { Link } from "react-router-dom";

export default function AuthCardShell({ icon, title, subtitle, children, backTo = "/login", backLabel = "Retour à la connexion" }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 bg-background-page">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="w-8 h-8 rounded-lg bg-corporate-blue/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-corporate-blue text-[18px]">domain</span>
          </div>
          <span className="font-bold text-slate-700">Ehden Vision</span>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 md:p-10 flex flex-col gap-3.5">
          <div className="w-13 h-13 rounded-xl bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center mb-1">
            <span className="material-symbols-outlined text-primary text-[26px]">{icon}</span>
          </div>
          <h1 className="text-2xl font-black m-0">{title}</h1>
          <p className="text-sm text-slate-500 m-0 mb-2">{subtitle}</p>
          {children}
          <div className="border-t border-slate-100 pt-4 mt-1 text-center">
            <Link to={backTo} className="text-sm text-primary font-semibold">
              ← {backLabel}
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">© 2026 Ehden Vision. Tous droits réservés.</p>
      </div>
    </div>
  );
}
