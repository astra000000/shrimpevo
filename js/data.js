'use strict';
// Données statiques : gènes, espèces, variétés, plantes, sols, eaux.

const GENES = {
  hue:    { min: 0,   max: 360,  sd: 5,    circ: true, label: 'Teinte', group: 'couleur' },
  sat:    { min: 0,   max: 1,    sd: .035, label: 'Saturation', group: 'couleur' },
  dens:   { min: .05, max: 1,    sd: .035, label: 'Densité pigment', group: 'couleur' },
  dark:   { min: 0,   max: 1,    sd: .03,  label: 'Mélanine', group: 'couleur' },
  stripe: { min: 0,   max: 1,    sd: .025, label: 'Ligne dorsale', group: 'motif' },
  bands:  { min: 0,   max: 1,    sd: .025, label: 'Bandes blanches', group: 'motif' },
  spots:  { min: 0,   max: 1,    sd: .025, label: 'Mouchetures', group: 'motif' },
  rili:   { min: 0,   max: 1,    sd: .025, label: 'Rili (transparence)', group: 'motif' },
  tOpt:   { min: 8,   max: 34,   sd: .35,  label: 'T° optimale', unit: '°C', group: 'eau' },
  tTol:   { min: 1,   max: 10,   sd: .15,  label: 'Tolérance T°', unit: '±°C', group: 'eau' },
  phOpt:  { min: 5,   max: 8.8,  sd: .04,  label: 'pH optimal', group: 'eau' },
  phTol:  { min: .2,  max: 2,    sd: .03,  label: 'Tolérance pH', unit: '±', group: 'eau' },
  ghOpt:  { min: 1,   max: 25,   sd: .3,   label: 'GH optimal', unit: '°dGH', group: 'eau' },
  ghTol:  { min: 1,   max: 12,   sd: .15,  label: 'Tolérance GH', unit: '±', group: 'eau' },
  size:   { min: 14,  max: 42,   sd: .5,   label: 'Taille adulte', unit: 'mm', group: 'vie' },
  life:   { min: 180, max: 1000, sd: 10,   label: 'Longévité', unit: 'j', group: 'vie' },
  fert:   { min: .3,  max: 2.5,  sd: .04,  label: 'Fertilité', group: 'vie' },
  growth: { min: .4,  max: 2.2,  sd: .035, label: 'Croissance', group: 'vie' },
};
const GENE_KEYS = Object.keys(GENES);
const VISUAL_GENES = ['hue', 'sat', 'dens', 'dark', 'stripe', 'bands', 'spots', 'rili'];

// Base physiologique par genre (les variétés ne changent que l'apparence)
const GENERA = {
  neo: {
    name: 'Neocaridina davidi', short: 'Neocaridina',
    base: { tOpt: 23, tTol: 6, phOpt: 7.3, phTol: .9, ghOpt: 10, ghTol: 6, size: 28, life: 520, fert: 1, growth: 1 },
    clutch: 24, gestation: 28,
  },
  car: {
    name: 'Caridina cantonensis', short: 'Caridina',
    base: { tOpt: 22, tTol: 3.5, phOpt: 6.3, phTol: .55, ghOpt: 5, ghTol: 2.5, size: 25, life: 560, fert: .85, growth: .9 },
    clutch: 22, gestation: 30,
  },
};

