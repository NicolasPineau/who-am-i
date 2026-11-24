// Petites fonctions partagées.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function formatDuree(ms) {
  if (ms === null || ms === undefined) return "—";
  const s = ms / 1000;
  if (s < 60) return s.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " s";
  const m = Math.floor(s / 60);
  return `${m} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;
}
