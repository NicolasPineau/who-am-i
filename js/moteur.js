// Moteur SQL du jeu : SQLite (sql.js) qui se comporte comme MariaDB.
// - on n'accepte qu'une seule requête SELECT ;
// - la requête est réécrite pour que la syntaxe MariaDB fonctionne sur SQLite
//   (guillemets doubles = chaînes, || = OR, IF(), CONCAT(), YEAR(), …) ;
// - ce qui n'existe pas en MariaDB est refusé avec un message clair.
import { PERSONNES } from "./data.js";

export const COLONNES = [
  { nom: "id", type: "INT", nul: false, info: "Identifiant unique (clé primaire)" },
  { nom: "prenom", type: "VARCHAR(30)", nul: false, info: "Prénom" },
  { nom: "nom", type: "VARCHAR(30)", nul: false, info: "Nom de famille" },
  { nom: "genre", type: "CHAR(1)", nul: false, info: "'F' ou 'M'" },
  { nom: "date_naissance", type: "DATE", nul: false, info: "Format 'AAAA-MM-JJ'" },
  { nom: "age", type: "INT", nul: false, info: "Âge en années (0 pour un bébé)" },
  { nom: "taille", type: "DECIMAL(3,2)", nul: false, info: "En mètres, ex. 1.70" },
  { nom: "cheveux", type: "VARCHAR(10)", nul: false, info: "blond, brun, chatain, roux, noir, gris, blanc, chauve" },
  { nom: "yeux", type: "VARCHAR(10)", nul: false, info: "marron, bleu, vert, noir, gris" },
  { nom: "lunettes", type: "BOOLEAN", nul: false, info: "1 (TRUE) ou 0 (FALSE)" },
  { nom: "barbe", type: "BOOLEAN", nul: false, info: "1 (TRUE) ou 0 (FALSE)" },
  { nom: "chapeau", type: "BOOLEAN", nul: false, info: "1 (TRUE) ou 0 (FALSE)" },
  { nom: "ville", type: "VARCHAR(30)", nul: false, info: "Ville d'habitation" },
  { nom: "profession", type: "VARCHAR(40)", nul: true, info: "NULL si aucune profession" },
  { nom: "email", type: "VARCHAR(60)", nul: true, info: "NULL si pas d'adresse e-mail" },
  { nom: "animal", type: "VARCHAR(20)", nul: true, info: "NULL si pas d'animal" },
  { nom: "permis", type: "BOOLEAN", nul: true, info: "1, 0, ou NULL si non renseigné" },
];

export const MAX_LIGNES = 2000;

let SQL = null;
let db = null;
let personnesParId = new Map();

export function calculerAge(dateIso, auJour = new Date()) {
  const [a, m, j] = dateIso.split("-").map(Number);
  let age = auJour.getFullYear() - a;
  const mm = auJour.getMonth() + 1;
  if (mm < m || (mm === m && auJour.getDate() < j)) age--;
  return Math.max(age, 0);
}

export function personne(id) {
  return personnesParId.get(Number(id));
}

export function toutesLesPersonnes() {
  return [...personnesParId.values()];
}

// ---------- Fonctions MariaDB ajoutées à SQLite ----------

