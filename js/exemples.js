// Trois questions d'exemple, utilisées seulement par le mode démo (?demo=1).
// Les vraies questions sont dans la banque Supabase, visible du prof seul.
export const EXEMPLES = [
  {
    notion: "WHERE =", consigne: "Exemple : affiche toutes les personnes qui habitent à Compiègne.",
    solution: "SELECT * FROM personnes WHERE ville = 'Compiègne';", verif: "ids", tri: "non", duree: 60,
    explication: "WHERE filtre les lignes ; le texte se met entre apostrophes.",
  },
  {
    notion: "ORDER BY", consigne: "Exemple : affiche les enfants de moins de 10 ans, du plus petit au plus grand (taille).",
    solution: "SELECT * FROM personnes WHERE age < 10 ORDER BY taille;", verif: "ids", tri: "taille", duree: 90,
    explication: "ORDER BY trie le résultat, par ordre croissant par défaut.",
  },
  {
    notion: "COUNT", consigne: "Exemple : combien de personnes ont un chien ? (un seul nombre)",
    solution: "SELECT COUNT(*) FROM personnes WHERE animal = 'chien';", verif: "valeurs", tri: "non", duree: 90,
    explication: "COUNT(*) compte les lignes restantes après le WHERE.",
  },
];
