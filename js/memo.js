// Onglet « Mémo SQL » : rappel de syntaxe MariaDB avec des exemples à essayer.
import { esc } from "./util.js";

const FICHES = [
  {
    titre: "Lire une table",
    texte: "SELECT choisit les colonnes, FROM la table. * = toutes les colonnes.",
    ex: ["SELECT * FROM personnes;", "SELECT prenom, nom, age FROM personnes;"],
  },
  {
    titre: "Filtrer avec WHERE",
    texte: "Comparaisons : =  <>  !=  <  >  <=  >=. Le texte et les dates se mettent entre apostrophes.",
    ex: ["SELECT * FROM personnes WHERE ville = 'Paris';", "SELECT * FROM personnes WHERE taille >= 1.80;"],
  },
  {
    titre: "Combiner : AND, OR, NOT",
    texte: "AND est prioritaire sur OR : mets des parenthèses pour être sûr de ce que tu demandes.",
    ex: ["SELECT * FROM personnes WHERE genre = 'M' AND lunettes = TRUE;", "SELECT * FROM personnes WHERE (yeux = 'bleu' OR yeux = 'vert') AND age < 18;"],
  },
  {
    titre: "BETWEEN et IN",
    texte: "BETWEEN a AND b inclut les bornes. IN (…) teste une liste de valeurs.",
    ex: ["SELECT * FROM personnes WHERE age BETWEEN 13 AND 17;", "SELECT * FROM personnes WHERE animal IN ('chat', 'chien');"],
  },
  {
    titre: "LIKE : chercher dans le texte",
    texte: "% = n'importe quelle suite de caractères, _ = exactement un caractère. LIKE ne tient pas compte des majuscules.",
    ex: ["SELECT * FROM personnes WHERE nom LIKE 'B%';", "SELECT * FROM personnes WHERE prenom LIKE '_a%';"],
  },
  {
    titre: "NULL : la valeur absente",
    texte: "NULL veut dire « pas de valeur / inconnu ». On le teste avec IS NULL ou IS NOT NULL, jamais avec =.",
    ex: ["SELECT * FROM personnes WHERE profession IS NULL;", "SELECT * FROM personnes WHERE email = NULL;  -- ne renvoie jamais rien !"],
  },
  {
    titre: "BOOLEAN",
    texte: "En MariaDB, un BOOLEAN est un nombre : 1 (TRUE) ou 0 (FALSE). Il peut aussi être NULL.",
    ex: ["SELECT * FROM personnes WHERE chapeau = TRUE;", "SELECT * FROM personnes WHERE NOT barbe AND genre = 'M';"],
  },
  {
    titre: "Trier et limiter",
    texte: "ORDER BY colonne ASC (croissant) ou DESC (décroissant). LIMIT n garde les n premières lignes.",
    ex: ["SELECT * FROM personnes ORDER BY age DESC;", "SELECT * FROM personnes ORDER BY taille LIMIT 3;"],
  },
  {
    titre: "Fonctions sur les dates",
    texte: "YEAR(), MONTH(), DAY(), CURDATE(), DATEDIFF(), TIMESTAMPDIFF(YEAR, d1, d2), DATE_FORMAT().",
    ex: ["SELECT prenom, YEAR(date_naissance) FROM personnes;", "SELECT prenom, DATE_FORMAT(date_naissance, '%d/%m/%Y') AS naissance FROM personnes;"],
  },
  {
    titre: "Fonctions sur le texte",
    texte: "CONCAT(), UPPER(), LOWER(), LENGTH(), LEFT(), SUBSTRING()… AS donne un nom (alias) à une colonne.",
    ex: ["SELECT CONCAT(prenom, ' ', UPPER(nom)) AS nom_complet FROM personnes;", "SELECT prenom, LENGTH(prenom) AS lettres FROM personnes;"],
  },
  {
    titre: "Compter et calculer",
    texte: "COUNT(*), SUM(), AVG(), MIN(), MAX(). ROUND(x, 2) arrondit à 2 décimales.",
    ex: ["SELECT COUNT(*) FROM personnes WHERE ville = 'Lyon';", "SELECT ROUND(AVG(age), 1) AS age_moyen FROM personnes;"],
  },
  {
    titre: "Regrouper : GROUP BY, HAVING",
    texte: "GROUP BY fait des paquets ; HAVING filtre les paquets (WHERE filtre les lignes avant).",
    ex: ["SELECT yeux, COUNT(*) AS nb FROM personnes GROUP BY yeux;", "SELECT ville, COUNT(*) AS nb FROM personnes GROUP BY ville HAVING nb >= 8;"],
  },
  {
    titre: "Sans doublon : DISTINCT",
    texte: "DISTINCT supprime les lignes identiques du résultat.",
    ex: ["SELECT DISTINCT cheveux FROM personnes;"],
  },
  {
    titre: "Afficher les personnes",
    texte: "Pour voir les bustes, la requête doit renvoyer la colonne id. Sinon, on voit un tableau de valeurs.",
    ex: ["SELECT id, prenom FROM personnes WHERE age < 3;", "SELECT prenom FROM personnes WHERE age < 3;"],
  },
];

export function rendreMemo(conteneur, ctx) {
  conteneur.innerHTML = `
    <p class="memo-intro">Rappel de la syntaxe <b>MariaDB</b>. Clique sur « Essayer » pour lancer un exemple dans l'onglet Jeu.</p>
    <div class="memo-grille">${FICHES.map((f) => `
      <article class="memo-carte">
        <h3>${esc(f.titre)}</h3>
        <p>${esc(f.texte)}</p>
        ${f.ex.map((e) => `<div class="memo-ex"><pre class="code">${esc(e)}</pre><button data-sql="${esc(e)}">Essayer</button></div>`).join("")}
      </article>`).join("")}
    </div>`;
  conteneur.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sql]");
    if (b && !b.disabled) ctx.essayer(b.dataset.sql);
  });
  // Pendant une évaluation, on ne lance pas les exemples (le mémo reste lisible).
  ctx.ecouteurs.push((etat, raison) => {
    if (raison !== "etat") return;
    const bloque = etat.mode === "evaluation";
    conteneur.querySelectorAll("button[data-sql]").forEach((b) => {
      b.disabled = bloque;
      b.title = bloque ? "Désactivé pendant l'évaluation" : "";
    });
  });
}
