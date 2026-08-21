import AuthCardShell from "../components/AuthCardShell";

const ROWS = [
  { icon: "mail", label: "Email", value: "ehdenvision@gmail.com", href: "mailto:ehdenvision@gmail.com" },
  { icon: "call", label: "Téléphone", value: "+33 6 22 15 38 18" },
  { icon: "schedule", label: "Disponibilité", value: "Lundi - Vendredi / 09:00 - 17:00 (CET)" },
];

export default function SupportLogin() {
  return (
    <AuthCardShell icon="help_center" title="Centre de Support" subtitle="Une question sur votre accès ou un projet ? Michel DAHDAH est là pour vous aider.">
      <div className="flex flex-col gap-3">
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
      </div>
    </AuthCardShell>
  );
}
