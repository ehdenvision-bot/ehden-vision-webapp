import { useNavigate } from "react-router-dom";

const ROWS = [
  { icon: "mail", label: "Email", value: "ehdenvision@gmail.com", href: "mailto:ehdenvision@gmail.com" },
  { icon: "call", label: "Téléphone", value: "+33 6 22 15 38 18" },
  { icon: "schedule", label: "Disponibilité", value: "Lundi - Vendredi / 09:00 - 17:00 (CET)" },
];

export default function Support() {
  const navigate = useNavigate();
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md mx-auto flex flex-col gap-3.5">
      <div className="w-13 h-13 rounded-xl bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center mb-1">
        <span className="material-symbols-outlined text-primary text-[26px]">help_center</span>
      </div>
      <h1 className="text-2xl font-black m-0">Centre de Support</h1>
      <p className="text-sm text-slate-500 m-0 mb-2">
        Une question sur votre accès ou un projet ? Michel DAHDAH est là pour vous aider.
      </p>
      {ROWS.map((r) => (
        <div key={r.label} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <span className="material-symbols-outlined text-primary">{r.icon}</span>
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase">{r.label}</div>
            {r.href ? (
              <a href={r.href} className="text-sm font-medium text-primary">{r.value}</a>
            ) : (
              <div className="text-sm font-medium">{r.value}</div>
            )}
          </div>
        </div>
      ))}
      <div className="border-t border-slate-100 pt-4 mt-1 text-center">
        <button onClick={() => navigate(-1)} className="text-sm text-primary font-semibold">
          ← Retour à la page précédente
        </button>
      </div>
    </div>
  );
}
