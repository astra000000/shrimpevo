# ShrimpEvo

Simulation d'évolution de crevettes (Neocaridina / Caridina) en aquarium ou en bassin extérieur.

## Lancer

Double-clic sur `index.html` (Opera, Chrome, Firefox). Tout est local, sauf la police pixel (Google Fonts).
Les sauvegardes sont dans le navigateur (localStorage) : même navigateur = même partie.

## Contrôles

- Clic gauche + glisser : tourner · clic droit / Maj + glisser : se déplacer · molette : zoom
- Clic sur une crevette : fiche génétique · 🎥 Suivre : la caméra la suit
- Espace : pause · touches 1 à 5 : vitesses (pause, ×1, ×10, ×100, ×1000) · Échap : désélectionner
- ×1 = 1 heure de jeu par seconde. Pause automatique sur les événements graves.

## Modes

- **Normal** : vitesse réglable, événements optionnels, taux de mutation réglable, export/import.
- **Hardcore** : temps réel strict (le bac vit même jeu fermé), vraie date et vraies saisons,
  une seule sauvegarde, pannes et maladies, colonie éteinte = partie perdue.

## Génétique

18 gènes quantitatifs : couleur (teinte, saturation, densité, mélanine), motifs (ligne dorsale,
bandes, mouchetures, rili), tolérances (T°, pH, GH : optimum + largeur), vie (taille, longévité,
fertilité, croissance). Bébé = moyenne des parents + variation ; macro-mutations rares.
Sélection : eau inadaptée (stress, mues ratées, pas de ponte), prédateurs qui repèrent les
juvéniles visibles sur le fond, coût du généralisme sur la fertilité.

## Dev

`tools/headless.html?sc=aqua|fish|pond|newtank&days=N` : simulation sans rendu pour l'équilibrage
(à servir en HTTP, ex. `py -m http.server`).
