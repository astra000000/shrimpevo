'use strict';
// Simulation : chimie de l'eau, cycle de l'azote, plantes, crevettes, prédateurs, événements.
// Unités : temps en heures de jeu, concentrations en mg/L, réserves de nourriture en mg.

const Sim = (() => {
  const rnd = Math.random;
  const { clamp } = Gen;
  const CAP = 1500;
  const BABY = 7, JUV = 9, NEWBORN = 4.5;
  const TAU = Math.PI * 2;

  // ---------- Calendrier ----------
  function calendar(s) {
    const total = s.start.hour + s.t;
    const dayIdx = Math.floor(total / 24);
    const hour = total - dayIdx * 24;
    const doyRaw = s.start.doy + dayIdx;
    return { day: Math.floor(s.t / 24) + 1, hour, doy: doyRaw % 365, year: Math.floor(doyRaw / 365) + 1 };
  }
  function roomTemp(s, c) {
    return 20.5 + 1.5 * Math.cos(TAU * (c.doy - 200) / 365) + .8 * Math.sin(TAU * (c.hour - 8) / 24) + (s.weather.heat > s.t ? 6 : 0);
  }
  function airTemp(s, c) {
    return 12.5 - 8.5 * Math.cos(TAU * (c.doy - 20) / 365) + 5 * Math.sin(TAU * (c.hour - 9) / 24)
      + (s.weather.heat > s.t ? 8 : 0) - (s.weather.cold > s.t ? 9 : 0) - (s.weather.rain > s.t ? 3 : 0);
  }
  function o2Sat(T) { return 14.6 - .39 * T + .007 * T * T; }
  function nh3Of(w) {
    const pKa = .09018 + 2729.92 / (w.temp + 273.15);
    return w.tan / (1 + Math.pow(10, pKa - w.ph));
  }

  function log(s, msg, kind = 'info', toast = false) {
    s.log.push({ t: s.t, msg, kind });
    if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
    if (toast) (s._toasts || (s._toasts = [])).push({ msg, kind });
    if (toast && kind === 'bad') s._alarm = true;
  }

  // ---------- Création ----------
  function makeShrimp(s, genus, g, o = {}) {
    return {
      id: s.nextId++, genus, g, sex: o.sex || (rnd() < .5 ? 'F' : 'M'),
      age: o.age ?? 0, size: o.size ?? 1.8, health: o.health ?? 1, hunger: .3,
      molt: o.molt ?? (2 + rnd() * 6), berried: null, gen: o.gen ?? 0,
      mom: o.mom ?? null, dad: o.dad ?? null, born: s.t, kids: 0,
    };
  }
  function storeShrimp(s, vkey) {
    const g = Gen.makeGenome(vkey);
    const sh = makeShrimp(s, VARIETIES[vkey].genus, g, { age: 60 + rnd() * 90, size: g.size * (.78 + rnd() * .17), molt: rnd() * 8 });
    sh.origin = VARIETIES[vkey].name;
    return sh;
  }

  function newGame(cfg) {
    const now = new Date();
    const realDoy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5) % 365;
    const hc = cfg.mode === 'hardcore';
    const startDoy = hc ? realDoy : ({ spring: 100, summer: 180, autumn: 270, winter: 350 }[cfg.season] ?? 100);
    const startHour = hc ? now.getHours() + now.getMinutes() / 60 : 9;
    const src = WATERS[cfg.water];
    const sub = SUBSTRATES[cfg.substrate];
    const s = {
      v: 1, mode: cfg.mode, env: cfg.env, created: Date.now(), realLast: Date.now(), t: 0,
      seed: (Math.random() * 1e9) | 0,
      start: { doy: startDoy, hour: startHour },
      cfg: { volume: cfg.volume, substrate: cfg.substrate, water: cfg.water, events: hc ? true : cfg.events, mutRate: hc ? 1 : cfg.mutRate },
      w: { temp: 20, gh: src.gh, kh: src.kh, ph: 7, tan: 0, no2: 0, no3: src.no3, o2: 8, co2: 3, tannin: sub.earth ? .2 : 0, level: 1 },
      pools: { food: 0, veg: 0, powder: 0, det: 0, biofilm: 0 },
      algae: .03, bactA: 1e-4, bactB: 1e-4,
      soilCap: sub.soil ? 1 : 0, soilLeach: sub.soil ? 1 : sub.earth ? .5 : 0,
      plants: {},
      eq: Object.assign({ filter: 'none', clog: 0, heater: false, target: 24, co2: false, light: 8, intensity: .8, air: false, ato: false, shade: false }, cfg.eq || {}),
      power: true, powerUntil: 0, heaterStuck: false,
      weather: { rain: 0, rainI: 1, heat: 0, cold: 0 }, disease: 0,
      shrimp: [], nextId: 1,
      pred: { hydra: 0, plan: 0, fish: cfg.fish || 0, fishHealth: 1, fishHunger: .3 },
      treat: { fenben: 0, trap: 0 },
      log: [], hist: [], lastHist: -24,
      stats: { born: 0, dead: {}, maxGen: 0, mutations: 0 },
      over: false, light: 0,
    };
    const c = calendar(s);
    s.w.temp = cfg.env === 'aquarium' ? (s.eq.heater ? s.eq.target : roomTemp(s, c)) : airTemp(s, c);
    s.w.o2 = o2Sat(s.w.temp);
    for (const p of cfg.plants) {
      s.plants[p] = .2;
      hitchhikers(s, true);
    }
    s.pools.biofilm = s.cfg.volume * (cfg.mature ? 3 : .3);
    if (cfg.mature) {
      const Kb = bactCap(s);
      s.bactA = Kb * .5; s.bactB = Kb * .5;
      s.soilLeach = 0;
      for (const p in s.plants) s.plants[p] = .45;
    }
    for (const [vk, n] of Object.entries(cfg.shrimp)) for (let i = 0; i < n; i++) s.shrimp.push(storeShrimp(s, vk));
    log(s, `Bac mis en eau : ${cfg.volume} L, ${sub.name}, ${src.name}.`, 'info');
    if (!cfg.mature) log(s, "Bac neuf : le cycle de l'azote n'est pas fait. Surveille l'ammoniac et les nitrites !", 'warn', true);
    return s;
  }

  function hitchhikers(s, silent) {
    if (rnd() < .15) { s.pred.hydra += 2; if (!silent) log(s, 'Des hydres sont peut-être arrivées avec les plantes…', 'warn'); }
    if (rnd() < .15) { s.pred.plan += 2; if (!silent) log(s, 'Des planaires sont peut-être arrivées avec les plantes…', 'warn'); }
  }

  function bactCap(s) {
    const sub = SUBSTRATES[s.cfg.substrate];
    const fb = s.env === 'aquarium' ? FILTERS[s.eq.filter].bact : 1.5;
    let cover = 0;
    for (const k in s.plants) cover += s.plants[k] * PLANTS[k].biofilm;
    return .05 * (sub.surface + fb + cover * .5);
  }

  // ---------- Événements ----------
  function events(s, c, dt) {
    const aq = s.env === 'aquarium';
    if (!s.power && s.t >= s.powerUntil) { s.power = true; log(s, '⚡ Courant rétabli.', 'info', true); }
    if (s.eq.filter !== 'none' && aq) s.eq.clog = Math.min(1, s.eq.clog + dt / (24 * 50));
    if (s.weather.rain > 0 && s.weather.rain <= s.t && s.weather.rain > s.t - dt) log(s, '🌤 Fin de la pluie.', 'info');
    if (!s.cfg.events) {
      if (!aq) rainCheck(s, c, dt);
      return;
    }
    const f = s.mode === 'hardcore' ? 1.5 : 1;
    if (s.power && rnd() < dt / (24 * 75) * f && (aq || s.eq.air)) {
      const h = 2 + rnd() * 10;
      s.power = false; s.powerUntil = s.t + h;
      log(s, `⚡ Coupure de courant (~${Math.round(h)} h) : filtre, chauffage et CO2 à l'arrêt !`, 'bad', true);
    }
    if (aq && s.eq.heater && !s.heaterStuck && rnd() < dt / (24 * 240) * f) {
      s.heaterStuck = true;
      log(s, '🔥 Le chauffage est bloqué en marche ! La température grimpe. Remplace-le.', 'bad', true);
    }
    if (c.doy > 165 && c.doy < 240 && s.weather.heat <= s.t && rnd() < dt / (24 * 25)) {
      s.weather.heat = s.t + 24 * (3 + rnd() * 4);
      log(s, '☀️ Canicule ! La température de la pièce et de l\'air monte.', 'warn', true);
    }
    if (!aq && (c.doy > 335 || c.doy < 60) && s.weather.cold <= s.t && rnd() < dt / (24 * 20)) {
      s.weather.cold = s.t + 24 * (3 + rnd() * 3);
      log(s, '❄️ Vague de froid sur le bassin.', 'warn', true);
    }
    if (!aq) rainCheck(s, c, dt);
    const org = (s.pools.food + s.pools.det) / (s.cfg.volume * s.w.level);
    if (s.disease <= s.t && s.shrimp.length > 10 && rnd() < dt / (24 * 160) * f * (1 + org / 3 + s.w.no3 / 40)) {
      s.disease = s.t + 24 * 5;
      for (const sh of s.shrimp) if (rnd() < .2) sh.health -= .2;
      log(s, '🦠 Infection bactérienne ! Les crevettes affaiblies sont en danger. Changements d\'eau et siphonnage aident.', 'bad', true);
    }
    if (rnd() < dt / (24 * 400) * f) { s.pred.plan += 2; log(s, 'Quelques planaires sont apparues (œufs dormants ?).', 'warn'); }
  }
  function rainCheck(s, c, dt) {
    if (s.weather.rain > s.t) return;
    const season = seasonOf(c.doy);
    const p = season === 'Été' ? 1 / (24 * 8) : season === 'Printemps' ? 1 / (24 * 4) : 1 / (24 * 3);
    if (rnd() < p * dt) {
      s.weather.rain = s.t + 2 + rnd() * 10;
      s.weather.rainI = .5 + rnd() * 1.5;
      log(s, s.weather.rainI > 1.4 ? '🌧 Grosse averse sur le bassin.' : '🌦 Il pleut.', 'info');
    }
  }

  // ---------- Pas de simulation ----------
  function step(s, dt) {
    const c = calendar(s);
    const aq = s.env === 'aquarium';
    const w = s.w, eq = s.eq, P = s.pools;
    const sub = SUBSTRATES[s.cfg.substrate];
    events(s, c, dt);
    s.t += dt;
    const V = s.cfg.volume * w.level;
    const power = s.power;

    // Lumière
    let light;
    if (aq) light = power && c.hour >= 9 && c.hour < 9 + eq.light ? eq.intensity : 0;
    else {
      const dl = 12 + 4 * Math.cos(TAU * (c.doy - 172) / 365);
      const x = (c.hour - (12 - dl / 2)) / dl;
      light = x > 0 && x < 1 ? Math.sin(Math.PI * x) : 0;
      if (s.weather.rain > s.t) light *= .45;
      if (eq.shade) light *= .6;
    }
    s.light = light;
    const lemna = s.plants.lemna || 0;
    const lightBelow = light * (1 - .6 * lemna);

    // Température
    let envT, k;
    const air = aq ? roomTemp(s, c) : airTemp(s, c);
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
    } else exch = (.1 + (eq.air && power ? .2 : 0)) * (ice ? .2 : 1);

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
      const grow = pd.r / 24 * lt * nutr * co2b * ok * cv * (1 - cv);
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

    // Poissons (eau, faim)
    const pr = s.pred;
    if (pr.fish > 0) {
      const fT = Gen.fitRange(FISH.tOpt, FISH.tTol, w.temp, 1), fP = Gen.fitRange(FISH.phOpt, FISH.phTol, w.ph, .2);
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
      const acid = (sub.soil ? .3 * s.soilCap : 0) + .7 * w.tannin + (sub.earth ? .1 : 0);
      const phEq = clamp(7 + Math.log10(3 * Math.max(w.kh, .3) / Math.max(w.co2, .5)) - acid, 4.8, 8.8);
      w.ph += (phEq - w.ph) * (1 - Math.exp(-.3 * dt));
    }
    // Évaporation / pluie / osmolateur
    {
      let evap = aq ? .004 / 24 * (1 + .05 * (w.temp - 22)) : .004 / 24 * (1 + .06 * Math.max(0, air - 15)) * (light > 0 ? 1.4 : .6);
      if (ice) evap = 0;
      const nl = Math.max(.3, w.level - evap * dt);
      concentrate(s, w.level / nl); w.level = nl;
      if (aq && eq.ato && power && w.level < .985) topOff(s, 'ro', true);
      if (!aq && s.weather.rain > s.t) {
        const add = .006 * dt * s.weather.rainI;
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
      med: s.treat.fenben > s.t ? .12 : 0,
      level: w.level < .6 ? (.6 - w.level) * 3 : 0,
      crowd: Math.max(0, adultEq / V - 8) / 10,
    };
    const toxSum = tox.nh3 + tox.no2 + tox.no3 + tox.o2 + tox.med + tox.level + tox.crowd;
    s.toxSum = toxSum;
    const sick = s.disease > s.t;
    const planMolt = Math.min(.12, pr.plan / (V * 20));
    // densité : au-delà de ~2 crevettes adultes/L, les femelles pondent de moins en moins
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
      sh._fit = fit;
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
            if (n > 0) sh.berried = { days: GENERA[sh.genus].gestation, n, dadG: Object.assign({}, dad.g), dadId: dad.id, dadGen: dad.gen };
          }
        }
      }
      // Gestation
      if (sh.berried) {
        const b = sh.berried;
        b.days -= dt / 24 * Math.pow(mT, .8);
        if (stress > .9 && rnd() < .01 * dt) { sh.berried = null; log(s, `#${sh.id} a lâché ses œufs (stress).`, 'warn'); }
        else if (b.days <= 0) {
          let born = 0;
          for (let i = 0; i < b.n; i++) {
            if (shrimp.length + newborn.length >= CAP) break;
            const { g: cg, muts } = Gen.child(g, b.dadG, s.cfg.mutRate);
            const kid = makeShrimp(s, sh.genus, cg, { gen: Math.max(sh.gen, b.dadGen) + 1, mom: sh.id, dad: b.dadId, health: .9 });
            newborn.push(kid);
            born++;
            if (muts.length) {
              s.stats.mutations++;
              const m = muts[0];
              if (['stripe', 'bands', 'spots', 'rili'].includes(m.k) && m.dir > 0 && cg[m.k] > .35)
                log(s, `🧬 Mutation chez #${kid.id} : ${GENES[m.k].label} apparaît !`, 'mut', true);
              else if (rnd() < .3) log(s, `🧬 Mutation chez #${kid.id} : ${GENES[m.k].label} ${m.dir > 0 ? '↑' : '↓'}`, 'mut');
            }
          }
          sh.kids += born;
          s.stats.born += born;
          if (born < b.n) log(s, `Surpopulation : ${b.n - born} bébés n'ont pas survécu.`, 'warn');
          if (born) log(s, `🥚 #${sh.id} a libéré ${born} bébés.`, 'birth');
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
      if (s.treat.fenben > s.t) { pr.hydra *= Math.exp(-.05 * dt); pr.plan *= Math.exp(-.05 * dt); }
      if (s.treat.trap > s.t) pr.plan *= Math.exp(-.012 * dt);
      if (pr.hydra < .5) pr.hydra = 0;
      if (pr.plan < .5) pr.plan = 0;
      if (pr.fish > 0) {
        const fT = Gen.fitRange(FISH.tOpt, FISH.tTol, w.temp, 1), fP = Gen.fitRange(FISH.phOpt, FISH.phTol, w.ph, .2);
        const fs = (1 - fT * fP) + toxSum + (pr.fishHunger > .9 ? .5 : 0);
        if (fs > .4) pr.fishHealth -= (fs - .4) * .02 * dt; else pr.fishHealth = Math.min(1, pr.fishHealth + .01 * dt);
        if (pr.fishHealth <= 0) { pr.fish--; pr.fishHealth = .7; log(s, '🐟 Un micro rasbora est mort.', 'warn'); }
      }
    }

    // Morts / naissances
    if (dead.length) {
      const ds = new Set();
      for (const [sh, cause] of dead) {
        if (ds.has(sh)) continue;
        ds.add(sh);
        s.stats.dead[cause] = (s.stats.dead[cause] || 0) + 1;
        // les cadavres sont en partie mangés par les autres crevettes
        P.food += (sh.size / 25) ** 3 * 12; P.det += (sh.size / 25) ** 3 * 6;
      }
      s.shrimp = shrimp.filter(sh => !ds.has(sh));
      if (dead.length >= 5) log(s, `💀 ${dead.length} crevettes mortes (${dead[0][1]}…)`, 'bad');
      else for (const [sh, cause] of dead) if (sh.size >= BABY) log(s, `💀 #${sh.id} est morte : ${cause}.`, 'dead');
    }
    if (newborn.length) {
      for (const kid of newborn) s.stats.maxGen = Math.max(s.stats.maxGen, kid.gen);
      s.shrimp.push(...newborn);
    }
    for (const sh of s.shrimp) { delete sh._e; }

    if (s.t - s.lastHist >= 24) { s.lastHist = s.t; sample(s); }
    if (!s.shrimp.length && !s.over && s.stats.born + Object.keys(s.stats.dead).length > 0) {
      s.over = true;
      log(s, '☠️ La colonie s\'est éteinte.', 'bad', true);
    }
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

  function advance(s, hours) {
    let rem = hours;
    while (rem > 1e-9) { const dt = Math.min(1, rem); step(s, dt); rem -= dt; }
  }

  // ---------- Actions du joueur ----------
  function V0(s) { return s.cfg.volume; }
  const A = {
    feed(s, type) {
      const v = V0(s);
      if (type === 'granules') { s.pools.food += v * 1; log(s, 'Nourriture : granulés.'); }
      if (type === 'veg') { s.pools.veg += v * 2; log(s, 'Nourriture : légumes blanchis.'); }
      if (type === 'powder') { s.pools.powder += v * .4; log(s, 'Nourriture : poudre pour bébés.'); }
    },
    waterChange(s, pct, srcKey) {
      const w = s.w, src = WATERS[srcKey];
      const p = pct / 100;
      const t = s.env === 'aquarium' ? w.temp - 2 : 14;
      const dG = Math.abs(src.gh - w.gh) * p, dT = Math.abs(t - w.temp) * p;
      mixIn(s, src, p, t);
      w.level = 1;
      s.pools.food *= 1 - p * .5; s.pools.powder *= 1 - p * .5; s.pools.det *= 1 - p * .3;
      if (s.disease > s.t) s.disease -= 24 * p * 2;
      const shock = dG / 3 + dT / 4;
      if (shock > .3) {
        let molts = 0;
        for (const sh of s.shrimp) {
          sh.health -= shock * .15 * (sh.size < BABY ? 1.5 : 1);
          if (rnd() < shock * .5) { sh.molt = 0; molts++; }
        }
        log(s, `Changement d'eau ${pct}% : choc (ΔGH ${dG.toFixed(1)}, ΔT ${dT.toFixed(1)}°C), ${molts} mues déclenchées !`, 'warn', true);
      } else log(s, `Changement d'eau ${pct}% (${src.name}).`);
    },
    siphon(s) {
      s.pools.det *= .35; s.pools.food *= .5; s.pools.veg *= .5;
      s.pred.plan *= .85; s.pred.hydra *= .95;
      A.waterChange(s, 10, s.cfg.water);
      log(s, 'Siphonnage du sol.');
    },
    topOff(s, srcKey) { topOff(s, srcKey, false); },
    cleanFilter(s) {
      s.eq.clog = 0; s.bactA *= .85; s.bactB *= .85; s.pools.det *= .8;
      log(s, 'Filtre nettoyé (dans l\'eau du bac, on garde les bactéries).');
    },
    fixHeater(s) { s.heaterStuck = false; log(s, 'Chauffage remplacé.', 'info', true); },
    treat(s, kind) {
      if (kind === 'fenben') { s.treat.fenben = s.t + 96; log(s, '💊 Traitement anti-hydres/planaires (fenbendazole) pendant 4 jours. Léger stress pour les crevettes.', 'warn', true); }
      if (kind === 'trap') { s.treat.trap = s.t + 72; log(s, 'Piège à planaires installé pour 3 jours.'); }
    },
    addShrimp(s, vk, n) {
      for (let i = 0; i < n; i++) s.shrimp.push(storeShrimp(s, vk));
      if (s.over && s.shrimp.length) s.over = false;
      log(s, `+${n} ${GENERA[VARIETIES[vk].genus].short} ${VARIETIES[vk].name}.`);
    },
    addPlant(s, key) {
      s.plants[key] = Math.min(1, (s.plants[key] || 0) + .15);
      hitchhikers(s, false);
      log(s, `Plante ajoutée : ${PLANTS[key].name}.`);
    },
    fish(s, d) {
      s.pred.fish = Math.max(0, s.pred.fish + d);
      log(s, d > 0 ? `+${d} micro rasbora.` : 'Un micro rasbora retiré.');
    },
    setEq(s, k, v) { s.eq[k] = v; },
  };
  function topOff(s, srcKey, silent) {
    const w = s.w, src = WATERS[srcKey];
    const p = 1 - w.level;
    if (p <= 0) return;
    w.gh = w.gh * w.level + src.gh * p;
    w.kh = w.kh * w.level + src.kh * p;
    w.no3 = w.no3 * w.level + src.no3 * p;
    w.tan *= w.level; w.no2 *= w.level; w.tannin *= w.level;
    w.level = 1;
    if (!silent) log(s, `Niveau complété (${src.name}).`);
  }

  return { newGame, step, advance, calendar, popStats, isMature, express, nh3Of, A, CAP, BABY, bactCap, log };
})();