// ---------- Génétique mendélienne ----------
// Couleurs et motifs : un locus = 2 allèles, '+' = type sauvage.
// rec : visible seulement en double dose · inc : dominance partielle (1 dose = moitié) · dom : 1 dose suffit
const LOCI = [
  { k: 'R', mut: 'r', mode: 'rec', label: 'Rouge' },
  { k: 'Y', mut: 'y', mode: 'rec', label: 'Jaune' },
  { k: 'B', mut: 'b', mode: 'rec', label: 'Bleu' },
  { k: 'G', mut: 'g', mode: 'rec', label: 'Vert jade' },
  { k: 'K', mut: 'k', mode: 'rec', label: 'Noir' },
  { k: 'W', mut: 'w', mode: 'rec', label: 'Blanc (snowball)' },
  { k: 'N', mut: 'N', mode: 'inc', label: 'Bandes crystal' },
  { k: 'L', mut: 'L', mode: 'inc', label: 'Rili' },
  { k: 'S', mut: 'S', mode: 'dom', label: 'Ligne dorsale' },
  { k: 'M', mut: 'm', mode: 'rec', label: 'Mouchetures' },
];
// Traits polygéniques : n locus × 2 allèles numériques additifs.
// mean : phénotype = moyenne des allèles (0..1) · sinon : somme des allèles ajoutée à la base du genre.
const POLY = [
  { k: 'dens',   n: 3, sd: .03,  init: .05, min: 0,    max: 1,   mean: true, label: 'Densité pigment' },
  { k: 'dark',   n: 2, sd: .03,  init: .05, min: 0,    max: 1,   mean: true, label: 'Mélanine' },
  { k: 'hueS',   n: 2, sd: 1.5,  init: 2,   min: -25,  max: 25,  label: 'Nuance' },
  { k: 'bandW',  n: 2, sd: .03,  init: .08, min: 0,    max: 1,   mean: true, label: 'Largeur des motifs' },
  { k: 'tOpt',   n: 4, sd: .1,   init: .35, min: -4,   max: 4,   label: 'T° optimale' },
  { k: 'tTol',   n: 2, sd: .06,  init: .2,  min: -2.5, max: 2.5, label: 'Tolérance T°' },
  { k: 'phOpt',  n: 3, sd: .015, init: .06, min: -.6,  max: .6,  label: 'pH optimal' },
  { k: 'phTol',  n: 2, sd: .01,  init: .03, min: -.25, max: .4,  label: 'Tolérance pH' },
  { k: 'ghOpt',  n: 3, sd: .12,  init: .4,  min: -3,   max: 3,   label: 'GH optimal' },
  { k: 'ghTol',  n: 2, sd: .06,  init: .25, min: -2,   max: 2.5, label: 'Tolérance GH' },
  { k: 'size',   n: 2, sd: .25,  init: .6,  min: -5,   max: 5,   label: 'Taille' },
  { k: 'life',   n: 2, sd: 5,    init: 15,  min: -120, max: 150, label: 'Longévité' },
  { k: 'fert',   n: 2, sd: .02,  init: .05, min: -.3,  max: .4,  label: 'Fertilité' },
  { k: 'growth', n: 2, sd: .015, init: .04, min: -.3,  max: .4,  label: 'Croissance' },
];
// Teinte selon les pigments homozygotes présents (r rouge, y jaune, b bleu, g vert)
const PIGMENT_HUE = { r: 356, y: 52, b: 222, g: 125, ry: 24, rb: 272, yb: 155, rg: 40, yg: 88, bg: 185 };

// Souches d'animalerie : génotype de base + cibles polygéniques. price en Shrimp Coin par individu.
const VARIETIES = {
  neo_wild:   { genus: 'neo', name: 'Sauvage',       loci: {},                    poly: { dens: .4 },  price: 1 },
  neo_cherry: { genus: 'neo', name: 'Red Cherry',    loci: { R: 'rr' },           poly: { dens: .5 },  price: 3 },
  neo_yellow: { genus: 'neo', name: 'Yellow',        loci: { Y: 'yy' },           poly: { dens: .58 }, price: 3 },
  neo_blue:   { genus: 'neo', name: 'Blue Dream',    loci: { B: 'bb' },           poly: { dens: .78, dark: .35 }, price: 4 },
  neo_green:  { genus: 'neo', name: 'Green Jade',    loci: { G: 'gg' },           poly: { dens: .62, dark: .25 }, price: 4 },
  neo_orange: { genus: 'neo', name: 'Orange Sakura', loci: { R: 'rr', Y: 'yy' },  poly: { dens: .68 }, price: 5 },
  neo_black:  { genus: 'neo', name: 'Black Rose',    loci: { K: 'kk' },           poly: { dens: .88 }, price: 6 },
  neo_snow:   { genus: 'neo', name: 'Snowball',      loci: { W: 'ww' },           poly: { dens: .85 }, price: 5 },
  neo_rili:   { genus: 'neo', name: 'Red Rili',      loci: { R: 'rr', L: 'LL' },  poly: { dens: .72 }, price: 6 },
  car_wild:   { genus: 'car', name: 'Sauvage',       loci: { M: 'mm' },           poly: { dens: .35 }, price: 4 },
  car_crs:    { genus: 'car', name: 'Crystal Red',   loci: { R: 'rr', N: 'NN' },  poly: { dens: .85, bandW: .45 }, price: 10 },
  car_cbs:    { genus: 'car', name: 'Crystal Black', loci: { K: 'kk', N: 'NN' },  poly: { dens: .88, bandW: .45 }, price: 12 },
  car_bolt:   { genus: 'car', name: 'Blue Bolt',     loci: { B: 'bb', S: 'SS' },  poly: { dens: .93, dark: .05, bandW: .6 }, price: 25 },
};

