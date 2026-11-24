// Synchronisation de la classe.
// - SupabaseBackend : le vrai fonctionnement en classe (temps réel entre tous les postes).
// - LocalBackend    : mode démo (?demo=1), synchronisé entre les onglets d'un même navigateur.
// - AucunBackend    : pas de configuration → mode libre seulement.
import { CONFIG } from "./config.js";
import { EXEMPLES } from "./exemples.js";

const COLONNES_PUBLIQUES = "run_id,idx,notion,consigne,verif,tri,duree";

function etatVide() {
  return { mode: "libre", run_id: null, question_index: 0, question_debut: null, correction_index: 0 };
}

function normaliserEtat(e) {
  if (!e) return etatVide();
  return {
    mode: e.mode || "libre",
    run_id: e.run_id || null,
    question_index: e.question_index ?? 0,
    question_debut: e.question_debut ? new Date(e.question_debut).getTime() : null,
    correction_index: e.correction_index ?? 0,
  };
}

// ---------------------------------------------------------------------------
class AucunBackend {
  type = "aucun";
  async init() {}
  maintenant() { return Date.now(); }
  async getEtat() { return etatVide(); }
  onEtat() {}
  onPresence() {}
  rejoindre() {}
  estProf() { return false; }
}

// ---------------------------------------------------------------------------
class SupabaseBackend {
  type = "supabase";
  decalage = 0;
  prof = null;
  evaluations = new Map();
  questions = new Map(); // "run:idx" → question
  ecouteursEtat = [];
  ecouteursPresence = [];
  eleve = null;

