// Point d'entrée : onglet Jeu, synchronisation avec la classe, popins.
import * as M from "./moteur.js";
import { avatarSVG } from "./avatar.js";
import { empreintes } from "./empreinte.js";
import { creerBackend } from "./backend.js";
import { rendreMemo } from "./memo.js";
import { initProf } from "./prof.js";
import { esc, formatDuree } from "./util.js";

const $ = (s) => document.querySelector(s);
const REQUETE_DEFAUT = "SELECT * FROM personnes;";

const ctx = {
  backend: null,
  etat: { mode: "libre" },
  evaluation: null,
  presents: [],
  ecouteurs: [], // fonctions appelées à chaque changement d'état
};

// ---------- Petits utilitaires de stockage (protégés contre les navigateurs restrictifs) ----------
function lire(cle, defaut = null) {
  try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); } catch { return defaut; }
}
function ecrire(cle, v) { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* rien */ } }

// ---------- Élève ----------
function eleve() { return lire("eleve", null); }
function demanderNom(force = false) {
  return new Promise((ok) => {
    const e = eleve();
    if (e && !force) return ok(e);
    const d = $("#popin-nom");
    $("#champ-nom").value = e?.nom || "";
    $("#btn-oublier").hidden = !e;
    d.showModal();
    d.onclose = () => {
      const nom = $("#champ-nom").value.trim().replace(/\s+/g, " ").slice(0, 40);
      if (!nom) { if (!eleve()) setTimeout(() => d.showModal(), 50); return; }
      const nouvel = { id: e?.id || crypto.randomUUID(), nom };
      ecrire("eleve", nouvel);
      afficherEleve();
      ctx.backend.rejoindre(nouvel);
      ok(nouvel);
    };
  });
}
// Oublie le nom d'élève enregistré dans ce navigateur (ex. après un test)
function oublierEleve() {
  try { localStorage.removeItem("eleve"); } catch { /* rien */ }
  ctx.backend.quitter();
  afficherEleve();
}

// Un poste connecté en prof n'apparaît jamais comme élève dans la classe.
function majIdentite() {
  if (ctx.backend.estProf()) ctx.backend.quitter();
  else if (eleve()) ctx.backend.rejoindre(eleve());
  afficherEleve();
}

function afficherEleve() {
  const e = eleve();
  const b = $("#btn-eleve");
  const visible = e && ctx.backend.type !== "aucun" && !ctx.backend.estProf();
  b.hidden = !visible;
  if (visible) b.textContent = "👤 " + e.nom;
}

