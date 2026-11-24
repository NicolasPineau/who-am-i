# Qui est-ce ? SQL

Un jeu pour apprendre la requête `SELECT` (syntaxe **MariaDB**), pour les BTS SIO 1ʳᵉ année.

Les élèves tapent une requête SQL et voient tout de suite les personnes qu'elle renvoie, sous forme de grille de bustes ou de liste.
Le prof peut lancer une **évaluation** sur tous les postes en même temps, puis une **correction** commentée.

## Fonctionnement

- **Onglet Jeu (mode libre)** : prompt SQL (`SELECT * FROM personnes;` par défaut), bouton OK ou Ctrl + Entrée.
  - Les erreurs de syntaxe s'affichent façon MariaDB. Tout ce qui n'est pas un `SELECT` est refusé.
  - ⓘ *Structure* affiche les colonnes de la table. Un clic sur une colonne l'insère au curseur.
  - Si la requête renvoie la colonne `id`, on voit les personnes (grille ou liste). Sinon, on voit un tableau de valeurs.
  - Un clic sur une personne ouvre sa fiche complète, avec les `NULL` et les booléens.
- **Onglet Mémo SQL** : rappel de syntaxe avec des exemples à essayer.
- **Onglet Prof** :
  - banque de questions (ajout, modification, ordre), visible par le prof seulement ;
  - choix des questions et de leur durée, puis lancement sur tous les postes ;
  - suivi en direct ;
  - correction question par question, avec les stats et les erreurs fréquentes anonymes ;
  - résultats par élève (temps de réponse et nombre d'essais), avec export CSV.

**Temps de réponse** = heure de la 1ʳᵉ bonne réponse − heure d'affichage de la question sur le poste de l'élève.
Les deux heures sont prises sur le même poste.

Les questions s'enchaînent automatiquement à la fin du chrono, même si la page du prof est fermée.

## Technique

- 100 % statique : hébergeable sur **GitHub Pages**.
- Moteur SQL : SQLite compilé en WebAssembly ([sql.js](https://github.com/sql-js/sql.js)), qui tourne dans le navigateur.
  - Les requêtes sont réécrites pour se comporter comme MariaDB : `"texte"` est une chaîne, `||` vaut `OR`, `5/2` vaut 2.5, `IF()`, `CONCAT()`, `YEAR()`, `DATE_FORMAT()`, `TIMESTAMPDIFF()`…
  - Ce qui n'existe pas en MariaDB (`ILIKE`, `::`, `TOP`…) est refusé.
- Synchronisation de la classe : [Supabase](https://supabase.com) (base de données + temps réel, offre gratuite).
- Aucune dépendance à installer : les bibliothèques sont dans `vendor/`.

| Fichier | Rôle |
|---|---|
| `js/data.js` | Les 60 personnes (généré par `tools/generer_personnes.py`) |
| `js/empreinte.js` | Empreinte (hash) d'un résultat, pour la correction côté serveur |
| `js/moteur.js` | Moteur SQL « façon MariaDB » |
| `js/avatar.js` | Dessin des bustes en SVG |
| `js/config.js` | URL et clé publique Supabase |
| `supabase/schema.sql` | Tables et droits à créer dans Supabase |

## Installation

1. **Supabase** :
   - créer un projet et exécuter `supabase/schema.sql` dans le *SQL Editor* ;
   - ajouter des questions dans l'onglet Prof, ou importer un fichier de questions par le *SQL Editor* ;
   - créer le compte prof (*Authentication → Users → Add user*, cocher *Auto Confirm*) ;
   - désactiver les inscriptions (*Authentication → Sign In / Providers → Allow new users to sign up*).
2. Copier la *Project URL* et la clé *anon / publishable* dans `js/config.js`. Ne jamais y mettre la clé `service_role`.
3. **GitHub Pages** : *Settings → Pages → Deploy from a branch → `main` / `(root)`*.

Le site sera à l'adresse `https://<utilisateur>.github.io/who-am-i/`.

### Tester sans Supabase

Ajouter `?demo=1` à l'adresse et ouvrir deux onglets du même navigateur : l'un pour le prof (mot de passe `demo`), l'autre pour un élève.

En local :

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000/?demo=1.

## Sécurité des questions

- Les questions et leurs solutions sont dans Supabase (table `banque`). Elles ne sont lisibles que par le prof connecté, jamais dans le code public.
- Au lancement, le poste du prof calcule une **empreinte** (hash SHA-256) du résultat attendu de chaque question.
- L'élève envoie l'empreinte du résultat de sa requête, et c'est **le serveur qui décide** si c'est juste. L'élève ne peut ni lire la solution, ni se déclarer juste depuis la console.
- Une consigne n'est visible qu'à partir du moment où sa question s'affiche. Une solution n'est visible que pendant la correction.

## Limites connues

- Comparaisons de texte : insensibles à la casse, comme MariaDB, mais seulement pour les lettres sans accent.
- Les requêtes sont exécutées par le navigateur avec SQLite : quelques fonctions MariaDB rares ne sont pas gérées (`INTERVAL`, `DIV`…). Un message le dit clairement.