const pad = (n, l = 2) => String(n).padStart(l, "0");
function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function maintenant() {
  const d = new Date();
  return `${aujourdhui()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function versDate(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return {
    a: +m[1], m: +m[2], j: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0),
    t: Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)),
  };
}
const JOURS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MOIS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

const FONCTIONS = {
  mdb_if: (c, a, b) => (c !== null && Number(c) !== 0 ? a : b),
  mdb_concat: (...args) => (args.some((x) => x === null) ? null : args.map(texte).join("")),
  mdb_left: (s, n) => (s === null || n === null ? null : texte(s).slice(0, Math.max(0, n))),
  mdb_right: (s, n) => (s === null || n === null ? null : n <= 0 ? "" : texte(s).slice(-n)),
  mdb_locate: (sub, s, pos = 1) => (sub === null || s === null ? null
    : texte(s).toLowerCase().indexOf(texte(sub).toLowerCase(), Math.max(0, pos - 1)) + 1),
  mdb_lpad: (s, n, p) => (s === null || p === null ? null : texte(s).padStart(n, texte(p)).slice(0, n)),
  mdb_rpad: (s, n, p) => (s === null || p === null ? null : texte(s).padEnd(n, texte(p)).slice(0, n)),
  mdb_repeat: (s, n) => (s === null ? null : texte(s).repeat(Math.max(0, n))),
  mdb_reverse: (s) => (s === null ? null : [...texte(s)].reverse().join("")),
  mdb_floor: (x) => (x === null ? null : Math.floor(x)),
  mdb_ceil: (x) => (x === null ? null : Math.ceil(x)),
  mdb_sqrt: (x) => (x === null || x < 0 ? null : Math.sqrt(x)),
  mdb_pow: (x, y) => (x === null || y === null ? null : Math.pow(x, y)),
  mdb_mod: (x, y) => (x === null || y === null || Number(y) === 0 ? null : x % y),
  mdb_truncate: (x, d) => (x === null ? null : Math.trunc(x * 10 ** d) / 10 ** d),
  mdb_sign: (x) => (x === null ? null : Math.sign(x)),
  mdb_rand: () => Math.random(),
  mdb_now: () => maintenant(),
  mdb_curdate: () => aujourdhui(),
  mdb_curtime: () => maintenant().slice(11),
  mdb_date: (v) => { const d = versDate(v); return d ? `${d.a}-${pad(d.m)}-${pad(d.j)}` : null; },
  mdb_year: (v) => versDate(v)?.a ?? null,
  mdb_month: (v) => versDate(v)?.m ?? null,
  mdb_day: (v) => versDate(v)?.j ?? null,
  mdb_dayofweek: (v) => { const d = versDate(v); return d ? new Date(d.t).getUTCDay() + 1 : null; },
  mdb_dayname: (v) => { const d = versDate(v); return d ? JOURS[new Date(d.t).getUTCDay()] : null; },
  mdb_monthname: (v) => { const d = versDate(v); return d ? MOIS[d.m - 1] : null; },
  mdb_datediff: (a, b) => {
    const x = versDate(a), y = versDate(b);
    if (!x || !y) return null;
    return Math.round((Date.UTC(x.a, x.m - 1, x.j) - Date.UTC(y.a, y.m - 1, y.j)) / 86400000);
  },
  mdb_timestampdiff: (unite, a, b) => {
    const x = versDate(a), y = versDate(b);
    if (!x || !y) return null;
    const u = String(unite).toUpperCase();
    if (u === "YEAR" || u === "MONTH" || u === "QUARTER") {
      let mois = (y.a - x.a) * 12 + (y.m - x.m);
      const resteY = y.t - Date.UTC(y.a, y.m - 1, 1), resteX = x.t - Date.UTC(x.a, x.m - 1, 1);
      if (mois > 0 && resteY < resteX) mois--;
      if (mois < 0 && resteY > resteX) mois++;
      return u === "YEAR" ? Math.trunc(mois / 12) : u === "QUARTER" ? Math.trunc(mois / 3) : mois;
    }
    const sec = { WEEK: 604800, DAY: 86400, HOUR: 3600, MINUTE: 60, SECOND: 1 }[u];
    return sec ? Math.trunc((y.t - x.t) / 1000 / sec) : null;
  },
  mdb_date_format: (v, f) => {
    const d = versDate(v);
    if (!d || f === null) return null;
    const dt = new Date(d.t);
    const map = {
      Y: d.a, y: pad(d.a % 100), m: pad(d.m), c: d.m, d: pad(d.j), e: d.j, H: pad(d.h),
      i: pad(d.mi), s: pad(d.s), M: MOIS[d.m - 1], b: MOIS[d.m - 1].slice(0, 3),
      W: JOURS[dt.getUTCDay()], a: JOURS[dt.getUTCDay()].slice(0, 3), "%": "%",
    };
    return texte(f).replace(/%(.)/g, (t, c) => (c in map ? String(map[c]) : c));
  },
  mdb_isnull: (x) => (x === null ? 1 : 0),
  mdb_regexp: (motif, valeur) => {
    if (motif === null || valeur === null) return null;
    try { return new RegExp(texte(motif), "i").test(texte(valeur)) ? 1 : 0; } catch { return 0; }
  },
};

function texte(v) {
  if (v === null) return null;
  if (typeof v === "number" && !Number.isInteger(v)) return String(v);
  return String(v);
}

// Fonctions à nombre d'arguments variable (déclarées une fois par nombre d'arguments)
const ARITES = { mdb_concat: [1, 2, 3, 4, 5, 6, 7, 8], mdb_locate: [2, 3] };

function compterArguments(jetons, k) {
  // jetons[k] est la parenthèse ouvrante
  let prof = 0, n = 0, vide = true;
  for (let i = k; i < jetons.length; i++) {
    const j = jetons[i];
    if (j.t === "op" && j.v === "(") { prof++; if (prof === 1) continue; }
    if (j.t === "op" && j.v === ")") { prof--; if (prof === 0) return vide ? 0 : n + 1; }
    if (prof === 1 && j.t === "op" && j.v === ",") n++;
    vide = false;
  }
  return vide ? 0 : n + 1;
}

// Fonctions MariaDB autorisées. Valeur : nom de la fonction SQLite à appeler
// (null = même nom, la fonction SQLite se comporte déjà comme MariaDB).
const FONCTIONS_MARIADB = {
  COUNT: null, SUM: null, AVG: null, MIN: null, MAX: null, GROUP_CONCAT: null,
  UPPER: null, UCASE: "upper", LOWER: null, LCASE: "lower",
  LENGTH: null, CHAR_LENGTH: "length", CHARACTER_LENGTH: "length",
  CONCAT: "mdb_concat", CONCAT_WS: null, SUBSTRING: "substr", SUBSTR: null, MID: "substr",
  LEFT: "mdb_left", RIGHT: "mdb_right", TRIM: null, LTRIM: null, RTRIM: null, REPLACE: null,
  REVERSE: "mdb_reverse", LOCATE: "mdb_locate", INSTR: null, LPAD: "mdb_lpad", RPAD: "mdb_rpad",
  REPEAT: "mdb_repeat", ROUND: null, FLOOR: "mdb_floor", CEIL: "mdb_ceil", CEILING: "mdb_ceil",
  ABS: null, MOD: "mdb_mod", TRUNCATE: "mdb_truncate", SQRT: "mdb_sqrt", POW: "mdb_pow",
  POWER: "mdb_pow", RAND: "mdb_rand", SIGN: "mdb_sign",
  NOW: "mdb_now", CURDATE: "mdb_curdate", CURRENT_DATE: "mdb_curdate", CURTIME: "mdb_curtime",
  CURRENT_TIMESTAMP: "mdb_now", SYSDATE: "mdb_now", DATE: "mdb_date",
  YEAR: "mdb_year", MONTH: "mdb_month", DAY: "mdb_day", DAYOFMONTH: "mdb_day",
  DAYOFWEEK: "mdb_dayofweek", DAYNAME: "mdb_dayname", MONTHNAME: "mdb_monthname",
  DATEDIFF: "mdb_datediff", TIMESTAMPDIFF: "mdb_timestampdiff", DATE_FORMAT: "mdb_date_format",
  IF: "iif", IFNULL: null, NULLIF: null, COALESCE: null, ISNULL: "mdb_isnull", CAST: null,
  ROW_NUMBER: null, RANK: null, DENSE_RANK: null,
};

// Mots-clés qui peuvent être suivis d'une parenthèse sans être des fonctions.
const MOTS_CLES = new Set(("SELECT FROM WHERE AND OR NOT XOR IN EXISTS AS ON BETWEEN LIKE IS " +
  "NULL USING JOIN HAVING BY WHEN THEN ELSE CASE END ALL ANY SOME DISTINCT UNION LIMIT OFFSET " +
  "REGEXP RLIKE OVER INNER OUTER CROSS NATURAL GROUP ORDER ASC DESC VALUES INTERSECT EXCEPT " +
  "PARTITION").split(" "));

const INTERDITS_ECRITURE = new Set(["INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
  "TRUNCATE", "REPLACE", "RENAME", "GRANT", "REVOKE", "LOAD", "CALL", "SET", "USE", "SHOW",
  "DESCRIBE", "DESC", "EXPLAIN", "LOCK", "UNLOCK", "HANDLER", "DO", "WITH", "PRAGMA", "ATTACH",
  "DETACH", "VACUUM", "BEGIN", "COMMIT", "ROLLBACK", "START"]);

export class ErreurSQL extends Error {
  constructor(message, code = "") {
    super(message);
    this.code = code;
  }
}

// ---------- Analyse lexicale ----------

function decouper(sql) {
  const jetons = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const debut = i;
    if (/\s/.test(c)) { i++; continue; }
    // Commentaires MariaDB : "-- " (avec espace), "#", "/* */"
    if (c === "-" && sql[i + 1] === "-" && (i + 2 >= n || /\s/.test(sql[i + 2]))) {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "#") { while (i < n && sql[i] !== "\n") i++; continue; }
    if (c === "/" && sql[i + 1] === "*") {
      const fin = sql.indexOf("*/", i + 2);
      if (fin < 0) throw new ErreurSQL("Commentaire /* … */ jamais refermé.", "1064");
      i = fin + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let val = "";
      i++;
      let ferme = false;
      while (i < n) {
        const d = sql[i];
        if (d === "\\" && i + 1 < n) {
          const e = sql[i + 1];
          val += { n: "\n", t: "\t", r: "\r", 0: "\0" }[e] ?? e;
          i += 2;
          continue;
        }
        if (d === c) {
          if (sql[i + 1] === c) { val += c; i += 2; continue; }
          ferme = true;
          i++;
          break;
        }
        val += d;
        i++;
      }
      if (!ferme) throw new ErreurSQL(`Chaîne de caractères jamais refermée : il manque un ${c}.`, "1064");
      jetons.push({ t: "chaine", v: val, pos: debut });
      continue;
    }
    if (c === "`") {
      const fin = sql.indexOf("`", i + 1);
      if (fin < 0) throw new ErreurSQL("Nom entre ` ` jamais refermé.", "1064");
      jetons.push({ t: "ident", v: sql.slice(i + 1, fin), cite: true, pos: debut });
      i = fin + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(sql[i + 1] || ""))) {
      const m = sql.slice(i).match(/^(\d*\.?\d+(?:[eE][+-]?\d+)?|\d+\.)/);
      jetons.push({ t: "nombre", v: m[0], pos: debut });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_À-ɏ]/.test(c)) {
      const m = sql.slice(i).match(/^[A-Za-z0-9_$À-ɏ]+/);
      jetons.push({ t: "ident", v: m[0], pos: debut });
      i += m[0].length;
      continue;
    }
    const ops = ["<=>", "<>", "!=", ">=", "<=", "||", "&&", "::", ":="];
    const op = ops.find((o) => sql.startsWith(o, i));
    if (op) { jetons.push({ t: "op", v: op, pos: debut }); i += op.length; continue; }
    if ("(),;.*+-/%=<>!".includes(c)) { jetons.push({ t: "op", v: c, pos: debut }); i++; continue; }
    throw new ErreurSQL(`Caractère inattendu « ${c} ».`, "1064");
  }
  for (const j of jetons) j.fin = j.fin ?? finJeton(sql, j);
  return jetons;
}