// ---------- Onglets ----------
function ouvrirOnglet(nom) {
  document.querySelectorAll(".onglets button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.onglet === nom)));
  document.querySelectorAll(".onglet").forEach((m) => { m.hidden = m.id !== "onglet-" + nom; });
  ctx.ongletActif = nom;
  ctx.ecouteurs.forEach((f) => f(ctx.etat, "onglet"));
  try { sessionStorage.setItem("onglet", nom); } catch { /* rien */ }
}

// ---------- Structure de la table + insertion au curseur ----------
let curseur = null; // {debut, fin} ou null si inconnu
function memoriserCurseur() {
  const t = $("#requete");
  curseur = { debut: t.selectionStart, fin: t.selectionEnd };
}
function insererDansRequete(texte) {
  const t = $("#requete");
  const v = t.value;
  let debut, fin;
  if (curseur) ({ debut, fin } = curseur);
  else {
    // Position inconnue : à la fin (avant le ; final s'il y en a un)
    const m = v.match(/;\s*$/);
    debut = fin = m ? m.index : v.length;
  }
  const avant = v.slice(0, debut), apres = v.slice(fin);
  const espaceAvant = avant && !/[\s(,.]$/.test(avant) ? " " : "";
  const espaceApres = apres && !/^[\s),;]/.test(apres) ? " " : "";
  t.value = avant + espaceAvant + texte + espaceApres + apres;
  const pos = (avant + espaceAvant + texte).length;
  t.focus();
  t.setSelectionRange(pos, pos);
  memoriserCurseur();
}
function construireStructure() {
  $("#colonnes").innerHTML = M.COLONNES.map((c) => `
    <button class="colonne" data-col="${c.nom}" title="Insérer ${c.nom} dans la requête">
      <b>${c.nom}</b>
      <span class="type">${c.type}${c.nul ? " <em>NULL possible</em>" : " NOT NULL"}</span>
      <small>${esc(c.info)}</small>
    </button>`).join("");
  $("#colonnes").addEventListener("mousedown", (e) => { if (e.target.closest(".colonne")) e.preventDefault(); });
  $("#colonnes").addEventListener("click", (e) => {
    const b = e.target.closest(".colonne");
    if (b) insererDansRequete(b.dataset.col);
  });
  $("#btn-structure").addEventListener("click", () => {
    const s = $("#structure");
    s.hidden = !s.hidden;
    $("#btn-structure").setAttribute("aria-expanded", String(!s.hidden));
    try { localStorage.setItem("structure", s.hidden ? "0" : "1"); } catch { /* rien */ }
  });
  try {
    if (localStorage.getItem("structure") === "1") $("#btn-structure").click();
  } catch { /* rien */ }
}

// ---------- Affichage des résultats ----------
let vue = lire("vue", "grille");
let dernierResultat = null;

function formatValeur(col, v) {
  if (v === null || v === undefined) return '<span class="null">NULL</span>';
  if (typeof v === "number") {
    if (col.toLowerCase() === "taille" && v < 10) return v.toFixed(2);
    if (!Number.isInteger(v)) return String(Math.round(v * 10000) / 10000);
  }
  return esc(v);
}

function afficherResultat(res) {
  dernierResultat = res;
  const zone = $("#resultat");
  const ids = M.idsDuResultat(res);
  const n = res.lignes.length;
  if (!n) {
    $("#compteur").textContent = "Aucun résultat";
    zone.innerHTML = '<div class="vide">Empty set — la requête ne renvoie aucune ligne.</div>';
    return;
  }
  if (ids) {
    $("#compteur").textContent = `${n} personne${n > 1 ? "s" : ""}`;
    if (vue === "grille") {
      zone.innerHTML = `<div class="grille">${ids.map((id) => {
        const p = M.personne(id);
        return `<button class="tuile" data-id="${id}">${avatarSVG(p)}<span class="nom">${esc(p.prenom)}<small>${esc(p.nom)}</small></span></button>`;
      }).join("")}</div>`;
    } else {
      zone.innerHTML = tableau(res, ids);
    }
  } else {
    $("#compteur").textContent = `${n} ligne${n > 1 ? "s" : ""}`;
    zone.innerHTML = tableau(res, null);
  }
  if (res.tronque) zone.insertAdjacentHTML("beforeend", `<p class="note">Affichage limité aux ${M.MAX_LIGNES} premières lignes.</p>`);
}

function tableau(res, ids) {
  const entetes = (ids ? "<th></th>" : "") + res.colonnes.map((c) => `<th>${esc(c)}</th>`).join("");
  const lignes = res.lignes.map((l, i) => {
    const cellules = l.map((v, k) => `<td class="${typeof v === "number" ? "num" : ""}">${formatValeur(res.colonnes[k], v)}</td>`).join("");
    if (!ids) return `<tr>${cellules}</tr>`;
    const p = M.personne(ids[i]);
    return `<tr class="cliquable" data-id="${ids[i]}"><td><span class="mini">${avatarSVG(p)}</span></td>${cellules}</tr>`;
  }).join("");
  return `<div class="tableau-conteneur"><table class="tableau${ids ? " avec-buste" : ""}"><thead><tr>${entetes}</tr></thead><tbody>${lignes}</tbody></table></div>`;
}

function changerVue(v) {
  vue = v;
  ecrire("vue", v);
  $("#vue-grille").classList.toggle("actif", v === "grille");
  $("#vue-liste").classList.toggle("actif", v === "liste");
  $("#vue-grille").setAttribute("aria-pressed", String(v === "grille"));
  $("#vue-liste").setAttribute("aria-pressed", String(v === "liste"));
  if (dernierResultat) afficherResultat(dernierResultat);
}

function ouvrirFiche(id) {
  const p = M.personne(id);
  if (!p) return;
  const bool = (v) => (v === null ? '<span class="null">NULL</span>' : v ? "1 <small>(TRUE)</small>" : "0 <small>(FALSE)</small>");
  const lignes = M.COLONNES.map((c) => {
    const v = p[c.nom];
    const aff = c.type === "BOOLEAN" ? bool(v) : formatValeur(c.nom, v);
    return `<dt>${c.nom}</dt><dd>${aff}</dd>`;
  }).join("");
  $("#popin-contenu").innerHTML = `
    <div class="fiche">
      <div class="fiche-portrait">${avatarSVG(p)}</div>
      <div class="fiche-infos">
        <h3>${esc(p.prenom)} ${esc(p.nom)}</h3>
        <p class="sous-titre">${p.age === 0 ? "moins d'un an" : p.age + " an" + (p.age > 1 ? "s" : "")} · ${esc(p.ville)}</p>
        <dl>${lignes}</dl>
      </div>
    </div>`;
  $("#popin").showModal();
}

// ---------- Exécution d'une requête ----------
function afficherMessage(type, html) {
  const m = $("#message");
  m.className = "message " + (type || "");
  m.innerHTML = html || "";
}

function executerRequete({ evaluer = true } = {}) {
  const sql = $("#requete").value;
  const t0 = performance.now();
  let res = null, erreur = null;
  try {
    res = M.executer(sql);
  } catch (e) {
    erreur = e;
  }
  const duree = ((performance.now() - t0) / 1000).toFixed(3);
  if (erreur) {
    afficherMessage("erreur", `${esc(erreur.message)}${erreur.code ? `<span class="code-erreur">ERROR ${erreur.code} (MariaDB)</span>` : ""}`);
  } else {
    const n = res.lignes.length;
    afficherMessage("info", n ? `${n} row${n > 1 ? "s" : ""} in set (${duree} sec)` : `Empty set (${duree} sec)`);
    afficherResultat(res);
  }
  if (evaluer) verifierReponse(sql, res, erreur);
}

// ---------- Évaluation ----------
const cleSuivi = (run, idx) => `suivi:${run}:${idx}`;
function suivi(run, idx) { return lire(cleSuivi(run, idx), null); }
function majSuivi(run, idx, patch) {
  const s = { ...(suivi(run, idx) || {}), ...patch };
  ecrire(cleSuivi(run, idx), s);
  return s;
}

// Question en cours (seulement les colonnes publiques : pas de solution côté élève)
function questionCourante() {
  const e = ctx.etat, q = ctx.question;
  if (e.mode !== "evaluation" || !q || q.run_id !== e.run_id || q.idx !== e.question_index) return null;
  return { ...q, index: q.idx, total: ctx.evaluation?.nb_questions ?? "?" };
}

function tempsRestant() {
  const q = questionCourante();
  if (!q || !ctx.etat.question_debut) return null;
  return q.duree * 1000 - (ctx.backend.maintenant() - ctx.etat.question_debut);
}

let envoiEnCours = false;
async function verifierReponse(sql, res, erreur) {
  const q = questionCourante();
  if (!q) return;
  const run = ctx.etat.run_id;
  const s = suivi(run, q.index) || {};
  const retour = $("#q-retour");
  if (s.trouve) return;
  if (tempsRestant() <= 0) { retour.className = "retour ko"; retour.textContent = "⏱ Temps écoulé pour cette question."; return; }
  const moi = ctx.backend.estProf() ? null : eleve();
  if (!moi) {
    retour.className = "retour";
    retour.textContent = ctx.backend.estProf() ? "(Vue prof : tes requêtes ne sont pas enregistrées.)" : "Donne ton prénom pour participer.";
    if (!ctx.backend.estProf()) demanderNom();
    return;
  }
  if (envoiEnCours) return;

  let message = erreur ? String(erreur.message) : null;
  let emp = null;
  if (!erreur) {
    emp = await empreintes(res, q.verif, q.tri, run);
    if (!emp) message = "Ta requête doit renvoyer la colonne id pour qu'on voie les personnes.";
  }
  const maintenant = Date.now();
  const affichee = s.affichee || maintenant;
  envoiEnCours = true;
  $("#btn-ok").disabled = true;
  retour.className = "retour";
  retour.textContent = "Vérification…";
  let r;
  try {
    r = await ctx.backend.soumettre({
      run_id: run, question_index: q.index, eleve_id: moi.id, eleve_nom: moi.nom,
      requete: sql.slice(0, 4000), erreur: message ? message.slice(0, 500) : null,
      empreinte: emp?.empreinte ?? null, empreinte_ens: emp?.empreinte_ens ?? null,
      nb_lignes: res ? res.lignes.length : null, nb_colonnes: res ? res.colonnes.length : null,
      affichee_le: new Date(affichee).toISOString(), repondu_le: new Date(maintenant).toISOString(),
    });
  } catch (e) {
    console.warn(e);
    retour.className = "retour ko";
    retour.textContent = "⚠ Réponse non envoyée (problème de réseau). Réessaie.";
    return;
  } finally {
    envoiEnCours = false;
    $("#btn-ok").disabled = false;
  }
  if (r?.erreur === "fermee") { retour.className = "retour ko"; retour.textContent = "⏱ Cette question est terminée."; return; }
  if (r?.erreur === "deja") { majSuivi(run, q.index, { trouve: true }); afficherQuestion(); return; }
  if (r?.erreur) { retour.className = "retour ko"; retour.textContent = "Trop d'essais pour cette question."; return; }

  const duree = maintenant - affichee;
  majSuivi(run, q.index, { tentatives: r.tentative, derniere: sql, trouve: r.correct, duree_ms: r.correct ? duree : null });
  if (r.correct) {
    retour.className = "retour ok";
    retour.textContent = `✔ Bravo ! Trouvé en ${formatDuree(duree)} (${r.tentative} essai${r.tentative > 1 ? "s" : ""}). Attends la question suivante…`;
  } else {
    retour.className = "retour ko";
    const pourquoi = erreur ? "Ta requête contient une erreur (voir le message sous la requête)." : message || r.indice;
    retour.textContent = `✘ ${pourquoi} (essai n° ${r.tentative})`;
  }
}

let questionAffichee = null;
let avancementDemande = null;

function rafraichirChrono() {
  const q = questionCourante();
  const c = $("#q-chrono");
  if (!q) return;
  const reste = tempsRestant();
  if (reste === null) { c.textContent = ""; return; }
  const sec = Math.max(0, Math.ceil(reste / 1000));
  c.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  c.classList.toggle("urgent", sec <= 10 && sec > 0);
  if (reste <= 0) {
    const s = suivi(ctx.etat.run_id, q.index);
    if (!s?.trouve) {
      const r = $("#q-retour");
      r.className = "retour ko";
      r.textContent = "⏱ Temps écoulé ! Question suivante dans un instant…";
    }
    // N'importe quel poste peut demander le passage à la question suivante :
    // le serveur vérifie que le temps est vraiment écoulé.
    const cle = `${ctx.etat.run_id}:${q.index}`;
    if (!avancementDemande || avancementDemande.cle !== cle || Date.now() - avancementDemande.t > 5000) {
      avancementDemande = { cle, t: Date.now() };
      setTimeout(() => ctx.backend.avancer(ctx.etat.run_id, q.index).catch(() => {}), Math.random() * 1500);
    }
  }
}

function afficherQuestion() {
  const q = questionCourante();
  const run = ctx.etat.run_id;
  const cle = q ? `${run}:${q.index}` : null;
  $("#bandeau-question").hidden = !q;
  if (!q) { questionAffichee = null; return; }
  // Heure d'affichage de la question sur ce poste (gardée même si on recharge la page)
  const s = suivi(run, q.index) || majSuivi(run, q.index, { affichee: Date.now(), tentatives: 0 });
  $("#q-numero").textContent = `Question ${q.index + 1} / ${q.total}`;
  $("#q-notion").textContent = q.notion;
  $("#q-consigne").textContent = q.consigne;
  const r = $("#q-retour");
  if (s.trouve) {
    r.className = "retour ok";
    r.textContent = `✔ Bravo ! Trouvé${s.duree_ms != null ? " en " + formatDuree(s.duree_ms) : ""}. Attends la question suivante…`;
  } else if (cle !== questionAffichee) {
    r.className = "retour";
    r.textContent = ctx.backend.estProf() && !eleve() ? "(Vue prof : tes requêtes ne sont pas enregistrées.)" : "";
  }
  if (cle !== questionAffichee) {
    questionAffichee = cle;
    // Prompt vide à chaque question (sinon la 1re réponse serait déjà écrite) ;
    // on montre quand même toutes les personnes.
    $("#requete").value = "";
    curseur = null;
    afficherResultat(M.executer(REQUETE_DEFAUT));
    afficherMessage("info", "Écris ta requête, puis clique sur OK.");
    $("#requete").focus();
  }
  rafraichirChrono();
}

function afficherFin() {
  const visible = ctx.etat.mode === "fin";
  $("#bandeau-fin").hidden = !visible;
  if (!visible || !ctx.evaluation) return;
  const n = ctx.evaluation.nb_questions;
  let trouvees = 0;
  for (let i = 0; i < n; i++) if (suivi(ctx.etat.run_id, i)?.trouve) trouvees++;
  $("#fin-bilan").textContent = eleve() ? `Tu as trouvé ${trouvees} question${trouvees > 1 ? "s" : ""} sur ${n}.` : "";
}

let correctionAffichee = null;
function afficherCorrection() {
  const e = ctx.etat, c = ctx.correction;
  const visible = e.mode === "correction" && c && c.run_id === e.run_id && c.idx === e.correction_index;
  $("#bandeau-correction").hidden = !visible;
  if (!visible) { if (e.mode !== "correction") correctionAffichee = null; return; }
  const s = suivi(e.run_id, e.correction_index);
  $("#c-numero").textContent = `Question ${e.correction_index + 1} / ${ctx.evaluation?.nb_questions ?? "?"}`;
  $("#c-notion").textContent = c.notion;
  $("#c-consigne").textContent = c.consigne;
  $("#c-solution").textContent = c.solution || "(solution indisponible)";
  $("#c-mienne").textContent = s?.derniere ? s.derniere + (s.trouve ? `\n-- ✔ trouvé${s.duree_ms != null ? " en " + formatDuree(s.duree_ms) : ""}` : "\n-- ✘ pas trouvé") : "(aucune requête envoyée)";
  $("#c-essayer-mienne").hidden = !s?.derniere;
  $("#c-explication").textContent = c.explication ? "💡 " + c.explication : "";
  $("#c-explication").hidden = !c.explication;
  const cle = `${e.run_id}:${e.correction_index}`;
  if (cle !== correctionAffichee && c.solution) {
    correctionAffichee = cle;
    $("#requete").value = c.solution;
    curseur = null;
    executerRequete({ evaluer: false });
  }
}

function afficherBadge() {
  const b = $("#badge-mode");
  const e = ctx.etat;
  b.className = "badge " + e.mode;
  b.textContent = {
    libre: ctx.backend.type === "local" ? "Mode libre (démo)" : "Mode libre",
    evaluation: "Évaluation en cours",
    fin: "Évaluation terminée",
    correction: "Correction",
  }[e.mode] || e.mode;
}

async function appliquerEtat(e) {
  const ancien = ctx.etat;
  ctx.etat = e;
  if (e.run_id && (!ctx.evaluation || ctx.evaluation.id !== e.run_id)) {
    try { ctx.evaluation = await ctx.backend.getEvaluation(e.run_id); } catch { ctx.evaluation = null; }
  }
  if (!e.run_id) ctx.evaluation = null;
  try {
    if (e.mode === "evaluation" && e.run_id) {
      const q = await ctx.backend.question(e.run_id, e.question_index);
      if (q) ctx.question = q;
    }
    if (e.mode === "correction" && e.run_id) {
      const q = await ctx.backend.question(e.run_id, e.correction_index);
      const c = await ctx.backend.correction(e.run_id, e.correction_index);
      if (q) ctx.correction = { ...q, ...(c || {}) };
    }
  } catch (err) { console.warn(err); }
  if (ctx.etat !== e) return; // un état plus récent est arrivé pendant le chargement
  afficherBadge();
  if (e.mode === "evaluation" && !eleve() && !ctx.backend.estProf()) demanderNom();
  if (e.mode === "evaluation" && ancien.mode !== "evaluation" && ctx.ongletActif !== "prof") ouvrirOnglet("jeu");
  afficherQuestion();
  afficherFin();
  afficherCorrection();
  if (e.mode === "libre" && ancien.mode && ancien.mode !== "libre") {
    $("#q-retour").textContent = "";
  }
  ctx.ecouteurs.forEach((f) => f(e, "etat"));
}

// ---------- Démarrage ----------
async function demarrer() {
  afficherMessage("info", "Chargement de la base de données…");
  try {
    await M.initialiser();
  } catch (e) {
    afficherMessage("erreur", "Impossible de charger le moteur SQL : " + esc(e.message || e));
    return;
  }
  construireStructure();
  changerVue(vue);

  const t = $("#requete");
  ["keyup", "click", "select", "input"].forEach((ev) => t.addEventListener(ev, memoriserCurseur));
  t.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); executerRequete(); }
  });
  $("#btn-ok").addEventListener("click", () => executerRequete());
  $("#btn-reinit").addEventListener("click", () => {
    curseur = null;
    // Pendant une évaluation, on vide simplement le prompt (pas de requête toute faite)
    if (ctx.etat.mode === "evaluation") { t.value = ""; t.focus(); return; }
    t.value = REQUETE_DEFAUT;
    executerRequete({ evaluer: false });
  });
  $("#vue-grille").addEventListener("click", () => changerVue("grille"));
  $("#vue-liste").addEventListener("click", () => changerVue("liste"));
  $("#resultat").addEventListener("click", (e) => {
    const el = e.target.closest("[data-id]");
    if (el) ouvrirFiche(el.dataset.id);
  });
  $("#popin").addEventListener("click", (e) => {
    if (e.target.matches("[data-fermer]") || e.target === $("#popin")) $("#popin").close();
  });
  $("#c-essayer-solution").addEventListener("click", () => { t.value = $("#c-solution").textContent; executerRequete({ evaluer: false }); });
  $("#c-essayer-mienne").addEventListener("click", () => {
    const s = suivi(ctx.etat.run_id, ctx.etat.correction_index);
    if (s?.derniere) { t.value = s.derniere; executerRequete({ evaluer: false }); }
  });
  document.querySelectorAll(".onglets button").forEach((b) => b.addEventListener("click", () => ouvrirOnglet(b.dataset.onglet)));
  $("#btn-eleve").addEventListener("click", () => demanderNom(true));
  $("#btn-oublier").addEventListener("click", () => {
    $("#popin-nom").onclose = null;
    $("#popin-nom").close();
    oublierEleve();
  });

  executerRequete({ evaluer: false });

  ctx.backend = await creerBackend();
  ctx.essayer = (sql) => { ouvrirOnglet("jeu"); t.value = sql; curseur = null; executerRequete({ evaluer: false }); };
  rendreMemo($("#onglet-memo"), ctx);
  initProf($("#onglet-prof"), ctx);
  afficherEleve();
  ctx.majIdentite = majIdentite;
  majIdentite();
  ctx.backend.onPresence((l) => { ctx.presents = l; ctx.ecouteurs.forEach((f) => f(ctx.etat, "presence")); });
  ctx.backend.onEtat((e) => appliquerEtat(e));
  try { await appliquerEtat(await ctx.backend.getEtat()); } catch (e) { console.error(e); }
  if (ctx.backend.erreur) afficherMessage("erreur", esc(ctx.backend.erreur));

  let onglet = "jeu";
  try { onglet = sessionStorage.getItem("onglet") || "jeu"; } catch { /* rien */ }
  ouvrirOnglet(onglet);
  setInterval(() => { rafraichirChrono(); ctx.ecouteurs.forEach((f) => f(ctx.etat, "tic")); }, 250);
}

demarrer();
