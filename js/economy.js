'use strict';
// Économie de la Carrière : argent, boutique, équipement, eau, tests, marché (éleveurs simulés), bestiaire.
// En Bac à sable / Hardcore tout est gratuit et visible. Le marché est local pour l'instant :
// listings / buyListing / sell sont le point de branchement d'un futur serveur en ligne.

const Economy = (() => {
  const rnd = Math.random;
  const career = W => W.mode === 'career';
  const fmt = n => `${Math.round(n * 10) / 10} ${MONEY}`;

  // ---------- Argent / inventaire ----------
  function pay(W, n) {
    if (!career(W)) return true;
    if (W.money + 1e-9 < n) return false;
    W.money = Math.round((W.money - n) * 100) / 100;
    return true;
  }
  function earn(W, n) { if (career(W)) W.money = Math.round((W.money + n) * 100) / 100; }
  const owned = (W, key) => career(W) ? (W.inv[key] || 0) : Infinity;
  function consume(W, key, n = 1) {
    if (!career(W)) return true;
    if ((W.inv[key] || 0) < n) return false;
    W.inv[key] -= n;
    return true;
  }

  // ---------- Équipement installé ----------
  const EQ_USE = {
    sponge: s => s.eq.filter === 'sponge', canister: s => s.eq.filter === 'canister' || s.eq.filter === 'guarded',
    guard: s => s.eq.filter === 'guarded', heater: s => s.eq.heater, ledPro: s => s.eq.ledPro, co2: s => s.eq.co2,
    air: s => s.env === 'aquarium' && s.eq.air, solar: s => s.env === 'pond' && s.eq.air, shade: s => s.eq.shade,
    ato: s => s.eq.ato, probePh: s => s.eq.probePh, probeAll: s => s.eq.probeAll,
  };
  const installed = (W, key) => W.tanks.filter(EQ_USE[key]).length;
  const spare = (W, key) => owned(W, key) - installed(W, key);
  // Modifie l'équipement d'un bac si le joueur possède le matériel ; renvoie un message d'erreur sinon
  function setEquip(W, s, patch) {
    const old = {};
    for (const k in patch) old[k] = s.eq[k];
    Object.assign(s.eq, patch);
    if (career(W)) {
      for (const key in EQ_USE) if (installed(W, key) > (W.inv[key] || 0)) { Object.assign(s.eq, old); return `Il te faut : ${SHOP[key].name} (boutique).`; }
      if (s.eq.ato && !W.inv.osmo) { Object.assign(s.eq, old); return 'L\'osmolateur a besoin d\'un osmoseur.'; }
    }
    if (!s.eq.ledPro) s.eq.intensity = Math.min(s.eq.intensity, .6);
    return null;
  }
  const maxIntensity = s => s.eq.ledPro ? 1 : .6;

  // ---------- Eau ----------
  // Sources d'eau disponibles : robinet gratuit, osmosée avec osmoseur (+ sels)
  function waterSources(W) {
    if (!career(W)) return Object.keys(WATERS);
    const out = [W.tap];
    if (W.inv.osmo) {
      out.push('ro');
      if (W.inv.saltsGH) out.push('ro_gh');
      if (W.inv.saltsGHKH) out.push('ro_ghkh');
    }
    return out;
  }
  function useWater(W, key) {
    if (!career(W)) return true;
    if (key === 'ro_gh') return consume(W, 'saltsGH');
    if (key === 'ro_ghkh') return consume(W, 'saltsGHKH');
    return waterSources(W).includes(key);
  }

  // ---------- Tests d'eau ----------
  const STRIP = {
    ph: [6.0, 6.4, 6.8, 7.2, 7.6, 8.0, 8.4], gh: [0, 3, 7, 14, 21], kh: [0, 3, 6, 10, 15, 20],
    tan: [0, .25, .5, 1, 3, 5], no2: [0, .5, 1, 3, 5, 10], no3: [0, 10, 25, 50, 100, 250],
  };
  const DROP = { ph: .1, gh: 1, kh: 1, tan: .05, no2: .05, no3: 5 };
  const nearest = (arr, v) => arr.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
  function testStrip(W, s) {
    for (const k in STRIP) s.tests[k] = { v: nearest(STRIP[k], s.w[k]), kind: 'bandelette', t: W.t };
    Sim.log(W, 'Bandelette de test trempée.', 'info', false, s);
  }
  function testDrops(W, s) {
    if (!consume(W, 'drops')) return 'Plus de tests en gouttes : rachète un kit.';
    for (const k in DROP) s.tests[k] = { v: Math.round(s.w[k] / DROP[k]) * DROP[k], kind: 'gouttes', t: W.t };
    Sim.log(W, 'Tests en gouttes réalisés.', 'info', false, s);
    return null;
  }
  // Ce que le joueur voit d'un paramètre : la vraie valeur (sonde / mode libre) ou le dernier test
  function reading(W, s, k) {
    const live = { v: k === 'nh3' ? s.nh3 : s.w[k], kind: 'live', age: 0 };
    if (!career(W) || k === 'temp' || k === 'level' || s.eq.probeAll || (k === 'ph' && s.eq.probePh)) return live;
    if (k === 'nh3') {
      const t = s.tests.tan;
      if (!t) return null;
      const pKa = .09018 + 2729.92 / (s.w.temp + 273.15);
      const ph = (s.tests.ph || { v: 7 }).v;
      return { v: t.v / (1 + Math.pow(10, pKa - ph)), kind: t.kind, age: W.t - t.t };
    }
    const t = s.tests[k];
    return t ? { v: t.v, kind: t.kind, age: W.t - t.t } : null;
  }

  // ---------- Boutique ----------
  function buy(W, key, qty = 1, tank = null) {
    const it = SHOP[key];
    if (!it) return 'Article inconnu.';
    if (it.plant || it.fish) { if (!tank) return 'Choisis d\'abord un bac.'; }
    if (it.tank) return 'Utilise createTank.';
    if (!pay(W, it.price * qty)) return `Pas assez de ${MONEY}.`;
    if (it.eq || it.tool) W.inv[key] = (W.inv[key] || 0) + qty;
    if (it.use) W.inv[it.use] = (W.inv[it.use] || 0) + it.qty * qty;
    if (it.plant) Sim.A.addPlant(W, tank, it.plant);
    if (it.fish) Sim.A.fish(W, tank, qty);
    if (career(W)) Sim.log(W, `🛒 Achat : ${qty > 1 ? qty + ' × ' : ''}${it.name} (${fmt(it.price * qty)}).`);
    return null;
  }
  function tankPrice(key, sub) {
    const it = SHOP[key];
    return it.price + Math.ceil((SUB_PRICE[sub] || 0) * it.tank.volume / 30);
  }
  // Nouveau bac (toujours neuf, non cyclé, en Carrière)
  function createTank(W, key, opts) {
    const it = SHOP[key];
    const price = tankPrice(key, opts.substrate);
    if (!pay(W, price)) return `Pas assez de ${MONEY} (${fmt(price)}).`;
    if (!useWater(W, opts.water)) { earn(W, price); return 'Cette eau n\'est pas disponible.'; }
    const s = Sim.newTank(W, {
      name: opts.name, env: it.tank.env, volume: it.tank.volume, substrate: opts.substrate, water: opts.water,
      plants: [], mature: !career(W) && opts.mature, eq: { light: it.tank.env === 'aquarium' ? 8 : 0, intensity: .6, heater: false, target: 24 },
    });
    W.cur = W.tanks.indexOf(s);
    return s;
  }
  const SHOP_WATER = { neo: { gh: 7, kh: 4, ph: 7.4, temp: 22 }, car: { gh: 5, kh: 1, ph: 6.5, temp: 22 } };
  // Crevettes d'animalerie : livrées dans un sac à acclimater
  function buyStrain(W, vk, n) {
    const v = VARIETIES[vk];
    if (!pay(W, v.price * n)) return `Pas assez de ${MONEY}.`;
    ensureShopEntry(W, vk);
    const list = [];
    for (let i = 0; i < n; i++) list.push(Sim.storeShrimp(W, vk));
    Sim.addBag(W, list, SHOP_WATER[v.genus], `${n} ${GENERA[v.genus].short} ${v.name} (animalerie)`);
    return null;
  }

  // ---------- Bestiaire ----------
  function condOf(list) {
    const c = {};
    for (const k of ['tOpt', 'tTol', 'phOpt', 'phTol', 'ghOpt', 'ghTol']) c[k] = list.reduce((a, g) => a + g[k], 0) / list.length;
    return c;
  }
  function ensureShopEntry(W, vk) {
    const id = 'shop:' + vk;
    let e = W.bestiary.find(x => x.id === id);
    if (e) return e;
    const v = VARIETIES[vk];
    const dna = Gen.strainDNA(vk, 0);
    const g = Gen.express(dna, v.genus);
    e = {
      id, name: `${v.name}`, author: 'Animalerie', genus: v.genus, cls: Gen.colorClass(g), dna, cond: condOf([g]),
      desc: `Souche commerciale de ${GENERA[v.genus].name}. Lignée pure, mais quelques individus peuvent porter des gènes cachés.`,
      created: W.t, source: 'shop',
    };
    W.bestiary.push(e);
    return e;
  }
  function entryOf(W, id) {
    if (!id) return null;
    if (id.startsWith('shop:') && VARIETIES[id.slice(5)]) return ensureShopEntry(W, id.slice(5));
    return W.bestiary.find(x => x.id === id) || null;
  }
  // Crée une souche à partir de crevettes fondatrices : elles et leur descendance pure portent le nom
  function createStrain(W, s, ids, name, desc) {
    const set = new Set(ids);
    const founders = s.shrimp.filter(sh => set.has(sh.id));
    if (!founders.length) return 'Aucune crevette sélectionnée.';
    const genus = founders[0].genus;
    if (founders.some(f => f.genus !== genus)) return 'Une souche ne peut mélanger Neocaridina et Caridina.';
    const cls = {};
    for (const f of founders) { const k = Gen.colorClass(f.g); cls[k] = (cls[k] || 0) + 1; }
    const main = Object.entries(cls).sort((a, b) => b[1] - a[1])[0][0];
    const ref = founders.find(f => Gen.colorClass(f.g) === main);
    const e = {
      id: 'm' + (W.nextUid++), name: name || main, author: 'Toi', genus, cls: main, dna: ref.dna,
      cond: condOf(founders.map(f => f.g)), desc: desc || '', created: W.t, source: 'mine', founders: founders.length,
    };
    W.bestiary.push(e);
    for (const f of founders) f.strain = e.id;
    Sim.log(W, `📖 Nouvelle souche « ${e.name} » (${founders.length} fondatrices).`, 'mut', true, s);
    return e;
  }
  // Stabilité : part des bébés de la souche qui ressemblent au phénotype de référence
  function stability(W, e) {
    const ss = W.strainStats[e.id];
    if (!ss || ss.n < 10) return null;
    return (ss.cls[e.cls] || 0) / ss.n;
  }
  const countAlive = (W, id) => W.tanks.reduce((a, s) => a + s.shrimp.filter(sh => sh.strain === id).length, 0);

  // ---------- Valeur d'une crevette ----------
  const COLOR_VALUE = { Sauvage: 1, Translucide: 1, Grise: 1.5, Rouge: 3, Jaune: 3, Bleu: 4, Vert: 4, 'Vert pomme': 6, Orange: 5, Noire: 6, Blanche: 5, Chocolat: 8, Violet: 9, Turquoise: 9, Rose: 6 };
  let shopClasses = null;
  function value(W, sh) {
    const g = sh.g;
    const cls = Gen.colorClass(g);
    const name = cls.split(' à ')[0].split(' ')[0];
    let v = COLOR_VALUE[cls.startsWith('Vert pomme') ? 'Vert pomme' : name] ?? 3;
    if (g.bands > .3) v += sh.genus === 'car' ? 6 : 4;
    if (g.stripe > .4) v += 2;
    if (g.spots > .4) v += 1;
    if (g.rili > .3) v += 3;
    v *= .6 + 1.2 * g.dens;
    if (sh.genus === 'car') v *= 2;
    v *= Sim.isMature(sh) ? 1 : sh.size > 7 ? .6 : .3;
    v *= .5 + .5 * Math.max(0, sh.health);
    if (!shopClasses) shopClasses = new Set(Object.entries(VARIETIES).map(([k, x]) => Gen.colorClass(Gen.express(Gen.strainDNA(k, 0), x.genus))));
    if (!shopClasses.has(cls)) v *= 1.5;
    const e = entryOf(W, sh.strain);
    if (e && e.source === 'mine') { const st = stability(W, e); if (st != null && st > .8) v *= 1.25; }
    const m = W.market;
    if (m) {
      if (m.trend === cls) v *= 1.6;
      v /= 1 + (m.sold[cls] || 0) / 40;
    }
    return Math.max(.5, Math.round(v * 2) / 2);
  }

  // ---------- Marché (éleveurs simulés) ----------
  const NAMES = ['Galaxy', 'Velvet', 'Dream', 'Fire', 'Sunset', 'Ghost', 'Pearl', 'Storm', 'Candy', 'Lagoon', 'Ember', 'Frost', 'Aurora', 'Royal', 'Neon', 'Ruby', 'Ocean', 'Midnight'];
  function ensureMarket(W) {
    if (W.market) return W.market;
    W.market = { listings: [], trend: null, trendUntil: 0, nextRefresh: 0, sold: {} };
    return W.market;
  }
  // Génère une souche d'éleveur : parfois un mélange de deux souches, parfois un motif en plus, souvent un meilleur grade
  function breederStrain() {
    const keys = Object.keys(VARIETIES);
    const a = keys[(rnd() * keys.length) | 0], va = VARIETIES[a];
    const loci = Object.assign({}, va.loci), poly = Object.assign({}, va.poly);
    if (rnd() < .35) {
      const same = keys.filter(k => VARIETIES[k].genus === va.genus && k !== a);
      Object.assign(loci, VARIETIES[same[(rnd() * same.length) | 0]].loci);
    }
    if (rnd() < .3) { const L = ['L', 'S', 'M', 'N'][(rnd() * 4) | 0]; loci[L] = L === 'M' ? 'mm' : L + L; }
    poly.dens = Math.min(.97, (poly.dens || .5) + rnd() * .3);
    return { genus: va.genus, loci, poly };
  }
  function dnaFromTemplate(tpl) {
    const key = '__tmp';
    VARIETIES[key] = Object.assign({ name: 'tmp', price: 0 }, tpl);
    const dna = Gen.strainDNA(key, .08);
    delete VARIETIES[key];
    return dna;
  }
  function refreshMarket(W) {
    const m = ensureMarket(W);
    m.listings = m.listings.filter(l => W.t - l.created < 24 * 6 && l.stock.length);
    const n = 2 + ((rnd() * 3) | 0);
    for (let i = 0; i < n && m.listings.length < 12; i++) {
      const tpl = breederStrain();
      const stock = [];
      const count = 4 + ((rnd() * 10) | 0);
      for (let j = 0; j < count; j++) stock.push(dnaFromTemplate(tpl));
      const g = Gen.express(stock[0], tpl.genus);
      const cls = Gen.colorClass(g);
      const seller = BREEDERS[(rnd() * BREEDERS.length) | 0];
      const name = `${Gen.colorClass(g).split(' ')[0]} ${NAMES[(rnd() * NAMES.length) | 0]}`;
      const fake = { g, genus: tpl.genus, size: 25, age: 120, health: 1, strain: null };
      const price = Math.max(1, Math.round(value(W, fake) * (.8 + rnd() * .7)));
      const id = 'p' + (W.nextUid++);
      m.listings.push({
        id, seller, created: W.t, price, stock, genus: tpl.genus, cls,
        entry: {
          id, name, author: seller, genus: tpl.genus, cls, dna: stock[0], cond: condOf(stock.map(d => Gen.express(d, tpl.genus))),
          desc: `Lignée sélectionnée par ${seller}. ${['Très stable.', 'Encore quelques bébés hors standard.', 'Lignée récente, à stabiliser.', 'Issue de plusieurs générations de sélection.'][(rnd() * 4) | 0]}`,
          created: W.t, source: 'market',
        },
      });
    }
    if (W.t >= m.trendUntil) {
      const pool = ['Rouge', 'Bleu', 'Jaune', 'Noire', 'Orange', 'Blanche', 'Violet', 'Rouge à bandes', 'Noire à bandes', 'Rouge rili', 'Bleu rayée', 'Chocolat'];
      m.trend = pool[(rnd() * pool.length) | 0];
      m.trendUntil = W.t + 24 * 7;
    }
    m.nextRefresh = W.t + 24;
  }
  function buyListing(W, id, n) {
    const m = ensureMarket(W);
    const l = m.listings.find(x => x.id === id);
    if (!l) return 'Annonce introuvable.';
    n = Math.min(n, l.stock.length);
    if (!pay(W, l.price * n)) return `Pas assez de ${MONEY}.`;
    if (!W.bestiary.find(e => e.id === l.entry.id)) W.bestiary.push(Object.assign({}, l.entry));
    const list = l.stock.splice(0, n).map(dna => {
      const g = Gen.express(dna, l.genus);
      const sh = Sim.makeShrimp(W, l.genus, dna, { age: 60 + rnd() * 60, size: g.size * (.75 + rnd() * .2), strain: l.entry.id });
      sh.origin = `${l.entry.name} (${l.seller})`;
      return sh;
    });
    Sim.addBag(W, list, { gh: 4 + rnd() * 8, kh: rnd() * 6, ph: 6.2 + rnd() * 1.4, temp: 21 + rnd() * 3 }, `${n} × ${l.entry.name} de ${l.seller}`);
    if (!l.stock.length) m.listings = m.listings.filter(x => x !== l);
    return null;
  }

  // ---------- Ventes du joueur ----------
  function sell(W, s, ids, price, note) {
    const set = new Set(ids);
    const list = s.shrimp.filter(sh => set.has(sh.id) && !sh.listed);
    if (!list.length) return 'Aucune crevette disponible à la vente.';
    const l = { id: W.nextUid++, tank: s.id, ids: list.map(sh => sh.id), price, note: note || '', created: W.t, sold: 0 };
    for (const sh of list) sh.listed = l.id;
    W.listings.push(l);
    Sim.log(W, `🏷 Mise en vente : ${list.length} crevette(s) à ${fmt(price)} pièce.`, 'info', false, s);
    return null;
  }
  function unlist(W, id) {
    const l = W.listings.find(x => x.id === id);
    if (!l) return;
    for (const s of W.tanks) for (const sh of s.shrimp) if (sh.listed === id) sh.listed = null;
    W.listings = W.listings.filter(x => x !== l);
  }
  // Les acheteurs passent chaque heure ; plus le prix dépasse la valeur, moins ils achètent
  function salesTick(W, dt) {
    const m = ensureMarket(W);
    for (const l of W.listings.slice()) {
      const s = Sim.tankById(W, l.tank);
      if (!s) { unlist(W, l.id); continue; }
      const byId = new Map(s.shrimp.map(sh => [sh.id, sh]));
      l.ids = l.ids.filter(id => byId.has(id));
      for (const id of l.ids.slice()) {
        const sh = byId.get(id);
        const v = value(W, sh);
        const ratio = l.price / v;
        const p = Math.min(.3, .04 * Math.exp(-2.5 * (ratio - 1))) * dt;
        if (rnd() < p) {
          s.shrimp = s.shrimp.filter(x => x !== sh);
          l.ids = l.ids.filter(x => x !== id);
          l.sold++;
          earn(W, l.price);
          W.stats.sold++; W.stats.earned += l.price;
          const cls = Gen.colorClass(sh.g);
          m.sold[cls] = (m.sold[cls] || 0) + 1;
          const e = entryOf(W, sh.strain);
          Sim.log(W, `💰 Vendu : ${e ? '« ' + e.name + ' »' : cls} #${sh.id} pour ${fmt(l.price)} à ${BREEDERS[(rnd() * BREEDERS.length) | 0]}.`, 'birth', true, s);
        }
      }
      if (!l.ids.length) W.listings = W.listings.filter(x => x !== l);
    }
    // la saturation du marché s'estompe
    for (const k in m.sold) { m.sold[k] *= Math.exp(-dt / (24 * 10)); if (m.sold[k] < .5) delete m.sold[k]; }
  }

  function tick(W, dt) {
    if (!career(W)) return;
    const m = ensureMarket(W);
    if (W.t >= m.nextRefresh) refreshMarket(W);
    salesTick(W, dt);
  }

  // Monde de départ de la Carrière : de l'argent, l'eau du robinet du quartier, rien d'autre
  function newCareer() {
    const W = Sim.newWorld({ mode: 'career' });
    W.tap = rnd() < .5 ? 'tap_soft' : 'tap_hard';
    W.inv = {};
    refreshMarket(W);
    Sim.log(W, `Bienvenue ! Tu as ${fmt(W.money)}. Ton eau du robinet est ${WATERS[W.tap].name.toLowerCase()}. Commence par acheter un bac dans la boutique.`, 'info', true);
    return W;
  }

  return {
    career, pay, earn, owned, consume, spare, setEquip, maxIntensity, waterSources, useWater, testStrip, testDrops, reading,
    buy, tankPrice, createTank, buyStrain, ensureShopEntry, entryOf, createStrain, stability, countAlive, value,
    ensureMarket, refreshMarket, buyListing, sell, unlist, tick, newCareer, fmt, SHOP_WATER,
  };
})();
