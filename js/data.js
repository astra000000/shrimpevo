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

const VARIETIES = {
  neo_wild:   { genus: 'neo', name: 'Sauvage',      g: { hue: 30,  sat: .35, dens: .45, dark: .55, stripe: .15, bands: 0, spots: .25, rili: 0 } },
  neo_cherry: { genus: 'neo', name: 'Red Cherry',   g: { hue: 356, sat: .85, dens: .55, dark: .1,  stripe: .05, bands: 0, spots: .1,  rili: 0 } },
  neo_orange: { genus: 'neo', name: 'Orange Sakura',g: { hue: 24,  sat: .9,  dens: .7,  dark: .05, stripe: 0,   bands: 0, spots: .05, rili: 0 } },
  neo_yellow: { genus: 'neo', name: 'Yellow',       g: { hue: 52,  sat: .85, dens: .6,  dark: .02, stripe: .1,  bands: 0, spots: 0,   rili: 0 } },
  neo_green:  { genus: 'neo', name: 'Green Jade',   g: { hue: 120, sat: .6,  dens: .65, dark: .2,  stripe: 0,   bands: 0, spots: .05, rili: 0 } },
  neo_blue:   { genus: 'neo', name: 'Blue Dream',   g: { hue: 222, sat: .8,  dens: .8,  dark: .35, stripe: 0,   bands: 0, spots: 0,   rili: 0 } },
  neo_black:  { genus: 'neo', name: 'Black Rose',   g: { hue: 0,   sat: .1,  dens: .9,  dark: .93, stripe: 0,   bands: 0, spots: 0,   rili: 0 } },
  neo_snow:   { genus: 'neo', name: 'Snowball',     g: { hue: 40,  sat: .05, dens: .85, dark: 0,   stripe: 0,   bands: 0, spots: 0,   rili: 0 } },
  neo_rili:   { genus: 'neo', name: 'Red Rili',     g: { hue: 356, sat: .85, dens: .75, dark: .08, stripe: 0,   bands: 0, spots: 0,   rili: .75 } },
  car_wild:   { genus: 'car', name: 'Sauvage',      g: { hue: 200, sat: .2,  dens: .35, dark: .4,  stripe: .05, bands: .1, spots: .1, rili: .2 } },
  car_crs:    { genus: 'car', name: 'Crystal Red',  g: { hue: 356, sat: .85, dens: .85, dark: .1,  stripe: 0,   bands: .75, spots: .05, rili: 0 } },
  car_cbs:    { genus: 'car', name: 'Crystal Black',g: { hue: 0,   sat: 0,   dens: .9,  dark: .9,  stripe: 0,   bands: .75, spots: .05, rili: 0 } },
  car_bolt:   { genus: 'car', name: 'Blue Bolt',    g: { hue: 205, sat: .65, dens: .95, dark: .1,  stripe: .2,  bands: 0, spots: 0,   rili: 0 } },
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

const SEASONS = [
  { name: 'Hiver', from: 355 }, { name: 'Printemps', from: 79 }, { name: 'Été', from: 172 }, { name: 'Automne', from: 265 },
];
function seasonOf(doy) {
  if (doy >= 355 || doy < 79) return 'Hiver';
  if (doy < 172) return 'Printemps';
  if (doy < 265) return 'Été';
  return 'Automne';
}
