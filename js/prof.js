// Onglet « Prof » : connexion, lancement de l'évaluation, suivi en direct,
// correction et résultats (temps de réponse de chaque élève).
import * as M from "./moteur.js";
import { empreintes } from "./empreinte.js";
import { esc, formatDuree, retrouverEleve, analyserListe } from "./util.js";

let C;            // conteneur
let ctx;          // contexte partagé avec app.js
let modeAffiche = null;
let reponsesCache = { run: null, liste: [], t: 0 };
let chargement = null;
let runResultats = null; // évaluation affichée dans « Résultats »
let banque = [];          // banque de questions du prof
let classe = [];          // liste des élèves (Supabase, prof uniquement)
const identifies = new Map(); // nom saisi → élève de la liste (ou null)

function identifier(nomSaisi) {
  if (!identifies.has(nomSaisi)) identifies.set(nomSaisi, retrouverEleve(classe, nomSaisi));
  return identifies.get(nomSaisi);
}
const nomOfficiel = (e) => `${e.prenom} ${e.nom}`;

async function chargerClasse() {
  try { classe = await ctx.backend.classe(); } catch (e) { console.warn(e); classe = []; }
  identifies.clear();
}
const questionsParRun = new Map(); // run → questions complètes (avec solutions)

async function questionsDe(run) {
  if (!run) return [];
  if (!questionsParRun.has(run)) {
    try { questionsParRun.set(run, await ctx.backend.questionsEvaluation(run)); } catch (e) { console.warn(e); return []; }
  }
  return questionsParRun.get(run);
}

export function initProf(conteneur, contexte) {
  C = conteneur;
  ctx = contexte;
  rendre();
  ctx.ecouteurs.push((etat, raison) => {
    if (!ctx.backend.estProf()) return;
    if (raison === "etat") {
      if (etat.mode !== modeAffiche) { rendreSeance(); rendreResultats(); }
      else majSeance();
      rafraichirReponses(true);
    } else if (raison === "presence") {
      rendreDirect();
    } else if (raison === "tic") {
      majChrono();
      if (ctx.ongletActif === "prof" && ["evaluation", "correction", "fin"].includes(etat.mode)) rafraichirReponses(false);
    } else if (raison === "onglet" && ctx.ongletActif === "prof") {
      rafraichirReponses(true);
    }
  });
}

const $ = (s) => C.querySelector(s);

function rendre() {
  const b = ctx.backend;
  if (b.type === "aucun") {
    C.innerHTML = `
      <div class="carte">
        <h2>Configurer l'évaluation en classe</h2>
        ${b.erreur ? `<p class="alerte">${esc(b.erreur)}</p>` : ""}
        <p>Le jeu fonctionne déjà en <b>mode libre</b>. Pour lancer une évaluation sur tous les postes, il faut relier le site à Supabase :</p>
        <ol class="etapes">
          <li>Dans Supabase, exécute le script <code>supabase/schema.sql</code> (SQL Editor).</li>
          <li>Recopie la <b>Project URL</b> et la clé <b>anon / publishable</b> dans <code>js/config.js</code>.</li>
          <li>Crée ton compte prof dans Authentication → Users, et désactive les inscriptions.</li>
        </ol>
        <p>Pour essayer sans Supabase : <a href="?demo=1">ouvre le mode démo</a> dans deux onglets (un « prof », un « élève »). Mot de passe prof : <code>demo</code>.</p>
      </div>`;
    return;
  }
  if (!b.estProf()) {
    C.innerHTML = `
      <div class="carte">
        <h2>Espace prof</h2>
        ${b.type === "local" ? '<p class="alerte">Mode démo : le mot de passe est <code>demo</code>.</p>' : ""}
        <form class="form-connexion" id="form-connexion">
          <label>E-mail<br><input type="email" id="p-email" autocomplete="username" ${b.type === "local" ? 'value="prof@demo"' : "required"}></label>
          <label>Mot de passe<br><input type="password" id="p-mdp" autocomplete="current-password" required></label>
          <button class="btn btn-principal" type="submit">Se connecter</button>
          <p id="p-erreur" class="retour ko"></p>
        </form>
        <p class="note">Les élèves n'ont pas besoin de compte : ils donnent juste leur prénom au début de l'évaluation.</p>
      </div>`;
    $("#form-connexion").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await b.connexion($("#p-email").value, $("#p-mdp").value);
        ctx.majIdentite?.();
        rendre();
      } catch (err) {
        $("#p-erreur").textContent = err.message;
      }
    });
    return;
  }
  C.innerHTML = `
    <div class="carte" id="p-seance"></div>
    <div class="carte" id="p-direct"></div>
    <div class="carte" id="p-resultats"></div>
    <div class="carte" id="p-banque"></div>
    <p class="note">Connecté en tant que prof${b.type === "local" ? " (démo)" : ""}. <button class="btn-lien" id="p-deconnexion">Se déconnecter</button></p>`;
  $("#p-deconnexion").addEventListener("click", async () => { await b.deconnexion(); modeAffiche = null; ctx.majIdentite?.(); rendre(); });
  rendreSeance();
  chargerClasse().then(() => { rendreDirect(); rendreTableau(); });
  rendreResultats();
  rendreBanque();
}

