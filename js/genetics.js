'use strict';
// Génétique mendélienne.
// ADN = { c: ['++', '+r', …] (un couple d'allèles par locus de LOCI), p: [nombres] (2n allèles par trait de POLY) }.
// Le phénotype (g) est calculé à partir de l'ADN et sert à tout le reste (simulation, rendu, fiche).

const Gen = (() => {
  const rnd = Math.random;
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const fix = (k, v) => GENES[k].circ ? ((v % 360) + 360) % 360 : clamp(v, GENES[k].min, GENES[k].max);
  const sortPair = (a, b) => a === '+' ? a + b : b === '+' ? b + a : a + b;
  const LI = Object.fromEntries(LOCI.map((l, i) => [l.k, i]));

  // ---------- ADN ----------
  // ADN d'une crevette d'animalerie : génotype de la souche, variabilité polygénique, porteurs cachés occasionnels
  function strainDNA(key, carrier = .05) {
    const v = VARIETIES[key];
    const c = LOCI.map(L => v.loci[L.k] ? v.loci[L.k] : '++');
    if (rnd() < carrier) {
      const free = LOCI.filter(L => L.mode === 'rec' && !v.loci[L.k]);
      const L = free[(rnd() * free.length) | 0];
      if (L) c[LI[L.k]] = '+' + L.mut;
    }
    const p = [];
    for (const P of POLY) {
      const target = P.mean ? (v.poly[P.k] ?? { dens: .5, dark: .1, bandW: .4 }[P.k] ?? .5) : (v.poly[P.k] || 0) / (2 * P.n);
      for (let j = 0; j < 2 * P.n; j++) p.push(round(clamp(target + gauss() * P.init, P.min, P.max)));
    }
    return { c, p };
  }
  const round = x => Math.round(x * 1000) / 1000;

  // Reproduction : chaque parent transmet un allèle au hasard par locus, avec mutations rares
  function cross(m, f, mutRate = 1) {
    const muts = [];
    const c = LOCI.map((L, i) => {
      let a = m.c[i][rnd() < .5 ? 0 : 1], b = f.c[i][rnd() < .5 ? 0 : 1];
      if (rnd() < 4e-4 * mutRate) { a = a === '+' ? L.mut : '+'; muts.push({ k: L.k, label: L.label, hidden: true }); }
      if (rnd() < 4e-4 * mutRate) { b = b === '+' ? L.mut : '+'; muts.push({ k: L.k, label: L.label, hidden: true }); }
      return sortPair(a, b);
    });
    const p = [];
    let off = 0;
    for (const P of POLY) {
      for (let j = 0; j < P.n; j++) {
        for (const par of [m, f]) {
          let v = par.p[off + 2 * j + (rnd() < .5 ? 0 : 1)];
          if (rnd() < .2 * mutRate) v += gauss() * P.sd;
          if (rnd() < .003 * mutRate) { v += (rnd() < .5 ? -1 : 1) * (P.max - P.min) * .15; muts.push({ k: P.k, label: P.label }); }
          p.push(round(clamp(v, P.min, P.max)));
        }
      }
      off += 2 * P.n;
    }
    return { dna: { c, p }, muts };
  }

  function polyValues(dna) {
    const out = {};
    let off = 0;
    for (const P of POLY) {
      let s = 0;
      for (let j = 0; j < 2 * P.n; j++) s += dna.p[off + j];
      out[P.k] = P.mean ? s / (2 * P.n) : s;
      off += 2 * P.n;
    }
    return out;
  }
  const dose = (dna, k) => { const L = LOCI[LI[k]], c = dna.c[LI[k]]; return (c[0] === L.mut) + (c[1] === L.mut); };

  // ---------- Phénotype ----------
  function express(dna, genus) {
    const G = GENERA[genus] || GENERA.neo, P = polyValues(dna), base = G.base;
    const hom = k => dose(dna, k) === 2;
    const g = {};
    let dens = .1 + .9 * P.dens, dark = P.dark * .4, sat = .85, hue, spots = 0;
    const pig = (hom('R') ? 'r' : '') + (hom('Y') ? 'y' : '') + (hom('B') ? 'b' : '') + (hom('G') ? 'g' : '');
    if (hom('W')) { hue = 40; sat = .04; dark = 0; dens = Math.max(dens, .75); }
    else if (!pig) {
      if (hom('K')) { hue = 0; sat = .1; dark = .93; }
      else { // type sauvage : propre à chaque espèce
        const wd = G.wild;
        hue = wd.hue; sat = wd.sat; dark = wd.dark + dark * .5; spots = wd.spots || 0;
        dens = wd.dens != null ? wd.dens * (.75 + .5 * P.dens) : dens * .8;
      }
    } else {
      hue = PIGMENT_HUE[pig.length > 2 ? '' : pig] ?? 20;
      if (pig.length > 2) { sat = .5; dark += .45; }
      if (hom('K')) dark = .55 + dark * .5;
    }
    g.hue = fix('hue', hue + P.hueS);
    g.sat = fix('sat', sat);
    g.dens = fix('dens', dens);
    g.dark = fix('dark', dark);
    g.stripe = dose(dna, 'S') ? fix('stripe', .55 + P.bandW * .4) : 0;
    g.bands = [0, .4, .72][dose(dna, 'N')] + (dose(dna, 'N') ? P.bandW * .25 : 0);
    g.rili = [0, .35, .75][dose(dna, 'L')];
    g.spots = Math.min(1, spots + (hom('M') ? .55 : 0));
    for (const k of ['tOpt', 'tTol', 'phOpt', 'phTol', 'ghOpt', 'ghTol', 'size', 'life', 'fert', 'growth']) g[k] = fix(k, base[k] + P[k]);
    // la taille polygénique est calée sur une crevette de 25 mm : on la remet à l'échelle de l'espèce
    if (genus !== 'neo' && genus !== 'car') g.size = fix('size', base.size * (1 + P.size / 25));
    g.salOpt = G.salt[0]; g.salTol = G.salt[1];
    return g;
  }

  // Génotype lisible (seulement les locus non sauvages)
  function genotype(dna) {
    return LOCI.map((L, i) => {
      const c = dna.c[i];
      if (c === '++') return null;
      const d = (c[0] === L.mut) + (c[1] === L.mut);
      const state = L.mode === 'rec' ? (d === 2 ? 'visible' : 'porteur') : d === 2 ? 'double dose' : 'une dose';
      return { k: L.k, label: L.label, pair: c.split('').join('/'), state };
    }).filter(Boolean);
  }

  // ---------- Couleur / visibilité / adaptation ----------
  function hsl2rgb(h, s, l) {
    h /= 360;
    const f = n => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  }
  function color(g) {
    const l = (1 - g.dark) * (.42 + .43 * (1 - g.sat)) + .03;
    return hsl2rgb(g.hue, g.sat, l);
  }
  const WATER_RGB = [.55, .66, .62];
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

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
    const fS = fitRange(g.salOpt || 0, g.salTol ?? 4, w.sal || 0, 2);
    return { fT, fP, fG, fS, all: fT * fP * fG * fS };
  }
  // Coût du généralisme : être tolérant à tout réduit la fertilité
  function fertCost(g) {
    return 1 / (1 + .06 * Math.max(0, g.tTol - 3) + .35 * Math.max(0, g.phTol - .6) + .04 * Math.max(0, g.ghTol - 4));
  }

  const HUES = [[15, 'Rouge'], [38, 'Orange'], [70, 'Jaune'], [105, 'Vert pomme'], [165, 'Vert'], [195, 'Turquoise'], [255, 'Bleu'], [285, 'Violet'], [335, 'Rose'], [361, 'Rouge']];
  function colorName(g) {
    if (g.dens < .25) return 'Translucide';
    if (g.dark > .75) return g.sat > .4 ? 'Chocolat' : 'Noire';
    if (g.sat < .18) return g.dark < .25 ? 'Blanche' : 'Grise';
    if (g.sat < .4) return 'Sauvage';
    return HUES.find(h => g.hue < h[0])[1];
  }
  function tags(g) {
    const t = [];
    if (g.bands > .3) t.push('à bandes');
    if (g.stripe > .4) t.push('rayée');
    if (g.spots > .4) t.push('mouchetée');
    if (g.rili > .3) t.push('rili');
    return t;
  }
  // Classe de couleur (sans le grade) : sert au marché et à la stabilité des souches
  function colorClass(g) { return [colorName(g), ...tags(g)].join(' '); }
  function grade(g) {
    if (g.dens < .25 || g.sat < .18 || g.dark > .75) return '';
    return g.dens < .45 ? 'pâle' : g.dens < .7 ? '' : g.dens < .88 ? 'intense' : 'painted';
  }
  function phenotype(g) { return [colorName(g), grade(g), ...tags(g)].filter(Boolean).join(' '); }

  return {
    gauss, clamp, strainDNA, cross, express, genotype, polyValues, color, conspicuity, fitness, fitTemp, fitRange,
    fertCost, phenotype, colorClass, grade, mix, dist, WATER_RGB, hsl2rgb,
  };
})();
