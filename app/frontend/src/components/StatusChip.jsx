const CHIP_CLASS = {
  active: "chip-active",
  blocked: "chip-blocked",
  ended: "chip-ended",
  archived: "chip-archived",
  open: "chip-open",
};

export function statusChipClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "active" || s === "actif") return CHIP_CLASS.active;
  if (s === "blocked" || s === "bloqué" || s === "bloquant" || s === "bloquée") return CHIP_CLASS.blocked;
  if (s === "archived" || s === "archivé") return CHIP_CLASS.archived;
  if (s === "open") return CHIP_CLASS.open;
  return CHIP_CLASS.ended;
}

export default function StatusChip({ status, icon }) {
  return (
    <span className={`status-pill ${statusChipClass(status)}`}>
      {icon && <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{icon}</span>}
      {status || "—"}
    </span>
  );
}