  async init() {
    await chargerScript("vendor/supabase.js");
    this.client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, storageKey: "quiestce-prof" },
    });
    const { data } = await this.client.auth.getSession();
    this.prof = data.session?.user || null;
    this.client.auth.onAuthStateChange((_e, session) => { this.prof = session?.user || null; });
    await this.synchroniserHorloge();
    setInterval(() => this.synchroniserHorloge(), 5 * 60 * 1000);

    this.canalEtat = this.client
      .channel("etat-classe")
      .on("postgres_changes", { event: "*", schema: "public", table: "etat" }, (p) => {
        if (p.new && p.new.id === 1) this.diffuserEtat(normaliserEtat(p.new));
      })
      .subscribe();
    // Filet de sécurité si le temps réel décroche (réseau du lycée…)
    setInterval(() => this.getEtat().then((e) => this.diffuserEtat(e)).catch(() => {}), 8000);

    this.canalClasse = this.client.channel("classe", { config: { presence: { key: crypto.randomUUID() } } });
    this.canalClasse
      .on("presence", { event: "sync" }, () => {
        const liste = Object.values(this.canalClasse.presenceState()).flat()
          .filter((x) => x.eleve_id).map((x) => ({ id: x.eleve_id, nom: x.nom }));
        this.ecouteursPresence.forEach((f) => f(liste));
      })
      .subscribe((statut) => {
        if (statut === "SUBSCRIBED" && this.eleve) this.canalClasse.track(this.eleve);
      });
  }

  async synchroniserHorloge() {
    try {
      const t0 = Date.now();
      const { data, error } = await this.client.rpc("heure_serveur");
      const t1 = Date.now();
      if (!error && data) this.decalage = new Date(data).getTime() - (t0 + t1) / 2;
    } catch { /* on garde l'ancien décalage */ }
  }

  maintenant() { return Date.now() + this.decalage; }

  diffuserEtat(e) {
    const cle = JSON.stringify(e);
    if (cle === this.dernierEtat) return;
    this.dernierEtat = cle;
    this.ecouteursEtat.forEach((f) => f(e));
  }

  async getEtat() {
    const { data, error } = await this.client.from("etat").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    return normaliserEtat(data);
  }

  onEtat(f) { this.ecouteursEtat.push(f); }
  onPresence(f) { this.ecouteursPresence.push(f); }

  rejoindre(eleve) {
    this.eleve = { eleve_id: eleve.id, nom: eleve.nom };
    if (this.canalClasse) this.canalClasse.track(this.eleve).catch(() => {});
  }

  async getEvaluation(id) {
    if (!id) return null;
    if (this.evaluations.has(id)) return this.evaluations.get(id);
    const { data, error } = await this.client.from("evaluations").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (data) this.evaluations.set(id, data);
    return data;
  }

  // Une question de l'évaluation. Pour un élève : seulement les colonnes publiques,
  // et seulement si la question a déjà été affichée.
  async question(run, idx) {
    const cle = `${run}:${idx}`;
    if (this.questions.has(cle)) return this.questions.get(cle);
    const { data, error } = await this.client.from("evaluation_questions")
      .select(this.prof ? "*" : COLONNES_PUBLIQUES).eq("run_id", run).eq("idx", idx).maybeSingle();
    if (error) throw error;
    if (data) this.questions.set(cle, data);
    return data;
  }

  async correction(run, idx) {
    const q = this.prof ? await this.question(run, idx) : null;
    if (q?.solution) return { solution: q.solution, explication: q.explication };
    const { data, error } = await this.client.rpc("question_corrigee", { p_run: run, p_idx: idx });
    if (error) throw error;
    return data;
  }

  async avancer(runId, depuis) {
    await this.client.rpc("avancer_question", { p_run: runId, p_depuis: depuis });
  }

  async soumettre(r) {
    const { data, error } = await this.client.rpc("soumettre", {
      p_run: r.run_id, p_idx: r.question_index, p_eleve_id: r.eleve_id, p_eleve_nom: r.eleve_nom,
      p_requete: r.requete, p_empreinte: r.empreinte, p_empreinte_ens: r.empreinte_ens,
      p_nb_lignes: r.nb_lignes, p_nb_colonnes: r.nb_colonnes, p_erreur: r.erreur,
      p_affichee_le: r.affichee_le, p_repondu_le: r.repondu_le,
    });
    if (error) throw error;
    return data;
  }

  // --- Prof ---
  estProf() { return !!this.prof; }
  async connexion(email, mdp) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password: mdp });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "E-mail ou mot de passe incorrect." : error.message);
    this.prof = data.user;
    this.questions.clear();
  }
  async deconnexion() { await this.client.auth.signOut(); this.prof = null; this.questions.clear(); }

  async listeEvaluations() {
    const { data, error } = await this.client.from("evaluations").select("*").order("creee_le", { ascending: false });
    if (error) throw error;
    return data;
  }

  async questionsEvaluation(run) {
    const { data, error } = await this.client.from("evaluation_questions").select("*").eq("run_id", run).order("idx");
    if (error) throw error;
    data.forEach((q) => this.questions.set(`${run}:${q.idx}`, q));
    return data;
  }

  async creerEvaluation(titre, questions, id) {
    const ev = { id, titre, nb_questions: questions.length };
    let r = await this.client.from("evaluations").insert(ev).select().single();
    if (r.error) throw r.error;
    r = await this.client.from("evaluation_questions").insert(questions.map((q, idx) => ({ ...q, run_id: id, idx })));
    if (r.error) {
      await this.client.from("evaluations").delete().eq("id", id);
      throw r.error;
    }
    this.evaluations.set(id, ev);
    return ev;
  }

  async supprimerEvaluation(id) {
    const { error } = await this.client.from("evaluations").delete().eq("id", id);
    if (error) throw error;
  }

  async majEtat(patch) {
    const p = { ...patch, maj: new Date(this.maintenant()).toISOString() };
    if (typeof p.question_debut === "number") p.question_debut = new Date(p.question_debut).toISOString();
    const { data, error } = await this.client.from("etat").update(p).eq("id", 1).select().single();
    if (error) throw error;
    this.diffuserEtat(normaliserEtat(data));
  }

  async reponses(runId) {
    const tout = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await this.client.from("reponses").select("*").eq("run_id", runId)
        .order("id").range(de, de + 999);
      if (error) throw error;
      tout.push(...data);
      if (data.length < 1000) break;
    }
    return tout;
  }

  async banque() {
    const { data, error } = await this.client.from("banque").select("*").order("position").order("maj");
    if (error) throw error;
    return data;
  }
  async enregistrerQuestion(q) {
    const ligne = { ...q, maj: new Date().toISOString() };
    const r = q.id
      ? await this.client.from("banque").update(ligne).eq("id", q.id).select().single()
      : await this.client.from("banque").insert(ligne).select().single();
    if (r.error) throw r.error;
    return r.data;
  }
  async supprimerQuestion(id) {
    const { error } = await this.client.from("banque").delete().eq("id", id);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Mode démo : tout est stocké dans le navigateur et partagé entre ses onglets.
// Il reproduit les mêmes règles que le serveur (correction par empreinte).
class LocalBackend {
  type = "local";
  ecouteursEtat = [];
  ecouteursPresence = [];
  presents = new Map();

  async init() {
    this.canal = new BroadcastChannel("quiestce-demo");
    this.canal.onmessage = (m) => this.recevoir(m.data);
    window.addEventListener("storage", (e) => { if (e.key === "demo-etat") this.diffuser(); });
    setInterval(() => {
      if (this.eleve) this.canal.postMessage({ type: "present", eleve: this.eleve, t: Date.now() });
      const avant = this.presents.size;
      for (const [id, x] of this.presents) if (Date.now() - x.t > 8000) this.presents.delete(id);
      if (this.presents.size !== avant) this.diffuserPresence();
    }, 2000);
    this.canal.postMessage({ type: "qui" });
    if (!localStorage.getItem("demo-banque")) {
      this.ecrire("demo-banque", EXEMPLES.map((q, i) => ({ ...q, id: crypto.randomUUID(), position: i + 1 })));
    }
  }
  lire(cle, defaut) {
    try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; }
  }
  ecrire(cle, v) { localStorage.setItem(cle, JSON.stringify(v)); }
  recevoir(m) {
    if (m.type === "etat") this.diffuser();
    if (m.type === "present") { this.presents.set(m.eleve.id, { ...m.eleve, t: m.t }); this.diffuserPresence(); }
    if (m.type === "qui" && this.eleve) this.canal.postMessage({ type: "present", eleve: this.eleve, t: Date.now() });
  }
  diffuserPresence() {
    const l = [...this.presents.values()].map(({ id, nom }) => ({ id, nom }));
    this.ecouteursPresence.forEach((f) => f(l));
  }
  diffuser() {
    const e = this.etatSync();
    const cle = JSON.stringify(e);
    if (cle === this.dernier) return;
    this.dernier = cle;
    this.ecouteursEtat.forEach((f) => f(e));
  }
  etatSync() { return normaliserEtat(this.lire("demo-etat", null)); }
  maintenant() { return Date.now(); }
  async getEtat() { return this.etatSync(); }
  onEtat(f) { this.ecouteursEtat.push(f); }
  onPresence(f) { this.ecouteursPresence.push(f); }
  rejoindre(eleve) { this.eleve = eleve; this.canal.postMessage({ type: "present", eleve, t: Date.now() }); }
  async getEvaluation(id) { return this.lire("demo-evaluations", []).find((e) => e.id === id) || null; }
  questionSync(run, idx) { return this.lire("demo-questions", []).find((q) => q.run_id === run && q.idx === idx) || null; }
  async question(run, idx) {
    const q = this.questionSync(run, idx);
    if (!q || this.estProf()) return q;
    const e = this.etatSync();
    const visible = e.run_id === run && ((e.mode === "evaluation" && idx <= e.question_index) || ["fin", "correction"].includes(e.mode));
    if (!visible) return null;
    const { run_id, notion, consigne, verif, tri, duree } = q;
    return { run_id, idx, notion, consigne, verif, tri, duree };
  }
  async correction(run, idx) {
    const q = this.questionSync(run, idx);
    const e = this.etatSync();
    if (!q || (!this.estProf() && !(e.mode === "correction" && e.run_id === run && idx <= e.correction_index))) return null;
    return { solution: q.solution, explication: q.explication };
  }
  async avancer(runId, depuis) {
    const e = this.lire("demo-etat", null);
    const ev = await this.getEvaluation(runId);
    const q = this.questionSync(runId, depuis);
    if (!e || !ev || !q || e.mode !== "evaluation" || e.run_id !== runId || e.question_index !== depuis) return;
    if (Date.now() < new Date(e.question_debut).getTime() + (q.duree - 2) * 1000) return;
    await this.majEtat({
      question_index: depuis + 1,
      question_debut: Date.now(),
      mode: depuis + 1 >= ev.nb_questions ? "fin" : "evaluation",
    });
  }
  async soumettre(r) {
    const e = this.etatSync();
    if (e.mode !== "evaluation" || e.run_id !== r.run_id || e.question_index !== r.question_index) return { erreur: "fermee" };
    const toutes = this.lire("demo-reponses", []);
    const miennes = toutes.filter((x) => x.run_id === r.run_id && x.question_index === r.question_index && x.eleve_id === r.eleve_id);
    if (miennes.some((x) => x.correct)) return { erreur: "deja" };
    const q = this.questionSync(r.run_id, r.question_index);
    const correct = !r.erreur && r.empreinte && r.empreinte === q.empreinte;
    let indice = "";
    if (!correct && !r.erreur) {
      if (q.verif === "valeurs" && r.nb_colonnes !== q.nb_colonnes) indice = `Il faut ${q.nb_colonnes} colonne(s), ta requête en renvoie ${r.nb_colonnes}.`;
      else if (r.nb_lignes > q.nb_lignes) indice = `Pas tout à fait : ta requête renvoie ${r.nb_lignes} ligne(s), c'est trop.`;
      else if (r.nb_lignes < q.nb_lignes) indice = `Pas tout à fait : ta requête renvoie ${r.nb_lignes} ligne(s), il en manque.`;
      else if (q.tri !== "non" && r.empreinte_ens === q.empreinte_ens) indice = "Les bonnes lignes, mais pas dans le bon ordre.";
      else indice = "Le bon nombre de lignes, mais pas les bonnes.";
    }
    const tentative = miennes.length + 1;
    toutes.push({
      id: toutes.length + 1, run_id: r.run_id, eleve_id: r.eleve_id, eleve_nom: r.eleve_nom,
      question_index: r.question_index, requete: r.requete, correct: !!correct, erreur: r.erreur || indice || null,
      tentative, affichee_le: r.affichee_le, repondu_le: r.repondu_le,
      duree_ms: Math.max(0, new Date(r.repondu_le) - new Date(r.affichee_le)), recu_le: new Date().toISOString(),
    });
    this.ecrire("demo-reponses", toutes);
    return { correct: !!correct, tentative, indice };
  }
  estProf() { return sessionStorage.getItem("demo-prof") === "1"; }
  async connexion(_email, mdp) {
    if (mdp !== "demo") throw new Error("En mode démo, le mot de passe est « demo ».");
    sessionStorage.setItem("demo-prof", "1");
  }
  async deconnexion() { sessionStorage.removeItem("demo-prof"); }
  async listeEvaluations() { return [...this.lire("demo-evaluations", [])].reverse(); }
  async questionsEvaluation(run) {
    return this.lire("demo-questions", []).filter((q) => q.run_id === run).sort((a, b) => a.idx - b.idx);
  }
  async creerEvaluation(titre, questions, id) {
    const ev = { id, titre, nb_questions: questions.length, creee_le: new Date().toISOString() };
    this.ecrire("demo-evaluations", [...this.lire("demo-evaluations", []), ev]);
    this.ecrire("demo-questions", [...this.lire("demo-questions", []), ...questions.map((q, idx) => ({ ...q, run_id: id, idx }))]);
    return ev;
  }
  async supprimerEvaluation(id) {
    this.ecrire("demo-evaluations", this.lire("demo-evaluations", []).filter((e) => e.id !== id));
    this.ecrire("demo-questions", this.lire("demo-questions", []).filter((q) => q.run_id !== id));
    this.ecrire("demo-reponses", this.lire("demo-reponses", []).filter((r) => r.run_id !== id));
  }
  async majEtat(patch) {
    const e = { ...etatVide(), ...this.lire("demo-etat", {}), ...patch };
    if (typeof e.question_debut === "number") e.question_debut = new Date(e.question_debut).toISOString();
    this.ecrire("demo-etat", e);
    this.canal.postMessage({ type: "etat" });
    this.diffuser();
  }
  async reponses(runId) { return this.lire("demo-reponses", []).filter((r) => r.run_id === runId); }
  async banque() { return [...this.lire("demo-banque", [])].sort((a, b) => a.position - b.position); }
  async enregistrerQuestion(q) {
    const l = this.lire("demo-banque", []);
    const ligne = { ...q, id: q.id || crypto.randomUUID() };
    const i = l.findIndex((x) => x.id === ligne.id);
    if (i >= 0) l[i] = ligne; else l.push(ligne);
    this.ecrire("demo-banque", l);
    return ligne;
  }
  async supprimerQuestion(id) { this.ecrire("demo-banque", this.lire("demo-banque", []).filter((q) => q.id !== id)); }
}

function chargerScript(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = ok;
    s.onerror = () => ko(new Error(`Impossible de charger ${src}`));
    document.head.appendChild(s);
  });
}

export async function creerBackend() {
  const params = new URLSearchParams(location.search);
  let b;
  if (params.has("demo")) b = new LocalBackend();
  else if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) b = new SupabaseBackend();
  else b = new AucunBackend();
  try {
    await b.init();
  } catch (e) {
    console.error(e);
    const a = new AucunBackend();
    a.erreur = "Connexion à Supabase impossible : " + (e.message || e);
    return a;
  }
  return b;
}