// ---------------------------------------------------------------------------
// Séance : préparation / pilotage / correction
// ---------------------------------------------------------------------------

async function rendreSeance() {
  const zone = $("#p-seance");
  if (!zone) return;
  const e = ctx.etat;
  modeAffiche = e.mode;
  if (e.mode === "libre") banque = await chargerBanque();
  else await questionsDe(e.run_id);
  if (ctx.etat !== e) return;
  if (e.mode === "libre") zone.innerHTML = htmlPreparation();
  else if (e.mode === "evaluation") zone.innerHTML = htmlEvaluation();
  else if (e.mode === "fin") zone.innerHTML = htmlFin();
  else if (e.mode === "correction") zone.innerHTML = htmlCorrection();
  brancherSeance(zone);
  majSeance();
}

async function chargerBanque() {
  try { return await ctx.backend.banque(); } catch (e) { console.warn(e); return []; }
}

function htmlPreparation() {
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  if (!banque.length) {
    return `<h2>Préparer une évaluation</h2>
      <p class="alerte">La banque de questions est vide. Ajoute des questions plus bas (« Banque de questions »).</p>`;
  }
  return `
    <h2>Préparer une évaluation</h2>
    <div class="ligne">
      <label>Titre <input type="text" id="p-titre" value="Évaluation du ${esc(date)}" size="28"></label>
      <label>Durée pour toutes <input type="number" id="p-duree-tous" min="10" max="1800" step="10" placeholder="s"></label>
      <button class="btn" id="p-appliquer-duree">Appliquer</button>
      <button class="btn btn-discret" id="p-tout">Tout cocher / décocher</button>
    </div>
    <div class="liste-questions">
      ${banque.map((q) => `
        <label>
          <input type="checkbox" data-q="${q.id}" checked>
          <span class="notion">${esc(q.notion)}</span>
          <span>${esc(q.consigne)}</span>
          <span><input type="number" data-duree="${q.id}" value="${q.duree}" min="10" max="1800" step="10"> s</span>
        </label>`).join("")}
    </div>
    <div class="ligne">
      <button class="btn btn-principal" id="p-lancer">▶ Lancer l'évaluation sur tous les postes</button>
      <span class="note" id="p-total"></span>
    </div>`;
}

function questionEval(index) {
  return (questionsParRun.get(ctx.etat.run_id) || []).find((q) => q.idx === index) || null;
}

function htmlEvaluation() {
  return `
    <h2>Évaluation en cours <small class="note" id="p-titre-eval"></small></h2>
    <div class="ligne">
      <span class="q-numero" id="p-num"></span>
      <span class="q-notion" id="p-notion"></span>
      <span class="chrono" id="p-chrono"></span>
    </div>
    <p class="consigne" id="p-consigne"></p>
    <pre class="code" id="p-solution"></pre>
    <div class="ligne" style="margin-top:10px">
      <button class="btn" id="p-plus30">+30 s</button>
      <button class="btn" id="p-suivante">Question suivante ⏭</button>
      <button class="btn btn-danger" id="p-stop">Terminer l'évaluation</button>
    </div>
    <p class="note">Les questions s'enchaînent toutes seules à la fin du chrono, même si tu fermes cette page.</p>`;
}

function htmlFin() {
  return `
    <h2>Évaluation terminée <small class="note" id="p-titre-eval"></small></h2>
    <div class="ligne">
      <button class="btn btn-principal" id="p-corriger">Passer en mode correction</button>
      <button class="btn" id="p-libre">Revenir au mode libre</button>
    </div>`;
}

function htmlCorrection() {
  return `
    <h2>Correction <small class="note" id="p-titre-eval"></small></h2>
    <div class="ligne">
      <button class="btn" id="p-prec">◀ Précédente</button>
      <span class="q-numero" id="p-num"></span>
      <button class="btn" id="p-suiv">Suivante ▶</button>
      <span class="q-notion" id="p-notion"></span>
      <button class="btn" id="p-libre" style="margin-left:auto">Terminer la correction</button>
    </div>
    <p class="consigne" id="p-consigne"></p>
    <pre class="code" id="p-solution"></pre>
    <div id="p-stats" style="margin-top:12px"></div>
    <p class="note">Les élèves voient la même question, la solution, son résultat et leur propre requête.</p>`;
}