// Position de fin d'un jeton dans le texte d'origine
function finJeton(sql, j) {
  if (j.t === "chaine") {
    const q = sql[j.pos];
    let i = j.pos + 1;
    while (i < sql.length) {
      if (sql[i] === "\\") { i += 2; continue; }
      if (sql[i] === q) { if (sql[i + 1] === q) { i += 2; continue; } return i + 1; }
      i++;
    }
    return sql.length;
  }
  if (j.t === "ident" && j.cite) return sql.indexOf("`", j.pos + 1) + 1;
  return j.pos + j.v.length;
}

// En MariaDB, une colonne calculée sans alias porte le texte de l'expression
// (ex. « COUNT(*) »). On ajoute donc un alias avec le texte d'origine pour que
// la requête réécrite pour SQLite affiche les mêmes noms de colonnes.
function aliasAutomatiques(jetons, sql) {
  const alias = new Map();
  let k = jetons.findIndex((j) => j.t === "ident" && j.v.toUpperCase() === "SELECT");
  if (k < 0) return alias;
  k++;
  while (jetons[k] && jetons[k].t === "ident" && ["DISTINCT", "ALL"].includes(jetons[k].v.toUpperCase())) k++;
  const FIN = new Set(["FROM", "WHERE", "GROUP", "ORDER", "LIMIT", "HAVING", "UNION"]);
  let prof = 0, debut = k;
  const elements = [];
  for (; k <= jetons.length; k++) {
    const j = jetons[k];
    const fin = !j || (prof === 0 && j.t === "ident" && !j.cite && FIN.has(j.v.toUpperCase()));
    if (fin || (prof === 0 && j.t === "op" && j.v === ",")) {
      if (k > debut) elements.push([debut, k - 1]);
      debut = k + 1;
      if (fin) break;
      continue;
    }
    if (j.t === "op" && j.v === "(") prof++;
    if (j.t === "op" && j.v === ")") prof--;
  }
  for (const [a, b] of elements) {
    const e = jetons.slice(a, b + 1);
    const dernier = e[e.length - 1], avant = e[e.length - 2];
    const simple = (e.length === 1 && (e[0].t === "ident" || (e[0].t === "op" && e[0].v === "*")))
      || (e.length === 3 && e[1].v === "." && (e[2].t === "ident" || e[2].v === "*"));
    if (simple) continue;
    const aAlias = e.length >= 2 && (dernier.t === "ident" || dernier.t === "chaine") && (
      (avant.t === "ident" && avant.v.toUpperCase() === "AS")
      || (dernier.t === "ident" && !MOTS_CLES.has(dernier.v.toUpperCase())
        && (avant.t !== "op" || avant.v === ")") && !(avant.t === "ident" && MOTS_CLES.has(avant.v.toUpperCase()))));
    if (aAlias) continue;
    alias.set(b, sql.slice(e[0].pos, dernier.fin).replace(/\s+/g, " "));
  }
  return alias;
}