// Plantes. r : croissance/jour, up : absorption azote (mg N/L/h à couverture 1), cover : refuge pour juvéniles,
// dem : exigence (0 facile … 1 : pousse à peine sans CO2), price en Shrimp Coin, look : rendu 3D.
const PLANT_CATS = ['Mousses', 'Tiges', 'Rubans', 'Rosettes', 'Épiphytes', 'Gazons', 'Flottantes'];
const PLANTS = {
  // Mousses
  moss:      { cat: 'Mousses', name: 'Mousse de Java', price: 8, r: .06, up: .006, cover: 1.0, o2: .3, tMin: 4, tMax: 30, biofilm: 1.5, look: { shape: 'moss', c: [.16, .3, .1] } },
  christmas: { cat: 'Mousses', name: 'Mousse Christmas', price: 10, r: .05, up: .005, cover: 1.0, o2: .3, tMin: 15, tMax: 28, biofilm: 1.6, look: { shape: 'moss', c: [.12, .36, .1], s: .8 } },
  weeping:   { cat: 'Mousses', name: 'Mousse pleureuse', price: 11, r: .05, up: .005, cover: .9, o2: .3, tMin: 12, tMax: 28, biofilm: 1.5, look: { shape: 'moss', c: [.18, .38, .12], s: 1.15 } },
  flame:     { cat: 'Mousses', name: 'Mousse Flame', price: 12, r: .045, up: .005, cover: .7, o2: .3, tMin: 15, tMax: 28, biofilm: 1.4, look: { shape: 'stem', c: [.1, .28, .08], ny: 3, len: .6, wid: .3, h: [.1, .12], nStem: 18 } },
  subwass:   { cat: 'Mousses', name: 'Subwassertang', price: 9, r: .05, up: .005, cover: .9, o2: .3, tMin: 15, tMax: 30, biofilm: 1.4, look: { shape: 'moss', c: [.22, .4, .12], s: 1.3 } },
  marimo:    { cat: 'Mousses', name: 'Boule de Marimo', price: 6, r: .01, up: .002, cover: .1, o2: .2, tMin: 2, tMax: 28, biofilm: 1.2, look: { shape: 'ball', c: [.12, .32, .1], n: 5, size: 1.6 } },
  // Plantes à tiges
  hygro:     { cat: 'Tiges', name: 'Hygrophila polysperma', price: 6, r: .22, up: .02, cover: .4, o2: 1, tMin: 14, tMax: 30, biofilm: .5, look: { shape: 'stem', c: [.3, .55, .17], ny: 2, len: 1.8, wid: .45 } },
  egeria:    { cat: 'Tiges', name: 'Élodée dense', price: 4, r: .2, up: .02, cover: .6, o2: 1.2, tMin: 3, tMax: 27, biofilm: .6, look: { shape: 'stem', c: [.18, .5, .12], ny: 4, len: 1.1, wid: .18 } },
  cerato:    { cat: 'Tiges', name: 'Cornifle (Ceratophyllum)', price: 3, r: .25, up: .025, cover: .7, o2: 1.2, tMin: 2, tMax: 30, biofilm: .5, look: { shape: 'stem', c: [.12, .38, .1], ny: 6, len: 1.2, wid: .1, h: [.6, .4] } },
  limno:     { cat: 'Tiges', name: 'Limnophila sessiliflora', price: 5, r: .22, up: .02, cover: .6, o2: 1, tMin: 16, tMax: 30, biofilm: .5, look: { shape: 'stem', c: [.35, .62, .2], ny: 5, len: 1.3, wid: .12 } },
  cabomba:   { cat: 'Tiges', name: 'Cabomba caroliniana', price: 6, r: .18, up: .015, cover: .5, o2: .9, tMin: 18, tMax: 28, biofilm: .5, dem: .3, look: { shape: 'stem', c: [.3, .6, .2], ny: 6, len: 1.4, wid: .1 } },
  bacopa:    { cat: 'Tiges', name: 'Bacopa caroliniana', price: 6, r: .1, up: .01, cover: .3, o2: .7, tMin: 15, tMax: 30, biofilm: .4, look: { shape: 'stem', c: [.35, .55, .2], ny: 2, len: 1, wid: .55 } },
  rotala:    { cat: 'Tiges', name: 'Rotala rotundifolia', price: 7, r: .2, up: .018, cover: .5, o2: .9, tMin: 18, tMax: 30, biofilm: .5, dem: .4, look: { shape: 'stem', c: [.35, .55, .2], c2: [.85, .4, .3], ny: 4, len: .8, wid: .2 } },
  ludwigia:  { cat: 'Tiges', name: 'Ludwigia repens Rubin', price: 7, r: .15, up: .015, cover: .4, o2: .8, tMin: 15, tMax: 30, biofilm: .4, dem: .4, look: { shape: 'stem', c: [.45, .3, .2], c2: [.75, .18, .15], ny: 2, len: 1.3, wid: .5 } },
  alter:     { cat: 'Tiges', name: 'Alternanthera reineckii', price: 9, r: .08, up: .01, cover: .3, o2: .6, tMin: 20, tMax: 30, biofilm: .4, dem: .7, look: { shape: 'stem', c: [.55, .2, .25], c2: [.85, .25, .4], ny: 2, len: 1.5, wid: .45 } },
  // Rubans
  vallis:    { cat: 'Rubans', name: 'Vallisnérie spiralis', price: 6, r: .14, up: .012, cover: .5, o2: .7, tMin: 10, tMax: 31, biofilm: .6, look: { shape: 'ribbon', c: [.3, .6, .2], n: 70, w: .5, h: [.6, .4], wave: .25 } },
  vgiant:    { cat: 'Rubans', name: 'Vallisnérie géante', price: 9, r: .15, up: .015, cover: .5, o2: .8, tMin: 15, tMax: 30, biofilm: .6, look: { shape: 'ribbon', c: [.25, .52, .18], n: 36, w: 1, h: [.9, .3], wave: .3 } },
  sagit:     { cat: 'Rubans', name: 'Sagittaria subulata', price: 6, r: .1, up: .01, cover: .5, o2: .5, tMin: 15, tMax: 30, biofilm: .6, look: { shape: 'ribbon', c: [.32, .62, .22], n: 90, w: .35, h: [.12, .1], wave: .1, front: true } },
  eleo:      { cat: 'Rubans', name: 'Éléocharis (herbe à aiguilles)', price: 7, r: .1, up: .008, cover: .5, o2: .4, tMin: 15, tMax: 30, biofilm: .7, dem: .3, look: { shape: 'ribbon', c: [.4, .7, .25], n: 160, w: .12, h: [.08, .1], wave: .05, front: true } },
  apono:     { cat: 'Rubans', name: 'Aponogeton crispus', price: 8, r: .1, up: .01, cover: .3, o2: .5, tMin: 20, tMax: 30, biofilm: .4, look: { shape: 'ribbon', c: [.4, .55, .22], n: 18, w: .9, h: [.5, .3], wave: .6 } },
  // Rosettes
  crypto:    { cat: 'Rosettes', name: 'Cryptocoryne wendtii', price: 7, r: .05, up: .008, cover: .5, o2: .4, tMin: 18, tMax: 30, biofilm: .7, look: { shape: 'rosette', c: [.35, .33, .15], n: 8, k: 7, len: 2.6, wid: .9, tilt: .7 } },
  parva:     { cat: 'Rosettes', name: 'Cryptocoryne parva', price: 6, r: .04, up: .005, cover: .4, o2: .3, tMin: 18, tMax: 30, biofilm: .6, look: { shape: 'rosette', c: [.2, .45, .15], n: 14, k: 6, len: 1.4, wid: .25, tilt: 1.1, front: true } },
  sword:     { cat: 'Rosettes', name: 'Échinodorus (Amazone)', price: 10, r: .07, up: .015, cover: .5, o2: .7, tMin: 20, tMax: 30, biofilm: .6, look: { shape: 'rosette', c: [.25, .55, .18], n: 3, k: 12, len: 7, wid: 1.4, tilt: 1 } },
  lotus:     { cat: 'Rosettes', name: 'Nymphaea lotus rouge', price: 9, r: .08, up: .012, cover: .4, o2: .5, tMin: 20, tMax: 30, biofilm: .5, look: { shape: 'rosette', c: [.6, .2, .2], n: 3, k: 7, len: 3.5, wid: 2, tilt: .35 } },
  // Épiphytes (sur roches et racines)
  anubias:   { cat: 'Épiphytes', name: 'Anubias nana', price: 12, r: .03, up: .004, cover: .4, o2: .2, tMin: 18, tMax: 30, biofilm: .8, look: { shape: 'epi', c: [.08, .25, .08], n: 24, sx: 2.2, sz: 1.2, rz: .5 } },
  fern:      { cat: 'Épiphytes', name: 'Fougère de Java', price: 8, r: .05, up: .006, cover: .5, o2: .3, tMin: 15, tMax: 30, biofilm: .8, look: { shape: 'epi', c: [.18, .38, .14], n: 30, sx: 3.2, sz: .5, rz: 1 } },
  buce:      { cat: 'Épiphytes', name: 'Bucephalandra', price: 14, r: .02, up: .003, cover: .3, o2: .15, tMin: 20, tMax: 29, biofilm: .8, look: { shape: 'epi', c: [.24, .17, .26], n: 20, sx: 1.2, sz: .7, rz: .4 } },
  bolbitis:  { cat: 'Épiphytes', name: 'Bolbitis heudelotii', price: 13, r: .03, up: .005, cover: .5, o2: .25, tMin: 20, tMax: 28, biofilm: .8, look: { shape: 'epi', c: [.12, .32, .12], n: 22, sx: 2.6, sz: 1, rz: .9 } },
  // Gazons
  hcuba:     { cat: 'Gazons', name: 'HC Cuba', price: 9, r: .12, up: .012, cover: .6, o2: .6, tMin: 20, tMax: 28, biofilm: .8, dem: .9, look: { shape: 'carpet', c: [.35, .7, .25], n: 600, size: .3, sy: .25 } },
  monte:     { cat: 'Gazons', name: 'Monte Carlo', price: 8, r: .12, up: .012, cover: .6, o2: .6, tMin: 18, tMax: 28, biofilm: .8, dem: .5, look: { shape: 'carpet', c: [.3, .65, .22], n: 450, size: .45, sy: .25 } },
  marsilea:  { cat: 'Gazons', name: 'Marsilea hirsuta', price: 7, r: .06, up: .007, cover: .5, o2: .4, tMin: 15, tMax: 30, biofilm: .7, look: { shape: 'carpet', c: [.25, .5, .18], n: 350, size: .55, sy: .2 } },
  hydro:     { cat: 'Gazons', name: 'Hydrocotyle tripartita', price: 7, r: .14, up: .012, cover: .5, o2: .6, tMin: 18, tMax: 28, biofilm: .6, dem: .3, look: { shape: 'carpet', c: [.35, .65, .25], n: 400, size: .5, sy: .5 } },
  stauro:    { cat: 'Gazons', name: 'Staurogyne repens', price: 7, r: .06, up: .008, cover: .5, o2: .4, tMin: 18, tMax: 30, biofilm: .6, dem: .3, look: { shape: 'rosette', c: [.3, .55, .2], n: 20, k: 4, len: 1, wid: .4, tilt: .6, front: true } },
  // Flottantes
  lemna:     { cat: 'Flottantes', name: "Lentilles d'eau", price: 2, r: .35, up: .025, cover: .2, o2: .2, tMin: 4, tMax: 33, biofilm: .3, floating: true, look: { shape: 'float', c: [.45, .7, .2], n: 600, size: .35 } },
  riccia:    { cat: 'Flottantes', name: 'Riccia fluitans', price: 5, r: .25, up: .02, cover: .7, o2: .6, tMin: 15, tMax: 30, biofilm: 1, floating: true, look: { shape: 'float', c: [.45, .75, .25], n: 500, size: .5, sy: .4 } },
  salvinia:  { cat: 'Flottantes', name: 'Salvinia', price: 3, r: .3, up: .022, cover: .25, o2: .2, tMin: 16, tMax: 32, biofilm: .3, floating: true, look: { shape: 'float', c: [.35, .6, .2], n: 300, size: .7 } },
  limnob:    { cat: 'Flottantes', name: 'Grenouillette (Limnobium)', price: 4, r: .25, up: .022, cover: .3, o2: .2, tMin: 15, tMax: 30, biofilm: .4, floating: true, look: { shape: 'float', c: [.3, .6, .25], n: 160, size: 1.2 } },
  pistia:    { cat: 'Flottantes', name: "Laitue d'eau (Pistia)", price: 5, r: .25, up: .03, cover: .35, o2: .2, tMin: 18, tMax: 32, biofilm: .4, floating: true, look: { shape: 'float', c: [.5, .72, .4], n: 50, size: 2.2, sy: .5 } },
  phyllan:   { cat: 'Flottantes', name: 'Phyllanthus fluitans (Red Root)', price: 6, r: .2, up: .02, cover: .25, o2: .2, tMin: 18, tMax: 30, biofilm: .3, floating: true, dem: .2, look: { shape: 'float', c: [.65, .3, .2], n: 220, size: .55 } },
  nenuphar:  { cat: 'Flottantes', name: 'Nénuphar rustique', price: 25, r: .06, up: .02, cover: .5, o2: .4, tMin: 1, tMax: 32, biofilm: .5, floating: true, look: { shape: 'float', c: [.18, .42, .15], n: 18, size: 4, sy: .1 } },
};
// Petit résumé auto pour la boutique et l'installation
function plantDesc(p) {
  const t = [];
  if ((p.dem || 0) >= .6) t.push('Exigeante : CO2 conseillé');
  else if ((p.dem || 0) >= .3) t.push('Aime le CO2');
  else t.push('Facile');
  if (p.up >= .02) t.push('pompe les nitrates');
  if (p.cover >= .7) t.push('super abri pour les bébés');
  if (p.biofilm >= 1.2) t.push('beaucoup de biofilm');
  if (p.tMin <= 5) t.push('résiste au froid (bassin)');
  else t.push(`${p.tMin}–${p.tMax} °C`);
  return t.join(' · ') + '.';
}

