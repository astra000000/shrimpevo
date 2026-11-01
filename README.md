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

- **Carrière** : temps réel ×24 (1 h réelle = 1 jour), le monde vit jeu fermé. Départ avec
  400 Shrimp Coin (SC) seulement : boutique (bacs, matériel, plantes, souches), paramètres de l'eau cachés
  (bandelettes gratuites, gouttes, sondes), marché avec éleveurs simulés et ventes à prix libre,
  bestiaire des souches.
- **Bac à sable** : tout gratuit et visible, vitesse réglable, plusieurs bacs, export/import.
- **Hardcore** : temps réel 1:1, vraie date et vraies saisons, une seule sauvegarde,
  plus aucune crevette = partie perdue.

## Génétique (mendélienne)

- 10 locus à 2 allèles : rouge, jaune, bleu, vert, noir, blanc (récessifs), bandes et rili
  (dominance partielle), ligne dorsale (dominante), mouchetures (récessif).
  Red × Blue → F1 sauvage (porteurs), les couleurs ressortent en F2 ; rouge + bleu → violet.
- Traits polygéniques (allèles additifs) : densité, mélanine, nuance, largeur des motifs,
  tolérances T°/pH/GH, taille, longévité, fertilité, croissance.
- Mutations rares, souvent cachées (porteurs) ; les crevettes d'animalerie portent parfois des gènes cachés.
- Sélection : eau inadaptée (stress, mues ratées, pas de ponte), prédateurs qui repèrent les
  juvéniles visibles, coût du généralisme sur la fertilité.

## Bac

- 14 sols (sable de Loire, quartz, pouzzolane, akadama, soil actif/neutre, corallien qui durcit l'eau, catappa et ses tanins…).
- 40 plantes en 7 familles (mousses, tiges, rubans, rosettes, épiphytes, gazons, flottantes) ; les exigeantes poussent à peine sans CO2.
- Cycle de l'azote affiché (phase, avancement, temps restant estimé) ; ensemencement depuis un bac mûr
  (seau d'eau, jus du filtre, substrat + mousse — ce dernier peut amener planaires et hydres).
- Nourriture visible : les crevettes viennent la manger.
- Ambiance : plantes qui ondulent avec le courant du filtre, cascade à la sortie du filtre externe,
  caustiques sur le sol, particules en suspension, rayons de lumière, mues qui restent au sol.

## Plusieurs bacs

Onglet Sélection : filtres (phénotype, stade, sexe, souche), épuisette, transfert direct ou au
goutte-à-goutte (3 h, ~90 % de choc en moins). Les achats arrivent en colis à acclimater sous ~3 jours.

## Marché en ligne (plus tard)

`js/economy.js` : `listings`, `buyListing`, `sell` et `salesTick` sont le point de branchement
d'un futur serveur partagé ; aujourd'hui acheteurs et éleveurs sont simulés.

## Dev

`tools/headless.html?sc=aqua|fish|pond|newtank&days=N` : simulation sans rendu pour l'équilibrage
(à servir en HTTP, ex. `py -m http.server`).
