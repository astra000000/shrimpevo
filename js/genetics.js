'use strict';
// Génétique quantitative : chaque gène = moyenne des parents + bruit de ségrégation + mutations rares.

const Gen = (() => {
  const rnd = Math.random;
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

  function fix(k, v) {
    const d = GENES[k];
    if (d.circ) return ((v % 360) + 360) % 360;
    return clamp(v, d.min, d.max);
  }

  function circMean(a, b) {
    let d = ((b - a + 540) % 360) - 180;
    return a + d / 2;
  }

  // Génome de départ (animalerie) : base du genre + variété + variabilité naturelle
  function makeGenome(varietyKey, jitter = 3) {
    const v = VARIETIES[varietyKey];
    const base = Object.assign({}, GENERA[v.genus].base, v.g);
    const g = {};
    // la teinte varie peu en animalerie : une Crystal Red reste rouge
    for (const k of GENE_KEYS) g[k] = fix(k, base[k] + gauss() * GENES[k].sd * jitter * (k === 'hue' ? .35 : 1));
    return g;
  }

  // mutRate : multiplicateur global réglable
  function child(m, f, mutRate = 1) {
    const g = {}, muts = [];
    for (const k of GENE_KEYS) {
      const d = GENES[k];
      const mid = d.circ ? circMean(m[k], f[k]) : (m[k] + f[k]) / 2;
      // ségrégation : une partie de l'écart entre parents se retrouve chez l'enfant
      const spread = d.circ ? Math.abs(((m[k] - f[k] + 540) % 360) - 180) : Math.abs(m[k] - f[k]);
      g[k] = fix(k, mid + gauss() * (d.sd * mutRate + spread * .25));
    }
    // macro-mutations : c'est comme ça que les motifs apparaissent
    if (rnd() < .025 * mutRate) {
      const k = VISUAL_GENES[(rnd() * VISUAL_GENES.length) | 0];
      const d = GENES[k];
      const range = d.max - d.min;
      let jump = (.12 + rnd() * .25) * range * (rnd() < .5 ? -1 : 1);
      if (['stripe', 'bands', 'spots', 'rili'].includes(k) && rnd() < .7) jump = Math.abs(jump);
      g[k] = fix(k, g[k] + jump);
      muts.push({ k, dir: jump > 0 ? 1 : -1 });
    }
    if (rnd() < .006 * mutRate) {
      const ks = ['tOpt', 'tTol', 'phOpt', 'phTol', 'ghOpt', 'ghTol', 'size', 'life', 'fert', 'growth'];
      const k = ks[(rnd() * ks.length) | 0];
      const d = GENES[k];
      const jump = (.05 + rnd() * .1) * (d.max - d.min) * (rnd() < .5 ? -1 : 1);
      g[k] = fix(k, g[k] + jump);
      muts.push({ k, dir: jump > 0 ? 1 : -1 });
    }
    return { g, muts };
  }

  function hsl2rgb(h, s, l) {
    h /= 360;
    const f = n => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  }

  // Couleur des chromatophores (sans la transparence)
  function color(g) {
    const l = (1 - g.dark) * (.42 + .43 * (1 - g.sat)) + .03;
    return hsl2rgb(g.hue, g.sat, l);
  }

  const WATER_RGB = [.55, .66, .62];
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

  // Visibilité pour un prédateur (0..1) selon le fond du bac
  function conspicuity(g, express, bg) {
    const d = g.dens * express * (1 - g.rili * .5);
    const vis = mix(bg, color(g), d); // une crevette transparente laisse voir le fond
    const pat = Math.max(g.stripe, g.bands, g.spots * .7) * d;
    return clamp(dist(vis, bg) / .9 + pat * .2, 0, 1);
  }

  // Adaptation : plateau dans la tolérance, chute au-delà (le froid est plus doux que le chaud)
  function fitTemp(g, T) {
    const d = T - g.tOpt, a = Math.abs(d);
    if (a <= g.tTol) return 1;
    const ex = a - g.tTol;
    const sc = d < 0 ? g.tTol * 1.5 + 7 : g.tTol * .5 + 1;
    return Math.exp(-((ex / sc) ** 2));
  }
  function fitRange(opt, tol, x, soft) {
    const a = Math.abs(x - opt);
    if (a <= tol) return 1;
    return Math.exp(-(((a - tol) / (tol * .8 + soft)) ** 2));
  }
  function fitness(g, w) {
    const fT = fitTemp(g, w.temp);
    const fP = fitRange(g.phOpt, g.phTol, w.ph, .2);
    const fG = fitRange(g.ghOpt, g.ghTol, w.gh, 1);
    return { fT, fP, fG, all: fT * fP * fG };
  }

  // Coût du généralisme : être tolérant à tout réduit la fertilité
  function fertCost(g) {
    return 1 / (1 + .06 * Math.max(0, g.tTol - 3) + .35 * Math.max(0, g.phTol - .6) + .04 * Math.max(0, g.ghTol - 4));
  }

  const HUES = [[15, 'Rouge'], [38, 'Orange'], [70, 'Jaune'], [160, 'Vert'], [190, 'Turquoise'], [255, 'Bleu'], [290, 'Violet'], [335, 'Rose'], [361, 'Rouge']];
  function phenotype(g) {
    let base;
    if (g.dens < .25) base = 'Translucide';
    else if (g.dark > .75) base = g.sat > .4 ? 'Chocolat' : 'Noire';
    else if (g.sat < .18) base = g.dark < .25 ? 'Blanche' : 'Grise';
    else base = HUES.find(h => g.hue < h[0])[1];
    const tags = [];
    if (g.bands > .4) tags.push('à bandes');
    if (g.stripe > .4) tags.push('rayée');
    if (g.spots > .4) tags.push('mouchetée');
    if (g.rili > .4) tags.push('rili');
    let grade = '';
    if (g.dens >= .25 && g.sat >= .18 && g.dark <= .75) {
      grade = g.dens < .45 ? 'pâle' : g.dens < .7 ? '' : g.dens < .88 ? 'intense' : 'painted';
    }
    return [base, grade, ...tags].filter(Boolean).join(' ');
  }

  return { gauss, clamp, makeGenome, child, color, conspicuity, fitness, fitTemp, fitRange, fertCost, phenotype, mix, dist, WATER_RGB, hsl2rgb };
})();
