// Dessin des bustes en SVG, calculé à partir des données de la personne.
// Rien n'est une photo : tout est généré (âge, genre, cheveux, yeux, lunettes…).

const PEAUX = ["#f8dcc8", "#efc4a4", "#dba57f", "#bb8158", "#8f5c3c", "#5f3c27"];
const CHEVEUX = {
  blond: "#e0bb62", brun: "#4b2d1e", chatain: "#8a5a33", roux: "#c2552a",
  noir: "#211b18", gris: "#a6a6a6", blanc: "#ebe8e3",
};
const YEUX = { marron: "#6b3f1f", bleu: "#3c7dcc", vert: "#4d9a48", noir: "#1d1d1d", gris: "#8b949b" };
const HAUTS = ["#e4572e", "#2e86ab", "#76b041", "#f2a541", "#8e5ea2", "#ef476f", "#118ab2", "#5c6b73"];
const FONDS = ["#fde2c4", "#d7ecff", "#e2f5d3", "#fff1b8", "#ecdcf7", "#ffd9e1", "#d3f4ef", "#e8e8e8"];

function assombrir(hex, f = 0.82) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

export function avatarSVG(p, { taille = "100%" } = {}) {
  const age = p.age;
  const stade = age < 2 ? "bebe" : age < 13 ? "enfant" : age < 18 ? "ado" : age < 60 ? "adulte" : "senior";
  const peau = PEAUX[p._peau ?? 1];
  const peauOmbre = assombrir(peau, 0.88);
  const chauve = p.cheveux === "chauve";
  const ch = chauve ? (age >= 50 ? "#b9b4ae" : peauOmbre) : CHEVEUX[p.cheveux] || "#4b2d1e";
  const yeux = YEUX[p.yeux] || YEUX.marron;
  const haut = HAUTS[p._haut ?? 0];
  const fond = FONDS[p._fond ?? 0];

  const cx = 50;
  let cy = 44, rx = 15, ry = 18;
  if (stade === "enfant") { rx = 15.5; ry = 16.5; cy = 46; }
  if (stade === "bebe") { rx = 17; ry = 16; cy = 50; }
  if (stade === "ado") { ry = 17.5; }

  const s = [];
  s.push(`<rect width="100" height="100" fill="${fond}"/>`);

  // Cheveux de derrière
  const coiffure = p._coiffure;
  if (!chauve) {
    if (coiffure === "long") {
      s.push(`<path d="M${cx - rx - 3} ${cy - 4} Q${cx - rx - 7} ${cy + 26} ${cx - rx - 1} ${cy + 34} L${cx + rx + 1} ${cy + 34} Q${cx + rx + 7} ${cy + 26} ${cx + rx + 3} ${cy - 4} Z" fill="${ch}"/>`);
    } else if (coiffure === "carre") {
      s.push(`<path d="M${cx - rx - 3} ${cy - 4} Q${cx - rx - 5} ${cy + 12} ${cx - rx - 2} ${cy + 17} L${cx + rx + 2} ${cy + 17} Q${cx + rx + 5} ${cy + 12} ${cx + rx + 3} ${cy - 4} Z" fill="${ch}"/>`);
    } else if (coiffure === "chignon") {
      s.push(`<circle cx="${cx}" cy="${cy - ry - 4}" r="8" fill="${ch}"/>`);
    } else if (coiffure === "queue") {
      s.push(`<path d="M${cx + rx - 2} ${cy - 10} Q${cx + rx + 14} ${cy - 6} ${cx + rx + 8} ${cy + 18} Q${cx + rx + 4} ${cy + 4} ${cx + rx - 4} ${cy - 2} Z" fill="${ch}"/>`);
    } else if (coiffure === "couettes") {
      s.push(`<ellipse cx="${cx - rx - 5}" cy="${cy + 2}" rx="5" ry="8" fill="${ch}"/><ellipse cx="${cx + rx + 5}" cy="${cy + 2}" rx="5" ry="8" fill="${ch}"/>`);
    }
  }

  // Corps
  if (stade === "bebe") {
    s.push(`<path d="M26 100 Q28 78 50 76 Q72 78 74 100 Z" fill="${haut}"/>`);
    s.push(`<path d="M40 76 Q50 90 60 76 Z" fill="#fff" opacity=".9"/>`);
  } else if (stade === "enfant") {
    s.push(`<path d="M22 100 Q24 74 50 72 Q76 74 78 100 Z" fill="${haut}"/>`);
  } else {
    s.push(`<path d="M15 100 Q17 70 50 68 Q83 70 85 100 Z" fill="${haut}"/>`);
  }
  // Cou
  const couY = cy + ry - 6;
  s.push(`<path d="M${cx - 6} ${couY} L${cx - 6} ${couY + 12} Q${cx} ${couY + 16} ${cx + 6} ${couY + 12} L${cx + 6} ${couY} Z" fill="${peauOmbre}"/>`);
  if (stade !== "bebe") {
    s.push(p.genre === "F"
      ? `<path d="M${cx - 9} ${couY + 11} Q${cx} ${couY + 22} ${cx + 9} ${couY + 11}" fill="none" stroke="${assombrir(haut, 0.75)}" stroke-width="1.6"/>`
      : `<path d="M${cx - 8} ${couY + 11} L${cx} ${couY + 18} L${cx + 8} ${couY + 11}" fill="none" stroke="${assombrir(haut, 0.75)}" stroke-width="1.6"/>`);
  }

  // Oreilles et tête
  s.push(`<ellipse cx="${cx - rx}" cy="${cy + 2}" rx="3.2" ry="4.4" fill="${peauOmbre}"/>`);
  s.push(`<ellipse cx="${cx + rx}" cy="${cy + 2}" rx="3.2" ry="4.4" fill="${peauOmbre}"/>`);
  s.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${peau}"/>`);

  // Barbe (sous les traits du visage)
  if (p.barbe) {
    s.push(`<path d="M${cx - rx + 0.5} ${cy + 1} Q${cx - rx + 1} ${cy + ry + 3} ${cx} ${cy + ry + 5} Q${cx + rx - 1} ${cy + ry + 3} ${cx + rx - 0.5} ${cy + 1} Q${cx + rx - 4} ${cy + 9} ${cx} ${cy + 8} Q${cx - rx + 4} ${cy + 9} ${cx - rx + 0.5} ${cy + 1} Z" fill="${ch}"/>`);
  }

  // Yeux
  const ey = cy + 1.5, ex = stade === "bebe" ? 6.5 : 6;
  const r = stade === "bebe" || stade === "enfant" ? 2.1 : 1.8;
  for (const dx of [-ex, ex]) {
    s.push(`<ellipse cx="${cx + dx}" cy="${ey}" rx="${r + 1.3}" ry="${r + 0.8}" fill="#fff"/>`);
    s.push(`<circle cx="${cx + dx}" cy="${ey}" r="${r}" fill="${yeux}"/>`);
    s.push(`<circle cx="${cx + dx}" cy="${ey}" r="${r * 0.45}" fill="#111"/>`);
    s.push(`<circle cx="${cx + dx + 0.6}" cy="${ey - 0.7}" r="0.5" fill="#fff"/>`);
  }
  // Sourcils
  const sourcil = chauve && age >= 50 ? "#9a948e" : p.cheveux === "blanc" ? "#c9c4bd" : ch;
  if (stade !== "bebe") {
    s.push(`<path d="M${cx - ex - 3.5} ${ey - 5} Q${cx - ex} ${ey - 7} ${cx - ex + 3.5} ${ey - 5.2}" stroke="${sourcil}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);
    s.push(`<path d="M${cx + ex - 3.5} ${ey - 5.2} Q${cx + ex} ${ey - 7} ${cx + ex + 3.5} ${ey - 5}" stroke="${sourcil}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`);
  }
  // Nez et bouche
  s.push(`<path d="M${cx} ${ey + 2.5} Q${cx - 1.8} ${ey + 6.5} ${cx} ${ey + 7}" stroke="${assombrir(peau, 0.72)}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`);
  const by = ey + (stade === "bebe" ? 9.5 : 11);
  s.push(`<path d="M${cx - 4.5} ${by} Q${cx} ${by + 3.6} ${cx + 4.5} ${by}" stroke="${p.barbe ? "#3a1f17" : "#9b3b3b"}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`);
  // Joues
  if (stade === "bebe" || stade === "enfant") {
    s.push(`<circle cx="${cx - 9}" cy="${ey + 6}" r="2.6" fill="#ff8a8a" opacity=".35"/><circle cx="${cx + 9}" cy="${ey + 6}" r="2.6" fill="#ff8a8a" opacity=".35"/>`);
  }
  // Rides
  if (age >= 60) {
    const ride = assombrir(peau, 0.7);
    s.push(`<path d="M${cx - 5} ${cy - 11} Q${cx} ${cy - 12.5} ${cx + 5} ${cy - 11}" stroke="${ride}" stroke-width=".7" fill="none" opacity=".7"/>`);
    s.push(`<path d="M${cx - ex - 5.5} ${ey + 1} l-1.6 1 M${cx + ex + 5.5} ${ey + 1} l1.6 1" stroke="${ride}" stroke-width=".7" opacity=".7"/>`);
    if (age >= 80) s.push(`<path d="M${cx - 6} ${cy - 8.5} Q${cx} ${cy - 10} ${cx + 6} ${cy - 8.5}" stroke="${ride}" stroke-width=".6" fill="none" opacity=".6"/>`);
  }

  // Cheveux de devant
  const top = cy - ry;
  if (coiffure === "bebe") {
    s.push(`<path d="M${cx - 2} ${top + 1} Q${cx - 4} ${top - 6} ${cx + 2} ${top - 5} Q${cx + 5} ${top - 3} ${cx + 1} ${top - 1}" stroke="${ch}" stroke-width="2" fill="none" stroke-linecap="round"/>`);
  } else if (chauve) {
    if (age >= 40) {
      s.push(`<path d="M${cx - rx - 0.5} ${cy - 2} Q${cx - rx + 1} ${cy - 10} ${cx - rx + 4} ${cy - 9} L${cx - rx + 2} ${cy + 1} Z" fill="${ch}"/>`);
      s.push(`<path d="M${cx + rx + 0.5} ${cy - 2} Q${cx + rx - 1} ${cy - 10} ${cx + rx - 4} ${cy - 9} L${cx + rx - 2} ${cy + 1} Z" fill="${ch}"/>`);
    }
  } else if (coiffure === "herisse") {
    let d = `M${cx - rx - 1} ${cy - 3}`;
    for (let i = 0; i <= 8; i++) {
      const x = cx - rx + (i * (2 * rx)) / 8;
      const y = top - (i % 2 === 0 ? 6 : 1);
      d += ` L${x.toFixed(1)} ${y}`;
    }
    d += ` L${cx + rx + 1} ${cy - 3} Q${cx} ${top + 4} ${cx - rx - 1} ${cy - 3} Z`;
    s.push(`<path d="${d}" fill="${ch}"/>`);
  } else if (coiffure === "boucle") {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (1 + i / (n - 1));
      const x = cx + Math.cos(a) * (rx + 0.5);
      const y = cy - 3 + Math.sin(a) * (ry - 1);
      s.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${p.genre === "F" ? 5.2 : 4.6}" fill="${ch}"/>`);
    }
    s.push(`<ellipse cx="${cx}" cy="${top + 4}" rx="${rx - 2}" ry="5" fill="${ch}"/>`);
  } else {
    // court, long, carre, chignon, queue, couettes : une calotte avec une raie
    const epais = coiffure === "court" ? 3 : 6;
    s.push(`<path d="M${cx - rx - 1.5} ${cy - 1} Q${cx - rx - 2} ${top - 6} ${cx} ${top - 4} Q${cx + rx + 2} ${top - 6} ${cx + rx + 1.5} ${cy - 1} Q${cx + rx - 1} ${top + epais + 2} ${cx + 3} ${top + epais} Q${cx - rx + 2} ${top + epais + 2} ${cx - rx - 1.5} ${cy - 1} Z" fill="${ch}"/>`);
  }

  // Lunettes
  if (p.lunettes) {
    const g = "#2b2b2b";
    s.push(`<g fill="rgba(255,255,255,.18)" stroke="${g}" stroke-width="1.3">` +
      `<rect x="${cx - ex - 4.6}" y="${ey - 3.8}" width="9.2" height="7.4" rx="2.6"/>` +
      `<rect x="${cx + ex - 4.6}" y="${ey - 3.8}" width="9.2" height="7.4" rx="2.6"/></g>`);
    s.push(`<path d="M${cx - ex + 4.6} ${ey - 1} Q${cx} ${ey - 2.6} ${cx + ex - 4.6} ${ey - 1} M${cx - ex - 4.6} ${ey - 1} L${cx - rx} ${ey - 2} M${cx + ex + 4.6} ${ey - 1} L${cx + rx} ${ey - 2}" stroke="${g}" stroke-width="1.2" fill="none"/>`);
  }

  // Chapeau
  if (p.chapeau) {
    const c = assombrir(HAUTS[(p._haut + 3) % HAUTS.length], 0.8);
    if (p.id % 2 === 0) {
      // casquette
      s.push(`<path d="M${cx - rx - 2} ${top + 7} Q${cx - rx - 1} ${top - 9} ${cx} ${top - 9} Q${cx + rx + 1} ${top - 9} ${cx + rx + 2} ${top + 7} Z" fill="${c}"/>`);
      s.push(`<path d="M${cx - 4} ${top + 6} Q${cx + rx + 6} ${top + 3} ${cx + rx + 13} ${top + 9} Q${cx + rx} ${top + 10} ${cx - 4} ${top + 8} Z" fill="${assombrir(c, 0.8)}"/>`);
    } else {
      // chapeau à bord
      s.push(`<ellipse cx="${cx}" cy="${top + 4}" rx="${rx + 10}" ry="4.2" fill="${assombrir(c, 0.85)}"/>`);
      s.push(`<path d="M${cx - rx + 2} ${top + 4} L${cx - rx + 4} ${top - 10} Q${cx} ${top - 14} ${cx + rx - 4} ${top - 10} L${cx + rx - 2} ${top + 4} Z" fill="${c}"/>`);
      s.push(`<rect x="${cx - rx + 2.6}" y="${top - 1}" width="${2 * rx - 5.2}" height="3" fill="${assombrir(c, 0.55)}"/>`);
    }
  }

  const titre = `${p.prenom} ${p.nom}`.replace(/[<&"]/g, "");
  return `<svg viewBox="6 10 88 90" preserveAspectRatio="xMidYMid slice" width="${taille}" height="${taille}" role="img" aria-label="${titre}" xmlns="http://www.w3.org/2000/svg">${s.join("")}</svg>`;
}
