// Empreinte (hash SHA-256) d'un résultat de requête.
// Le prof calcule l'empreinte du résultat attendu au lancement de l'évaluation ;
// l'élève envoie l'empreinte de son propre résultat, et le serveur compare.
// La solution elle-même n'est donc jamais envoyée aux élèves.
import { colonneId, personne } from "./moteur.js";

function normaliser(v) {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "number") return "n:" + String(Math.round(v * 100) / 100);
  const s = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return "n:" + String(Math.round(Number(s) * 100) / 100);
  return "s:" + s;
}

// Forme canonique du résultat, selon la façon de vérifier la question.
//   verif "ids"     : seules comptent les personnes (colonne id) ;
//   verif "valeurs" : comptent les valeurs (l'ordre des colonnes ne compte pas).
//   tri "non" : l'ordre des lignes ne compte pas ; "oui" : il compte ;
//   tri = nom de colonne : l'ordre compte, mais les ex æquo sur cette colonne sont libres.
export function canonique(res, verif, tri) {
  if (verif === "ids") {
    const k = colonneId(res);
    if (k < 0) return null;
    const ids = res.lignes.map((l) => Number(l[k]));
    const ens = [...ids].sort((a, b) => a - b).join(",");
    let ordonne = ens;
    if (tri === "oui") ordonne = ids.join(",");
    else if (tri && tri !== "non") ordonne = ids.map((id) => normaliser(personne(id)?.[tri])).join(",") + "|" + ens;
    return { ordonne: "ids:" + ordonne, ens: "ids:" + ens };
  }
  const lignes = res.lignes.map((l) => l.map(normaliser).sort().join("¦"));
  const ens = [...lignes].sort().join("\n");
  return { ordonne: "val:" + (tri === "non" ? ens : lignes.join("\n")), ens: "val:" + ens };
}

async function sha256(texte) {
  const octets = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte));
  return [...new Uint8Array(octets)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Le sel (l'identifiant de l'évaluation) rend les empreintes différentes à chaque séance.
export async function empreintes(res, verif, tri, sel) {
  const c = canonique(res, verif, tri);
  if (!c) return null;
  return {
    empreinte: await sha256(sel + "#" + c.ordonne),
    empreinte_ens: await sha256(sel + "#" + c.ens),
    nb_lignes: res.lignes.length,
    nb_colonnes: res.colonnes.length,
  };
}
