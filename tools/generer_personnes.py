#!/usr/bin/env python3
"""Génère js/data.js : la table `personnes` du jeu.

Le tirage est déterministe (graine fixe) : relancer le script redonne
exactement les mêmes personnes. Usage : python3 tools/generer_personnes.py
"""
import datetime as dt
import json
import random
from pathlib import Path

random.seed(2026)
REF = dt.date(2026, 11, 24)  # date de référence pour viser les âges voulus

# Prénoms par génération (jeune < 30 ans, adulte 30-59, âgé 60+), pour rester crédible.
PRENOMS = {
    ("F", "jeune"): ["Emma", "Louise", "Alice", "Chloé", "Léa", "Manon", "Inès", "Jade", "Lina",
                     "Zoé", "Mila", "Rose", "Ambre", "Maëlle", "Amina", "Clara", "Anna", "Lou"],
    ("F", "adulte"): ["Julie", "Sarah", "Camille", "Aurélie", "Nathalie", "Sophie", "Isabelle",
                      "Fatou", "Mei", "Céline", "Laure", "Sandrine"],
    ("F", "age"): ["Christine", "Martine", "Monique", "Jeanne", "Simone", "Yvette", "Odette",
                   "Hélène", "Colette", "Germaine", "Suzanne", "Paulette", "Marie"],
    ("M", "jeune"): ["Lucas", "Hugo", "Louis", "Gabriel", "Léo", "Arthur", "Jules", "Adam",
                     "Nathan", "Tom", "Noah", "Mathis", "Yanis", "Raphaël", "Ethan", "Sacha"],
    ("M", "adulte"): ["Thomas", "Nicolas", "Julien", "Maxime", "Antoine", "Karim", "Wei",
                      "Moussa", "Sébastien", "David", "Olivier", "Vincent"],
    ("M", "age"): ["Pierre", "Philippe", "Michel", "Alain", "Bernard", "Jean", "Marcel", "René",
                   "Gérard", "André", "Robert", "Lucien", "Paul"],
}
NOMS = ["Martin", "Bernard", "Dubois", "Durand", "Lefebvre", "Leroy", "Moreau", "Simon",
        "Laurent", "Michel", "Garcia", "Roux", "Fournier", "Girard", "Bonnet", "Dupont",
        "Lambert", "Fontaine", "Rousseau", "Vincent", "Muller", "Mercier", "Boyer", "Blanc",
        "Guerin", "Chevalier", "Robin", "Masson", "Diallo", "Nguyen", "Benali", "Lemoine",
        "Gauthier", "Perrin", "Morin", "Renard", "Carpentier", "Olivier", "Picard", "Texier"]
VILLES = ["Paris", "Lyon", "Marseille", "Lille", "Compiègne", "Bordeaux", "Nantes", "Beauvais"]
# (masculin, féminin)
PROFESSIONS = [("Infirmier", "Infirmière"), ("Développeur", "Développeuse"),
               ("Boulanger", "Boulangère"), ("Professeur", "Professeure"),
               ("Comptable", "Comptable"), ("Plombier", "Plombière"), ("Médecin", "Médecin"),
               ("Vendeur", "Vendeuse"), ("Électricien", "Électricienne"),
               ("Avocat", "Avocate"), ("Chauffeur", "Chauffeuse"), ("Coiffeur", "Coiffeuse"),
               ("Agriculteur", "Agricultrice"), ("Architecte", "Architecte"),
               ("Pharmacien", "Pharmacienne"), ("Journaliste", "Journaliste"),
               ("Mécanicien", "Mécanicienne"), ("Graphiste", "Graphiste"),
               ("Policier", "Policière"), ("Cuisinier", "Cuisinière"),
               ("Secrétaire", "Secrétaire"), ("Ingénieur", "Ingénieure")]
ANIMAUX = ["chat", "chien", "lapin", "poisson", "perroquet", "hamster", "tortue"]
YEUX = ["marron", "marron", "marron", "bleu", "bleu", "vert", "noir", "gris"]

# Âges visés (en années, ou fractions pour les bébés) : de 1 mois à 100 ans.
AGES = [1/12, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        22, 23, 25, 27, 28, 30, 31, 33, 35, 36, 38, 40, 41, 43, 45, 47, 50, 52, 55, 57,
        60, 62, 64, 66, 68, 70, 72, 75, 77, 79, 81, 84, 86, 88, 90, 93, 96, 100]


def naissance(age_annees):
    jours = int(age_annees * 365.25) + random.randint(5, 300 if age_annees >= 1 else 10)
    if age_annees < 1:
        jours = int(age_annees * 365.25)
    return REF - dt.timedelta(days=jours)


