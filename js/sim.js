'use strict';
// Simulation : un monde (temps, météo, courant, joueur) contient plusieurs bacs.
// Chaque bac : chimie de l'eau, cycle de l'azote, plantes, crevettes, prédateurs.
// Unités : temps en heures de jeu, concentrations en mg/L, réserves de nourriture en mg.

const Sim = (() => {
  const rnd = Math.random;
  const { clamp } = Gen;
  const CAP = 1500;
  const BABY = 7, JUV = 9, NEWBORN = 4.5;
  const TAU = Math.PI * 2;
  const DRIP_HOURS = 3;

  // ---------- Calendrier / climat ----------
  function calendar(W) {
    const total = W.start.hour + W.t;
    const dayIdx = Math.floor(total / 24);
    const hour = total - dayIdx * 24;
    const doyRaw = W.start.doy + dayIdx;
    return { day: Math.floor(W.t / 24) + 1, hour, doy: doyRaw % 365, year: Math.floor(doyRaw / 365) + 1 };
  }
  function roomTemp(W, c) {
    return 20.5 + 1.5 * Math.cos(TAU * (c.doy - 200) / 365) + .8 * Math.sin(TAU * (c.hour - 8) / 24) + (W.weather.heat > W.t ? 6 : 0);
  }
  function airTemp(W, c) {
    return 12.5 - 8.5 * Math.cos(TAU * (c.doy - 20) / 365) + 5 * Math.sin(TAU * (c.hour - 9) / 24)
      + (W.weather.heat > W.t ? 8 : 0) - (W.weather.cold > W.t ? 9 : 0) - (W.weather.rain > W.t ? 3 : 0);
  }
  function o2Sat(T) { return 14.6 - .39 * T + .007 * T * T; }
  function nh3Of(w) {
    const pKa = .09018 + 2729.92 / (w.temp + 273.15);
    return w.tan / (1 + Math.pow(10, pKa - w.ph));
  }

  function log(W, msg, kind = 'info', toast = false, tank = null) {
    if (tank && W.tanks.length > 1) msg = `[${tank.name}] ${msg}`;
    W.log.push({ t: W.t, msg, kind });
    if (W.log.length > 500) W.log.splice(0, W.log.length - 500);
    if (toast) (W._toasts || (W._toasts = [])).push({ msg, kind });
    if (toast && kind === 'bad') W._alarm = true;
  }
  const tankById = (W, id) => W.tanks.find(t => t.id === id);

  // ---------- Création ----------
  function makeShrimp(W, genus, dna, o = {}) {
    return {
      id: W.nextId++, genus, dna, g: Gen.express(dna, genus), sex: o.sex || (rnd() < .5 ? 'F' : 'M'),
      age: o.age ?? 0, size: o.size ?? 1.8, health: o.health ?? 1, hunger: .3,
      molt: o.molt ?? (2 + rnd() * 6), berried: null, gen: o.gen ?? 0,
      mom: o.mom ?? null, dad: o.dad ?? null, born: W.t, kids: 0, strain: o.strain ?? null,
    };
  }
  function storeShrimp(W, vkey) {
    const dna = Gen.strainDNA(vkey);
    const g = Gen.express(dna, VARIETIES[vkey].genus);
    const sh = makeShrimp(W, VARIETIES[vkey].genus, dna, { age: 60 + rnd() * 90, size: g.size * (.78 + rnd() * .17), molt: rnd() * 8, strain: 'shop:' + vkey });
    sh.origin = VARIETIES[vkey].name;
    return sh;
  }

  function newWorld(cfg) {
    const now = new Date();
    const realDoy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5) % 365;
    const real = cfg.mode !== 'sandbox';
    const W = {
      v: 2, mode: cfg.mode, created: Date.now(), realLast: Date.now(), t: 0,
      seed: (rnd() * 1e9) | 0,
      start: real ? { doy: realDoy, hour: now.getHours() + now.getMinutes() / 60 } : { doy: ({ spring: 100, summer: 180, autumn: 270, winter: 350 }[cfg.season] ?? 100), hour: 9 },
      cfg: { events: cfg.mode === 'sandbox' ? cfg.events : true, mutRate: cfg.mode === 'sandbox' ? cfg.mutRate : 1 },
      weather: { rain: 0, rainI: 1, heat: 0, cold: 0 }, power: true, powerUntil: 0,
      tanks: [], cur: 0, nextId: 1, nextTank: 1,
      log: [], stats: { born: 0, dead: {}, maxGen: 0, mutations: 0, sold: 0, earned: 0 }, over: false,
      money: cfg.mode === 'career' ? START_MONEY : Infinity, inv: {}, bags: [], transfers: [],
      bestiary: [], strainStats: {}, listings: [], market: null, nextUid: 1,
    };
    if (cfg.tank) newTank(W, cfg.tank);
    return W;
  }

  // cfg : { name, env, volume, substrate, water, plants, mature, eq, fish, shrimp: { variété: n } }
  function newTank(W, cfg) {
    const src = WATERS[cfg.water];
    const sub = SUBSTRATES[cfg.substrate];
    const id = W.nextTank++;
    const s = {
      id, name: cfg.name || `${cfg.env === 'pond' ? 'Bassin' : 'Bac'} ${id}`, env: cfg.env, seed: (rnd() * 1e9) | 0,
      cfg: { volume: cfg.volume, substrate: cfg.substrate, water: cfg.water },
      w: { temp: 20, gh: src.gh, kh: src.kh, ph: 7, tan: 0, no2: 0, no3: src.no3, o2: 8, co2: 3, tannin: sub.earth ? .2 : sub.tannin || 0, level: 1 },
      pools: { food: 0, veg: 0, powder: 0, det: 0, biofilm: 0 },
      algae: .03, bactA: 1e-4, bactB: 1e-4,
      soilCap: sub.soil ? 1 : 0, soilLeach: sub.soil ? 1 : sub.earth ? .5 : sub.leach || 0,
      plants: {},
      eq: Object.assign({ filter: 'none', clog: 0, heater: false, target: 24, co2: false, light: 8, intensity: .6, air: false, ato: false, shade: false, ledPro: false, probePh: false, probeAll: false }, cfg.eq || {}),
      heaterStuck: false, disease: 0,
      shrimp: [], pred: { hydra: 0, plan: 0, fish: cfg.fish || 0, fishHealth: 1, fishHunger: .3 },
      treat: { fenben: 0, trap: 0 }, hist: [], lastHist: -24, tests: {}, seen: {},
      t: W.t, power: true, light: 0,
    };
    W.tanks.push(s);
    s._W = W;
    const c = calendar(W);
    s.w.temp = cfg.env === 'aquarium' ? (s.eq.heater ? s.eq.target : roomTemp(W, c)) : airTemp(W, c);
    s.w.o2 = o2Sat(s.w.temp);
    for (const p of cfg.plants || []) { s.plants[p] = .2; hitchhikers(W, s, true); }
    s.pools.biofilm = s.cfg.volume * (cfg.mature ? 3 : .3);
    if (cfg.mature) {
      const Kb = bactCap(s);
      s.bactA = Kb * .5; s.bactB = Kb * .5;
      s.soilLeach = 0;
      for (const p in s.plants) s.plants[p] = .45;
    }
    for (const [vk, n] of Object.entries(cfg.shrimp || {})) for (let i = 0; i < n; i++) s.shrimp.push(storeShrimp(W, vk));
    for (const sh of s.shrimp) s.seen[Gen.colorClass(sh.g)] = 1;
    log(W, `${s.name} mis en eau : ${cfg.volume} L, ${sub.name}, ${src.name}.`, 'info');
    if (!cfg.mature) log(W, "Bac neuf : le cycle de l'azote n'est pas fait. Surveille l'ammoniac et les nitrites !", 'warn', true, s);
    return s;
  }

  function hitchhikers(W, s, silent) {
    if (rnd() < .15) { s.pred.hydra += 2; if (!silent) log(W, 'Des hydres sont peut-être arrivées avec les plantes…', 'warn', false, s); }
    if (rnd() < .15) { s.pred.plan += 2; if (!silent) log(W, 'Des planaires sont peut-être arrivées avec les plantes…', 'warn', false, s); }
  }

  function bactCap(s) {
    const sub = SUBSTRATES[s.cfg.substrate];
    const fb = s.env === 'aquarium' ? FILTERS[s.eq.filter].bact : 1.5;
    let cover = 0;
    for (const k in s.plants) cover += s.plants[k] * PLANTS[k].biofilm;
    return .05 * (sub.surface + fb + cover * .5);
  }

  // ---------- Événements ----------
  function worldEvents(W, c, dt) {
    if (!W.power && W.t >= W.powerUntil) { W.power = true; log(W, '⚡ Courant rétabli.', 'info', true); }
    const hasPond = W.tanks.some(t => t.env === 'pond');
    if (W.weather.rain > 0 && W.weather.rain <= W.t && W.weather.rain > W.t - dt && hasPond) log(W, '🌤 Fin de la pluie.', 'info');
    rainCheck(W, c, dt, hasPond);
    if (!W.cfg.events) return;
    const f = W.mode === 'hardcore' ? 1.5 : 1;
    if (W.power && W.tanks.length && rnd() < dt / (24 * 75) * f) {
      const h = 2 + rnd() * 10;
      W.power = false; W.powerUntil = W.t + h;
      log(W, `⚡ Coupure de courant (~${Math.round(h)} h) : filtres, chauffages et CO2 à l'arrêt !`, 'bad', true);
    }
    if (c.doy > 165 && c.doy < 240 && W.weather.heat <= W.t && rnd() < dt / (24 * 25)) {
      W.weather.heat = W.t + 24 * (3 + rnd() * 4);
      log(W, '☀️ Canicule ! La température de la pièce et de l\'air monte.', 'warn', true);
    }
    if (hasPond && (c.doy > 335 || c.doy < 60) && W.weather.cold <= W.t && rnd() < dt / (24 * 20)) {
      W.weather.cold = W.t + 24 * (3 + rnd() * 3);
      log(W, '❄️ Vague de froid.', 'warn', true);
    }
  }
  function tankEvents(W, s, dt) {
    const aq = s.env === 'aquarium';
    if (s.eq.filter !== 'none' && aq) s.eq.clog = Math.min(1, s.eq.clog + dt / (24 * 50));
    if (!W.cfg.events) return;
    const f = W.mode === 'hardcore' ? 1.5 : 1;
    if (aq && s.eq.heater && !s.heaterStuck && rnd() < dt / (24 * 240) * f) {
      s.heaterStuck = true;
      log(W, '🔥 Le chauffage est bloqué en marche ! La température grimpe. Remplace-le.', 'bad', true, s);
    }
    const org = (s.pools.food + s.pools.det) / (s.cfg.volume * s.w.level);
    if (s.disease <= W.t && s.shrimp.length > 10 && rnd() < dt / (24 * 160) * f * (1 + org / 3 + s.w.no3 / 40)) {
      s.disease = W.t + 24 * 5;
      for (const sh of s.shrimp) if (rnd() < .2) sh.health -= .2;
      log(W, '🦠 Infection bactérienne ! Les crevettes affaiblies sont en danger. Changements d\'eau et siphonnage aident.', 'bad', true, s);
    }
    if (rnd() < dt / (24 * 400) * f) { s.pred.plan += 2; log(W, 'Quelques planaires sont apparues (œufs dormants ?).', 'warn', false, s); }
  }
  function rainCheck(W, c, dt, hasPond) {
    if (W.weather.rain > W.t) return;
    const season = seasonOf(c.doy);
    const p = season === 'Été' ? 1 / (24 * 8) : season === 'Printemps' ? 1 / (24 * 4) : 1 / (24 * 3);
    if (rnd() < p * dt) {
      W.weather.rain = W.t + 2 + rnd() * 10;
      W.weather.rainI = .5 + rnd() * 1.5;
      if (hasPond) log(W, W.weather.rainI > 1.4 ? '🌧 Grosse averse sur le bassin.' : '🌦 Il pleut.', 'info');
    }
  }

  // ---------- Pas de simulation ----------
  function step(W, dt) {
    const c = calendar(W);
    worldEvents(W, c, dt);
    W.t += dt;
    for (const s of W.tanks) stepTank(W, s, c, dt);
    processTransfers(W);
    stepBags(W, c, dt);
    if (typeof Economy !== 'undefined') Economy.tick(W, dt);
    const alive = W.tanks.some(t => t.shrimp.length) || W.bags.some(b => b.shrimp.length) || W.transfers.length;
    if (!alive && !W.over && W.stats.born + Object.keys(W.stats.dead).length > 0) {
      W.over = true;
      log(W, '☠️ Il ne reste plus aucune crevette.', 'bad', true);
    }
    if (alive) W.over = false;
  }

  function stepTank(W, s, c, dt) {
    s._W = W;
    s.t = W.t;
    s.power = W.power;
    s._wx = W.weather;
    tankEvents(W, s, dt);
    const aq = s.env === 'aquarium';
    const w = s.w, eq = s.eq, P = s.pools;
    const sub = SUBSTRATES[s.cfg.substrate];
    const V = s.cfg.volume * w.level;
    const power = W.power;

    // Lumière
    let light;
    if (aq) light = power && c.hour >= 9 && c.hour < 9 + eq.light ? eq.intensity : 0;
    else {
      const dl = 12 + 4 * Math.cos(TAU * (c.doy - 172) / 365);
      const x = (c.hour - (12 - dl / 2)) / dl;
      light = x > 0 && x < 1 ? Math.sin(Math.PI * x) : 0;
      if (W.weather.rain > W.t) light *= .45;
      if (eq.shade) light *= .6;
    }
    s.light = light;
    const lemna = s.plants.lemna || 0;
    const lightBelow = light * (1 - .6 * lemna);

    // Température
    let envT, k;
    const air = aq ? roomTemp(W, c) : airTemp(W, c);
    s.air = air;
    if (aq) {
      envT = air + (light > 0 ? .6 : 0);
      k = .06 * Math.cbrt(60 / V);
      const heating = power && (eq.heater || s.heaterStuck);
      const tgt = s.heaterStuck ? 34 : eq.target;
      if (heating && tgt > envT) { envT = tgt; k = Math.max(k, .2); }
    } else {
      envT = air + light * 3 * (eq.shade ? .4 : 1);
      k = .03 * Math.cbrt(250 / V);
    }
    w.temp += (envT - w.temp) * (1 - Math.exp(-k * dt));
    if (!aq) w.temp = Math.max(w.temp, s.cfg.volume >= 500 ? 4 : 2);
    const ice = !aq && air < -1 && w.temp < 4.5;
    s.ice = ice;
    const mT = clamp(1 + .07 * (w.temp - 22), .15, 2);

    // Échanges gazeux
    let exch;
    if (aq) {
      const f = FILTERS[eq.filter];
      exch = .04 + (power ? f.flow * (1 - .7 * eq.clog) : 0) + (eq.air && power ? .25 : 0);
    } else exch = (.1 + (eq.air ? .2 : 0)) * (ice ? .2 : 1);

    // Plantes
    const N = w.tan + w.no3 / 4.4;
    const nutr = N / (N + .5);
    const co2b = 1 + .6 * clamp((w.co2 - 3) / 25, 0, 1);
    let upN = 0, o2prod = 0, plantResp = 0, cover = 0, bioS = 0;
    for (const key in s.plants) {
      const pd = PLANTS[key];
      let cv = s.plants[key];
      const ok = w.temp >= pd.tMin && w.temp <= pd.tMax ? 1 : 0;
      const lt = pd.floating ? light : lightBelow;
      const dem = pd.dem || 0;
      const needs = 1 - dem + dem * clamp((w.co2 - 5) / 20, 0, 1) * Math.min(1, lt / .7);
      const grow = pd.r / 24 * lt * nutr * co2b * needs * ok * cv * (1 - cv);
      cv = clamp(cv + (grow - (ok ? 0 : .004 * cv)) * dt, .01, 1);
      s.plants[key] = cv;
      upN += cv * pd.up * lt * ok * co2b;
      o2prod += cv * pd.o2 * lt * ok * .08;
      plantResp += cv * pd.o2 * .015;
      cover += cv * pd.cover;
      bioS += cv * pd.biofilm;
    }
    cover = Math.min(1, cover);
    s.cover = cover;
    {
      const take = upN * dt;
      const fromTan = Math.min(w.tan * .9, take * .5);
      const fromNo3 = Math.min(w.no3 / 4.4 * .95, take - fromTan);
      w.tan -= fromTan; w.no3 -= fromNo3 * 4.4;
    }

    // Algues et biofilm
    const comp = Math.min(.85, upN / .03);
    s.algae += (.1 / 24 * light * nutr * (1 - comp) * (w.no3 > 20 ? 2 : 1) * s.algae * (1 - s.algae)
      - (nutr < .3 ? .02 / 24 * s.algae : 0)) * dt;
    const K = V * 2 * (sub.surface + bioS + s.algae * 2) * (aq ? 1 : 1.5);
    const rB = .5 / 24 * (.3 + .7 * light) * (.4 + .6 * nutr) * (w.temp < 8 ? .3 : 1);
    P.biofilm += (rB * P.biofilm * (1 - P.biofilm / K) + .001 * V) * dt;
    if (!aq) {
      if (c.doy > 120 && c.doy < 270 && w.temp > 14) P.food += V * .002 * dt;               // larves de moustiques
      if (c.doy > 280 && c.doy < 335) { P.veg += V * .008 * dt; w.tannin += .0005 * dt; }  // feuilles mortes
    }

    // Décomposition
    const dec = (key, rate) => { const d = P[key] * (1 - Math.exp(-rate * mT * dt)); P[key] -= d; return d; };
    const dF = dec('food', .025) + dec('veg', .006) + dec('powder', .06);
    const dD = dec('det', .008);
    P.det += .6 * dF;
    w.tan += (.025 * dF + .045 * dD) / V;
    let o2cons = (dF + dD) * .02 / V / dt;

    // Sol
    if (sub.soil && s.soilCap > 0) {
      w.kh += (0 - w.kh) * (1 - Math.exp(-.01 * s.soilCap * dt));
      s.soilCap = Math.max(0, s.soilCap - dt / (24 * 420));
    }
    if (s.soilLeach > .001) {
      w.tan += .025 * s.soilLeach * dt * (sub.earth ? .5 : 1);
      if (sub.earth) w.tannin += (.25 - w.tannin) * .002 * dt;
      s.soilLeach *= Math.exp(-dt / (24 * 18));
    }
    if (sub.tannin) w.tannin += (sub.tannin - w.tannin) * .002 * dt;          // feuilles de catappa
    if (sub.calc) {                                                              // calcaire : remonte GH/KH
      w.kh += Math.max(0, 7 - w.kh) * .0015 * sub.calc * dt;
      w.gh += Math.max(0, 12 - w.gh) * .0015 * sub.calc * dt;
    }
    w.tannin *= Math.exp(-.0006 * dt);

    // Bactéries (nitrification)
    const Kb = bactCap(s);
    const o2ok = w.o2 > 2 ? 1 : .2;
    const procA = Math.min(w.tan * .95, s.bactA * mT * w.tan / (w.tan + .1) * dt);
    w.tan -= procA; w.no2 += procA * 2.7;
    const procB = Math.min(w.no2 * .95, s.bactB * mT * w.no2 / (w.no2 + .1) * dt);
    w.no2 -= procB; w.no3 += procB * 1.35;
    s.bactA = Math.max(1e-5, s.bactA + (s.bactA * .03 * mT * o2ok * w.tan / (w.tan + .2) * (1 - s.bactA / Kb) - s.bactA * .0015) * dt);
    s.bactB = Math.max(1e-5, s.bactB + (s.bactB * .022 * mT * o2ok * w.no2 / (w.no2 + .2) * (1 - s.bactB / Kb) - s.bactB * .0015) * dt);
    o2cons += (procA * 3 + procB) / dt;

    // ---------- Crevettes : nourriture ----------
    const shrimp = s.shrimp;
    let adultEq = 0, Da = 0, Db = 0;
    for (const sh of shrimp) {
      const m3 = (sh.size / 25) ** 3;
      adultEq += m3;
      const e = Math.min(sh.hunger, .08 * dt * mT);
      sh._e = e;
      const need = e * (.6 * m3 + .02);
      if (sh.size < BABY) Db += need; else Da += need;
    }
    const take = (key, amt, cap = Infinity) => { const a = Math.max(0, Math.min(amt, P[key], cap)); P[key] -= a; return a; };
    const bioCap = P.biofilm * .04 * dt;
    let gotB = take('powder', Db);
    let bioUsed = take('biofilm', Db - gotB, bioCap); gotB += bioUsed;
    gotB += take('food', (Db - gotB) * 2) * .5;
    let gotA = take('food', Da);
    gotA += take('veg', Da - gotA, P.veg * .05 * dt);
    gotA += take('biofilm', Da - gotA, bioCap - bioUsed);
    gotA += take('powder', Da - gotA);
    const rb = Db > 0 ? gotB / Db : 1, ra = Da > 0 ? gotA / Da : 1;
    const eaten = gotA + gotB;
    w.tan += (eaten * .1 + adultEq * .004 * mT * dt) / V;
    P.det += eaten * .2;
    o2cons += adultEq * .008 * mT / V;
    s.algae = Math.max(.01, s.algae - adultEq / V * .01 / 24 * dt);

    // Poissons (faim)
    const pr = s.pred;
    if (pr.fish > 0) {
      pr.fishHunger = clamp(pr.fishHunger + .03 * dt * mT, 0, 1);
      const got = take('food', pr.fish * .3 * dt * pr.fishHunger);
      pr.fishHunger = Math.max(0, pr.fishHunger - got / (pr.fish * .6));
      w.tan += pr.fish * .015 * dt / V;
      o2cons += pr.fish * .01 / V;
    }

    // ---------- Chimie finale ----------
    {
      const kc = exch * 2 + .05;
      const resp = (adultEq * .03 + pr.fish * .02 + dF + dD * .5) / V + plantResp;
      const use = light > 0 ? upN * 40 : 0;
      const eqv = 2.5 + (resp - use) / kc;
      w.co2 = eqv + (w.co2 - eqv) * Math.exp(-kc * dt);
      if (aq && eq.co2 && power && light > 0) w.co2 += (30 - w.co2) * (1 - Math.exp(-.6 * dt));
      w.co2 = clamp(w.co2, .4, 90);
      const ko = exch * 1.5 + .03;
      const sat = o2Sat(w.temp);
      const eo = sat + (o2prod - o2cons - plantResp) / ko;
      w.o2 = clamp(eo + (w.o2 - eo) * Math.exp(-ko * dt), 0, sat * 1.6);
      const acid = (sub.soil ? .3 * s.soilCap : 0) + .7 * w.tannin + (sub.earth ? .1 : 0) + (sub.acid || 0);
      const phEq = clamp(7 + Math.log10(3 * Math.max(w.kh, .3) / Math.max(w.co2, .5)) - acid, 4.8, 8.8);
      w.ph += (phEq - w.ph) * (1 - Math.exp(-.3 * dt));
    }
    // Évaporation / pluie / osmolateur
    {
      let evap = aq ? .004 / 24 * (1 + .05 * (w.temp - 22)) : .004 / 24 * (1 + .06 * Math.max(0, air - 15)) * (light > 0 ? 1.4 : .6);
      if (ice) evap = 0;
      const nl = Math.max(.3, w.level - evap * dt);
      concentrate(s, w.level / nl); w.level = nl;
      if (aq && eq.ato && power && w.level < .985) topOff(W, s, 'ro', true);
      if (!aq && W.weather.rain > W.t) {
        const add = .006 * dt * W.weather.rainI;
        mixIn(s, RAIN, add / (w.level + add), null);
        w.level = Math.min(1, w.level + add);
        w.temp -= .1 * dt;
      }
    }
    w.tan = Math.max(0, w.tan); w.no2 = Math.max(0, w.no2); w.no3 = Math.max(0, w.no3);

    // ---------- Crevettes : vie ----------
    const nh3 = nh3Of(w);
    s.nh3 = nh3;
    const tox = {
      nh3: Math.max(0, nh3 - .005) / .03,
      no2: Math.max(0, w.no2 - .2) / 1,
      no3: Math.max(0, w.no3 - 40) / 80,
      o2: Math.max(0, 3.5 - w.o2) / 2.5,
      med: s.treat.fenben > W.t ? .12 : 0,
      level: w.level < .6 ? (.6 - w.level) * 3 : 0,
      crowd: Math.max(0, adultEq / V - 8) / 10,
    };
    const toxSum = tox.nh3 + tox.no2 + tox.no3 + tox.o2 + tox.med + tox.level + tox.crowd;
    s.toxSum = toxSum;
    const sick = s.disease > W.t;
    const planMolt = Math.min(.12, pr.plan / (V * 20));
    // densité : au-delà de ~3 crevettes/L, les femelles pondent de moins en moins
    const dens = shrimp.length / V;
    const crowdBreed = clamp(1 - (dens - 3) / 5, .05, 1);
    const babyCrowd = .003 * Math.max(0, dens - 4);
    s.crowd = dens;
    let males = null;
    const newborn = [];
    const dead = [];

    for (const sh of shrimp) {
      const g = sh.g;
      const baby = sh.size < BABY;
      // compétition inégale : les plus vigoureuses mangent d'abord
      const vig = sh.vig ?? (sh.vig = .6 + rnd() * .8);
      const r = Math.min(1, (baby ? rb : ra) * vig * Math.sqrt(sh.health + .2));
      sh.hunger = clamp(sh.hunger - sh._e * r + .012 * dt * mT, 0, 1);
      const fit = Gen.fitness(g, w);
      let stress = (1 - fit.all) + toxSum * (baby ? 1.4 : 1) + (sick && sh.health < .5 ? .25 : 0);
      let dmg = 0;
      if (stress > .35) dmg += (stress - .35) * .025 * Math.max(.12, mT);
      if (sh.hunger > .85) dmg += .008 * mT;
      if (w.temp > 35) dmg += .3;
      if (dmg > 0) sh.health -= dmg * dt;
      else sh.health = Math.min(1, sh.health + .006 * dt * mT);
      sh.stress = stress;
      sh.age += dt / 24 * Math.max(.35, mT);
      sh.size += (g.size - sh.size) * .0007 * g.growth * mT * (1 - sh.hunger * .8) * Math.sqrt(fit.all) * dt;

      if (sh.health <= 0) { dead.push([sh, deathCause(sh, fit, tox, sick)]); continue; }
      if (baby && babyCrowd && rnd() < babyCrowd * dt) { dead.push([sh, 'surpopulation']); continue; }
      const lifeEff = g.life / Math.sqrt(g.growth);
      if (sh.age > lifeEff && rnd() < ((sh.age - lifeEff) / lifeEff * .02 + .0005) * dt) { dead.push([sh, 'vieillesse']); continue; }

      // Mue
      sh.molt -= dt / 24 * mT;
      if (sh.molt <= 0) {
        sh.molt = Math.min(22, 5 + sh.age / 18) * (.85 + rnd() * .3);
        if (rnd() < planMolt) { dead.push([sh, 'planaires']); continue; }
        const pFail = .003 + .3 * (1 - fit.fG) ** 2 + .08 * (1 - sh.health) + (stress > 1 ? .1 : 0);
        if (rnd() < pFail) { dead.push([sh, 'mue ratée']); continue; }
        // Accouplement juste après la mue
        if (sh.sex === 'F' && !sh.berried && isMature(sh) && fit.fT > .6 && fit.all > .35 && sh.hunger < .65 && sh.health > .5) {
          if (!males) {
            males = {};
            for (const m of shrimp) if (m.sex === 'M' && isMature(m) && m.health > .3) (males[m.genus] || (males[m.genus] = [])).push(m);
          }
          const list = males[sh.genus];
          if (list && list.length && rnd() < .85 * crowdBreed) {
            const dad = list[(rnd() * list.length) | 0];
            const n = Math.round(GENERA[sh.genus].clutch * g.fert * Gen.fertCost(g) * (sh.size / 25) ** 2 * (.5 + .5 * sh.health) * (.8 + .4 * rnd()));
            if (n > 0) sh.berried = { days: GENERA[sh.genus].gestation, n, dadDna: dad.dna, dadId: dad.id, dadGen: dad.gen, dadStrain: dad.strain };
          }
        }
      }
      // Gestation
      if (sh.berried) {
        const b = sh.berried;
        b.days -= dt / 24 * Math.pow(mT, .8);
        if (stress > .9 && rnd() < .01 * dt) { sh.berried = null; log(W, `#${sh.id} a lâché ses œufs (stress).`, 'warn', false, s); }
        else if (b.days <= 0) {
          let born = 0;
          const strain = sh.strain && sh.strain === b.dadStrain ? sh.strain : null;
          for (let i = 0; i < b.n; i++) {
            if (shrimp.length + newborn.length >= CAP) break;
            const { dna, muts } = Gen.cross(sh.dna, b.dadDna, W.cfg.mutRate);
            const kid = makeShrimp(W, sh.genus, dna, { gen: Math.max(sh.gen, b.dadGen) + 1, mom: sh.id, dad: b.dadId, health: .9, strain });
            newborn.push(kid);
            born++;
            if (muts.length) W.stats.mutations++;
            const cls = Gen.colorClass(kid.g);
            if (strain) {
              const ss = W.strainStats[strain] || (W.strainStats[strain] = { n: 0, cls: {} });
              ss.n++; ss.cls[cls] = (ss.cls[cls] || 0) + 1;
            }
            if (!s.seen[cls]) {
              s.seen[cls] = 1;
              log(W, `✨ Nouveau phénotype : ${cls} (#${kid.id}, fille de #${sh.id}) !`, 'mut', true, s);
            }
          }
          sh.kids += born;
          W.stats.born += born;
          if (born < b.n) log(W, `Surpopulation : ${b.n - born} bébés n'ont pas survécu.`, 'warn', false, s);
          if (born) log(W, `🥚 #${sh.id} a libéré ${born} bébés.`, 'birth', false, s);
          sh.berried = null;
        }
      }
    }

    // ---------- Prédation ----------
    const alive = new Set(shrimp);
    for (const [sh] of dead) alive.delete(sh);
    const juv = [], nb = [];
    for (const sh of alive) { if (sh.size < JUV) { juv.push(sh); if (sh.size < NEWBORN) nb.push(sh); } }
    const bg = Gen.mix(sub.color, [.15, .35, .12], Math.min(.7, cover * .6));
    if (pr.fish > 0 && juv.length) {
      const Kk = pr.fish * .15 * dt * (.4 + pr.fishHunger) * juv.length / (juv.length + 12) * (1 - .6 * cover);
      let sw = 0;
      const ws = juv.map(sh => { const x = Gen.conspicuity(sh.g, express(sh), bg) ** 3 + .02; sw += x; return x; });
      let kills = 0;
      juv.forEach((sh, i) => {
        if (rnd() < Math.min(.95, Kk * ws[i] / sw)) { dead.push([sh, 'mangée (rasbora)']); alive.delete(sh); kills++; }
      });
      pr.fishHunger = Math.max(0, pr.fishHunger - kills * .06 / pr.fish);
    }
    const kill = (list, Kk, cause) => {
      if (!list.length || Kk <= 0) return;
      const p = Math.min(.9, Kk / list.length);
      for (const sh of list) if (alive.has(sh) && rnd() < p) { dead.push([sh, cause]); alive.delete(sh); }
    };
    kill(nb, pr.hydra * .004 * dt * nb.length / (nb.length + 15), 'hydres');
    kill(nb, pr.plan * .0015 * dt * nb.length / (nb.length + 15), 'planaires');
    if (aq && power && FILTERS[eq.filter].suck) kill(nb.filter(x => x.size < 3), nb.length * FILTERS[eq.filter].suck * .05 * dt, 'aspirée par le filtre');

    // Populations de prédateurs
    {
      const pw = P.powder / V, org = (P.food + P.det) / V;
      const logi = (x, r, cap) => clamp(x + x * r * (r > 0 ? Math.max(0, 1 - x / cap) : 1) * dt, 0, cap);
      pr.hydra = logi(pr.hydra, .012 * pw / (pw + .3) + .02 * nb.length / (nb.length + 15) + .004 * org / (org + 2) - .004, V * 3);
      pr.plan = logi(pr.plan, .008 * org / (org + 4) - .003, V * 2);
      if (s.treat.fenben > W.t) { pr.hydra *= Math.exp(-.05 * dt); pr.plan *= Math.exp(-.05 * dt); }
      if (s.treat.trap > W.t) pr.plan *= Math.exp(-.012 * dt);
      if (pr.hydra < .5) pr.hydra = 0;
      if (pr.plan < .5) pr.plan = 0;
      if (pr.fish > 0) {
        const fT = Gen.fitRange(FISH.tOpt, FISH.tTol, w.temp, 1), fP = Gen.fitRange(FISH.phOpt, FISH.phTol, w.ph, .2);
        const fs = (1 - fT * fP) + toxSum + (pr.fishHunger > .9 ? .5 : 0);
        if (fs > .4) pr.fishHealth -= (fs - .4) * .02 * dt; else pr.fishHealth = Math.min(1, pr.fishHealth + .01 * dt);
        if (pr.fishHealth <= 0) { pr.fish--; pr.fishHealth = .7; log(W, '🐟 Un micro rasbora est mort.', 'warn', false, s); }
      }
    }

    // Morts / naissances
    if (dead.length) {
      const ds = new Set();
      for (const [sh, cause] of dead) {
        if (ds.has(sh)) continue;
        ds.add(sh);
        W.stats.dead[cause] = (W.stats.dead[cause] || 0) + 1;
        // les cadavres sont en partie mangés par les autres crevettes
        P.food += (sh.size / 25) ** 3 * 12; P.det += (sh.size / 25) ** 3 * 6;
      }
      s.shrimp = shrimp.filter(sh => !ds.has(sh));
      if (dead.length >= 5) log(W, `💀 ${dead.length} crevettes mortes (${dead[0][1]}…)`, 'bad', false, s);
      else for (const [sh, cause] of dead) if (sh.size >= BABY) log(W, `💀 #${sh.id} est morte : ${cause}.`, 'dead', false, s);
    }
    if (newborn.length) {
      for (const kid of newborn) W.stats.maxGen = Math.max(W.stats.maxGen, kid.gen);
      s.shrimp.push(...newborn);
    }
    for (const sh of s.shrimp) delete sh._e;

    if (W.t - s.lastHist >= 24) { s.lastHist = W.t; sample(s); }
  }

  function isMature(sh) { return sh.size >= .72 * sh.g.size && sh.age > 45; }
  function express(sh) { return Math.min(1, .5 + sh.age / 30); }

  function deathCause(sh, fit, tox, sick) {
    const c = [
      ['température', (1 - fit.fT) * 1.2], ['pH', 1 - fit.fP], ['GH', 1 - fit.fG],
      ['ammoniac', tox.nh3], ['nitrites', tox.no2], ['nitrates', tox.no3], ['manque d\'oxygène', tox.o2],
      ['traitement', tox.med], ['niveau d\'eau', tox.level], ['surpopulation', tox.crowd],
      ['faim', sh.hunger > .85 ? .6 : 0], ['infection', sick ? .5 : 0],
    ];
    c.sort((a, b) => b[1] - a[1]);
    return c[0][0];
  }

  function concentrate(s, r) {
    const w = s.w;
    for (const k of ['gh', 'kh', 'tan', 'no2', 'no3', 'tannin']) w[k] *= r;
  }
  // Mélange une fraction p d'une eau source dans le bac
  function mixIn(s, src, p, temp) {
    const w = s.w;
    w.gh = w.gh * (1 - p) + src.gh * p;
    w.kh = w.kh * (1 - p) + src.kh * p;
    w.no3 = w.no3 * (1 - p) + (src.no3 || 0) * p;
    w.tan *= 1 - p; w.no2 *= 1 - p; w.tannin *= 1 - p;
    if (temp != null) w.temp = w.temp * (1 - p) + temp * p;
  }

  function sample(s) {
    const st = popStats(s);
    s.hist.push({
      t: s.t, n: s.shrimp.length, juv: st.juv, ber: st.berried, ad: st.adults,
      m: st.mean, rgb: st.rgb,
      temp: s.w.temp, ph: s.w.ph, gh: s.w.gh, kh: s.w.kh, nh3: s.nh3 || 0, no2: s.w.no2, no3: s.w.no3, o2: s.w.o2,
      hydra: s.pred.hydra, plan: s.pred.plan, fish: s.pred.fish,
    });
    if (s.hist.length > 1500) s.hist = s.hist.filter((_, i) => i % 2 === 0);
  }

  function popStats(s) {
    const n = s.shrimp.length;
    const mean = {}, sd = {};
    for (const k of GENE_KEYS) mean[k] = 0;
    let juv = 0, adults = 0, berried = 0, F = 0, M = 0, hx = 0, hy = 0;
    const genus = { neo: 0, car: 0 };
    let r = 0, g = 0, b = 0;
    for (const sh of s.shrimp) {
      for (const k of GENE_KEYS) if (k !== 'hue') mean[k] += sh.g[k];
      hx += Math.cos(sh.g.hue * Math.PI / 180) * sh.g.sat; hy += Math.sin(sh.g.hue * Math.PI / 180) * sh.g.sat;
      if (isMature(sh)) { adults++; sh.sex === 'F' ? F++ : M++; } else juv++;
      if (sh.berried) berried++;
      genus[sh.genus]++;
      const c = Gen.color(sh.g), d = sh.g.dens;
      r += c[0] * d + Gen.WATER_RGB[0] * (1 - d); g += c[1] * d + Gen.WATER_RGB[1] * (1 - d); b += c[2] * d + Gen.WATER_RGB[2] * (1 - d);
    }
    if (n) {
      for (const k of GENE_KEYS) mean[k] /= n;
      mean.hue = ((Math.atan2(hy, hx) * 180 / Math.PI) + 360) % 360;
      for (const k of GENE_KEYS) {
        if (k === 'hue') continue;
        let v = 0;
        for (const sh of s.shrimp) v += (sh.g[k] - mean[k]) ** 2;
        sd[k] = Math.sqrt(v / n);
      }
    }
    return { n, juv, adults, berried, F, M, genus, mean, sd, rgb: n ? [r / n, g / n, b / n] : [0, 0, 0] };
  }

  function advance(W, hours) {
    let rem = hours;
    while (rem > 1e-9) { const dt = Math.min(1, rem); step(W, dt); rem -= dt; }
  }

  // ---------- Transferts, acclimatation, sacs ----------
  const waterOf = s => ({ gh: s.w.gh, kh: s.w.kh, ph: s.w.ph, temp: s.w.temp });
  // Retire des crevettes d'un bac (ou d'un sac) et les met en acclimatation vers un autre bac
  function startTransfer(W, list, src, toId, method, label) {
    if (!list.length) return null;
    const tr = { id: W.nextUid++, shrimp: list, src, to: toId, method, end: W.t + (method === 'drip' ? DRIP_HOURS : .05), label };
    for (const sh of list) sh.listed = null;
    W.transfers.push(tr);
    const to = tankById(W, toId);
    log(W, `🥅 ${list.length} crevette(s) ${method === 'drip' ? 'en acclimatation au goutte-à-goutte' : 'transférées directement'} vers ${to ? to.name : '?'}.`);
    return tr;
  }
  function netFromTank(W, tank, ids, toId, method) {
    const set = new Set(ids);
    const list = tank.shrimp.filter(sh => set.has(sh.id));
    tank.shrimp = tank.shrimp.filter(sh => !set.has(sh.id));
    return startTransfer(W, list, waterOf(tank), toId, method, tank.name);
  }
  function processTransfers(W) {
    for (const tr of W.transfers.slice()) {
      if (tr.end > W.t) continue;
      W.transfers.splice(W.transfers.indexOf(tr), 1);
      const to = tankById(W, tr.to);
      if (!to) continue;
      const d = to.w;
      const shock = Math.abs(tr.src.gh - d.gh) / 4 + Math.abs(tr.src.ph - d.ph) / .7 + Math.abs(tr.src.temp - d.temp) / 5;
      const f = (tr.method === 'drip' ? .12 : 1) * shock;
      let died = 0, molts = 0;
      for (const sh of tr.shrimp) {
        sh.health -= f * .3 * (sh.size < BABY ? 1.4 : 1) * (.6 + .8 * rnd());
        if (sh.health <= 0) { died++; W.stats.dead['choc (acclimatation)'] = (W.stats.dead['choc (acclimatation)'] || 0) + 1; continue; }
        if (f > .4 && rnd() < .5) { sh.molt = Math.min(sh.molt, .2); molts++; }
        to.shrimp.push(sh);
        to.seen[Gen.colorClass(sh.g)] = 1;
      }
      const msg = `Arrivée dans ${to.name} : ${tr.shrimp.length - died}/${tr.shrimp.length} en forme` + (died ? `, ${died} mortes du choc` : '') + (molts ? `, ${molts} mues déclenchées` : '') + ` (écart : GH ${Math.abs(tr.src.gh - d.gh).toFixed(1)}, pH ${Math.abs(tr.src.ph - d.ph).toFixed(2)}, ${Math.abs(tr.src.temp - d.temp).toFixed(1)} °C).`;
      log(W, msg, died ? 'warn' : 'info', true);
    }
  }
  // Sac de transport : l'eau refroidit vers la pièce, après 3 jours les crevettes souffrent
  function addBag(W, list, water, label) {
    const bag = { id: W.nextUid++, shrimp: list, water: Object.assign({}, water), t0: W.t, label };
    W.bags.push(bag);
    log(W, `📦 Colis reçu : ${label} (${list.length} crevettes). Acclimate-les vite !`, 'info', true);
    return bag;
  }
  function stepBags(W, c, dt) {
    const room = roomTemp(W, c);
    for (const bag of W.bags) {
      bag.water.temp += (room - bag.water.temp) * (1 - Math.exp(-.3 * dt));
      if (W.t - bag.t0 > 72) for (const sh of bag.shrimp) sh.health -= .02 * dt;
      const before = bag.shrimp.length;
      bag.shrimp = bag.shrimp.filter(sh => sh.health > 0);
      if (bag.shrimp.length < before) {
        W.stats.dead['oubliée dans le sac'] = (W.stats.dead['oubliée dans le sac'] || 0) + before - bag.shrimp.length;
        log(W, `📦 ${before - bag.shrimp.length} crevette(s) mortes dans le colis « ${bag.label} ».`, 'bad', true);
      }
    }
    W.bags = W.bags.filter(b => b.shrimp.length);
  }
  function bagToTank(W, bag, ids, toId, method) {
    const set = ids ? new Set(ids) : null;
    const list = bag.shrimp.filter(sh => !set || set.has(sh.id));
    bag.shrimp = bag.shrimp.filter(sh => set && !set.has(sh.id));
    W.bags = W.bags.filter(b => b.shrimp.length);
    return startTransfer(W, list, bag.water, toId, method, bag.label);
  }

  // ---------- Actions sur un bac ----------
  function V0(s) { return s.cfg.volume; }
  const A = {
    feed(W, s, type) {
      const v = V0(s);
      s._fed = { type, t: W.t };   // pour le rendu : morceau de nourriture visible
      if (type === 'granules') { s.pools.food += v * 1; log(W, 'Nourriture : granulés.', 'info', false, s); }
      if (type === 'veg') { s.pools.veg += v * 2; log(W, 'Nourriture : légumes blanchis.', 'info', false, s); }
      if (type === 'powder') { s.pools.powder += v * .4; log(W, 'Nourriture : poudre pour bébés.', 'info', false, s); }
    },
    waterChange(W, s, pct, srcKey) {
      const w = s.w, src = WATERS[srcKey];
      const p = pct / 100;
      const t = s.env === 'aquarium' ? w.temp - 2 : 14;
      const dG = Math.abs(src.gh - w.gh) * p, dT = Math.abs(t - w.temp) * p;
      mixIn(s, src, p, t);
      w.level = 1;
      s.pools.food *= 1 - p * .5; s.pools.powder *= 1 - p * .5; s.pools.det *= 1 - p * .3;
      if (s.disease > W.t) s.disease -= 24 * p * 2;
      const shock = dG / 3 + dT / 4;
      if (shock > .3) {
        let molts = 0;
        for (const sh of s.shrimp) {
          sh.health -= shock * .15 * (sh.size < BABY ? 1.5 : 1);
          if (rnd() < shock * .5) { sh.molt = 0; molts++; }
        }
        log(W, `Changement d'eau ${pct}% : choc (ΔGH ${dG.toFixed(1)}, ΔT ${dT.toFixed(1)}°C), ${molts} mues déclenchées !`, 'warn', true, s);
      } else log(W, `Changement d'eau ${pct}% (${src.name}).`, 'info', false, s);
    },
    siphon(W, s) {
      s.pools.det *= .35; s.pools.food *= .5; s.pools.veg *= .5;
      s.pred.plan *= .85; s.pred.hydra *= .95;
      A.waterChange(W, s, 10, s.cfg.water);
      log(W, 'Siphonnage du sol.', 'info', false, s);
    },
    topOff(W, s, srcKey) { topOff(W, s, srcKey, false); },
    cleanFilter(W, s) {
      s.eq.clog = 0; s.bactA *= .85; s.bactB *= .85; s.pools.det *= .8;
      log(W, 'Filtre nettoyé (dans l\'eau du bac, on garde les bactéries).', 'info', false, s);
    },
    fixHeater(W, s) { s.heaterStuck = false; log(W, 'Chauffage remplacé.', 'info', true, s); },
    treat(W, s, kind) {
      if (kind === 'fenben') { s.treat.fenben = W.t + 96; log(W, '💊 Traitement anti-hydres/planaires (fenbendazole) pendant 4 jours. Léger stress pour les crevettes.', 'warn', true, s); }
      if (kind === 'trap') { s.treat.trap = W.t + 72; log(W, 'Piège à planaires installé pour 3 jours.', 'info', false, s); }
    },
    addShrimp(W, s, vk, n) {
      for (let i = 0; i < n; i++) { const sh = storeShrimp(W, vk); s.shrimp.push(sh); s.seen[Gen.colorClass(sh.g)] = 1; }
      log(W, `+${n} ${GENERA[VARIETIES[vk].genus].short} ${VARIETIES[vk].name}.`, 'info', false, s);
    },
    addPlant(W, s, key) {
      s.plants[key] = Math.min(1, (s.plants[key] || 0) + .15);
      hitchhikers(W, s, false);
      log(W, `Plante ajoutée : ${PLANTS[key].name}.`, 'info', false, s);
    },
    fish(W, s, d) {
      s.pred.fish = Math.max(0, s.pred.fish + d);
      log(W, d > 0 ? `+${d} micro rasbora.` : 'Un micro rasbora retiré.', 'info', false, s);
    },
    addBacteria(W, s) {
      const Kb = bactCap(s);
      s.bactA = Math.max(s.bactA, Kb * .3); s.bactB = Math.max(s.bactB, Kb * .3);
      log(W, 'Bactéries ajoutées : le cycle va beaucoup plus vite.', 'info', false, s);
    },
  };
  // ---------- Cycle de l'azote ----------
  // Colonies (fraction de la capacité) : un bac neuf part de ~0,1 %, il tient la charge vers 5 %.
  // Ammoniac → nitrites d'abord (nitrosomonas), puis nitrites → nitrates (nitrobacter, en retard).
  const CYCLED = .05, START = 1e-3;
  function cycleInfo(s) {
    const Kb = bactCap(s), a = s.bactA / Kb, b = s.bactB / Kb, w = s.w;
    const lg = r => clamp(Math.log(Math.max(r, START) / START) / Math.log(CYCLED / START), 0, 1);
    const pA = lg(a), pB = lg(b);
    const clean = w.no2 < .2 && w.tan < .2;
    const cycled = a >= CYCLED && b >= CYCLED && clean;
    const fuel = w.tan + s.pools.food + s.pools.veg + s.pools.det / 10 > .05 || s.shrimp.length > 0;
    // estimation (taux calés sur la simulation, bac nourri chaque jour)
    const mT = clamp(1 + .07 * (w.temp - 22), .15, 2);
    const rA = .03 * mT * Math.max(.4, w.tan / (w.tan + .2)) - .0015, rB = .022 * mT * .55 - .0015;
    const tA = a >= CYCLED ? 0 : Math.log(CYCLED / a) / rA;
    const tWait = a >= .02 ? 0 : Math.log(.02 / a) / rA;
    const tB = b >= CYCLED ? 0 : Math.log(CYCLED / Math.max(b, .002)) / rB;
    const hours = cycled ? 0 : !fuel || rA <= 0 ? Infinity : Math.max(tA, tWait + tB) + (clean ? 0 : 36 * Math.max(1, Math.log2(Math.max(w.no2, w.tan) / .2)));
    const pct = cycled ? 1 : Math.min(.97, (pA + pB) / 2);
    const phase = cycled ? 'Cyclé' : a < CYCLED * .5 ? 'Phase 1 : ammoniac' : b < CYCLED ? 'Phase 2 : nitrites' : 'Fin : les nitrites redescendent';
    return { pct, a: pA, b: pB, days: hours / 24, phase, fuel };
  }
  // Ensemencer un bac avec un bac mûr. kind : water (seau d'eau), sponge (presser la masse filtrante), mulm (substrat/mousse)
  const SEED = {
    water: { gain: .0015, take: 0, hitch: .02, label: "un seau d'eau" },
    sponge: { gain: .06, take: .08, hitch: .1, label: 'le jus de la masse filtrante' },
    mulm: { gain: .035, take: .04, hitch: .3, label: 'du substrat et de la mousse' },
  };
  function seedFrom(W, src, dst, kind) {
    const k = SEED[kind];
    if (kind === 'sponge' && src.env === 'aquarium' && src.eq.filter === 'none') return "Le bac source n'a pas de filtre.";
    const KbS = bactCap(src), KbD = bactCap(dst);
    const mat = Math.min(1, Math.min(src.bactA / KbS, src.bactB / KbS) / CYCLED);
    if (mat < .2) return `${src.name} n'est pas assez mûr pour ensemencer.`;
    const cap = KbD * CYCLED * 1.2 * mat;
    dst.bactA = Math.max(dst.bactA, Math.min(cap, dst.bactA + KbD * k.gain * mat));
    dst.bactB = Math.max(dst.bactB, Math.min(cap, dst.bactB + KbD * k.gain * mat));
    src.bactA *= 1 - k.take; src.bactB *= 1 - k.take;
    if (kind === 'water') mixIn(dst, waterOf(src), Math.min(.2, src.cfg.volume * .1 / dst.cfg.volume), src.w.temp);
    dst.pools.biofilm += Math.min(src.pools.biofilm * .05, dst.cfg.volume * .3);
    // les indésirables voyagent aussi
    let hitch = '';
    if (src.pred.plan >= 1 && rnd() < .5 + k.hitch) { dst.pred.plan += Math.max(1, src.pred.plan * k.hitch); hitch += ' Des planaires ont peut-être suivi…'; }
    if (src.pred.hydra >= 1 && rnd() < .5 + k.hitch) { dst.pred.hydra += Math.max(1, src.pred.hydra * k.hitch); hitch += ' Des hydres ont peut-être suivi…'; }
    log(W, `🧫 ${dst.name} ensemencé avec ${k.label} de ${src.name}.${hitch}`, hitch ? 'warn' : 'info', true, dst);
    return null;
  }

  function topOff(W, s, srcKey, silent) {
    const w = s.w, src = WATERS[srcKey];
    const p = 1 - w.level;
    if (p <= 0) return;
    w.gh = w.gh * w.level + src.gh * p;
    w.kh = w.kh * w.level + src.kh * p;
    w.no3 = w.no3 * w.level + src.no3 * p;
    w.tan *= w.level; w.no2 *= w.level; w.tannin *= w.level;
    w.level = 1;
    if (!silent) log(W, `Niveau complété (${src.name}).`, 'info', false, s);
  }

  // Relie les références après chargement d'une sauvegarde
  function relink(W) {
    for (const s of W.tanks) {
      s._W = W; s._wx = W.weather; s.t = W.t;
      for (const sh of s.shrimp) if (!sh.g) sh.g = Gen.express(sh.dna, sh.genus);
    }
    for (const b of W.bags) for (const sh of b.shrimp) if (!sh.g) sh.g = Gen.express(sh.dna, sh.genus);
    for (const tr of W.transfers) for (const sh of tr.shrimp) if (!sh.g) sh.g = Gen.express(sh.dna, sh.genus);
    if (W.money === null) W.money = Infinity; // Infinity devient null en JSON
    return W;
  }

  return {
    newWorld, newTank, step, advance, calendar, popStats, isMature, express, nh3Of, A, CAP, BABY, bactCap, log,
    cycleInfo, seedFrom, makeShrimp, storeShrimp, startTransfer, netFromTank, addBag, bagToTank, tankById, relink, roomTemp, waterOf, DRIP_HOURS,
  };
})();