// price : prix pour 30 L. leach : relargage d'ammoniaque au début · acid : acidification · calc : calcaire (GH/KH/pH ↑)
// tannin : tanins (eau ambrée, pH ↓) · mix : couleurs des grains
const SUBSTRATES = {
  sand:    { name: 'Sable inerte fin',            price: 6,  color: [.76, .68, .52], surface: 1,   desc: 'Neutre, sans effet sur l\'eau.' },
  loire:   { name: 'Sable de Loire',              price: 8,  color: [.7, .6, .46],   surface: 1.1, mix: [[.78, .68, .52], [.62, .48, .32], [.55, .52, .48], [.85, .8, .7], [.42, .33, .25]], desc: 'Grains beiges, ocre et gris. Naturel et inerte.' },
  quartz:  { name: 'Sable de quartz blanc',       price: 7,  color: [.9, .88, .83],  surface: 1,   desc: 'Inerte. Fond clair : les crevettes colorées s\'y voient (et les prédateurs aussi).' },
  gravel:  { name: 'Gravier gris',                price: 6,  color: [.5, .5, .5],    surface: 1.2, desc: 'Inerte.' },
  black:   { name: 'Gravier noir',                price: 8,  color: [.1, .1, .11],   surface: 1.2, desc: 'Inerte. Fond sombre : les couleurs ressortent moins pour les prédateurs.' },
  basalt:  { name: 'Sable noir basaltique',       price: 9,  color: [.16, .16, .17], surface: 1.1, mix: [[.13, .13, .14], [.2, .2, .21], [.1, .1, .1]], desc: 'Inerte, très sombre.' },
  pebbles: { name: 'Galets de rivière',           price: 10, color: [.55, .5, .44],  surface: .8,  mix: [[.6, .55, .48], [.45, .42, .4], [.7, .66, .6], [.5, .4, .32]], desc: 'Peu de surface pour les bactéries.' },
  pozz:    { name: 'Pouzzolane',                  price: 9,  color: [.42, .17, .12], surface: 1.8, mix: [[.45, .18, .12], [.35, .13, .1], [.25, .1, .08]], desc: 'Roche volcanique poreuse : énormément de bactéries.' },
  akadama: { name: 'Akadama',                     price: 14, color: [.55, .36, .2],  surface: 1.6, acid: .15, desc: 'Argile japonaise : acidifie légèrement, très poreuse.' },
  catappa: { name: 'Sable + feuilles de catappa', price: 9,  color: [.5, .4, .28],   surface: 1.2, tannin: .3, mix: [[.72, .62, .46], [.45, .3, .16], [.35, .22, .12]], desc: 'Tanins : eau ambrée, pH un peu plus bas, biofilm.' },
  soil:    { name: 'Soil actif (Caridina)',       price: 25, color: [.13, .09, .07], surface: 1.5, soil: true, desc: 'Fait chuter KH et pH. Relargue de l\'ammoniaque les premières semaines.' },
  soilNeo: { name: 'Soil neutre (Neocaridina)',   price: 20, color: [.2, .14, .1],   surface: 1.5, leach: .6, desc: 'Nutritif, ne touche pas au KH. Relargue un peu au début.' },
  coral:   { name: 'Sable corallien',             price: 10, color: [.93, .89, .8],  surface: 1.1, calc: 1, mix: [[.95, .92, .85], [.9, .84, .74], [.98, .96, .92]], desc: 'Calcaire : fait monter GH, KH et pH. À éviter pour les Caridina.' },
  earth:   { name: 'Terre de jardin',             price: 0,  color: [.3, .22, .14],  surface: 1.3, earth: true, pond: true, desc: 'Bassin uniquement. Gratuite, un peu de tanins.' },
};