def taille(age, genre):
    if age < 1:
        t = 0.54 + age * 0.22
    elif age < 18:
        t = 0.75 + age * 0.058 + (0.04 if genre == "M" and age > 13 else 0)
    else:
        t = random.gauss(1.78 if genre == "M" else 1.65, 0.07)
        if age > 75:
            t -= 0.04
    return round(min(max(t, 0.50), 2.05), 2)


def cheveux(age):
    if age >= 75:
        return random.choice(["blanc", "blanc", "gris", "chauve"])
    if age >= 55:
        return random.choice(["gris", "gris", "blanc", "chatain", "brun", "chauve"])
    return random.choice(["brun", "brun", "chatain", "chatain", "blond", "noir", "noir", "roux"])


def sans_accent(s):
    table = str.maketrans("éèêëàâäîïôöùûüçÉÈ", "eeeeaaaiioouuucEE")
    return s.translate(table)


personnes = []
genres = ["F", "M"] * 30
random.shuffle(genres)
prenoms_dispo = {k: v[:] for k, v in PRENOMS.items()}
for lst in prenoms_dispo.values():
    random.shuffle(lst)
noms_dispo = NOMS[:]
random.shuffle(noms_dispo)
dates_utilisees = set()

for i, age_vise in enumerate(AGES):
    g = genres[i]
    gen = "jeune" if age_vise < 30 else "adulte" if age_vise < 60 else "age"
    prenom = prenoms_dispo[(g, gen)].pop()
    nom = noms_dispo[i % len(noms_dispo)]
    d = naissance(age_vise)
    while d in dates_utilisees:
        d -= dt.timedelta(days=1)
    dates_utilisees.add(d)
    age = int(age_vise)

    ch = cheveux(age)
    if g == "F" and ch == "chauve":
        ch = "blanc"
    if age < 2:
        ch = random.choice(["blond", "chatain", "brun"])

    if g == "F":
        coiffure = random.choice(["long", "long", "carre", "chignon", "queue", "boucle"])
    else:
        coiffure = random.choice(["court", "court", "court", "boucle", "herisse"])
    if ch == "chauve":
        coiffure = "chauve"
    if age < 2:
        coiffure = "bebe"
    elif age < 10 and g == "F":
        coiffure = random.choice(["couettes", "queue", "long"])

    lunettes = random.random() < (0.15 if age < 18 else 0.35 if age < 55 else 0.7)
    barbe = g == "M" and age >= 18 and random.random() < 0.45
    chapeau = age >= 2 and random.random() < 0.15

    profession = None
    if 22 <= age <= 64 and random.random() < 0.85:
        profession = random.choice(PROFESSIONS)[0 if g == "M" else 1]
    elif age > 64:
        profession = "Retraité" if g == "M" else "Retraitée"
    elif 18 <= age < 22:
        profession = random.choice(["Étudiant" if g == "M" else "Étudiante", None])
    elif 6 <= age < 18:
        profession = None  # élève : pas de profession

    email = None
    if age >= 13 and random.random() < (0.9 if age < 70 else 0.45):
        domaine = random.choice(["gmail.com", "orange.fr", "free.fr", "laposte.net", "yahoo.fr"])
        email = f"{sans_accent(prenom).lower()}.{sans_accent(nom).lower()}@{domaine}"

    animal = random.choice(ANIMAUX) if random.random() < 0.4 else None

    if age < 18:
        permis = False
    elif random.random() < 0.12:
        permis = None  # non renseigné
    else:
        permis = random.random() < (0.85 if age < 85 else 0.5)

    personnes.append({
        "id": 0,
        "prenom": prenom,
        "nom": nom,
        "genre": g,
        "date_naissance": d.isoformat(),
        "taille": taille(age_vise, g),
        "cheveux": ch,
        "yeux": random.choice(YEUX),
        "lunettes": lunettes,
        "barbe": barbe,
        "chapeau": chapeau,
        "ville": random.choice(VILLES),
        "profession": profession,
        "email": email,
        "animal": animal,
        "permis": permis,
        # Infos purement visuelles (pas dans la table SQL)
        "_peau": random.randint(0, 5),
        "_coiffure": coiffure,
        "_haut": random.randint(0, 7),
        "_fond": random.randint(0, 7),
    })

# Mélange pour que les id ne suivent pas l'âge
random.shuffle(personnes)
for i, p in enumerate(personnes, start=1):
    p["id"] = i

out = Path(__file__).resolve().parent.parent / "js" / "data.js"
lignes = ",\n  ".join(json.dumps(p, ensure_ascii=False) for p in personnes)
out.write_text(
    "// Fichier généré par tools/generer_personnes.py — ne pas modifier à la main.\n"
    "// Les champs qui commencent par _ servent seulement au dessin des bustes.\n"
    f"export const PERSONNES = [\n  {lignes}\n];\n",
    encoding="utf-8",
)
print(f"{len(personnes)} personnes écrites dans {out}")
