'use strict';
// Interface : écrans, panneaux, fiche génétique, graphes, actions.

const UI = (() => {
  const $ = id => document.getElementById(id);
  let s = null;
  let tab = 'pop';
  let selected = null;
  let speed = 1;
  const SPEEDS = [0, 1, 10, 100, 1000];
  let lastLog = -1, lastPop = 0, lastGraph = 0, lastSheet = 0, lastWater = 0;
  const fmt = (x, d = 1) => (x == null || isNaN(x)) ? '–' : (+x).toFixed(d);
  const pct = x => Math.round(x * 100) + '%';
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Écran titre ----------
  function showTitle() {
    $('hud').classList.add('hidden');
    $('setup').classList.add('hidden');
    $('title').classList.remove('hidden');
    const box = $('titleSaves');
    box.innerHTML = '';
    for (const mode of ['normal', 'hardcore']) {
      const sv = Save.load(mode);
      if (!sv) continue;
      const sm = Save.summary(sv);
      const hc = mode === 'hardcore';
      const d = document.createElement('div');
      d.className = 'save-card' + (hc ? ' hc' : '');
      const away = hc ? ` · absent depuis ${humanDur((Date.now() - sv.realLast) / 1000)}` : '';
      d.innerHTML = `<div><b>${hc ? '☠ Hardcore' : 'Partie normale'}</b> — ${sm.env === 'aquarium' ? 'Aquarium' : 'Bassin'} ${sm.vol} L
        <small>Jour ${sm.day} · ${sm.n} crevettes · génération ${sm.gen}${away}</small></div>`;
      const b = document.createElement('button');
      b.className = 'big'; b.textContent = 'Continuer';
      b.onclick = () => Main.resume(mode);
      d.appendChild(b);
      box.appendChild(d);
    }
    const g = Save.graveyard();
    $('graveyard').innerHTML = g.length ? '<h4>Cimetière hardcore</h4>' + g.slice(0, 6).map(x =>
      `<div>☠ ${x.env === 'aquarium' ? 'Aquarium' : 'Bassin'} ${x.vol} L — tenu ${x.day} jours, ${x.born} naissances, génération ${x.gen} (surtout : ${esc(x.cause)})</div>`).join('') : '';
  }
  function humanDur(sec) {
    if (sec < 3600) return Math.round(sec / 60) + ' min';
    if (sec < 86400) return Math.round(sec / 3600) + ' h';
    return Math.round(sec / 86400) + ' j';
  }

  // ---------- Création du bac ----------
  let setupMode = 'normal';
  function openSetup(mode) {
    setupMode = mode;
    if (Save.load(mode) && !confirm(mode === 'hardcore' ? 'Une partie hardcore existe déjà. La remplacer ? (elle sera perdue)' : 'Remplacer la partie normale en cours ?')) return;
    $('title').classList.add('hidden');
    $('setup').classList.remove('hidden');
    $('setupTitle').textContent = mode === 'hardcore' ? '☠ Nouveau bac hardcore' : 'Nouveau bac';
    const hc = mode === 'hardcore';
    const opt = (o, sel) => Object.entries(o).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(v.name)}</option>`).join('');
    const vars = Object.entries(VARIETIES).map(([k, v]) =>
      `<div class="var"><span class="sw" style="background:${cssRGB(Gen.mix([.3, .4, .4], Gen.color(Object.assign({}, GENERA[v.genus].base, v.g)), v.g.dens))}"></span>
       <span class="name">${GENERA[v.genus].short} <b>${esc(v.name)}</b></span><input type="number" min="0" max="60" value="${k === 'neo_cherry' ? 10 : 0}" data-var="${k}"></div>`).join('');
    $('setupForm').innerHTML = `
      <fieldset class="fs"><legend>Milieu</legend>
        <div class="opt-cards">
          <label><input type="radio" name="env" value="aquarium" checked><b>Aquarium</b>Équipé : filtre, chauffage, CO2, éclairage.</label>
          <label><input type="radio" name="env" value="pond"><b>Bassin extérieur</b>Saisons, pluie, gel, canicule. La nature décide.</label>
        </div>
        <div class="row">Volume <select id="fVol"></select> <span id="fSeasonWrap" class="hidden">Saison de départ <select id="fSeason">
          <option value="spring">Printemps</option><option value="summer">Été</option><option value="autumn">Automne</option><option value="winter">Hiver</option></select></span></div>
        ${hc ? '<div class="dimc" style="font-size:12px">Hardcore : le temps est réel, la saison est celle d\'aujourd\'hui.</div>' : ''}
      </fieldset>
      <fieldset class="fs"><legend>Sol et eau</legend>
        <div class="row">Sol <select id="fSub">${opt(SUBSTRATES, 'sand')}</select></div>
        <div class="row">Eau <select id="fWater">${opt(WATERS, 'tap_soft')}</select></div>
        <div class="row"><label class="chk"><input type="radio" name="mat" value="0"> Bac neuf (cycle à faire)</label>
        <label class="chk"><input type="radio" name="mat" value="1" checked> Bac déjà cyclé</label></div>
      </fieldset>
      <fieldset class="fs"><legend>Plantes</legend>
        ${Object.entries(PLANTS).map(([k, p]) => `<label class="chk"><input type="checkbox" data-plant="${k}"${k === 'moss' || k === 'hygro' ? ' checked' : ''}> ${esc(p.name)}</label>`).join('')}
        <div class="dimc" style="font-size:12px">Les plantes peuvent amener des hydres ou des planaires…</div>
      </fieldset>
      <fieldset class="fs" id="fEquipAq"><legend>Équipement</legend>
        <div class="row">Filtre <select id="fFilter">${opt(FILTERS, 'sponge')}</select></div>
        <div class="row"><label class="chk"><input type="checkbox" id="fHeater" checked> Chauffage</label> consigne <input type="number" id="fTarget" value="24" min="16" max="32" style="width:56px"> °C</div>
        <div class="row">Éclairage <input type="number" id="fLight" value="8" min="0" max="14" style="width:56px"> h/jour
          <label class="chk"><input type="checkbox" id="fCO2"> CO2</label><label class="chk"><input type="checkbox" id="fAir"> Bulleur</label><label class="chk"><input type="checkbox" id="fAto"> Osmolateur</label></div>
      </fieldset>
      <fieldset class="fs hidden" id="fEquipPond"><legend>Équipement</legend>
        <label class="chk"><input type="checkbox" id="fPAir"> Pompe à air solaire</label>
        <label class="chk"><input type="checkbox" id="fShade"> Voile d'ombrage</label>
      </fieldset>
      <fieldset class="fs wide"><legend>Crevettes de départ</legend><div class="var-grid">${vars}</div>
        <div class="dimc" style="font-size:12px">Les Neocaridina se croisent entre elles, les Caridina aussi, mais jamais l'une avec l'autre.</div></fieldset>
      <fieldset class="fs"><legend>Prédateurs</legend>
        <div class="row">Micro rasboras <input type="number" id="fFish" value="0" min="0" max="30" style="width:56px"></div>
        <div class="dimc" style="font-size:12px">Ils mangent les juvéniles les plus visibles : la couleur devient un risque.</div>
      </fieldset>
      <fieldset class="fs${hc ? ' hidden' : ''}"><legend>Options</legend>
        <label class="chk"><input type="checkbox" id="fEvents" checked> Événements aléatoires (pannes, maladies…)</label>
        <div class="row">Taux de mutation <input type="range" id="fMut" min="0.5" max="4" step="0.25" value="1" style="width:120px"> <span id="fMutV">×1</span></div>
      </fieldset>`;
    const envSel = () => document.querySelector('input[name=env]:checked').value;
    const refreshEnv = () => {
      const env = envSel();
      const vols = env === 'aquarium' ? AQUA_VOLUMES : POND_VOLUMES;
      $('fVol').innerHTML = vols.map(v => `<option value="${v}"${v === (env === 'aquarium' ? 30 : 250) ? ' selected' : ''}>${v} L</option>`).join('');
      $('fEquipAq').classList.toggle('hidden', env !== 'aquarium');
      $('fEquipPond').classList.toggle('hidden', env === 'aquarium');
      $('fSeasonWrap').classList.toggle('hidden', env === 'aquarium' || hc);
      if (env === 'pond') { $('fSub').value = 'earth'; document.querySelector('[data-plant=egeria]').checked = true; document.querySelector('[data-plant=hygro]').checked = false; }
      hint();
    };
    const hint = () => {
      const counts = readVars();
      const car = Object.entries(counts).some(([k, n]) => n && VARIETIES[k].genus === 'car');
      const neo = Object.entries(counts).some(([k, n]) => n && VARIETIES[k].genus === 'neo');
      const w = WATERS[$('fWater').value];
      let h = '';
      if (car && w.gh > 8) h = 'Les Caridina aiment l\'eau douce et acide (GH 4-6, pH ~6.3) : essaie soil actif + osmosée.';
      else if (neo && $('fSub').value === 'soil' && w.kh < 1) h = 'Soil + osmosée : pH très acide, les Neocaridina vont souffrir… ou s\'adapter.';
      else if (envSel() === 'pond' && car) h = 'Des Caridina en bassin ? Elles détestent le froid. Bonne chance.';
      else if (!Object.values(counts).some(Boolean)) h = 'Aucune crevette : ajoute-en au moins quelques-unes.';
      $('setupHint').textContent = h;
    };
    document.querySelectorAll('input[name=env]').forEach(r => r.onchange = refreshEnv);
    $('setupForm').oninput = hint;
    $('fMut').oninput = () => $('fMutV').textContent = '×' + $('fMut').value;
    refreshEnv();
  }
  function readVars() {
    const r = {};
    document.querySelectorAll('[data-var]').forEach(i => { const n = +i.value; if (n > 0) r[i.dataset.var] = Math.min(60, n); });
    return r;
  }
  function readSetup() {
    const env = document.querySelector('input[name=env]:checked').value;
    const plants = [...document.querySelectorAll('[data-plant]')].filter(i => i.checked).map(i => i.dataset.plant);
    const eq = env === 'aquarium' ? {
      filter: $('fFilter').value, heater: $('fHeater').checked, target: +$('fTarget').value || 24,
      light: Math.max(0, Math.min(14, +$('fLight').value)), co2: $('fCO2').checked, air: $('fAir').checked, ato: $('fAto').checked,
    } : { air: $('fPAir').checked, shade: $('fShade').checked, light: 0 };
    return {
      mode: setupMode, env, volume: +$('fVol').value, substrate: $('fSub').value, water: $('fWater').value,
      plants, mature: document.querySelector('input[name=mat]:checked').value === '1', eq,
      shrimp: readVars(), fish: Math.max(0, Math.min(30, +$('fFish').value || 0)),
      events: $('fEvents').checked, mutRate: +$('fMut').value, season: $('fSeason').value,
    };
  }

  // ---------- Démarrage d'une partie ----------
  function start(state) {
    s = state;
    selected = null;
    lastLog = -1;
    $('title').classList.add('hidden');
    $('setup').classList.add('hidden');
    $('hud').classList.remove('hidden');
    const hc = s.mode === 'hardcore';
    $('modeBadge').textContent = hc ? 'HARDCORE' : 'NORMAL';
    $('modeBadge').className = 'badge' + (hc ? ' hc' : '');
    speed = hc ? 0 : 1;
    buildSpeed();
    buildEquip();
    buildActions();
    buildGraphSelects();
    setTab('pop');
    refreshAll(true);
  }

  function buildSpeed() {
    const el = $('speed');
    if (s.mode === 'hardcore') { el.innerHTML = '<span class="rt">● TEMPS RÉEL</span>'; return; }
    el.innerHTML = SPEEDS.map(v => `<button data-sp="${v}" class="${v === speed ? 'on' : ''}" title="${v ? `1 s = ${v} h de jeu` : 'Pause'}">${v ? '×' + v : '⏸'}</button>`).join('') + '<span class="eff" id="effSpeed"></span>';
    el.querySelectorAll('button').forEach(b => b.onclick = () => setSpeed(+b.dataset.sp));
  }
  function setSpeed(v) {
    if (s.mode === 'hardcore') return;
    speed = v;
    $('speed').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.sp === v));
  }

  // ---------- Équipement ----------
  function buildEquip() {
    const el = $('equip');
    const eq = s.eq;
    if (s.env === 'aquarium') {
      el.innerHTML = `
        <div class="eqrow"><span>Filtre</span><select id="eFilter">${Object.entries(FILTERS).map(([k, f]) => `<option value="${k}"${k === eq.filter ? ' selected' : ''}>${f.name}</option>`).join('')}</select></div>
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eHeater"${eq.heater ? ' checked' : ''}> Chauffage</label><span><input type="number" id="eTarget" value="${eq.target}" min="16" max="32" style="width:52px"> °C</span></div>
        <div class="eqrow full"><span>Éclairage : <b id="eLightV">${eq.light}</b> h/j <small>(9h → ${9 + eq.light}h)</small></span><input type="range" id="eLight" min="0" max="14" value="${eq.light}"></div>
        <div class="eqrow full"><span>Intensité : <b id="eIntV">${pct(eq.intensity)}</b></span><input type="range" id="eInt" min="0.2" max="1" step="0.05" value="${eq.intensity}"></div>
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eCO2"${eq.co2 ? ' checked' : ''}> CO2</label><label class="chk"><input type="checkbox" id="eAir"${eq.air ? ' checked' : ''}> Bulleur</label></div>
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eAto"${eq.ato ? ' checked' : ''}> Osmolateur</label><small>remet de l'osmosée</small></div>`;
      $('eFilter').onchange = e => { s.eq.filter = e.target.value; Sim.log(s, `Filtre : ${FILTERS[s.eq.filter].name}.`); };
      $('eHeater').onchange = e => s.eq.heater = e.target.checked;
      $('eTarget').onchange = e => s.eq.target = Math.max(16, Math.min(32, +e.target.value || 24));
      $('eLight').oninput = e => { s.eq.light = +e.target.value; $('eLightV').textContent = s.eq.light; };
      $('eInt').oninput = e => { s.eq.intensity = +e.target.value; $('eIntV').textContent = pct(s.eq.intensity); };
      $('eCO2').onchange = e => s.eq.co2 = e.target.checked;
      $('eAir').onchange = e => s.eq.air = e.target.checked;
      $('eAto').onchange = e => s.eq.ato = e.target.checked;
    } else {
      el.innerHTML = `
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eAir"${eq.air ? ' checked' : ''}> Pompe à air solaire</label></div>
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eShade"${eq.shade ? ' checked' : ''}> Voile d'ombrage</label><small>moins chaud l'été</small></div>`;
      $('eAir').onchange = e => s.eq.air = e.target.checked;
      $('eShade').onchange = e => s.eq.shade = e.target.checked;
    }
  }

  // ---------- Actions ----------
  function buildActions() {
    const pond = s.env === 'pond';
    const groups = [
      ['Nourrir', [['Granulés', () => Sim.A.feed(s, 'granules')], ['Légumes', () => Sim.A.feed(s, 'veg')], ['Poudre bébés', () => Sim.A.feed(s, 'powder')]]],
      ['Eau', [['Changer l\'eau…', waterModal], ['Compléter', () => Sim.A.topOff(s, pond ? 'tap_soft' : 'ro')], ['Siphonner', () => Sim.A.siphon(s)]]],
      ['Soins', [...(pond ? [] : [['Nettoyer filtre', () => Sim.A.cleanFilter(s)]]), ['Anti-parasites', () => confirm('Fenbendazole : tue hydres et planaires en 4 jours, léger stress pour les crevettes. Lancer ?') && Sim.A.treat(s, 'fenben')], ['Piège planaires', () => Sim.A.treat(s, 'trap')]]],
      ['Ajouter', [['Crevettes…', shrimpModal], ['Plantes…', plantModal], ['Rasbora +1', () => Sim.A.fish(s, 1)], ['−1', () => s.pred.fish > 0 && Sim.A.fish(s, -1)]]],
    ];
    const el = $('actions');
    el.innerHTML = '';
    for (const [name, btns] of groups) {
      const g = document.createElement('div');
      g.className = 'agroup';
      g.innerHTML = `<span>${name}</span>`;
      for (const [label, fn] of btns) {
        const b = document.createElement('button');
        b.textContent = label;
        b.onclick = () => { fn(); refreshAll(true); };
        g.appendChild(b);
      }
      el.appendChild(g);
    }
  }
  function modal(html, bind) {
    $('modalBody').innerHTML = html;
    $('modal').classList.remove('hidden');
    if (bind) bind($('modalBody'));
  }
  function closeModal() { $('modal').classList.add('hidden'); }
  function waterModal() {
    const pond = s.env === 'pond';
    modal(`<h2>Changement d'eau</h2>
      <div class="row">Eau neuve : <select id="mSrc">${Object.entries(WATERS).map(([k, w]) => `<option value="${k}"${k === s.cfg.water ? ' selected' : ''}>${w.name} (GH ${w.gh}, KH ${w.kh})</option>`).join('')}</select></div>
      <p class="dimc" style="font-size:13px">Bac actuel : GH ${fmt(s.w.gh)} · KH ${fmt(s.w.kh)} · ${fmt(s.w.temp)} °C. Un gros écart déclenche des mues… parfois ratées.${pond ? ' Au bassin, l\'eau du robinet arrive froide (14 °C).' : ''}</p>
      <div class="row">${[10, 25, 50, 80].map(p => `<button class="big" data-p="${p}">${p} %</button>`).join('')}</div>`, el => {
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { Sim.A.waterChange(s, +b.dataset.p, $('mSrc').value); closeModal(); refreshAll(true); });
    });
  }
  function shrimpModal() {
    modal(`<h2>Ajouter des crevettes</h2><div class="var-grid">${Object.entries(VARIETIES).map(([k, v]) =>
      `<div class="var"><span class="sw" style="background:${cssRGB(Gen.mix([.3, .4, .4], Gen.color(Object.assign({}, GENERA[v.genus].base, v.g)), v.g.dens))}"></span>
       <span class="name">${GENERA[v.genus].short} <b>${esc(v.name)}</b></span><button data-v="${k}" data-n="1">+1</button><button data-v="${k}" data-n="5">+5</button></div>`).join('')}</div>
       <p class="dimc" style="font-size:13px">Nouvelles arrivantes = sang neuf (plus de diversité génétique), mais elles ne sont pas adaptées à ton eau.</p>`, el => {
      el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { Sim.A.addShrimp(s, b.dataset.v, +b.dataset.n); refreshAll(true); });
    });
  }
  function plantModal() {
    modal(`<h2>Ajouter des plantes</h2><div class="mlist">${Object.entries(PLANTS).map(([k, p]) =>
      `<button data-k="${k}">${esc(p.name)} <small class="dimc">${s.plants[k] ? pct(s.plants[k]) : 'absente'} · ${p.tMin}–${p.tMax} °C</small></button>`).join('')}</div>
      <p class="dimc" style="font-size:13px">Risque d'auto-stoppeurs : hydres et planaires.</p>`, el => {
      el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { Sim.A.addPlant(s, b.dataset.k); closeModal(); refreshAll(true); });
    });
  }
  function menuModal() {
    const hc = s.mode === 'hardcore';
    modal(`<h2>Menu</h2>
      <div class="mlist">
        <button id="mSave">💾 Sauvegarder</button>
        ${hc ? '' : '<button id="mExport">⬇ Exporter (.json)</button>'}
        <button id="mQuit">↩ Écran titre</button>
        <button id="mHelp">❓ Aide</button>
      </div>
      <div id="mHelpBox" class="hidden" style="font-size:13px;margin-top:10px">
        <p><b>Caméra</b> : clic gauche + glisser pour tourner, clic droit (ou Maj) pour se déplacer, molette pour zoomer. Clic sur une crevette pour ouvrir sa fiche.</p>
        <p><b>Temps</b> : ×1 = 1 heure de jeu par seconde. Une génération de Neocaridina prend environ 3 mois de jeu.</p>
        <p><b>Évolution</b> : chaque bébé hérite de la moyenne de ses parents, plus une petite variation. Les mutations rares font apparaître des motifs. Celles qui supportent mal l'eau meurent, muent mal ou ne pondent pas ; celles qui sont trop visibles se font manger.</p>
        <p><b>Hardcore</b> : temps réel, une seule sauvegarde, le bac continue de vivre quand le jeu est fermé. Si la colonie meurt, la partie est perdue.</p>
      </div>`, el => {
      $('mSave').onclick = () => { Save.store(s); toast('Partie sauvegardée.'); closeModal(); };
      if (!hc) $('mExport').onclick = () => Save.exportFile(s);
      $('mQuit').onclick = () => { Save.store(s); closeModal(); Main.stop(); showTitle(); };
      $('mHelp').onclick = () => $('mHelpBox').classList.toggle('hidden');
    });
  }

  // ---------- Panneau eau ----------
  function cls(v, warn, bad, inv) {
    if (inv) return v < bad ? 'bad' : v < warn ? 'warn' : 'ok';
    return v > bad ? 'bad' : v > warn ? 'warn' : 'ok';
  }
  function renderWater() {
    const w = s.w, st = s._st || Sim.popStats(s), m = st.mean, aq = s.env === 'aquarium';
    const nh3 = s.nh3 || 0;
    const pf = (n, d) => st.n ? `pop. : ${fmt(m[n], d)} ± ${fmt(m[n.replace('Opt', 'Tol')], d)}` : '';
    const rangeCls = (x, o, t) => !st.n ? 'ok' : Math.abs(x - o) <= t ? 'ok' : Math.abs(x - o) <= t * 1.6 ? 'warn' : 'bad';
    const V = s.cfg.volume;
    const food = (s.pools.food + s.pools.veg + s.pools.powder) / V;
    const Kb = Sim.bactCap(s);
    const rows = [
      ['Température', `${fmt(w.temp)} °C`, rangeCls(w.temp, m.tOpt, m.tTol), `${aq ? 'pièce' : 'air'} ${fmt(s.air)} °C · ${pf('tOpt', 1)}`],
      ['pH', fmt(w.ph, 2), rangeCls(w.ph, m.phOpt, m.phTol), pf('phOpt', 2)],
      ['GH', `${fmt(w.gh)} °d`, rangeCls(w.gh, m.ghOpt, m.ghTol), pf('ghOpt', 1)],
      ['KH', `${fmt(w.kh)} °d`, 'dimc'],
      ['NH3 (libre)', `${fmt(nh3, 3)} mg/L`, cls(nh3, .01, .03), `NH4 total ${fmt(w.tan, 2)}`],
      ['NO2', `${fmt(w.no2, 2)} mg/L`, cls(w.no2, .15, .4)],
      ['NO3', `${fmt(w.no3, 0)} mg/L`, cls(w.no3, 30, 50)],
      ['O2', `${fmt(w.o2)} mg/L`, cls(w.o2, 5, 3.5, true)],
      ['CO2', `${fmt(w.co2, 0)} ppm`, cls(w.co2, 30, 45)],
      ['Niveau', pct(w.level), cls(w.level, .9, .75, true)],
      ['Nourriture', `${fmt(food, 1)} mg/L`, food > 3 ? 'warn' : 'dimc', `biofilm ${fmt(s.pools.biofilm / V, 1)} mg/L · déchets ${fmt(s.pools.det / V, 1)}`],
      ['Bactéries', `${pct(Math.min(1, s.bactA / Kb))} / ${pct(Math.min(1, s.bactB / Kb))}`, s.bactB / Kb < .15 ? 'warn' : 'dimc', 'nitrosomonas / nitrobacter'],
      ['Algues', pct(s.algae), cls(s.algae, .4, .7)],
      ['Densité', `${fmt(s.crowd || 0, 1)} /L`, cls(s.crowd || 0, 4, 7)],
    ];
    if (s.pred.hydra >= 1) rows.push(['Hydres', `~${Math.round(s.pred.hydra)}`, 'bad']);
    if (s.pred.plan >= 1) rows.push(['Planaires', `~${Math.round(s.pred.plan)}`, 'bad']);
    if (s.pred.fish > 0) rows.push(['Micro rasboras', `${s.pred.fish}`, s.pred.fishHealth < .5 ? 'warn' : 'dimc', `santé ${pct(s.pred.fishHealth)} · faim ${pct(s.pred.fishHunger)}`]);
    $('water').innerHTML = rows.map(([k, v, c, sub]) => `<div class="param"><span>${k}</span><span class="v ${c}">${v}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`).join('');
    const al = [];
    if (!s.power) al.push(`⚡ Coupure de courant (encore ~${Math.ceil(s.powerUntil - s.t)} h)`);
    if (s.heaterStuck) al.push('🔥 Chauffage bloqué ! <button id="fixH">Remplacer</button>');
    if (s.disease > s.t) al.push('🦠 Infection en cours');
    if (s.ice) al.push('❄️ Surface gelée');
    if (w.level < .85) al.push(`Niveau d'eau bas (${pct(w.level)}) : complète !`);
    if (s.shrimp.length && w.no2 > .3) al.push('Nitrites élevés : change l\'eau');
    if (s.shrimp.length && nh3 > .02) al.push('Ammoniac toxique : change l\'eau');
    if (s.treat.fenben > s.t) al.push('💊 Traitement en cours');
    if (aq && s.eq.filter !== 'none' && s.eq.clog > .6) al.push(`Filtre encrassé (${pct(s.eq.clog)})`);
    if (s.weather.rain > s.t) al.push('🌧 Pluie');
    if (s.weather.heat > s.t) al.push('☀️ Canicule');
    if (s.weather.cold > s.t) al.push('❄️ Vague de froid');
    $('alerts').innerHTML = al.map(a => `<div class="alert${/Pluie|Filtre|Traitement/.test(a) ? ' w' : ''}">${a}</div>`).join('');
    const fx = $('fixH');
    if (fx) fx.onclick = () => { Sim.A.fixHeater(s); refreshAll(true); };
  }

  // ---------- Colonie ----------
  function renderPop() {
    const st = s._st || Sim.popStats(s);
    const groups = {};
    for (const sh of s.shrimp) {
      const k = GENERA[sh.genus].short[0] + ' · ' + Gen.phenotype(sh.g);
      const gr = groups[k] || (groups[k] = { n: 0, r: 0, g: 0, b: 0, ex: sh });
      const c = Gen.mix([.3, .4, .4], Gen.color(sh.g), sh.g.dens);
      gr.n++; gr.r += c[0]; gr.g += c[1]; gr.b += c[2];
    }
    const top = Object.entries(groups).sort((a, b) => b[1].n - a[1].n).slice(0, 14);
    const deaths = Object.entries(s.stats.dead).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = top.length ? top[0][1].n : 1;
    $('tab-pop').innerHTML = `
      <div class="stat-grid">
        <span>Total</span><b>${st.n}</b>
        <span>Adultes ♀ / ♂</span><b>${st.F} / ${st.M}</b>
        <span>Juvéniles</span><b>${st.juv}</b>
        <span>Grainées</span><b>${st.berried}</b>
        <span>Génération max</span><b>${s.stats.maxGen}</b>
        <span>Naissances</span><b>${s.stats.born}</b>
        <span>Mutations</span><b>${s.stats.mutations}</b>
        ${st.genus.neo && st.genus.car ? `<span>Neo / Caridina</span><b>${st.genus.neo} / ${st.genus.car}</b>` : ''}
      </div>
      <h4>Phénotypes (clic = une crevette au hasard)</h4>
      ${top.map(([k, g]) => `<div class="pheno" data-k="${esc(k)}"><span class="sw" style="background:${cssRGB([g.r / g.n, g.g / g.n, g.b / g.n])}"></span><span style="flex:2">${esc(k)}</span><span class="bar-mini"><div style="width:${g.n / max * 100}%"></div></span><b>${g.n}</b></div>`).join('') || '<div class="dimc">Aucune crevette.</div>'}
      <h4>Moyennes de la colonie</h4>
      ${st.n ? `<div class="stat-grid" style="font-size:13px">
        <span>T° optimale</span><b>${fmt(st.mean.tOpt)} ± ${fmt(st.mean.tTol)}</b>
        <span>pH optimal</span><b>${fmt(st.mean.phOpt, 2)} ± ${fmt(st.mean.phTol, 2)}</b>
        <span>GH optimal</span><b>${fmt(st.mean.ghOpt)} ± ${fmt(st.mean.ghTol)}</b>
        <span>Densité pigment</span><b>${pct(st.mean.dens)}</b>
        <span>Taille adulte</span><b>${fmt(st.mean.size)} mm</b>
        <span>Fertilité</span><b>×${fmt(st.mean.fert, 2)}</b></div>` : ''}
      <h4>Causes de mort</h4>
      ${deaths.map(([k, n]) => `<div class="param"><span>${esc(k)}</span><span class="v">${n}</span></div>`).join('') || '<div class="dimc">Aucune pour l\'instant.</div>'}`;
    $('tab-pop').querySelectorAll('.pheno').forEach(d => d.onclick = () => {
      const list = s.shrimp.filter(sh => GENERA[sh.genus].short[0] + ' · ' + Gen.phenotype(sh.g) === d.dataset.k);
      if (list.length) selectShrimp(list[(Math.random() * list.length) | 0].id);
    });
  }

  // ---------- Fiche individuelle ----------
  function selectShrimp(id) {
    selected = id;
    Render.select(id, Render.follow);
    if (id != null) setTab('sheet');
    renderSheet();
  }
  function renderSheet() {
    const el = $('tab-sheet');
    const sh = selected != null && s.shrimp.find(x => x.id === selected);
    if (!sh) {
      el.innerHTML = selected != null ? '<p class="dimc">Cette crevette n\'est plus là…</p>' : '<p class="dimc">Clique sur une crevette dans le bac pour voir sa fiche.</p>';
      return;
    }
    const g = sh.g, fit = Gen.fitness(g, s.w);
    const mature = Sim.isMature(sh);
    const geneRow = (k, envVal) => {
      const d = GENES[k], v = g[k];
      const p = (v - d.min) / (d.max - d.min);
      let bar = `<div style="left:0;width:${p * 100}%"></div>`;
      if (k === 'hue') bar = `<div style="left:0;width:100%;background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"></div><span style="left:${p * 100}%;background:#fff"></span>`;
      const tolK = k.replace('Opt', 'Tol');
      if (envVal != null && GENES[tolK]) {
        const lo = (v - g[tolK] - d.min) / (d.max - d.min), hi = (v + g[tolK] - d.min) / (d.max - d.min);
        bar = `<div style="left:${Math.max(0, lo) * 100}%;width:${(Math.min(1, hi) - Math.max(0, lo)) * 100}%;opacity:.5"></div><div style="left:${p * 100 - .5}%;width:3px"></div><span style="left:${(envVal - d.min) / (d.max - d.min) * 100}%"></span>`;
      }
      const num = d.circ ? Math.round(v) + '°' : v >= 10 ? Math.round(v) : fmt(v, 2);
      return `<div class="gene"><span>${d.label}</span><div class="track">${bar}</div><span class="num">${num}</span></div>`;
    };
    const parent = id => id ? (s.shrimp.find(x => x.id === id) ? `<span class="link" data-id="${id}">#${id}</span>` : `#${id} †`) : 'animalerie';
    const kids = s.shrimp.filter(x => x.mom === sh.id || x.dad === sh.id).length;
    el.innerHTML = `
      <div class="sheet-head"><canvas class="portrait" id="portrait"></canvas>
        <div><b>#${sh.id}</b> ${sh.sex === 'F' ? '♀' : '♂'}<br>${esc(Gen.phenotype(g))}<br><small class="dimc">${GENERA[sh.genus].name}${sh.origin ? ' · ' + esc(sh.origin) : ''}</small></div></div>
      <div class="row"><button id="followBtn" class="${Render.follow ? 'on' : ''}">🎥 Suivre</button><button id="closeSel">✕</button></div>
      <div class="stat-grid" style="font-size:13px">
        <span>Génération</span><b>${sh.gen}</b>
        <span>Âge</span><b>${Math.floor(sh.age)} j ${mature ? '(adulte)' : '(juvénile)'}</b>
        <span>Taille</span><b>${fmt(sh.size)} / ${fmt(g.size)} mm</b>
        <span>Santé</span><b class="${cls(sh.health, .6, .3, true)}">${pct(Math.max(0, sh.health))}</b>
        <span>Faim</span><b class="${cls(sh.hunger, .6, .85)}">${pct(sh.hunger)}</b>
        <span>Stress</span><b class="${cls(sh.stress || 0, .35, .8)}">${pct(Math.min(9, sh.stress || 0))}</b>
        <span>Mère / Père</span><b>${parent(sh.mom)} / ${parent(sh.dad)}</b>
        <span>Descendants vivants</span><b>${kids} <small class="dimc">(${sh.kids} nés)</small></b>
        ${sh.berried ? `<span>Œufs</span><b>${sh.berried.n} · éclosion ~${Math.max(0, Math.ceil(sh.berried.days))} j</b>` : ''}
        <span>Prochaine mue</span><b>~${Math.max(0, Math.ceil(sh.molt))} j</b>
      </div>
      <h4>Adaptation à l'eau actuelle</h4>
      <div class="stat-grid" style="font-size:13px"><span>Température</span><b class="${cls(fit.fT, .8, .5, true)}">${pct(fit.fT)}</b>
        <span>pH</span><b class="${cls(fit.fP, .8, .5, true)}">${pct(fit.fP)}</b><span>GH (mues)</span><b class="${cls(fit.fG, .8, .5, true)}">${pct(fit.fG)}</b>
        <span>Visibilité</span><b>${pct(Gen.conspicuity(g, Sim.express(sh), SUBSTRATES[s.cfg.substrate].color))}</b></div>
      <h4>Couleur et motifs</h4>
      ${['hue', 'sat', 'dens', 'dark', 'stripe', 'bands', 'spots', 'rili'].map(k => geneRow(k)).join('')}
      <h4>Tolérances <small>(jaune = eau du bac)</small></h4>
      ${geneRow('tOpt', s.w.temp)}${geneRow('phOpt', s.w.ph)}${geneRow('ghOpt', s.w.gh)}
      <h4>Vie</h4>
      ${['size', 'life', 'fert', 'growth'].map(k => geneRow(k)).join('')}`;
    portrait($('portrait'), g, Sim.express(sh), !!sh.berried);
    $('followBtn').onclick = () => { Render.select(sh.id, !Render.follow); renderSheet(); };
    $('closeSel').onclick = () => { selected = null; Render.select(null); renderSheet(); };
    el.querySelectorAll('.link').forEach(l => l.onclick = () => selectShrimp(+l.dataset.id));
  }

  // Portrait pixel art (même logique de motifs que le shader 3D)
  function portrait(cv, g, express = 1, berried = false) {
    const W = 96, H = 48;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0a1a1e'; ctx.fillRect(0, 0, W, H);
    const prof = [[0, .04], [.1, .06], [.3, .085], [.55, .11], [.75, .12], [.9, .09], [1, .03]];
    const rad = u => { for (let i = 1; i < prof.length; i++) if (u <= prof[i][0]) { const a = prof[i - 1], b = prof[i]; return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]); } return .03; };
    const cy = u => .06 * Math.sin(Math.PI * u) - (u < .3 ? (.3 - u) * .25 : 0);
    const S = 64, X0 = 14, Y0 = 26;
    const water = [.07, .14, .16];
    const col = Gen.color(g);
    const dens = g.dens * express;
    const hash = (a, b, c) => { const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return x - Math.floor(x); };
    const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const seed = 13;
    // pattes et antennes d'abord (dessous)
    ctx.strokeStyle = cssRGB(Gen.mix(water, col, dens * .55));
    const toPx = (u, y) => [X0 + u * S, Y0 - y * S];
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) { const u = .58 + k * .07, [x, y] = toPx(u, cy(u) - rad(u) * .7); ctx.moveTo(x, y); ctx.lineTo(x + 3, y + 9); }
    const [ax, ay] = toPx(.95, cy(.95) + .02);
    ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + 14, ay - 12, ax + 26, ay - 6);
    ctx.moveTo(ax, ay); ctx.lineTo(ax + 10, ay - 5);
    ctx.stroke();
    const img = ctx.getImageData(0, 0, W, H);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const u = (px - X0) / S;
      let inside = false, v = .5, part = 0;
      if (u >= 0 && u <= 1) {
        const c = cy(u), r = rad(u), y = (Y0 - py) / S;
        if (Math.abs(y - c) <= r) { inside = true; v = Math.acos(Math.max(-1, Math.min(1, (y - c) / r))) / Math.PI; }
      }
      if (!inside && u < 0 && u > -.22) {
        const y = (Y0 - py) / S, c0 = cy(0) - .02, spread = -u * .9;
        if (Math.abs(y - c0) < spread * .6) { inside = true; v = .5; }
      }
      if (!inside && u > .95 && u < 1.12) {
        const y = (Y0 - py) / S, c = cy(.97) + .015 + (u - .95) * .25;
        if (Math.abs(y - c) < .02 * (1.12 - u) / .17 + .004) { inside = true; v = 0; }
      }
      let berr = false;
      if (!inside && berried && u > .3 && u < .52) {
        const y = (Y0 - py) / S, c = cy(u) - rad(u) - .02;
        if (Math.abs(y - c) < .03) { inside = true; berr = true; }
      }
      if (!inside) continue;
      const uu = Math.max(0, Math.min(1, u));
      let white = 0;
      white = Math.max(white, sst(.25, .6, g.stripe) * (1 - sst(.07, .14, v)) * (uu > .12 && uu < .93 ? 1 : 0));
      const wave = Math.sin(uu * 18.85 + 1.2) * .5 + .5;
      white = Math.max(white, sst(.15, .5, g.bands) * (wave >= 1 - g.bands * 1.3 ? 1 : 0) * (uu > .08 ? 1 : 0));
      const h = hash(Math.floor(uu * 24), Math.floor(v * 9), seed);
      white = Math.max(white, sst(.15, .5, g.spots) * (h >= 1 - g.spots * .45 ? 1 : 0) * (v <= .8 ? 1 : 0));
      const rl = sst(.15, .5, g.rili) * (sst(.24, .3, uu) - sst(.56, .62, uu));
      const d = dens * (1 - rl * .92);
      let alb = Gen.mix(water, col, d);
      alb = Gen.mix(alb, [.95, .95, .92], white * Math.max(.45, g.dens) * express);
      if (berr) alb = Gen.mix([.9, .78, .2], col, .3);
      let light = Math.cos(v * Math.PI) * .5 + .5;
      light = Math.round(light * 3) / 3;
      const k = .45 + .65 * light;
      const i = (py * W + px) * 4;
      img.data[i] = Math.min(255, alb[0] * k * 255); img.data[i + 1] = Math.min(255, alb[1] * k * 255); img.data[i + 2] = Math.min(255, alb[2] * k * 255); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // œil
    const [ex, ey] = toPx(.92, cy(.92) + .035);
    ctx.fillStyle = '#050505'; ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 3, 3);
    ctx.fillStyle = '#ddd'; ctx.fillRect(Math.round(ex), Math.round(ey) - 1, 1, 1);
  }

  // ---------- Graphes ----------
  const GRAPHS = {
    pop: { name: 'Population', series: [['n', '#5fe0b5', 'total'], ['juv', '#9fe6ff', 'juvéniles'], ['ber', '#f2c14e', 'grainées']] },
    color: { name: 'Couleur moyenne', color: true },
    temp: { name: 'Température vs adaptation', env: 'temp', opt: 'tOpt', tol: 'tTol', unit: '°C' },
    ph: { name: 'pH vs adaptation', env: 'ph', opt: 'phOpt', tol: 'phTol', unit: '' },
    gh: { name: 'GH vs adaptation', env: 'gh', opt: 'ghOpt', tol: 'ghTol', unit: '°d' },
    motifs: { name: 'Motifs', series: [['m.stripe', '#ffffff', 'ligne'], ['m.bands', '#f2c14e', 'bandes'], ['m.spots', '#c49bff', 'taches'], ['m.rili', '#9fe6ff', 'rili'], ['m.dens', '#ff6b5e', 'densité']] },
    vie: { name: 'Taille & fertilité', series: [['m.size', '#5fe0b5', 'taille (mm)'], ['m.fert', '#f2c14e', 'fertilité ×10', 10], ['m.growth', '#9fe6ff', 'croissance ×10', 10]] },
    azote: { name: 'Azote', series: [['no3', '#f2c14e', 'NO3'], ['no2', '#ff6b5e', 'NO2 ×10', 10], ['nh3', '#c49bff', 'NH3 ×100', 100]] },
    pred: { name: 'Prédateurs', series: [['hydra', '#bfdcae', 'hydres'], ['plan', '#e6dcc4', 'planaires'], ['fish', '#e0582c', 'rasboras']] },
  };
  function buildGraphSelects() {
    $('graphSel').innerHTML = Object.entries(GRAPHS).map(([k, g]) => `<option value="${k}">${g.name}</option>`).join('');
    $('histSel').innerHTML = GENE_KEYS.map(k => `<option value="${k}">${GENES[k].label}</option>`).join('');
    $('histSel').value = 'tOpt';
    $('graphSel').onchange = renderGraph;
    $('histSel').onchange = renderHist;
  }
  const get = (h, key) => key.startsWith('m.') ? (h.m ? h.m[key.slice(2)] : null) : h[key];
  function renderGraph() {
    const cv = $('graph'), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, P = { l: 34, r: 6, t: 8, b: 18 };
    ctx.fillStyle = '#08141a'; ctx.fillRect(0, 0, W, H);
    const hist = s.hist;
    const def = GRAPHS[$('graphSel').value];
    if (hist.length < 2) { ctx.fillStyle = '#8fb0aa'; ctx.font = '12px monospace'; ctx.fillText('Pas encore de données (1 point / jour).', 20, H / 2); $('graphLegend').innerHTML = ''; return; }
    const t0 = hist[0].t, t1 = hist[hist.length - 1].t;
    const X = t => P.l + (t - t0) / (t1 - t0 || 1) * (W - P.l - P.r);
    let lines = [], bands = [], lo = Infinity, hi = -Infinity;
    if (def.color) {
      const bw = Math.max(1, (W - P.l - P.r) / hist.length + .5);
      for (const h of hist) { if (!h.n) continue; ctx.fillStyle = cssRGB(h.rgb); ctx.fillRect(X(h.t), P.t, bw, H - P.t - P.b); }
      $('graphLegend').innerHTML = 'Couleur moyenne visible de la colonie, jour après jour.';
      axisX(ctx, W, H, P, t0, t1);
      return;
    }
    if (def.series) {
      lines = def.series.map(([k, c, label, mul = 1]) => ({ c, label, pts: hist.map(h => [h.t, get(h, k) != null ? get(h, k) * mul : null]) }));
    } else {
      lines = [{ c: '#ff9e5e', label: 'eau', pts: hist.map(h => [h.t, h[def.env]]) }, { c: '#5fe0b5', label: 'optimum moyen', pts: hist.map(h => [h.t, h.n ? h.m[def.opt] : null]) }];
      bands = [{ c: 'rgba(95,224,181,.18)', pts: hist.map(h => [h.t, h.n ? h.m[def.opt] - h.m[def.tol] : null, h.n ? h.m[def.opt] + h.m[def.tol] : null]) }];
    }
    for (const l of lines) for (const [, v] of l.pts) if (v != null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (const b of bands) for (const [, a, c] of b.pts) if (a != null) { lo = Math.min(lo, a); hi = Math.max(hi, c); }
    if (def.series) lo = Math.min(0, lo);
    if (hi - lo < 1e-6) hi = lo + 1;
    const pad = (hi - lo) * .06; lo -= def.series ? 0 : pad; hi += pad;
    const Y = v => H - P.b - (v - lo) / (hi - lo) * (H - P.t - P.b);
    ctx.strokeStyle = '#1b3338'; ctx.fillStyle = '#8fb0aa'; ctx.font = '10px monospace'; ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4, y = Y(v);
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(W - P.r, y); ctx.stroke();
      ctx.fillText(Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(Math.abs(v) < 10 ? 1 : 0), 2, y + 3);
    }
    for (const b of bands) {
      ctx.fillStyle = b.c; ctx.beginPath();
      const pts = b.pts.filter(p => p[1] != null);
      pts.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[2])) : ctx.moveTo(X(p[0]), Y(p[2])));
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
      ctx.fill();
    }
    for (const l of lines) {
      ctx.strokeStyle = l.c; ctx.lineWidth = 2; ctx.beginPath();
      let pen = false;
      for (const [t, v] of l.pts) { if (v == null) { pen = false; continue; } pen ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v)); pen = true; }
      ctx.stroke();
    }
    axisX(ctx, W, H, P, t0, t1);
    $('graphLegend').innerHTML = lines.map(l => `<span><i style="background:${l.c}"></i>${l.label}</span>`).join('') + (bands.length ? '<span><i style="background:rgba(95,224,181,.4)"></i>tolérance</span>' : '');
  }
  function axisX(ctx, W, H, P, t0, t1) {
    ctx.fillStyle = '#8fb0aa'; ctx.font = '10px monospace';
    ctx.fillText('J' + Math.floor(t0 / 24 + 1), P.l, H - 4);
    const s1 = 'J' + Math.floor(t1 / 24 + 1);
    ctx.fillText(s1, W - P.r - s1.length * 6, H - 4);
  }
  function renderHist() {
    const cv = $('hist'), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.fillStyle = '#08141a'; ctx.fillRect(0, 0, W, H);
    const k = $('histSel').value, d = GENES[k];
    if (!s.shrimp.length) { $('histInfo').textContent = ''; return; }
    const B = 32, bins = new Array(B).fill(0);
    let lo = d.min, hi = d.max;
    if (!d.circ) {
      lo = Infinity; hi = -Infinity;
      for (const sh of s.shrimp) { lo = Math.min(lo, sh.g[k]); hi = Math.max(hi, sh.g[k]); }
      const env = { tOpt: s.w.temp, phOpt: s.w.ph, ghOpt: s.w.gh }[k];
      if (env != null) { lo = Math.min(lo, env); hi = Math.max(hi, env); }
      const pd = (hi - lo) * .1 || (d.max - d.min) * .05; lo = Math.max(d.min, lo - pd); hi = Math.min(d.max, hi + pd);
    }
    for (const sh of s.shrimp) bins[Math.min(B - 1, Math.max(0, Math.floor((sh.g[k] - lo) / (hi - lo) * B)))]++;
    const mx = Math.max(...bins);
    const bw = W / B;
    bins.forEach((n, i) => {
      if (!n) return;
      const v = lo + (i + .5) / B * (hi - lo);
      let c = '#5fe0b5';
      if (k === 'hue') c = cssRGB(Gen.hsl2rgb(v, .8, .5));
      else if (k === 'dens') c = cssRGB(Gen.mix([.2, .3, .3], [.9, .3, .3], v));
      ctx.fillStyle = c;
      const h = n / mx * (H - 16);
      ctx.fillRect(i * bw + 1, H - 12 - h, bw - 2, h);
    });
    const env = { tOpt: s.w.temp, phOpt: s.w.ph, ghOpt: s.w.gh }[k];
    if (env != null) { const x = (env - lo) / (hi - lo) * W; ctx.fillStyle = '#f2c14e'; ctx.fillRect(x - 1, 0, 2, H - 12); }
    ctx.fillStyle = '#8fb0aa'; ctx.font = '10px monospace';
    const f = v => d.circ ? Math.round(v) + '°' : v >= 10 ? Math.round(v) : v.toFixed(2);
    ctx.fillText(f(lo), 2, H - 2); const sh = f(hi) + ''; ctx.fillText(sh, W - sh.length * 6 - 2, H - 2);
    const st = s._st || Sim.popStats(s);
    $('histInfo').innerHTML = d.circ ? 'Répartition des teintes dans la colonie.' :
      `moyenne ${f(st.mean[k])} · écart-type ${f(st.sd[k] || 0)}${env != null ? ' · <span class="warn">jaune = eau du bac</span>' : ''}<br><small>Plus l'écart-type est grand, plus la colonie peut s'adapter vite.</small>`;
  }

  // ---------- Journal ----------
  function renderLog() {
    if (s.log.length === lastLog && s.log.length) return;
    lastLog = s.log.length;
    $('log').innerHTML = s.log.slice(-150).reverse().map(e => {
      const day = Math.floor(e.t / 24) + 1, h = Math.floor((s.start.hour + e.t) % 24);
      return `<div class="${e.kind}"><span class="t">J${day} ${String(h).padStart(2, '0')}h</span>${esc(e.msg)}</div>`;
    }).join('');
  }

  // ---------- Onglets / toasts / horloge ----------
  function setTab(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    for (const k of ['pop', 'graph', 'sheet', 'log']) $('tab-' + k).classList.toggle('hidden', k !== t);
    refreshAll(true);
  }
  function toast(msg, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = msg;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 5000);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  function renderClock() {
    const c = Sim.calendar(s);
    const hh = Math.floor(c.hour), mm = Math.floor((c.hour - hh) * 60);
    let date = '';
    if (s.mode === 'hardcore') {
      date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ';
    }
    $('clock').innerHTML = `${date}Jour <b>${c.day}</b> · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${seasonOf(c.doy)}${s.light > 0 ? ' ☀' : ' ☾'} · <b>${s.shrimp.length}</b> 🦐`;
  }

  function refreshAll(force) {
    if (!s) return;
    const now = performance.now();
    if (s._toasts && s._toasts.length) { for (const t of s._toasts.splice(0)) toast(t.msg, t.kind); }
    renderClock();
    if (force || now - lastWater > 400) { s._st = Sim.popStats(s); renderWater(); lastWater = now; }
    if (tab === 'pop' && (force || now - lastPop > 1500)) { renderPop(); lastPop = now; }
    if (tab === 'graph' && (force || now - lastGraph > 2000)) { renderGraph(); renderHist(); lastGraph = now; }
    if (tab === 'sheet' && (force || now - lastSheet > 700)) { renderSheet(); lastSheet = now; }
    if (tab === 'log') renderLog();
  }
  function setEffective(hps) {
    const el = $('effSpeed');
    if (el) el.textContent = speed >= 100 && hps < speed * .8 ? `(réel ×${Math.round(hps)})` : '';
  }

  function cssRGB(c) { return `rgb(${Math.round(Math.min(1, Math.max(0, c[0])) * 255)},${Math.round(Math.min(1, Math.max(0, c[1])) * 255)},${Math.round(Math.min(1, Math.max(0, c[2])) * 255)})`; }

  // ---------- Liaisons fixes ----------
  function bind() {
    $('newNormal').onclick = () => openSetup('normal');
    $('newHard').onclick = () => openSetup('hardcore');
    $('setupBack').onclick = showTitle;
    $('setupGo').onclick = () => {
      const cfg = readSetup();
      if (!Object.keys(cfg.shrimp).length && !confirm('Démarrer sans crevette ?')) return;
      Main.newGame(cfg);
    };
    $('modalClose').onclick = closeModal;
    $('modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
    document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    $('btnMenu').onclick = menuModal;
    $('btnView').onclick = () => Render.resetView();
    $('pixSel').onchange = e => Render.setPixelScale(+e.target.value);
    $('importFile').onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then(t => {
        try {
          const st = JSON.parse(t);
          if (!st.shrimp || !st.cfg) throw new Error('format');
          st.mode = 'normal';
          Main.load(st);
        } catch (err) { alert('Fichier invalide.'); }
      });
    };
    window.addEventListener('keydown', e => {
      if (!s || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === ' ') { e.preventDefault(); setSpeed(speed ? 0 : 1); }
      const n = +e.key;
      if (n >= 1 && n <= 5) setSpeed(SPEEDS[n - 1]);
      if (e.key === 'Escape') { selected = null; Render.select(null); closeModal(); }
    });
  }

  return {
    bind, showTitle, start, refreshAll, toast, setEffective, selectShrimp, setSpeed,
    get state() { return s; }, set state(v) { s = v; },
    get speed() { return speed; },
  };
})();
