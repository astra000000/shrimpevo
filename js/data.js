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

// Souches d'animalerie : génotype de base + cibles polygéniques. price en 🐚 par individu.
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

// r : croissance/jour, up : absorption azote (mg N/L/h à couverture 1), cover : refuge pour juvéniles
const PLANTS = {
  moss:    { name: 'Mousse de Java',   r: .06, up: .006, cover: 1.0, o2: .3,  tMin: 4,  tMax: 30, biofilm: 1.5 },
  hygro:   { name: 'Hygrophila',       r: .22, up: .02,  cover: .4,  o2: 1,   tMin: 14, tMax: 30, biofilm: .5 },
  vallis:  { name: 'Vallisnérie',      r: .14, up: .012, cover: .5,  o2: .7,  tMin: 10, tMax: 31, biofilm: .6 },
  anubias: { name: 'Anubias',          r: .03, up: .004, cover: .4,  o2: .2,  tMin: 18, tMax: 30, biofilm: .8 },
  egeria:  { name: 'Élodée dense',     r: .2,  up: .02,  cover: .6,  o2: 1.2, tMin: 3,  tMax: 27, biofilm: .6 },
  lemna:   { name: "Lentilles d'eau",  r: .35, up: .025, cover: .2,  o2: .2,  tMin: 4,  tMax: 33, biofilm: .3, floating: true },
};

const SUBSTRATES = {
  sand:   { name: 'Sable inerte',        color: [.76, .68, .52], surface: 1,   soil: false },
  gravel: { name: 'Gravier gris',        color: [.5, .5, .5],    surface: 1.2, soil: false },
  black:  { name: 'Gravier noir',        color: [.1, .1, .11],   surface: 1.2, soil: false },
  soil:   { name: 'Soil actif',          color: [.13, .09, .07], surface: 1.5, soil: true },
  earth:  { name: 'Terre de jardin',     color: [.3, .22, .14],  surface: 1.3, soil: false, earth: true },
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
  p_moss:   { cat: 'Plantes', name: 'Mousse de Java', price: 8, plant: 'moss' },
  p_hygro:  { cat: 'Plantes', name: 'Hygrophila', price: 6, plant: 'hygro' },
  p_vallis: { cat: 'Plantes', name: 'Vallisnérie', price: 6, plant: 'vallis' },
  p_anubias:{ cat: 'Plantes', name: 'Anubias', price: 12, plant: 'anubias' },
  p_egeria: { cat: 'Plantes', name: 'Élodée dense', price: 4, plant: 'egeria' },
  p_lemna:  { cat: 'Plantes', name: 'Lentilles d\'eau', price: 2, plant: 'lemna' },
  rasbora:  { cat: 'Poissons', name: 'Micro rasbora', price: 4, fish: 1 },
};
// prix du sol pour 30 L
const SUB_PRICE = { sand: 6, gravel: 6, black: 8, soil: 25, earth: 0 };
const FREE_STUFF = ['Bandelettes de test', 'Thermomètre', 'Légumes blanchis', 'Eau du robinet', 'Épuisette', 'Siphon', 'Éclairage LED de base'];
const MONEY = '🐚';
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