function brancherSeance(zone) {
  const b = ctx.backend;
  const on = (id, f) => zone.querySelector(id)?.addEventListener("click", async () => {
    try { await f(); } catch (err) { alert("Erreur : " + (err.message || err)); }
  });

  // Préparation
  const majTotal = () => {
    const t = $("#p-total");
    if (!t) return;
    const choisies = zone.querySelectorAll("input[data-q]:checked");
    let s = 0;
    choisies.forEach((c) => { s += Number(zone.querySelector(`[data-duree="${c.dataset.q}"]`).value) || 0; });
    t.textContent = `${choisies.length} question(s) · environ ${Math.round(s / 60)} min`;
  };
  zone.querySelectorAll("input").forEach((i) => i.addEventListener("input", majTotal));
  majTotal();
  on("#p-tout", () => {
    const cases = [...zone.querySelectorAll("input[data-q]")];
    const tout = cases.every((c) => c.checked);
    cases.forEach((c) => { c.checked = !tout; });
    majTotal();
  });
  on("#p-appliquer-duree", () => {
    const v = Number($("#p-duree-tous").value);
    if (v >= 10) zone.querySelectorAll("input[data-duree]").forEach((i) => { i.value = v; });
    majTotal();
  });
  on("#p-lancer", async () => {
    const choisies = [...zone.querySelectorAll("input[data-q]:checked")].map((c) => ({
      ...banque.find((q) => q.id === c.dataset.q),
      duree: Math.max(10, Number(zone.querySelector(`[data-duree="${c.dataset.q}"]`).value) || 120),
    }));
    if (!choisies.length) return alert("Coche au moins une question.");
    if (!confirm(`Lancer l'évaluation (${choisies.length} questions) sur tous les postes connectés ?`)) return;
    // Empreinte du résultat attendu de chaque question : la solution ne quitte pas ce poste.
    const id = crypto.randomUUID();
    const questions = [];
    for (const q of choisies) {
      let res;
      try { res = M.executer(q.solution); } catch (err) { return alert(`La solution de « ${q.consigne} » ne fonctionne pas : ${err.message}`); }
      const emp = await empreintes(res, q.verif, q.tri, id);
      if (!emp) return alert(`La solution de « ${q.consigne} » doit renvoyer la colonne id (vérification « personnes »).`);
      questions.push({
        notion: q.notion, consigne: q.consigne, verif: q.verif, tri: q.tri, duree: q.duree,
        solution: q.solution, explication: q.explication, ...emp,
      });
    }
    const ev = await b.creerEvaluation($("#p-titre").value.trim() || "Évaluation", questions, id);
    ctx.evaluation = ev;
    questionsParRun.set(id, questions.map((q, idx) => ({ ...q, run_id: id, idx })));
    runResultats = id;
    await b.majEtat({ mode: "evaluation", run_id: id, question_index: 0, question_debut: b.maintenant(), correction_index: 0 });
  });

  // Évaluation
  on("#p-plus30", () => b.majEtat({ question_debut: ctx.etat.question_debut + 30000 }));
  on("#p-suivante", () => {
    const n = ctx.evaluation?.nb_questions || 0;
    const i = ctx.etat.question_index + 1;
    return b.majEtat(i >= n ? { mode: "fin" } : { question_index: i, question_debut: b.maintenant() });
  });
  on("#p-stop", () => {
    if (!confirm("Terminer l'évaluation maintenant pour tout le monde ?")) return;
    return b.majEtat({ mode: "fin" });
  });

  // Fin / correction
  on("#p-corriger", () => b.majEtat({ mode: "correction", correction_index: 0 }));
  on("#p-libre", () => b.majEtat({ mode: "libre", run_id: null, question_index: 0, correction_index: 0 }));
  on("#p-prec", () => b.majEtat({ correction_index: Math.max(0, ctx.etat.correction_index - 1) }));
  on("#p-suiv", () => b.majEtat({ correction_index: Math.min((ctx.evaluation?.nb_questions || 1) - 1, ctx.etat.correction_index + 1) }));
}

function majSeance() {
  const e = ctx.etat;
  const titre = $("#p-titre-eval");
  if (titre) titre.textContent = ctx.evaluation ? "— " + ctx.evaluation.titre : "";
  const n = ctx.evaluation?.nb_questions || 0;
  const idx = e.mode === "correction" ? e.correction_index : e.question_index;
  const q = questionEval(idx);
  if ($("#p-num")) $("#p-num").textContent = q ? `Question ${idx + 1} / ${n}` : "";
  if ($("#p-notion")) $("#p-notion").textContent = q?.notion || "";
  if ($("#p-consigne")) $("#p-consigne").textContent = q?.consigne || "";
  if ($("#p-solution")) $("#p-solution").textContent = q?.solution || "";
  if ($("#p-prec")) $("#p-prec").disabled = idx <= 0;
  if ($("#p-suiv")) $("#p-suiv").disabled = idx >= n - 1;
  majChrono();
  rendreStatsCorrection();
}

