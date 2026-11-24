// Petites fonctions partagées.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function formatDuree(ms) {
  if (ms === null || ms === undefined) return "—";
  const s = ms / 1000;
  if (s < 60) return s.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " s";
  const m = Math.floor(s / 60);
  return `${m} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;
}

// ---------- Reconnaissance des élèves de la classe ----------
// Les élèves saisissent « Prénom + initiale du nom » : on retrouve la bonne ligne de la
// liste de classe sans tenir compte des accents, majuscules, tirets et espaces.
export function simplifier(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

// Renvoie l'élève de la liste qui correspond au nom saisi (« Prénom NOM »), ou null.
export function retrouverEleve(classe, nomSaisi) {
  const s = simplifier(nomSaisi);
  if (!s) return null;
  const candidats = classe.filter((e) => {
    const p = simplifier(e.prenom), n = simplifier(e.nom);
    if (s === p + n || s === n + p) return true;
    // Prénom + initiale (ou début) du nom, ex. « Maxime D. »
    if (s.startsWith(p) && s.length > p.length && n.startsWith(s.slice(p.length))) return true;
    // Nom composé saisi en partie, ex. « Louis Le Maux »
    if (s.startsWith(p) && s.length - p.length >= 3 && n.includes(s.slice(p.length))) return true;
    // Dans l'autre sens : « Dunyach Maxime », « D. Maxime », « Andres Rafael »
    if (s.endsWith(p) && s.length > p.length) {
      const debut = s.slice(0, s.length - p.length);
      if (n.startsWith(debut) || (debut.length >= 3 && n.includes(debut))) return true;
    }
    return false;
  });
  // Prénom seul : accepté s'il est unique dans la classe
  if (!candidats.length) {
    const memePrenom = classe.filter((e) => simplifier(e.prenom) === s);
    if (memePrenom.length === 1) return memePrenom[0];
  }
  return candidats.length === 1 ? candidats[0] : null;
}

// Liste collée par le prof : une ligne par élève, « NOM Prénom » (nom en majuscules),
// ou le format de l'ENT (NOM, puis Prénom sur la ligne suivante).
export function analyserListe(texte) {
  const ignorer = /^(photo [ée]l[èe]ve|demi[- ]pensionnaire|externe( libre)?|interne)$/i;
  const lignes = texte.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !ignorer.test(l));
  const eleves = [];
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const mots = l.split(/\s+/);
    // Mots en majuscules au début = nom, le reste = prénom
    let k = 0;
    while (k < mots.length && mots[k] === mots[k].toUpperCase() && /[A-ZÀ-Ý]/.test(mots[k]) || (k < mots.length && /^-+$/.test(mots[k]))) k++;
    if (k > 0 && k < mots.length) {
      eleves.push({ nom: mots.slice(0, k).join(" "), prenom: joli(mots.slice(k).join(" ")) });
    } else if (k === mots.length && lignes[i + 1]) {
      // Format ENT : NOM sur une ligne, Prénom sur la suivante
      eleves.push({ nom: l, prenom: joli(lignes[i + 1]) });
      i++;
    }
  }
  return eleves;
}

function joli(prenom) {
  return prenom.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