const WATERS = {
  tap_hard: { name: 'Robinet (dure)',            gh: 14, kh: 9,  no3: 12 },
  tap_soft: { name: 'Robinet (douce)',           gh: 6,  kh: 4,  no3: 6 },
  ro_gh:    { name: 'Osmosée + sels GH+',        gh: 5,  kh: .5, no3: 0 },
  ro_ghkh:  { name: 'Osmosée + sels GH/KH+',     gh: 8,  kh: 4,  no3: 0 },
  ro:       { name: 'Osmosée pure',              gh: .2, kh: .1, no3: 0 },
};
const RAIN = { gh: .3, kh: .2, no3: 1 };

const FILTERS = {
  none:     { name: 'Aucun',            bact: .3, flow: 0,   suck: 0 },
  sponge:   { name: 'Filtre éponge',    bact: 1,  flow: .15, suck: 0 },
  canister: { name: 'Filtre externe',   bact: 2,  flow: .22, suck: .02 },
  guarded:  { name: 'Externe + crépine',bact: 2,  flow: .2,  suck: 0 },
};

const AQUA_VOLUMES = [12, 20, 30, 60, 120, 240];
const POND_VOLUMES = [100, 250, 500, 1000];

const FISH = { name: 'Micro rasbora (Boraras)', tOpt: 25, tTol: 4, phOpt: 6.5, phTol: 1.2, ghOpt: 6, ghTol: 6 };