function majChrono() {
  const c = $("#p-chrono");
  if (!c || ctx.etat.mode !== "evaluation") return;
  const q = questionEval(ctx.etat.question_index);
  if (!q || !ctx.etat.question_debut) return;
  const reste = q.duree * 1000 - (ctx.backend.maintenant() - ctx.etat.question_debut);
  const sec = Math.max(0, Math.ceil(reste / 1000));
  c.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  c.classList.toggle("urgent", sec <= 10 && sec > 0);
}

// ---------------------------------------------------------------------------
// Données : réponses des élèves
// ---------------------------------------------------------------------------

async function rafraichirReponses(force) {
  const run = ctx.etat.run_id || runResultats;
  if (!run || !ctx.backend.estProf()) { rendreDirect(); return; }
  if (!force && reponsesCache.run === run && Date.now() - reponsesCache.t < 4000) return;
  if (chargement) return;
  chargement = ctx.backend.reponses(run)
    .then((l) => { reponsesCache = { run, liste: l, t: Date.now() }; })
    .catch((e) => console.warn(e))
    .finally(() => {
      chargement = null;
      rendreDirect();
      rendreStatsCorrection();
      if (!runResultats || runResultats === run) { runResultats = run; rendreTableau(); }
    });
}

// Par élève et par question : { tentatives, trouve, duree_ms (1re bonne réponse) }
function synthese(liste) {
  const eleves = new Map();
  for (const r of liste) {
    if (!eleves.has(r.eleve_id)) eleves.set(r.eleve_id, { id: r.eleve_id, nom: r.eleve_nom, q: new Map() });
    const el = eleves.get(r.eleve_id);
    el.nom = r.eleve_nom;
    const c = el.q.get(r.question_index) || { tentatives: 0, trouve: false, duree_ms: null };
    c.tentatives++;
    if (r.correct && (!c.trouve || r.duree_ms < c.duree_ms)) { c.trouve = true; c.duree_ms = r.duree_ms; c.tentative_ok = r.tentative; }
    el.q.set(r.question_index, c);
  }
  return [...eleves.values()];
}