const echapper = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// Transforme la requête MariaDB en requête SQLite équivalente.
export function traduire(sqlMariaDB) {
  const jetons = decouper(sqlMariaDB);
  // Une seule requête : on tolère seulement un ou plusieurs ; à la fin.
  const pv = jetons.findIndex((j) => j.t === "op" && j.v === ";");
  if (pv >= 0) {
    const apres = jetons.slice(pv).filter((j) => !(j.t === "op" && j.v === ";"));
    if (apres.length) throw new ErreurSQL("Une seule requête à la fois, s'il te plaît.", "1064");
    jetons.length = pv;
  }
  if (!jetons.length) throw new ErreurSQL("La requête est vide.", "1065");

  const premier = jetons.find((j) => !(j.t === "op" && j.v === "("));
  const motPremier = premier && premier.t === "ident" ? premier.v.toUpperCase() : "";
  if (motPremier !== "SELECT") {
    if (INTERDITS_ECRITURE.has(motPremier)) {
      throw new ErreurSQL(`Interdit : seules les requêtes SELECT sont autorisées dans ce jeu (pas de ${motPremier}).`, "1142");
    }
    throw new ErreurSQL(`Une requête doit commencer par SELECT. Erreur de syntaxe près de « ${extrait(sqlMariaDB, premier)} ».`, "1064");
  }

  const alias = aliasAutomatiques(jetons, sqlMariaDB);
  const sortie = [];
  const ajouterAlias = (k) => {
    if (alias.has(k)) sortie.push('AS "' + alias.get(k).replace(/"/g, '""') + '"');
  };
  for (let k = 0; k < jetons.length; ajouterAlias(k), k++) {
    const j = jetons[k];
    const suivant = jetons[k + 1];
    const precedent = jetons[k - 1];
    const parenthese = suivant && suivant.t === "op" && suivant.v === "(";
    if (j.t === "chaine") { sortie.push(echapper(j.v)); continue; }
    if (j.t === "nombre") { sortie.push(j.v); continue; }
    if (j.t === "op") {
      if (j.v === "||") { sortie.push("OR"); continue; }
      if (j.v === "&&") { sortie.push("AND"); continue; }
      if (j.v === "<=>") { sortie.push("IS"); continue; }
      if (j.v === "::") throw new ErreurSQL("La conversion avec « :: » n'existe pas en MariaDB. Utilise CAST(valeur AS type).", "1064");
      if (j.v === ":=") throw new ErreurSQL("Les variables (:=) ne sont pas autorisées dans ce jeu.", "1064");
      // En MariaDB, 5/2 vaut 2.5 (et pas 2 comme en SQLite)
      if (j.v === "/") { sortie.push("* 1.0 /"); continue; }
      if (j.v === "!" && !(suivant && suivant.t === "op" && suivant.v === "=")) { sortie.push("NOT"); continue; }
      sortie.push(j.v);
      continue;
    }
    // Identifiants et mots-clés
    const haut = j.v.toUpperCase();
    if (j.cite) {
      if (/^sqlite_/i.test(j.v)) throw new ErreurSQL(`Table 'jeu.${j.v}' doesn't exist`, "1146");
      sortie.push('"' + j.v.replace(/"/g, '""') + '"');
      continue;
    }
    if (/^sqlite_/i.test(j.v)) throw new ErreurSQL(`Table 'jeu.${j.v}' doesn't exist`, "1146");
    if (haut === "ILIKE") throw new ErreurSQL("ILIKE n'existe pas en MariaDB : LIKE ne tient déjà pas compte des majuscules.", "1064");
    if (haut === "TOP" && precedent && precedent.v.toUpperCase() === "SELECT") {
      throw new ErreurSQL("TOP n'existe pas en MariaDB : utilise LIMIT à la fin de la requête.", "1064");
    }
    if (haut === "FETCH") throw new ErreurSQL("FETCH FIRST n'est pas utilisé ici : utilise LIMIT.", "1064");
    if (haut === "INTERVAL") throw new ErreurSQL("Les calculs avec INTERVAL ne sont pas gérés dans ce jeu. Utilise DATEDIFF ou TIMESTAMPDIFF.", "1064");
    if (INTERDITS_ECRITURE.has(haut) && !["REPLACE", "DESC", "SET"].includes(haut)) {
      throw new ErreurSQL(`Interdit : seules les requêtes SELECT sont autorisées dans ce jeu (pas de ${haut}).`, "1142");
    }
    if (haut === "MOD" && !parenthese) { sortie.push("%"); continue; }
    if (haut === "DIV") throw new ErreurSQL("DIV n'est pas géré dans ce jeu : utilise FLOOR(a / b).", "1064");
    if (haut === "RLIKE" || haut === "REGEXP") { sortie.push("REGEXP"); continue; }
    if (haut === "CURRENT_DATE" || haut === "CURRENT_TIMESTAMP") {
      sortie.push(haut === "CURRENT_DATE" ? "mdb_curdate()" : "mdb_now()");
      if (parenthese && jetons[k + 2] && jetons[k + 2].v === ")") k += 2;
      continue;
    }
    if (parenthese && !MOTS_CLES.has(haut)) {
      if (!(haut in FONCTIONS_MARIADB)) {
        throw new ErreurSQL(`FUNCTION jeu.${j.v} does not exist — la fonction ${j.v}() n'existe pas en MariaDB (ou n'est pas gérée ici).`, "1305");
      }
      const cible = FONCTIONS_MARIADB[haut];
      if (cible && ARITES[cible]) {
        const n = compterArguments(jetons, k + 1);
        if (!ARITES[cible].includes(n)) throw new ErreurSQL(`Mauvais nombre de paramètres pour la fonction ${haut}().`, "1582");
        sortie.push(`${cible}_${n}`);
        continue;
      }
      sortie.push(cible || haut);
      if (haut === "TIMESTAMPDIFF") {
        // TIMESTAMPDIFF(YEAR, a, b) : l'unité devient une chaîne
        const u = jetons[k + 2];
        if (u && u.t === "ident") {
          sortie.push("(", echapper(u.v.toUpperCase()));
          k += 2;
        }
      }
      continue;
    }
    sortie.push(j.v);
  }
  return sortie.join(" ");
}

function extrait(sql, jeton) {
  if (!jeton) return sql.slice(0, 30);
  return sql.slice(jeton.pos, jeton.pos + 30).split("\n")[0];
}

// Traduit un message d'erreur SQLite en message lisible façon MariaDB.
function messageErreur(e, requete) {
  const m = String(e.message || e);
  let r;
  if ((r = m.match(/near "(.*?)": syntax error/))) {
    const pos = requete.toLowerCase().indexOf(r[1].toLowerCase());
    const pres = pos >= 0 ? requete.slice(pos, pos + 30).split("\n")[0] : r[1];
    return new ErreurSQL(`Erreur de syntaxe près de « ${pres} ».`, "1064");
  }
  if (/incomplete input/.test(m)) return new ErreurSQL("Erreur de syntaxe : la requête est incomplète (il manque quelque chose à la fin).", "1064");
  if ((r = m.match(/no such column: (.*)/))) return new ErreurSQL(`Colonne inconnue « ${r[1]} ». Vérifie l'orthographe (clique sur ⓘ pour voir les colonnes).`, "1054");
  if ((r = m.match(/no such table: (.*)/))) return new ErreurSQL(`La table « ${r[1]} » n'existe pas. La seule table est « personnes ».`, "1146");
  if ((r = m.match(/ambiguous column name: (.*)/))) return new ErreurSQL(`La colonne « ${r[1]} » est ambiguë : précise la table (ex. p.${r[1]}).`, "1052");
  if (/misuse of aggregate/.test(m)) return new ErreurSQL("Utilisation incorrecte d'une fonction de groupe (COUNT, SUM, AVG…). Dans un filtre sur un groupe, utilise HAVING au lieu de WHERE.", "1111");
  if ((r = m.match(/wrong number of arguments to function (\w+)/))) return new ErreurSQL(`Mauvais nombre de paramètres pour la fonction ${r[1].replace(/^mdb_/, "").toUpperCase()}().`, "1582");
  if (/a GROUP BY clause is required/.test(m)) return new ErreurSQL("HAVING doit être utilisé avec GROUP BY.", "1064");
  if (/SELECTs to the left and right of UNION/.test(m)) return new ErreurSQL("Les SELECT de part et d'autre de UNION doivent avoir le même nombre de colonnes.", "1222");
  if (/no tables specified/.test(m)) return new ErreurSQL("SELECT * sans FROM : indique la table (FROM personnes).", "1096");
  return new ErreurSQL(m, "");
}

// ---------- Initialisation et exécution ----------

export async function initialiser() {
  // initSqlJs est fourni par vendor/sql-wasm.js
  SQL = await window.initSqlJs({ locateFile: (f) => `vendor/${f}` });
  db = new SQL.Database();
  // sql.js déclare chaque fonction avec fn.length paramètres : on enregistre
  // une version par nombre d'arguments possible.
  const enveloppes = [
    (f) => () => f(), (f) => (a) => f(a), (f) => (a, b) => f(a, b), (f) => (a, b, c) => f(a, b, c),
    (f) => (a, b, c, d) => f(a, b, c, d), (f) => (a, b, c, d, e) => f(a, b, c, d, e),
    (f) => (a, b, c, d, e, g) => f(a, b, c, d, e, g), (f) => (a, b, c, d, e, g, h) => f(a, b, c, d, e, g, h),
    (f) => (a, b, c, d, e, g, h, i) => f(a, b, c, d, e, g, h, i),
  ];
  // sql.js remplace une fonction déjà déclarée sous le même nom : les fonctions
  // à nombre d'arguments variable sont donc déclarées sous mdb_concat_2, _3, …
  for (const [nom, fn] of Object.entries(FONCTIONS)) {
    if (ARITES[nom]) {
      for (const n of ARITES[nom]) db.create_function(`${nom}_${n}`, enveloppes[n](fn));
    } else {
      db.create_function(nom === "mdb_regexp" ? "regexp" : nom, enveloppes[fn.length](fn));
    }
  }
  const ci = " COLLATE NOCASE";
  db.run(`CREATE TABLE personnes (
    id INTEGER PRIMARY KEY, prenom TEXT${ci}, nom TEXT${ci}, genre TEXT${ci},
    date_naissance TEXT, age INTEGER, taille REAL, cheveux TEXT${ci}, yeux TEXT${ci},
    lunettes INTEGER, barbe INTEGER, chapeau INTEGER, ville TEXT${ci}, profession TEXT${ci},
    email TEXT${ci}, animal TEXT${ci}, permis INTEGER)`);
  const ins = db.prepare("INSERT INTO personnes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const b = (v) => (v === null ? null : v ? 1 : 0);
  for (const p of PERSONNES) {
    const age = calculerAge(p.date_naissance);
    const ligne = { ...p, age, lunettes: b(p.lunettes), barbe: b(p.barbe), chapeau: b(p.chapeau), permis: b(p.permis) };
    personnesParId.set(p.id, ligne);
    ins.run([p.id, p.prenom, p.nom, p.genre, p.date_naissance, age, p.taille, p.cheveux, p.yeux,
      ligne.lunettes, ligne.barbe, ligne.chapeau, p.ville, p.profession, p.email, p.animal, ligne.permis]);
  }
  ins.free();
}

// Exécute une requête MariaDB. Renvoie { colonnes, lignes, tronque } ou lance une ErreurSQL.
export function executer(requete) {
  const sqlite = traduire(requete);
  let stmt;
  try {
    stmt = db.prepare(sqlite);
  } catch (e) {
    throw messageErreur(e, requete);
  }
  try {
    const colonnes = stmt.getColumnNames();
    const lignes = [];
    let tronque = false;
    while (stmt.step()) {
      if (lignes.length >= MAX_LIGNES) { tronque = true; break; }
      lignes.push(stmt.get());
    }
    return { colonnes, lignes, tronque };
  } catch (e) {
    throw messageErreur(e, requete);
  } finally {
    stmt.free();
  }
}

// Indice de la colonne id dans un résultat (ou -1)
export function colonneId(resultat) {
  return resultat.colonnes.findIndex((c) => c.toLowerCase() === "id");
}

// Le résultat peut-il s'afficher sous forme de personnes ?
export function idsDuResultat(resultat) {
  const k = colonneId(resultat);
  if (k < 0) return null;
  const ids = resultat.lignes.map((l) => l[k]);
  if (!ids.every((id) => personnesParId.has(Number(id)))) return null;
  return ids.map(Number);
}