// ---------- Boutique ----------
// eq : équipement installable dans un bac · use : consommable (qty doses) · tool : outil permanent
const SHOP = {
  tank12:   { cat: 'Bacs', name: 'Aquarium 12 L', price: 30, tank: { env: 'aquarium', volume: 12 } },
  tank20:   { cat: 'Bacs', name: 'Aquarium 20 L', price: 45, tank: { env: 'aquarium', volume: 20 } },
  tank30:   { cat: 'Bacs', name: 'Aquarium 30 L', price: 60, tank: { env: 'aquarium', volume: 30 } },
  tank60:   { cat: 'Bacs', name: 'Aquarium 60 L', price: 110, tank: { env: 'aquarium', volume: 60 } },
  tank120:  { cat: 'Bacs', name: 'Aquarium 120 L', price: 190, tank: { env: 'aquarium', volume: 120 } },
  tank240:  { cat: 'Bacs', name: 'Aquarium 240 L', price: 320, tank: { env: 'aquarium', volume: 240 } },
  pond250:  { cat: 'Bacs', name: 'Bassin extérieur 250 L', price: 150, tank: { env: 'pond', volume: 250 } },
  pond500:  { cat: 'Bacs', name: 'Bassin extérieur 500 L', price: 240, tank: { env: 'pond', volume: 500 } },
  pond1000: { cat: 'Bacs', name: 'Bassin extérieur 1000 L', price: 380, tank: { env: 'pond', volume: 1000 } },
  sponge:   { cat: 'Équipement', name: 'Filtre éponge', price: 15, eq: 'sponge', desc: 'Sûr pour les bébés.' },
  canister: { cat: 'Équipement', name: 'Filtre externe', price: 60, eq: 'canister', desc: 'Très efficace, mais aspire les bébés sans crépine.' },
  guard:    { cat: 'Équipement', name: 'Crépine anti-aspiration', price: 5, eq: 'guard' },
  heater:   { cat: 'Équipement', name: 'Chauffage', price: 25, eq: 'heater' },
  ledPro:   { cat: 'Équipement', name: 'Rampe LED pro', price: 50, eq: 'ledPro', desc: 'Intensité jusqu\'à 100 % (LED de base : 60 %).' },
  co2:      { cat: 'Équipement', name: 'Kit CO2', price: 80, eq: 'co2' },
  air:      { cat: 'Équipement', name: 'Bulleur', price: 10, eq: 'air' },
  ato:      { cat: 'Équipement', name: 'Osmolateur', price: 70, eq: 'ato', desc: 'Remet de l\'eau osmosée automatiquement (nécessite l\'osmoseur).' },
  solar:    { cat: 'Équipement', name: 'Pompe à air solaire (bassin)', price: 30, eq: 'solar' },
  shade:    { cat: 'Équipement', name: 'Voile d\'ombrage (bassin)', price: 15, eq: 'shade' },
  drops:    { cat: 'Tests', name: 'Kit tests en gouttes (50 tests)', price: 35, use: 'drops', qty: 50, desc: 'Mesure précise de pH, GH, KH, NH4, NO2, NO3.' },
  probePh:  { cat: 'Tests', name: 'Sonde pH connectée', price: 90, eq: 'probePh', desc: 'pH affiché en continu pour un bac.' },
  probeAll: { cat: 'Tests', name: 'Contrôleur multi-paramètres', price: 220, eq: 'probeAll', desc: 'Tous les paramètres en continu pour un bac.' },
  osmo:     { cat: 'Eau', name: 'Osmoseur', price: 120, tool: 'osmo', desc: 'Débloque l\'eau osmosée pure.' },
  saltsGH:  { cat: 'Eau', name: 'Sels GH+ (30 utilisations)', price: 12, use: 'saltsGH', qty: 30, desc: 'Osmosée + GH (Caridina).' },
  saltsGHKH:{ cat: 'Eau', name: 'Sels GH/KH+ (30 utilisations)', price: 12, use: 'saltsGHKH', qty: 30, desc: 'Osmosée + GH + KH (Neocaridina).' },
  bacteria: { cat: 'Eau', name: 'Bactéries en bouteille', price: 15, use: 'bacteria', qty: 1, desc: 'Accélère le cyclage d\'un bac neuf.' },
  granules: { cat: 'Nourriture', name: 'Granulés (60 portions)', price: 8, use: 'granules', qty: 60 },
  powder:   { cat: 'Nourriture', name: 'Poudre bébés (40 portions)', price: 10, use: 'powder', qty: 40 },
  fenben:   { cat: 'Soins', name: 'Fenbendazole (3 traitements)', price: 20, use: 'fenben', qty: 3 },
  trap:     { cat: 'Soins', name: 'Piège à planaires', price: 15, tool: 'trap' },
  rasbora:  { cat: 'Poissons', name: 'Micro rasbora', price: 4, fish: 1 },
};
for (const k in PLANTS) SHOP['p_' + k] = { cat: 'Plantes', name: PLANTS[k].name, price: PLANTS[k].price, plant: k, desc: plantDesc(PLANTS[k]) };
// prix du sol pour 30 L
const SUB_PRICE = Object.fromEntries(Object.entries(SUBSTRATES).map(([k, v]) => [k, v.price]));
const FREE_STUFF = ['Bandelettes de test', 'Thermomètre', 'Légumes blanchis', 'Eau du robinet', 'Épuisette', 'Siphon', 'Éclairage LED de base'];
const MONEY = 'SC';  // Shrimp Coin (affiché avec la pièce en pixel art côté UI)
const MONEY_NAME = 'Shrimp Coin';
const START_MONEY = 400;
const BREEDERS = ['CrevetteMania', 'Tom_Aqua', 'ShrimpLab69', 'Les Bacs de Léa', 'Neo&Co', 'BeeKeeper', 'AquaNico', 'Caridinette', 'PetitBacPerso', 'GhostShrimp_fr', 'Mamie Aquariophile', 'Le Crevettier'];

const SEASONS = [
  { name: 'Hiver', from: 355 }, { name: 'Printemps', from: 79 }, { name: 'Été', from: 172 }, { name: 'Automne', from: 265 },
];
function seasonOf(doy) {
  if (doy >= 355 || doy < 79) return 'Hiver';
  if (doy < 172) return 'Printemps';
  if (doy < 265) return 'Été';
  return 'Automne';
}