function mediane(t) {
  if (!t.length) return null;
  const s = [...t].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------------------
// En direct : élèves connectés et avancement
// ---------------------------------------------------------------------------

function rendreDirect() {
  const zone = $("#p-direct");
  if (!zone) return;
  const ouvert = zone.querySelector("details")?.open;
  const e = ctx.etat;
  const presents = ctx.presents || [];
  const liste = reponsesCache.run === e.run_id ? reponsesCache.liste : [];
  const syn = synthese(liste);
  const trouve = new Set(e.mode === "evaluation"
    ? syn.filter((el) => el.q.get(e.question_index)?.trouve).map((el) => el.id) : []);

  // Qui est là ? (élèves connectés reconnus dans la liste de la classe)
  const presentsParMembre = new Map(); // id dans la liste → [eleve_id connectés]
  const inconnus = [];
  for (const p of presents) {
    const m = classe.length ? identifier(p.nom) : null;
    if (m) presentsParMembre.set(m.id, [...(presentsParMembre.get(m.id) || []), p.id]);
    else inconnus.push(p);
  }
  const puce = (nom, ids, present) => {
    const ok = ids.some((id) => trouve.has(id));
    return `<span class="${ok ? "trouve" : present ? "present" : "absent"}" title="${present ? "connecté" : "pas connecté"}">${ok ? "✔ " : ""}${esc(nom)}</span>`;
  };
  let contenu;
  if (classe.length) {
    contenu = classe.map((m) => puce(nomOfficiel(m), presentsParMembre.get(m.id) || [], presentsParMembre.has(m.id))).join("")
      + (inconnus.length ? `</div><p class="note" style="margin:10px 0 4px">Connectés mais pas reconnus dans la liste :</p><div class="eleves">${inconnus.map((p) => puce(p.nom + " ?", [p.id], true)).join("")}` : "");
  } else {
    contenu = presents.map((p) => puce(p.nom, [p.id], true)).join("")
      || '<span class="note">Personne pour l\'instant. Les élèves apparaissent quand ils ouvrent le site et donnent leur prénom.</span>';
  }
  const nbPresents = classe.length ? presentsParMembre.size : presents.length;
  const titre = classe.length ? `Classe — ${nbPresents} présent${nbPresents > 1 ? "s" : ""} sur ${classe.length}` : `Élèves connectés (${presents.length})`;
  const nbTrouve = new Set([...trouve].filter((id) => presents.some((p) => p.id === id))).size;
  zone.innerHTML = `
    <h2>${titre}${e.mode === "evaluation" ? ` · ${nbTrouve} ont trouvé la question en cours` : ""}</h2>
    <div class="eleves">${contenu}</div>
    <p class="note">En gris : pas encore connecté. Le lancement n'attend personne : un élève qui arrive en retard rejoint la question en cours.</p>
    ${ctx.backend.type === "local" ? '<p class="note">Démo : ouvre un autre onglet sur cette adresse pour jouer un élève.</p>' : ""}
    <details ${ouvert ? "open" : ""}>
      <summary>Liste de la classe (${classe.length} élève${classe.length > 1 ? "s" : ""})</summary>
      <p class="note">Colle la liste : une ligne par élève « NOM Prénom », ou directement le copier-coller de l'ENT. Elle est stockée dans Supabase, visible par toi seul.</p>
      <textarea id="p-liste" rows="6" placeholder="DUNYACH Maxime&#10;PELLETIER Maxime&#10;…">${esc(classe.map((m) => `${m.nom} ${m.prenom}`).join("\n"))}</textarea>
      <div class="ligne"><button class="btn" id="p-liste-ok">Enregistrer la liste</button><span id="p-liste-info" class="note"></span></div>
    </details>`;
  zone.querySelector("#p-liste").addEventListener("input", (ev) => {
    const l = analyserListe(ev.target.value);
    zone.querySelector("#p-liste-info").textContent = `${l.length} élève(s) reconnu(s)` + homonymes(l);
  });
  zone.querySelector("#p-liste-ok").addEventListener("click", async () => {
    const l = analyserListe(zone.querySelector("#p-liste").value);
    if (!confirm(`Remplacer la liste de la classe par ces ${l.length} élèves ?`)) return;
    try {
      await ctx.backend.remplacerClasse(l);
      await chargerClasse();
      rendreDirect();
      rendreTableau();
    } catch (err) { alert("Erreur : " + (err.message || err)); }
  });
}

function homonymes(l) {
  const vus = new Map();
  l.forEach((e) => { const k = e.prenom.toLowerCase(); vus.set(k, [...(vus.get(k) || []), e]); });
  const doubles = [...vus.values()].filter((x) => x.length > 1);
  return doubles.length ? ` — prénoms en double : ${doubles.map((x) => x.map((e) => `${e.prenom} ${e.nom[0]}.`).join(" / ")).join(", ")} (l'initiale du nom les départage)` : "";
}

// ---------------------------------------------------------------------------
// Statistiques de correction
// ---------------------------------------------------------------------------

function normaliserRequete(s) {
  return s.replace(/\s+/g, " ").replace(/\s*;\s*$/, "").trim();
}

function rendreStatsCorrection() {
  const zone = $("#p-stats");
  if (!zone || ctx.etat.mode !== "correction") return;
  const idx = ctx.etat.correction_index;
  const liste = (reponsesCache.run === ctx.etat.run_id ? reponsesCache.liste : []).filter((r) => r.question_index === idx);
  const syn = synthese(reponsesCache.run === ctx.etat.run_id ? reponsesCache.liste : []);
  const participants = syn.length;
  const surQ = syn.map((el) => el.q.get(idx)).filter(Boolean);
  const trouves = surQ.filter((c) => c.trouve);
  const med = mediane(trouves.map((c) => c.duree_ms));
  const meilleur = trouves.length ? Math.min(...trouves.map((c) => c.duree_ms)) : null;
  const essais = trouves.length ? (trouves.reduce((s, c) => s + c.tentative_ok, 0) / trouves.length) : null;

  const fausses = new Map();
  for (const r of liste.filter((r) => !r.correct)) {
    const cle = normaliserRequete(r.requete).toLowerCase();
    const f = fausses.get(cle) || { n: 0, requete: normaliserRequete(r.requete), raison: r.erreur };
    f.n++;
    fausses.set(cle, f);
  }
  const top = [...fausses.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  zone.innerHTML = `
    <div class="ligne">
      <span class="stat"><b>${trouves.length} / ${participants}</b><small>ont trouvé</small></span>
      <span class="stat"><b>${formatDuree(med)}</b><small>temps médian</small></span>
      <span class="stat"><b>${formatDuree(meilleur)}</b><small>le plus rapide</small></span>
      <span class="stat"><b>${essais ? essais.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"}</b><small>essais en moyenne</small></span>
    </div>
    <h3 style="margin:14px 0 4px;font-size:1rem">Erreurs les plus fréquentes <small class="note">(anonymes)</small></h3>
    ${top.length ? `<ul class="erreurs-freq">${top.map((f) => `
      <li><span class="nb">×${f.n}</span><div><pre class="code">${esc(f.requete)}</pre><span class="raison">${esc(f.raison || "")}</span></div></li>`).join("")}</ul>`
    : '<p class="note">Aucune requête fausse enregistrée pour cette question.</p>'}`;
}

// ---------------------------------------------------------------------------
// Résultats : tableau élèves × questions, historique, export CSV
// ---------------------------------------------------------------------------

async function rendreResultats() {
  const zone = $("#p-resultats");
  if (!zone) return;
  zone.innerHTML = `
    <h2>Résultats</h2>
    <div class="ligne">
      <select id="p-histo"><option>Chargement…</option></select>
      <button class="btn" id="p-actualiser">Actualiser</button>
      <button class="btn" id="p-csv">Exporter (CSV)</button>
      <button class="btn" id="p-corriger-ancienne">Corriger cette évaluation</button>
      <button class="btn btn-danger" id="p-suppr">Supprimer</button>
    </div>
    <p class="note">Temps = heure de la bonne réponse − heure d'affichage de la question sur le poste de l'élève.</p>
    <div id="p-tableau"></div>`;
  let evals = [];
  try { evals = await ctx.backend.listeEvaluations(); } catch (e) { zone.querySelector("#p-tableau").innerHTML = `<p class="alerte">${esc(e.message)}</p>`; }
  const sel = zone.querySelector("#p-histo");
  if (!runResultats) runResultats = ctx.etat.run_id || evals[0]?.id || null;
  sel.innerHTML = evals.length
    ? evals.map((e) => `<option value="${e.id}" ${e.id === runResultats ? "selected" : ""}>${esc(e.titre)} — ${new Date(e.creee_le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</option>`).join("")
    : "<option value=''>Aucune évaluation pour l'instant</option>";
  ctx.evaluationsConnues = new Map(evals.map((e) => [e.id, e]));
  sel.addEventListener("change", () => { runResultats = sel.value; chargerResultats(); });
  zone.querySelector("#p-actualiser").addEventListener("click", () => rendreResultats());
  zone.querySelector("#p-csv").addEventListener("click", exporterCSV);
  zone.querySelector("#p-suppr").addEventListener("click", async () => {
    if (!runResultats) return;
    if (ctx.etat.run_id === runResultats) return alert("Cette évaluation est en cours : reviens d'abord au mode libre.");
    if (!confirm("Supprimer cette évaluation et toutes les réponses des élèves ? C'est définitif.")) return;
    await ctx.backend.supprimerEvaluation(runResultats);
    runResultats = null;
    rendreResultats();
  });
  zone.querySelector("#p-corriger-ancienne").addEventListener("click", async () => {
    if (!runResultats) return;
    if (ctx.etat.mode === "evaluation" && !confirm("Une évaluation est en cours. L'arrêter pour passer en correction ?")) return;
    await ctx.backend.majEtat({ mode: "correction", run_id: runResultats, correction_index: 0 });
  });
  chargerResultats();
}

async function chargerResultats() {
  if (!runResultats) { rendreTableau(); return; }
  await questionsDe(runResultats);
  try {
    const l = await ctx.backend.reponses(runResultats);
    reponsesCache = { run: runResultats, liste: l, t: Date.now() };
  } catch (e) { console.warn(e); }
  rendreTableau();
}

function donneesTableau() {
  const ev = ctx.evaluationsConnues?.get(runResultats) || (ctx.evaluation?.id === runResultats ? ctx.evaluation : null);
  if (!ev || reponsesCache.run !== runResultats) return null;
  const n = ev.nb_questions;
  const questions = questionsParRun.get(runResultats) || [];
  // Regroupe par élève de la liste (un élève peut s'être connecté sur deux postes)
  const parCle = new Map();
  for (const el of synthese(reponsesCache.liste)) {
    const m = classe.length ? identifier(el.nom) : null;
    const cle = m ? "m:" + m.id : "e:" + el.id;
    const x = parCle.get(cle);
    if (!x) { parCle.set(cle, { ...el, nom: m ? nomOfficiel(m) : el.nom + (classe.length ? " ?" : ""), membre: m }); continue; }
    for (const [i, c] of el.q) {
      const d = x.q.get(i);
      if (!d || (c.trouve && (!d.trouve || c.duree_ms < d.duree_ms))) x.q.set(i, c);
    }
  }
  const absents = classe.filter((m) => !parCle.has("m:" + m.id))
    .map((m) => ({ id: "absent-" + m.id, nom: nomOfficiel(m), q: new Map(), absent: true }));
  const lignes = [...parCle.values()].map((el) => {
    let trouvees = 0, total = 0;
    for (let i = 0; i < n; i++) { const c = el.q.get(i); if (c?.trouve) { trouvees++; total += c.duree_ms; } }
    return { ...el, trouvees, total };
  }).sort((a, b) => b.trouvees - a.trouvees || a.total - b.total || a.nom.localeCompare(b.nom, "fr"))
    .concat(absents.map((a) => ({ ...a, trouvees: 0, total: 0 })));
  return { ev, n, lignes, indices: [...Array(n).keys()], consigne: (i) => questions.find((q) => q.idx === i)?.consigne || "" };
}

function rendreTableau() {
  const zone = $("#p-tableau");
  if (!zone) return;
  const d = donneesTableau();
  if (!d) { zone.innerHTML = runResultats ? "" : '<p class="note">Les résultats apparaîtront ici après la première évaluation.</p>'; return; }
  if (!d.lignes.length) { zone.innerHTML = '<p class="note">Aucune réponse enregistrée pour cette évaluation.</p>'; return; }
  const entetes = d.indices.map((i) => `<th title="${esc(d.consigne(i))}">Q${i + 1}</th>`).join("");
  const corps = d.lignes.map((el) => el.absent
    ? `<tr><td><b>${esc(el.nom)}</b></td><td class="rien" colspan="${d.n + 2}">aucune réponse</td></tr>`
    : `
    <tr><td><b>${esc(el.nom)}</b></td>
      ${d.indices.map((i) => {
        const c = el.q.get(i);
        if (!c) return '<td class="rien">—</td>';
        if (c.trouve) return `<td class="ok num" title="${c.tentative_ok} essai(s)">${formatDuree(c.duree_ms)}<br><small>${c.tentative_ok} essai${c.tentative_ok > 1 ? "s" : ""}</small></td>`;
        return `<td class="ko num">✘<br><small>${c.tentatives} essai${c.tentatives > 1 ? "s" : ""}</small></td>`;
      }).join("")}
      <td class="num"><b>${el.trouvees} / ${d.n}</b></td><td class="num">${formatDuree(el.total)}</td></tr>`).join("");
  zone.innerHTML = `<div class="tableau-conteneur"><table class="tableau res"><thead><tr><th>Élève</th>${entetes}<th>Trouvées</th><th>Temps total</th></tr></thead><tbody>${corps}</tbody></table></div>`;
}

function exporterCSV() {
  const d = donneesTableau();
  if (!d || !d.lignes.length) return alert("Rien à exporter.");
  const sec = (ms) => (ms === null || ms === undefined ? "" : (ms / 1000).toFixed(1).replace(".", ","));
  const entete = ["Élève"];
  d.indices.forEach((i) => entete.push(`Q${i + 1} temps (s)`, `Q${i + 1} essais`, `Q${i + 1} trouvée`));
  entete.push("Trouvées", "Temps total (s)");
  const lignes = d.lignes.map((el) => {
    const l = [el.nom];
    d.indices.forEach((i) => {
      const c = el.q.get(i);
      l.push(c?.trouve ? sec(c.duree_ms) : "", c ? (c.trouve ? c.tentative_ok : c.tentatives) : 0, el.absent ? "aucune réponse" : c?.trouve ? "oui" : "non");
    });
    l.push(el.trouvees, sec(el.total));
    return l;
  });
  const csv = "﻿" + [entete, ...lignes].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${d.ev.titre.replace(/[^\p{L}\p{N} _-]/gu, "")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------
// Banque de questions (stockée dans Supabase, lisible par le prof seulement)
// ---------------------------------------------------------------------------

let enEdition = null; // question en cours de modification (ou {} pour une nouvelle)

async function rendreBanque() {
  const zone = $("#p-banque");
  if (!zone) return;
  banque = await chargerBanque();
  const lignes = banque.map((q, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${q.notion ? `<span class="notion">${esc(q.notion)}</span>` : ""}</td>
      <td style="white-space:normal">${esc(q.consigne)}</td>
      <td class="num">${q.duree} s</td>
      <td>
        <button class="btn-lien" data-haut="${q.id}" ${i === 0 ? "disabled" : ""} title="Monter">↑</button>
        <button class="btn-lien" data-bas="${q.id}" ${i === banque.length - 1 ? "disabled" : ""} title="Descendre">↓</button>
        <button class="btn-lien" data-modif="${q.id}">Modifier</button>
        <button class="btn-lien btn-danger" data-suppr="${q.id}">Supprimer</button>
      </td>
    </tr>`).join("");
  zone.innerHTML = `
    <h2>Banque de questions <small class="note">(${banque.length})</small></h2>
    <p class="note">Les questions et leurs solutions ne sont visibles que par toi. Les élèves ne reçoivent que la consigne, au moment où la question s'affiche, et la solution pendant la correction.</p>
    <div class="ligne"><button class="btn" id="p-nouvelle">+ Nouvelle question</button></div>
    <div id="p-editeur"></div>
    ${banque.length ? `<div class="tableau-conteneur" style="margin-top:10px"><table class="tableau"><tbody>${lignes}</tbody></table></div>` : ""}`;
  zone.querySelector("#p-nouvelle").addEventListener("click", () => { enEdition = {}; rendreEditeur(); });
  zone.querySelector("tbody")?.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.dataset.modif) { enEdition = banque.find((q) => q.id === b.dataset.modif); rendreEditeur(); return; }
      if (b.dataset.suppr) {
        const q = banque.find((x) => x.id === b.dataset.suppr);
        if (!confirm(`Supprimer la question « ${q.consigne} » de la banque ?`)) return;
        await ctx.backend.supprimerQuestion(q.id);
      }
      if (b.dataset.haut || b.dataset.bas) await deplacer(b.dataset.haut || b.dataset.bas, b.dataset.haut ? -1 : 1);
      await rendreBanque();
      if (ctx.etat.mode === "libre") rendreSeance();
    } catch (err) { alert("Erreur : " + (err.message || err)); }
  });
}

async function deplacer(id, sens) {
  const i = banque.findIndex((q) => q.id === id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= banque.length) return;
  [banque[i], banque[j]] = [banque[j], banque[i]];
  // On renumérote les deux questions échangées (et les autres si besoin)
  for (let k = 0; k < banque.length; k++) {
    if (banque[k].position !== k + 1) {
      banque[k] = await ctx.backend.enregistrerQuestion({ ...banque[k], position: k + 1 });
    }
  }
}

function rendreEditeur() {
  const zone = $("#p-editeur");
  if (!zone) return;
  if (!enEdition) { zone.innerHTML = ""; return; }
  const q = { notion: "", consigne: "", solution: "SELECT * FROM personnes WHERE ", verif: "ids", tri: "non", duree: 120, explication: "", ...enEdition };
  const colonnes = M.COLONNES.map((c) => c.nom);
  zone.innerHTML = `
    <form class="editeur" id="p-form-q">
      <h3>${q.id ? "Modifier la question" : "Nouvelle question"}</h3>
      <label>Consigne (ce que voient les élèves)<br><textarea id="e-consigne" rows="2" required>${esc(q.consigne)}</textarea></label>
      <label>Solution (requête MariaDB)<br><textarea id="e-solution" class="mono" rows="3" required>${esc(q.solution)}</textarea></label>
      <div class="ligne"><button type="button" class="btn" id="e-tester">Tester la solution</button><span id="e-test" class="note"></span></div>
      <div class="ligne">
        <label>Notion <input type="text" id="e-notion" value="${esc(q.notion)}" size="18" placeholder="ex. LIKE"></label>
        <label>Durée <input type="number" id="e-duree" value="${q.duree}" min="10" max="1800" step="10"> s</label>
      </div>
      <div class="ligne">
        <label>Ce qui doit être juste
          <select id="e-verif">
            <option value="ids" ${q.verif === "ids" ? "selected" : ""}>les personnes (colonne id, autres colonnes libres)</option>
            <option value="valeurs" ${q.verif === "valeurs" ? "selected" : ""}>les valeurs (nombres, textes…)</option>
          </select>
        </label>
        <label>Ordre des lignes
          <select id="e-tri">
            <option value="non" ${q.tri === "non" ? "selected" : ""}>n'importe quel ordre</option>
            <option value="oui" ${q.tri === "oui" ? "selected" : ""}>exactement cet ordre</option>
            ${colonnes.map((c) => `<option value="${c}" ${q.tri === c ? "selected" : ""}>trié par ${c} (ex æquo libres)</option>`).join("")}
          </select>
        </label>
      </div>
      <label>Explication (affichée pendant la correction)<br><textarea id="e-explication" rows="2">${esc(q.explication)}</textarea></label>
      <div class="ligne">
        <button class="btn btn-principal" type="submit">Enregistrer</button>
        <button class="btn btn-discret" type="button" id="e-annuler">Annuler</button>
      </div>
    </form>`;
  const f = zone.querySelector("form");
  const tester = () => {
    const out = zone.querySelector("#e-test");
    try {
      const res = M.executer(zone.querySelector("#e-solution").value);
      const avecId = M.colonneId(res) >= 0;
      out.className = "note";
      out.textContent = `✔ ${res.lignes.length} ligne(s), colonnes : ${res.colonnes.join(", ")}` +
        (zone.querySelector("#e-verif").value === "ids" && !avecId ? " — ⚠ pas de colonne id : choisis « les valeurs »." : "");
      return res;
    } catch (err) {
      out.className = "retour ko";
      out.textContent = "✘ " + err.message;
      return null;
    }
  };
  zone.querySelector("#e-tester").addEventListener("click", tester);
  zone.querySelector("#e-annuler").addEventListener("click", () => { enEdition = null; rendreEditeur(); });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = tester();
    if (!res) return;
    const verif = zone.querySelector("#e-verif").value;
    if (verif === "ids" && M.colonneId(res) < 0) return;
    const nouvelle = {
      ...(q.id ? { id: q.id } : {}),
      position: q.position ?? (Math.max(0, ...banque.map((x) => x.position || 0)) + 1),
      consigne: zone.querySelector("#e-consigne").value.trim(),
      solution: zone.querySelector("#e-solution").value.trim(),
      notion: zone.querySelector("#e-notion").value.trim(),
      duree: Math.min(1800, Math.max(10, Number(zone.querySelector("#e-duree").value) || 120)),
      verif,
      tri: zone.querySelector("#e-tri").value,
      explication: zone.querySelector("#e-explication").value.trim(),
    };
    try {
      await ctx.backend.enregistrerQuestion(nouvelle);
      enEdition = null;
      await rendreBanque();
      if (ctx.etat.mode === "libre") rendreSeance();
    } catch (err) { alert("Erreur : " + (err.message || err)); }
  });
  zone.querySelector("#e-consigne").focus();
}
