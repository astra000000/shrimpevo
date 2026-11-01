'use strict';
// Interface : écrans, bacs, panneaux, sélection (épuisette), boutique, marché, bestiaire, colis, graphes.

const UI = (() => {
  const $ = id => document.getElementById(id);
  let W = null;
  let tab = 'pop';
  let selected = null;
  let speed = 1;
  const SPEEDS = [0, 1, 10, 100, 1000];
  const net = new Set();                        // crevettes sélectionnées (épuisette)
  const filt = { cls: '', stage: '', sex: '', strain: '' };
  let lastLog = -1, lastPop = 0, lastGraph = 0, lastSheet = 0, lastWater = 0, lastNet = 0, lastBar = '';
  const fmt = (x, d = 1) => (x == null || isNaN(x)) ? '–' : (+x).toFixed(d);
  const pct = x => Math.round(x * 100) + '%';
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const T = () => (W && W.tanks[W.cur]) || null;
  const career = () => !!W && W.mode === 'career';
  // Shrimp Coin : pièce en pixel art (HTML) ; moneyTxt pour le texte brut (options, toasts)
  const money = n => `${Math.round(n * 10) / 10}<i class="sc" title="${MONEY_NAME}"></i>`;
  const moneyTxt = n => Economy.fmt(n);
  (function coinIcon() {
    const C = { o: '#6b4300', g: '#f2c230', G: '#ffe680', d: '#c98f12', b: '#2457b8', B: '#173c85', r: '#f07a2a', R: '#b8401a', a: '#ffb070', k: '#140a05', w: '#fff3e0' };
    const shrimp = [
      '.a.a.....',
      'a.a.rr...',
      '..rkrrr..',
      '..rrrwrr.',
      '....RrRr.',
      '.....rwr.',
      '..r..rr..',
      '.rrrrR...',
      '..rr.....',
    ];
    const cv = document.createElement('canvas'); cv.width = cv.height = 16;
    const x = cv.getContext('2d');
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const d = Math.hypot(i - 7.5, j - 7.5);
      let c = null;
      if (d <= 7.9) c = 'o';
      if (d <= 6.9) c = i + j < 13 ? 'G' : i + j > 18 ? 'd' : 'g';
      if (d <= 5.2) c = i + j > 17 ? 'B' : 'b';
      const sj = j - 3, si = i - 3;
      if (sj >= 0 && sj < 9 && si >= 0 && si < 9 && shrimp[sj][si] !== '.') c = shrimp[sj][si];
      if (c) { x.fillStyle = C[c]; x.fillRect(i, j, 1, 1); }
    }
    document.documentElement.style.setProperty('--sc', `url(${cv.toDataURL()})`);
  })();
  function cssRGB(c) { return `rgb(${Math.round(Math.min(1, Math.max(0, c[0])) * 255)},${Math.round(Math.min(1, Math.max(0, c[1])) * 255)},${Math.round(Math.min(1, Math.max(0, c[2])) * 255)})`; }
  const swatchOf = g => cssRGB(Gen.mix([.3, .4, .4], Gen.color(g), g.dens));
  const varG = k => Gen.express(Gen.strainDNA(k, 0), VARIETIES[k].genus);
  const stageOf = sh => Sim.isMature(sh) ? 'adulte' : sh.size < 7 ? 'bébé' : 'juvénile';
  const strainName = id => { const e = W && Economy.entryOf(W, id); return e ? e.name : null; };

  // ---------- Écran titre ----------
  const SLOT_NAMES = { career: 'Carrière', sandbox: 'Bac à sable', hardcore: '☠ Hardcore' };
  function showTitle() {
    $('hud').classList.add('hidden');
    $('setup').classList.add('hidden');
    $('title').classList.remove('hidden');
    const box = $('titleSaves');
    box.innerHTML = '';
    for (const mode of ['career', 'sandbox', 'hardcore']) {
      const sv = Save.load(mode);
      if (!sv) continue;
      const d = document.createElement('div');
      d.className = 'save-card' + (mode === 'hardcore' ? ' hc' : '');
      if (sv.v !== 2) {
        d.innerHTML = `<div><b>${SLOT_NAMES[mode]}</b><small>Sauvegarde d'une ancienne version, incompatible.</small></div>`;
        const b = document.createElement('button');
        b.textContent = 'Effacer';
        b.onclick = () => { Save.remove(mode); showTitle(); };
        d.appendChild(b);
        box.appendChild(d);
        continue;
      }
      const sm = Save.summary(sv);
      const away = mode !== 'sandbox' ? ` · absent depuis ${humanDur((Date.now() - sv.realLast) / 1000)}` : '';
      d.innerHTML = `<div><b>${SLOT_NAMES[mode]}</b> — ${sm.tanks} bac(s)${mode === 'career' ? ' · ' + money(sm.money) : ''}
        <small>Jour ${sm.day} · ${sm.n} crevettes · génération ${sm.gen}${away}</small></div>`;
      const b = document.createElement('button');
      b.className = 'big'; b.textContent = 'Continuer';
      b.onclick = () => Main.resume(mode);
      d.appendChild(b);
      box.appendChild(d);
    }
    const g = Save.graveyard();
    $('graveyard').innerHTML = g.length ? '<h4>Cimetière hardcore</h4>' + g.slice(0, 6).map(x =>
      `<div>☠ ${x.tanks || 1} bac(s) — tenu ${x.day} jours, ${x.born} naissances, génération ${x.gen} (surtout : ${esc(x.cause)})</div>`).join('') : '';
  }
  function humanDur(sec) {
    if (sec < 3600) return Math.round(sec / 60) + ' min';
    if (sec < 86400) return Math.round(sec / 3600) + ' h';
    return Math.round(sec / 86400) + ' j';
  }

  // ---------- Création du premier bac (Bac à sable / Hardcore) ----------
  let setupMode = 'sandbox';
  function openSetup(mode) {
    setupMode = mode;
    if (Save.load(mode) && !confirm(mode === 'hardcore' ? 'Une partie hardcore existe déjà. La remplacer ? (elle sera perdue)' : 'Remplacer la partie en cours ?')) return;
    $('title').classList.add('hidden');
    $('setup').classList.remove('hidden');
    $('setupTitle').textContent = mode === 'hardcore' ? '☠ Nouveau bac hardcore' : 'Bac à sable : premier bac';
    const hc = mode === 'hardcore';
    const opt = (o, sel) => Object.entries(o).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(v.name)}</option>`).join('');
    const vars = Object.entries(VARIETIES).map(([k, v]) =>
      `<div class="var"><span class="sw" style="background:${swatchOf(varG(k))}"></span>
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
        ${PLANT_CATS.map(c => `<div class="pcat"><small>${c}</small>${Object.entries(PLANTS).filter(([, p]) => p.cat === c).map(([k, p]) => `<label class="chk" title="${esc(plantDesc(p))}"><input type="checkbox" data-plant="${k}"${k === 'moss' || k === 'hygro' ? ' checked' : ''}> ${esc(p.name)}</label>`).join('')}</div>`).join('')}
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
      if (!h) {
        const vol = +$('fVol').value;
        const g = Object.entries(counts).map(([k, n]) => n && GENERA[VARIETIES[k].genus]).find(G => G && G.minVol > vol);
        if (g) h = `${g.short} : ${g.minVol} L conseillés, ce bac est trop petit.`;
        else if (Object.entries(counts).some(([k, n]) => n && GENERA[VARIETIES[k].genus].salt[0] > 0)) h = 'Halocaridina : le bac sera salé (≈ 18 g/L). Pas de crevettes d\'eau douce avec elles !';
      }
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
      intensity: .8, ledPro: true,
    } : { air: $('fPAir').checked, shade: $('fShade').checked, light: 0 };
    return {
      mode: setupMode, events: $('fEvents').checked, mutRate: +$('fMut').value, season: $('fSeason').value,
      tank: {
        env, volume: +$('fVol').value, substrate: $('fSub').value, water: $('fWater').value,
        plants, mature: document.querySelector('input[name=mat]:checked').value === '1', eq,
        shrimp: readVars(), fish: Math.max(0, Math.min(30, +$('fFish').value || 0)),
      },
    };
  }

  // ---------- Démarrage d'une partie ----------
  function start(world) {
    W = world;
    selected = null; net.clear();
    lastLog = -1; lastBar = '';
    $('title').classList.add('hidden');
    $('setup').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('modeBadge').textContent = { career: 'CARRIÈRE', sandbox: 'BAC À SABLE', hardcore: 'HARDCORE' }[W.mode];
    $('modeBadge').className = 'badge' + (W.mode === 'hardcore' ? ' hc' : '');
    speed = W.mode === 'sandbox' ? 1 : 0;
    $('btnMarket').classList.toggle('hidden', !career());
    buildSpeed();
    switchTank(Math.min(W.cur, W.tanks.length - 1), true);
    buildGraphSelects();
    setTab('pop');
  }
  let shownTank = null;
  function switchTank(i, force) {
    if (!force && i === W.cur) return;
    W.cur = Math.max(0, i);
    if (deco) decoClose();
    shownTank = T();
    selected = null; net.clear();
    Render.select(null);
    Render.build(T());
    $('noTank').classList.toggle('hidden', !!T());
    buildEquip();
    buildActions();
    lastBar = '';
    refreshAll(true);
  }

  function buildSpeed() {
    const el = $('speed');
    if (W.mode === 'hardcore') { el.innerHTML = '<span class="rt">● TEMPS RÉEL</span>'; return; }
    if (W.mode === 'career') { el.innerHTML = '<span class="rt" title="1 heure réelle = 1 jour de jeu">● TEMPS RÉEL ×24</span>'; return; }
    el.innerHTML = SPEEDS.map(v => `<button data-sp="${v}" class="${v === speed ? 'on' : ''}" title="${v ? `1 s = ${v} h de jeu` : 'Pause'}">${v ? '×' + v : '⏸'}</button>`).join('') + '<span class="eff" id="effSpeed"></span>';
    el.querySelectorAll('button').forEach(b => b.onclick = () => setSpeed(+b.dataset.sp));
  }
  function setSpeed(v) {
    if (!W || W.mode !== 'sandbox') return;
    speed = v;
    $('speed').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.sp === v));
  }

  // ---------- Barre des bacs ----------
  function renderTankBar() {
    const sig = W.tanks.map(t => t.id + t.name + t.shrimp.length).join() + W.cur + W.transfers.length + W.bags.length;
    if (sig === lastBar) return;
    lastBar = sig;
    const el = $('tankbar');
    el.innerHTML = W.tanks.map((t, i) => `<button data-i="${i}" class="${i === W.cur ? 'on' : ''}" title="Double-clic pour renommer">${t.env === 'pond' ? '🌿' : '🐟'} ${esc(t.name)} <small>(${t.shrimp.length})</small></button>`).join('')
      + `<button id="addTank">＋ Nouveau bac</button>`
      + (W.transfers.length ? `<span class="tr">⏳ ${W.transfers.reduce((a, t) => a + t.shrimp.length, 0)} en acclimatation</span>` : '');
    el.querySelectorAll('[data-i]').forEach(b => {
      b.onclick = () => switchTank(+b.dataset.i);
      b.ondblclick = () => { const t = W.tanks[+b.dataset.i]; const n = prompt('Nom du bac :', t.name); if (n) { t.name = n.slice(0, 30); lastBar = ''; } };
    });
    $('addTank').onclick = () => shopModal('Bacs');
    $('bagCount').textContent = W.bags.length ? `(${W.bags.length})` : '';
    $('btnBags').classList.toggle('on', W.bags.length > 0);
  }

  // ---------- Équipement ----------
  function buildEquip() {
    const el = $('equip'), s = T();
    if (!s) { el.innerHTML = ''; return; }
    const eq = s.eq;
    const own = k => career() ? ` <small>(${Economy.spare(W, k)} en stock)</small>` : '';
    if (s.env === 'aquarium') {
      el.innerHTML = `
        <div class="eqrow"><span>Filtre</span><select id="eFilter">${Object.entries(FILTERS).map(([k, f]) => `<option value="${k}"${k === eq.filter ? ' selected' : ''}>${f.name}</option>`).join('')}</select></div>
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eHeater"${eq.heater ? ' checked' : ''}> Chauffage</label><span><input type="number" id="eTarget" value="${eq.target}" min="16" max="32" style="width:52px"> °C</span></div>
        <div class="eqrow full"><span>Éclairage : <b id="eLightV">${eq.light}</b> h/j <small>(9h → ${9 + eq.light}h)</small></span><input type="range" id="eLight" min="0" max="14" value="${eq.light}"></div>
        <div class="eqrow full"><span>Intensité : <b id="eIntV">${pct(eq.intensity)}</b> <small>${eq.ledPro ? 'LED pro' : 'LED de base (max 60 %)'}</small></span><input type="range" id="eInt" min="0.2" max="1" step="0.05" value="${eq.intensity}"></div>
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eLed"${eq.ledPro ? ' checked' : ''}> LED pro${own('ledPro')}</label></div>
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eCO2"${eq.co2 ? ' checked' : ''}> CO2</label><label class="chk"><input type="checkbox" id="eAir"${eq.air ? ' checked' : ''}> Bulleur</label></div>
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eAto"${eq.ato ? ' checked' : ''}> Osmolateur</label><small>remet de l'osmosée</small></div>
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eMoon"${eq.moon ? ' checked' : ''}> 🌙 LED lunaire${own('moon')}</label><small>lueur la nuit</small></div>
        ${career() ? `<div class="eqrow"><label class="chk"><input type="checkbox" id="ePh"${eq.probePh ? ' checked' : ''}> Sonde pH</label><label class="chk"><input type="checkbox" id="eAll"${eq.probeAll ? ' checked' : ''}> Contrôleur</label></div>` : ''}`;
      const set = (patch, input) => {
        const err = Economy.setEquip(W, s, patch);
        if (err) { toast(err, 'warn'); if (input) { if (input.type === 'checkbox') input.checked = !input.checked; } buildEquip(); }
        else if ('filter' in patch) Sim.log(W, `Filtre : ${FILTERS[s.eq.filter].name}.`, 'info', false, s);
      };
      $('eFilter').onchange = e => set({ filter: e.target.value });
      $('eHeater').onchange = e => set({ heater: e.target.checked }, e.target);
      $('eTarget').onchange = e => s.eq.target = Math.max(16, Math.min(32, +e.target.value || 24));
      $('eLight').oninput = e => { s.eq.light = +e.target.value; $('eLightV').textContent = s.eq.light; };
      $('eInt').oninput = e => { s.eq.intensity = Math.min(Economy.maxIntensity(s), +e.target.value); $('eIntV').textContent = pct(s.eq.intensity); };
      $('eLed').onchange = e => { set({ ledPro: e.target.checked }, e.target); buildEquip(); };
      $('eCO2').onchange = e => set({ co2: e.target.checked }, e.target);
      $('eAir').onchange = e => set({ air: e.target.checked }, e.target);
      $('eAto').onchange = e => set({ ato: e.target.checked }, e.target);
      $('eMoon').onchange = e => set({ moon: e.target.checked }, e.target);
      if (career()) { $('ePh').onchange = e => set({ probePh: e.target.checked }, e.target); $('eAll').onchange = e => set({ probeAll: e.target.checked }, e.target); }
    } else {
      el.innerHTML = `
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eAir"${eq.air ? ' checked' : ''}> Pompe à air solaire</label></div>
        <div class="eqrow"><label class="chk"><input type="checkbox" id="eShade"${eq.shade ? ' checked' : ''}> Voile d'ombrage</label><small>moins chaud l'été</small></div>
        ${career() ? `<div class="eqrow"><label class="chk"><input type="checkbox" id="eAll"${eq.probeAll ? ' checked' : ''}> Contrôleur</label></div>` : ''}`;
      const set = (patch, input) => { const err = Economy.setEquip(W, s, patch); if (err) { toast(err, 'warn'); input.checked = !input.checked; } };
      $('eAir').onchange = e => set({ air: e.target.checked }, e.target);
      $('eShade').onchange = e => set({ shade: e.target.checked }, e.target);
      if (career()) $('eAll').onchange = e => set({ probeAll: e.target.checked }, e.target);
    }
  }

  // ---------- Actions ----------
  function buildActions() {
    const s = T(), el = $('actions');
    el.innerHTML = '';
    if (!s) return;
    const pond = s.env === 'pond';
    const left = k => career() ? ` (${W.inv[k] || 0})` : '';
    const need = (k, label) => () => {
      if (!Economy.consume(W, k)) { toast(`Plus de ${label} : passe à la boutique.`, 'warn'); return false; }
      return true;
    };
    const groups = [
      ['Nourrir', [
        [`Granulés${left('granules')}`, () => need('granules', 'granulés')() && (Sim.A.feed(W, s, 'granules'), Sound.plop())],
        ['Légumes', () => (Sim.A.feed(W, s, 'veg'), Sound.plop())],
        [`Poudre${left('powder')}`, () => need('powder', 'poudre')() && (Sim.A.feed(W, s, 'powder'), Sound.plop())]]],
      ['Eau', [['Changer l\'eau…', waterModal], ['Compléter', topOffModal], ['Siphonner', () => Sim.A.siphon(W, s)],
        ...(career() && !W.inv.salt ? [] : [[`🧂 Sel +${SALT_DOSE} g/L${left('salt')}`, () => {
          const doses = Math.max(1, Math.ceil(s.cfg.volume / 30));
          if (career() && (W.inv.salt || 0) < doses) return toast(`Il faut ${doses} doses de sel pour ${s.cfg.volume} L.`, 'warn');
          if (career()) W.inv.salt -= doses;
          Sim.A.salt(W, s, SALT_DOSE); buildActions();
        }]]),
        ...(W.tanks.length > 1 ? [['🧫 Ensemencer…', seedModal]] : [])]],
      ...(W.inv.vial ? [['Départ', [['🧪 Fiole de départ', () => {
        if (!confirm(`Fiole de départ (une seule par partie) : ${s.name} sera cyclé tout de suite. La verser ici ?`)) return;
        W.inv.vial = 0; Sim.A.vial(W, s); Sound.plop(); buildActions(); toast(`🧪 ${s.name} est cyclé !`);
      }]]]] : []),
      ['Bac', [['🪨 Décor…', decoOpen], ...(pond ? [] : [[`🧽 Raclette${(s.glass || 0) > .3 ? ' !' : ''}`, () => Sim.A.scrape(W, s)]])]],
      ...(career() ? [['Tests', [['Bandelette', () => Economy.testStrip(W, s)], [`Gouttes${left('drops')}`, () => { const e = Economy.testDrops(W, s); if (e) toast(e, 'warn'); }]]]] : []),
      ['Soins', [...(pond ? [] : [['Nettoyer filtre', () => Sim.A.cleanFilter(W, s)]]),
        [`Anti-parasites${left('fenben')}`, () => confirm('Fenbendazole : tue hydres et planaires en 4 jours, léger stress pour les crevettes. Lancer ?') && need('fenben', 'fenbendazole')() && Sim.A.treat(W, s, 'fenben')],
        ['Piège planaires', () => { if (career() && !W.inv.trap) return toast('Achète un piège à planaires.', 'warn'); Sim.A.treat(W, s, 'trap'); }],
        ...(career() && W.inv.bacteria ? [[`Bactéries (${W.inv.bacteria})`, () => need('bacteria', 'bactéries')() && Sim.A.addBacteria(W, s)]] : [])]],
      ...(career() ? [] : [['Ajouter', [['Crevettes…', () => shopModal('Crevettes')], ['Escargots…', () => shopModal('Escargots')], ['Plantes…', () => shopModal('Plantes')], ['Rasbora +1', () => Sim.A.fish(W, s, 1)], ['−1', () => s.pred.fish > 0 && Sim.A.fish(W, s, -1)]]]]),
      ...(career() && s.pred.fish ? [['Poissons', [['Rasbora −1', () => Sim.A.fish(W, s, -1)]]]] : []),
    ];
    for (const [name, btns] of groups) {
      const g = document.createElement('div');
      g.className = 'agroup';
      g.innerHTML = `<span>${name}</span>`;
      for (const [label, fn] of btns) {
        const b = document.createElement('button');
        b.textContent = label;
        b.onclick = () => { fn(); buildActions(); refreshAll(true); };
        g.appendChild(b);
      }
      el.appendChild(g);
    }
  }

  // Ensemencer le bac courant avec un bac mûr
  function seedModal() {
    const s = T();
    const others = W.tanks.filter(t => t !== s);
    const row = t => {
      const ci = Sim.cycleInfo(t);
      return `<div class="item"><span class="t">${esc(t.name)}</span><span class="d">Cycle ${pct(ci.pct)}${ci.pct >= 1 ? ' ✓' : ''}${t.pred.plan >= 1 || t.pred.hydra >= 1 ? ' · <b class="bad">parasites présents</b>' : ''}</span>
        <div class="row"><button data-src="${t.id}" data-k="water">Seau d'eau</button><button data-src="${t.id}" data-k="sponge">Presser le filtre</button><button data-src="${t.id}" data-k="mulm">Substrat + mousse</button></div></div>`;
    };
    modal(`<h2>🧫 Ensemencer ${esc(s.name)}</h2>
      <p class="dimc" style="font-size:13px">Les bactéries vivent surtout dans le filtre et le sol, très peu dans l'eau. Presser la masse filtrante d'un bac mûr est le plus efficace ; le substrat marche bien mais peut amener planaires et hydres.</p>
      <div class="items">${others.map(row).join('')}</div>`, el => {
      el.querySelectorAll('[data-src]').forEach(b => b.onclick = () => {
        const err = Sim.seedFrom(W, Sim.tankById(W, +b.dataset.src), s, b.dataset.k);
        if (err) return toast(err, 'warn');
        closeModal(); refreshAll(true);
      });
    });
  }

  // ---------- Mode décor ----------
  let lastSold = null;
  let deco = null; // { sel: id de l'objet choisi, placing: { k } ou { plant } }
  function decoOpen() {
    const s = T();
    if (!s) return;
    Sim.ensureDecor(W, s);
    deco = { sel: null, placing: null };
    $('decoPanel').classList.remove('hidden');
    Render.decoMode({
      placing: () => !!(deco && deco.placing),
      onSelect: id => { deco.sel = id; Render.decoSelect(id); renderDeco(); },
      onMove: (id, x, z) => {
        const d = s.decor.find(o => o.id === id);
        if (d) { d.x = x; d.z = z; }
        Render.build(s); Render.decoSelect(id);
      },
      onPlace: (x, z) => {
        const p = deco.placing;
        if (!p) return;
        if (p.plant) {
          (s.plantPos || (s.plantPos = {}))[p.plant] = { x, z };
          deco.placing = null;
        } else {
          if (career() && !((W.inv['d_' + p.k] || 0) > 0)) { toast(`Plus de ${DECOR[p.k].name} en stock : boutique, rayon Décor.`, 'warn'); return; }
          if (career()) W.inv['d_' + p.k]--;
          const d = { id: s.nextDecor++, k: p.k, x, z, ry: Math.random() * 6, s: 1, seed: (Math.random() * 1e6) | 0 };
          s.decor.push(d);
          deco.sel = d.id;
          if (!career() || !(W.inv['d_' + p.k] > 0)) deco.placing = null;
        }
        Render.build(s); Render.decoSelect(deco.sel); renderDeco();
      },
    });
    renderDeco();
  }
  function decoClose() {
    deco = null;
    $('decoPanel').classList.add('hidden');
    Render.decoMode(null);
  }
  function decoAct(act) {
    const s = T(), d = s && s.decor.find(o => o.id === deco.sel);
    if (!d) return;
    if (act === 'rl') d.ry -= .3;
    if (act === 'rr') d.ry += .3;
    if (act === 'sm') d.s = Math.max(.4, (d.s || 1) - .15);
    if (act === 'sp') d.s = Math.min(2.2, (d.s || 1) + .15);
    if (act === 'del') {
      s.decor = s.decor.filter(o => o !== d);
      if (career()) W.inv['d_' + d.k] = (W.inv['d_' + d.k] || 0) + 1;
      deco.sel = null;
    }
    Render.build(s); Render.decoSelect(deco.sel); renderDeco();
  }
  function renderDeco() {
    const s = T();
    if (!deco || !s) return;
    const sel = s.decor.find(o => o.id === deco.sel);
    const own = k => career() ? (W.inv['d_' + k] || 0) : '∞';
    const placeable = Object.keys(s.plants).filter(k => !PLANTS[k].floating && !['moss', 'epi'].includes(PLANTS[k].look.shape));
    const hint = deco.placing ? (deco.placing.plant ? `Clique sur le sol pour placer : ${PLANTS[deco.placing.plant].name}` : `Clique sur le sol pour poser : ${DECOR[deco.placing.k].name}`)
      : 'Clique un objet pour le choisir, glisse-le pour le déplacer. R : tourner · Suppr : retirer · Échap : terminer';
    $('decoPanel').innerHTML = `<div class="deco-row"><b>🪨 Décor — ${esc(s.name)}</b><span class="dimc">${esc(hint)}</span><button id="dClose">Terminer</button></div>
      <div class="deco-row">${Object.entries(DECOR).map(([k, D]) => `<button data-dk="${k}" class="${deco.placing && deco.placing.k === k ? 'on' : ''}" title="${esc(D.desc)}">${esc(D.name)} <small>${own(k)}</small></button>`).join('')}</div>
      ${sel ? `<div class="deco-row">Sélection : <b>${esc(DECOR[sel.k].name)}</b><button data-da="rl">↺</button><button data-da="rr">↻</button><button data-da="sm">−</button><button data-da="sp">+</button><button data-da="del">🗑 Retirer</button></div>` : ''}
      <div class="deco-row"><span class="dimc">Massifs :</span>${placeable.map(k => `<button data-pk="${k}" class="${deco.placing && deco.placing.plant === k ? 'on' : ''}">📍 ${esc(PLANTS[k].name)}</button>`).join('') || '<span class="dimc">aucune plante à placer</span>'}</div>`;
    const el = $('decoPanel');
    $('dClose').onclick = decoClose;
    el.querySelectorAll('[data-dk]').forEach(b => b.onclick = () => {
      const k = b.dataset.dk;
      if (career() && !((W.inv['d_' + k] || 0) > 0)) { toast(`Achète d'abord : ${DECOR[k].name} (boutique, rayon Décor).`, 'warn'); return; }
      deco.placing = deco.placing && deco.placing.k === k ? null : { k }; renderDeco();
    });
    el.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => { const k = b.dataset.pk; deco.placing = deco.placing && deco.placing.plant === k ? null : { plant: k }; renderDeco(); });
    el.querySelectorAll('[data-da]').forEach(b => b.onclick = () => decoAct(b.dataset.da));
  }

  // ---------- Modales ----------
  function modal(html, bind, wide) {
    $('modalBox').classList.toggle('wide', !!wide);
    $('modalBody').innerHTML = html;
    $('modal').classList.remove('hidden');
    if (bind) bind($('modalBody'));
  }
  function closeModal() { $('modal').classList.add('hidden'); }
  const waterOptions = sel => Economy.waterSources(W).map(k => `<option value="${k}"${k === sel ? ' selected' : ''}>${WATERS[k].name} (GH ${WATERS[k].gh}, KH ${WATERS[k].kh})</option>`).join('');

  function waterModal() {
    const s = T(), pond = s.env === 'pond';
    const src = Economy.waterSources(W).includes(s.cfg.water) ? s.cfg.water : Economy.waterSources(W)[0];
    modal(`<h2>Changement d'eau — ${esc(s.name)}</h2>
      <div class="row">Eau neuve : <select id="mSrc">${waterOptions(src)}</select></div>
      ${career() && !W.inv.osmo ? '<p class="dimc" style="font-size:13px">Pour l\'eau osmosée il faut un osmoseur (boutique).</p>' : ''}
      <p class="dimc" style="font-size:13px">Un gros écart de GH ou de température déclenche des mues… parfois ratées.${pond ? ' Au bassin, l\'eau du robinet arrive froide (14 °C).' : ''}</p>
      <div class="row">${[10, 25, 50, 80].map(p => `<button class="big" data-p="${p}">${p} %</button>`).join('')}</div>`, el => {
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
        const k = $('mSrc').value;
        if (!Economy.useWater(W, k)) return toast('Il te manque des sels pour cette eau.', 'warn');
        Sim.A.waterChange(W, s, +b.dataset.p, k); closeModal(); refreshAll(true);
      });
    });
  }
  function topOffModal() {
    const s = T();
    const src = Economy.waterSources(W);
    modal(`<h2>Compléter le niveau</h2><p class="dimc" style="font-size:13px">L'évaporation concentre les minéraux : compléter à l'osmosée pure les ramène, au robinet le GH monte.</p>
      <div class="mlist">${src.map(k => `<button data-k="${k}">${WATERS[k].name}</button>`).join('')}</div>`, el => {
      el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
        if (!Economy.useWater(W, b.dataset.k)) return toast('Il te manque des sels pour cette eau.', 'warn');
        Sim.A.topOff(W, s, b.dataset.k); closeModal(); refreshAll(true);
      });
    });
  }
  function menuModal() {
    const hc = W.mode === 'hardcore';
    modal(`<h2>Menu</h2>
      <div class="mlist">
        <button id="mSave">💾 Sauvegarder</button>
        ${hc ? '' : '<button id="mExport" title="Pour garder une copie ou passer sur un autre appareil (Importer sur l\'écran titre)">⬇ Exporter la sauvegarde</button>'}
        <button id="mGuide">📖 Guide du débutant</button>
        <button id="mAch">🏆 Succès (${Achievements.count(W)}/${Achievements.LIST.length})</button>
        <button id="mNotif">${Notify.on ? '🔔 Notifications : activées' : '🔕 Notifications : désactivées'}</button>
        <button id="mQuit">↩ Écran titre</button>
        <button id="mHelp">❓ Aide</button>
      </div>
      <div class="row" style="margin-top:8px">🔊 Volume <input type="range" id="mVol" min="0" max="1" step="0.05" value="${Sound.volume}" style="width:160px"></div>
      <div id="mHelpBox" class="hidden" style="font-size:13px;margin-top:10px">
        <p><b>Caméra</b> : clic gauche + glisser pour tourner, clic droit (ou Maj) pour se déplacer, molette pour zoomer. Clic sur une crevette pour sa fiche.</p>
        <p><b>Génétique</b> : les couleurs (rouge, jaune, bleu, vert, noir, blanc) sont récessives. Red × Blue donne des sauvages en F1 ; les couleurs ressortent en F2. Les bandes et le rili sont à dominance partielle, la ligne dorsale dominante. Densité, tolérances et taille dépendent de plusieurs gènes additifs.</p>
        <p><b>Décor</b> : bouton « Décor » en bas. Choisis un objet puis clique sur le sol pour le poser ; clique un objet pour le sélectionner, glisse pour le déplacer, R pour tourner, Suppr pour le retirer. « 📍 » place un massif de plantes. Le bois donne des tanins, la lave et les roches accueillent des bactéries, la Seiryu durcit l'eau.</p>
        <p><b>Sélection</b> : onglet Sélection, filtre les crevettes, puis transfère-les dans un autre bac. Goutte-à-goutte = 3 h de jeu, presque sans choc.</p>
        <p><b>Carrière</b> : temps réel ×24 (1 h réelle = 1 jour). Les paramètres de l'eau sont inconnus tant que tu ne les testes pas (bandelette gratuite, gouttes plus précises, sondes en continu). Vends tes souches au prix que tu veux sur le marché.</p>
        <p><b>Hardcore</b> : temps réel 1:1, une seule sauvegarde. S'il ne reste aucune crevette, la partie est perdue.</p>
      </div>`, () => {
      $('mSave').onclick = () => { Save.store(W); toast('Partie sauvegardée.'); closeModal(); };
      if (!hc) $('mExport').onclick = () => { Save.store(W); Save.exportFile(W); };
      $('mGuide').onclick = () => { closeModal(); Guide.open(); };
      $('mAch').onclick = achModal;
      $('mNotif').onclick = async () => {
        if (Notify.on) { Notify.disable(); toast('Notifications désactivées.'); }
        else { const err = await Notify.enable(); toast(err || 'Notifications activées : naissances, alertes, ventes… quand le jeu est en arrière-plan.', err ? 'warn' : ''); }
        menuModal();
      };
      $('mQuit').onclick = () => { Save.store(W); closeModal(); Main.stop(); showTitle(); };
      $('mHelp').onclick = () => $('mHelpBox').classList.toggle('hidden');
      $('mVol').oninput = e => Sound.setVolume(+e.target.value);
    });
  }

  function achModal() {
    Achievements.check(W, true);
    const got = W.ach || {};
    modal(`<h2>🏆 Succès <small class="dimc">${Achievements.count(W)} / ${Achievements.LIST.length}</small></h2>
      <div class="ach-grid">${Achievements.LIST.map(a => `<div class="ach${got[a.id] != null ? ' on' : ''}" title="${esc(a.desc)}">
        <span class="ic">${got[a.id] != null ? a.ic : '🔒'}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}${got[a.id] != null ? `<br>jour ${Math.floor(got[a.id] / 24) + 1}` : ''}</small></div>`).join('')}</div>`, null, true);
  }

  // ---------- Boutique ----------
  const SHOP_CATS = ['Bacs', 'Crevettes', 'Escargots', 'Équipement', 'Tests', 'Eau', 'Nourriture', 'Soins', 'Plantes', 'Décor', 'Poissons'];
  // Conseils d'eau et de volume d'une espèce, avec un avertissement si le bac affiché est trop petit
  function genusTips(genus, s) {
    const G = GENERA[genus], b = G.base;
    const sal = G.salt[0] ? ` Sel ≈ ${G.salt[0]} g/L.` : '';
    const small = s && s.cfg.volume < G.minVol ? ` <b class="badc">⚠ ${esc(s.name)} (${s.cfg.volume} L) est trop petit.</b>` : '';
    return `${G.desc} T° ${Math.round(b.tOpt - b.tTol)}-${Math.round(b.tOpt + b.tTol)} °C, pH ${b.phOpt}, GH ${Math.round(Math.max(1, b.ghOpt - b.ghTol))}-${Math.round(b.ghOpt + b.ghTol)}.${sal} <b>Volume conseillé : ${G.minVol} L</b>.${small}`;
  }
  function shopModal(cat = 'Bacs') {
    const s = T();
    const price = p => career() ? money(p) : 'gratuit';
    let items = '';
    if (cat === 'Crevettes') {
      let lastG = null;
      items = Object.entries(VARIETIES).sort((a, b) => GENUS_ORDER.indexOf(a[1].genus) - GENUS_ORDER.indexOf(b[1].genus)).map(([k, v]) => {
        const head = v.genus !== lastG ? `<h4 class="items-head">${GENERA[v.genus].short} <small class="dimc">${GENERA[v.genus].name}</small></h4><p class="dimc" style="font-size:12px;margin:0 0 4px;grid-column:1/-1">${genusTips(v.genus, s)}</p>` : '';
        lastG = v.genus;
        return head + `<div class="item"><span class="t"><span class="sw" style="display:inline-block;vertical-align:-2px;background:${swatchOf(varG(k))}"></span> ${GENERA[v.genus].short} ${esc(v.name)}</span>
        <span class="d">${career() ? 'Livrée en colis : à acclimater.' : ''}</span>
        <span class="p">${price(v.price)} / crevette</span>
        <div class="row">${(v.genus === 'macro' ? [1, 2, 4] : [5, 10, 20]).map(n => `<button data-shrimp="${k}" data-n="${n}">+${n}</button>`).join('')}</div></div>`;
      }).join('');
    } else {
      let lastPc = null;
      items = Object.entries(SHOP).filter(([, it]) => it.cat === cat).map(([k, it]) => {
        const pc = it.plant ? PLANTS[it.plant].cat : null;
        const head = pc && pc !== lastPc ? `<h4 class="items-head">${pc}</h4>` : '';
        lastPc = pc;
        const own = career() && (it.eq || it.tool || it.use || it.deco) ? `<span class="own">Possédé : ${it.use ? (W.inv[it.use] || 0) + ' doses' : W.inv[k] || 0}${it.eq ? ` (${Economy.spare(W, k)} libre)` : ''}</span>` : '';
        const btn = it.tank ? `<button data-tank="${k}">Installer…</button>` : it.plant || it.fish || it.snail ? `<button data-buy="${k}" ${s ? '' : 'disabled'}>Ajouter à ${s ? esc(s.name) : '—'}</button>` : `<button data-buy="${k}">Acheter</button>`;
        return head + `<div class="item"><span class="t">${esc(it.name)}</span><span class="d">${esc(it.desc || (it.tank ? (it.tank.env === 'pond' ? 'Dehors : saisons, pluie, gel.' : 'Éclairage LED de base inclus.') : ''))}</span>
          <span class="p">${price(it.price)}${it.tank ? ' + sol' : ''}</span>${own}<div class="row">${btn}</div></div>`;
      }).join('');
    }
    modal(`<h2>🛒 Boutique ${career() ? `<small style="color:#ffd76a">— ${money(W.money)}</small>` : ''}</h2>
      <div class="free">Gratuit : ${FREE_STUFF.join(' · ')}</div>
      <div class="shop-tabs">${SHOP_CATS.map(c => `<button data-cat="${c}" class="${c === cat ? 'on' : ''}">${c}</button>`).join('')}</div>
      <div class="items">${items}</div>`, el => {
      el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => shopModal(b.dataset.cat));
      el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
        const err = Economy.buy(W, b.dataset.buy, 1, T());
        if (err) toast(err, 'warn'); else { toast(`Acheté : ${SHOP[b.dataset.buy].name}`); buildEquip(); buildActions(); }
        shopModal(cat);
      });
      el.querySelectorAll('[data-shrimp]').forEach(b => b.onclick = () => {
        const k = b.dataset.shrimp, n = +b.dataset.n;
        const G = GENERA[VARIETIES[k].genus];
        if (s && s.cfg.volume < G.minVol) toast(`⚠ ${G.short} : ${G.minVol} L conseillés, ${s.name} n'en fait que ${s.cfg.volume}. Elles vont stresser.`, 'warn');
        if (!career() && s) { Sim.A.addShrimp(W, s, k, n); toast(`+${n} ${VARIETIES[k].name} dans ${s.name}`); return; }
        const err = Economy.buyStrain(W, k, n);
        if (err) toast(err, 'warn'); else { closeModal(); bagsModal(); }
      });
      el.querySelectorAll('[data-tank]').forEach(b => b.onclick = () => newTankModal(b.dataset.tank));
    }, true);
  }
  function newTankModal(key) {
    const it = SHOP[key], pond = it.tank.env === 'pond';
    const subs = Object.keys(SUBSTRATES).filter(k => pond || k !== 'earth');
    const sources = Economy.waterSources(W);
    modal(`<h2>Installer : ${esc(it.name)}</h2>
      <div class="row">Nom <input id="nName" value="${pond ? 'Bassin' : 'Bac'} ${W.nextTank}" style="width:160px;background:#0f1e22;border:2px solid var(--line)"></div>
      <div class="row">Sol <select id="nSub">${subs.map(k => `<option value="${k}"${k === (pond ? 'earth' : 'sand') ? ' selected' : ''}>${SUBSTRATES[k].name}${career() ? ' — ' + moneyTxt(Math.ceil((SUB_PRICE[k] || 0) * it.tank.volume / 30)) : ''}</option>`).join('')}</select></div>
      <div class="dimc" id="nSubDesc" style="font-size:13px"></div>
      <div class="row">Eau <select id="nWater">${waterOptions(sources[0])}</select></div>
      ${career() ? '<p class="dimc" style="font-size:13px">Le bac est neuf : il faut ~3 semaines de jeu pour que les bactéries s\'installent (ou des bactéries en bouteille). Pas de filtre ni de chauffage inclus.</p>' : '<label class="chk"><input type="checkbox" id="nMat" checked> Bac déjà cyclé</label>'}
      <div class="row"><b id="nPrice"></b> <button class="big" id="nGo">Installer</button></div>`, () => {
      const upd = () => {
        $('nPrice').innerHTML = career() ? 'Total : ' + money(Economy.tankPrice(key, $('nSub').value)) : '';
        $('nSubDesc').textContent = SUBSTRATES[$('nSub').value].desc || '';
      };
      $('nSub').onchange = upd; upd();
      $('nGo').onclick = () => {
        const r = Economy.createTank(W, key, { name: $('nName').value.slice(0, 30), substrate: $('nSub').value, water: $('nWater').value, mature: $('nMat') ? $('nMat').checked : false });
        if (typeof r === 'string') return toast(r, 'warn');
        closeModal();
        switchTank(W.tanks.indexOf(r), true);
        toast(`${r.name} installé !`);
      };
    });
  }

  // ---------- Colis et acclimatation ----------
  function bagsModal() {
    const tanks = W.tanks.map(t => `<option value="${t.id}"${t === T() ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
    const bags = W.bags.map(b => {
      const age = W.t - b.t0;
      return `<div class="item"><span class="t">📦 ${esc(b.label)}</span>
        <span class="d">Eau du sac : GH ${fmt(b.water.gh)} · KH ${fmt(b.water.kh)} · pH ${fmt(b.water.ph, 1)} · ${fmt(b.water.temp)} °C<br>Dans le sac depuis ${fmt(age / 24, 1)} j ${age > 60 ? '<b class="bad">— vite !</b>' : '(max ~3 j)'}</span>
        ${W.tanks.length ? `<div class="row">vers <select data-to="${b.id}">${tanks}</select></div>
        <div class="row"><button data-drip="${b.id}">💧 Goutte-à-goutte (${Sim.DRIP_HOURS} h)</button><button data-direct="${b.id}">Direct</button></div>` : '<span class="bad">Achète d\'abord un bac !</span>'}</div>`;
    }).join('');
    const trList = () => W.transfers.map(t => `<div>⏳ ${t.shrimp.length} crevette(s) → ${esc(Sim.tankById(W, t.to)?.name)} · ${t.method === 'drip' ? 'goutte-à-goutte' : 'direct'} · encore ${Math.max(0, (t.end - W.t) * (career() ? 2.5 : 1)).toFixed(0)} ${career() ? 'min réelles' : 'h'}</div>`).join('') || '<div class="dimc">Rien en cours.</div>';
    const trs = W.transfers.length ? trList() : '';
    modal(`<h2>📦 Colis et acclimatation</h2>
      ${bags ? `<div class="items">${bags}</div>` : '<p class="dimc">Aucun colis en attente.</p>'}
      ${trs ? `<h4>En cours</h4><div id="trList">${trs}</div>` : ''}
      <p class="dimc" style="font-size:13px">Le goutte-à-goutte amène doucement l'eau du sac aux paramètres du bac : presque aucun choc. En direct, un gros écart de GH, de pH ou de T° peut tuer ou faire rater des mues.</p>`, el => {
      const go = (id, method) => {
        const bag = W.bags.find(b => b.id === +id);
        const to = +el.querySelector(`[data-to="${id}"]`).value;
        Sim.bagToTank(W, bag, null, to, method);
        bagsModal(); refreshAll(true);
      };
      el.querySelectorAll('[data-drip]').forEach(b => b.onclick = () => go(b.dataset.drip, 'drip'));
      el.querySelectorAll('[data-direct]').forEach(b => b.onclick = () => go(b.dataset.direct, 'direct'));
      // compte à rebours en direct tant que la fenêtre est ouverte
      const iv = setInterval(() => {
        const box = document.getElementById('trList');
        if (!box || $('modal').classList.contains('hidden')) return clearInterval(iv);
        box.innerHTML = trList();
      }, 1000);
    }, true);
  }

  // ---------- Marché ----------
  function fakeShrimp(dna, genus, id) {
    return { id, dna, genus, g: Gen.express(dna, genus), size: 25, age: 150, sex: 'F', molt: 20, berried: null, health: 1 };
  }
  function marketModal() {
    const m = Economy.ensureMarket(W);
    const cards = m.listings.map(l => `<div class="item"><canvas data-pid="${l.id}"></canvas>
      <span class="t">« ${esc(l.entry.name)} » <small class="dimc">${GENERA[l.genus].short}</small></span>
      <span class="d">${esc(l.cls)} · par <b>${esc(l.seller)}</b><br>T° ${fmt(l.entry.cond.tOpt)} ± ${fmt(l.entry.cond.tTol)} · pH ${fmt(l.entry.cond.phOpt, 1)} · GH ${fmt(l.entry.cond.ghOpt)}<br>${esc(l.entry.desc)}</span>
      <span class="p">${money(l.price)} / crevette · ${l.stock.length} dispo</span>
      <div class="row">${[1, 5].map(n => `<button data-l="${l.id}" data-n="${n}">Acheter ${n}</button>`).join('')}<button data-l="${l.id}" data-n="999">Tout</button></div></div>`).join('');
    const mine = W.listings.map(l => {
      const s = Sim.tankById(W, l.tank);
      return `<div class="param"><span>${l.ids.length} en vente (${esc(s?.name)}) · ${money(l.price)} pièce · ${l.sold} vendue(s)${l.note ? ' · ' + esc(l.note) : ''}</span><span class="v"><button data-un="${l.id}">Retirer</button></span></div>`;
    }).join('');
    modal(`<h2>📈 Marché <small style="color:#ffd76a">— ${money(W.money)}</small></h2>
      ${m.trend ? `<div class="trend">🔥 Tendance de la semaine : <b>${esc(m.trend)}</b> (prix ×1.6)</div>` : ''}
      <h4>Mes annonces <small class="dimc">— vendu au total : ${W.stats.sold} pour ${money(W.stats.earned)}</small></h4>
      ${mine || '<p class="dimc" style="font-size:13px">Aucune annonce. Pour vendre : onglet Sélection → choisis des crevettes → Vendre.</p>'}
      ${Online.enabled() ? `<h4>🌐 Joueurs en ligne <small class="dimc">${Online.name ? '— tu es ' + esc(Online.name) : ''}</small></h4><div id="netMarket" class="items"><p class="dimc">Chargement…</p></div>` : ''}
      <h4>Annonces des éleveurs (simulés)</h4><div class="items">${cards || '<p class="dimc">Rien pour l\'instant, reviens demain.</p>'}</div>`, el => {
      if (Online.enabled()) loadNetMarket();
      el.querySelectorAll('canvas[data-pid]').forEach(cv => {
        const l = m.listings.find(x => x.id === cv.dataset.pid);
        try { Render.portrait(cv, fakeShrimp(l.stock[0], l.genus, 'm' + l.id)); } catch (e) { }
      });
      el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
        const err = Economy.buyListing(W, b.dataset.l, +b.dataset.n);
        if (err) toast(err, 'warn'); else { closeModal(); bagsModal(); }
      });
      el.querySelectorAll('[data-un]').forEach(b => b.onclick = () => { Economy.unlist(W, +b.dataset.un); marketModal(); });
    }, true);
  }

  // ---------- Marché entre joueurs ----------
  let netRows = [];
  async function loadNetMarket() {
    const box = () => document.getElementById('netMarket');
    try {
      netRows = (await Online.listings()).filter(r => r.entry && Array.isArray(r.stock) && r.stock.length && Online.validDna(r.stock[0]));
    } catch (e) { if (box()) box().innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    const el = box();
    if (!el) return;
    el.innerHTML = netRows.map(r => {
      const mine = r.seller === Online.me, c = r.entry.cond || {};
      return `<div class="item"><canvas data-nid="${r.id}"></canvas>
        <span class="t">« ${esc(r.entry.name)} » <small class="dimc">${GENERA[r.genus].short}</small></span>
        <span class="d">${esc(r.entry.cls || '')} · par <b>${esc(r.seller_name)}</b>${mine ? ' (toi)' : ''}<br>${c.tOpt != null ? `T° ${fmt(c.tOpt)} ± ${fmt(c.tTol)} · pH ${fmt(c.phOpt, 1)} · GH ${fmt(c.ghOpt)}<br>` : ''}${esc(r.note || r.entry.desc || '')}</span>
        <span class="p">${money(+r.price)} / crevette · ${r.stock.length} dispo${r.sold ? ` · ${r.sold} vendue(s)` : ''}</span>
        <div class="row">${mine ? `<button data-nun="${r.id}">Retirer (récupérer ${r.stock.length})</button>`
          : [1, 5].map(n => `<button data-nb="${r.id}" data-n="${n}">Acheter ${n}</button>`).join('') + `<button data-nb="${r.id}" data-n="50">Tout</button>`}</div></div>`;
    }).join('') || '<p class="dimc">Aucune annonce de joueur pour l\'instant. Sois le premier : onglet Sélection → Vendre → « Joueurs en ligne ».</p>';
    el.querySelectorAll('canvas[data-nid]').forEach(cv => {
      const r = netRows.find(x => x.id === +cv.dataset.nid);
      try { Render.portrait(cv, fakeShrimp(r.stock[0], r.genus, 'n' + r.id)); } catch (e) { }
    });
    el.querySelectorAll('[data-nb]').forEach(b => b.onclick = () => netBuy(+b.dataset.nb, +b.dataset.n));
    el.querySelectorAll('[data-nun]').forEach(b => b.onclick = () => netUnlist(+b.dataset.nun));
  }
  // Pseudo demandé une fois, avant la première action en ligne
  function withName(next) {
    if (Online.name) return next();
    modal(`<h2>🌐 Ton pseudo</h2><p style="font-size:14px">Il apparaîtra sur tes annonces et dans le bestiaire de tes acheteurs.</p>
      <div class="row"><input id="pName" maxlength="24" placeholder="ex. CrevetteMaster" style="flex:1;background:#0f1e22;border:2px solid var(--line)"><button class="big" id="pGo">OK</button></div>`, () => {
      $('pGo').onclick = () => {
        const n = $('pName').value.trim();
        if (n.length < 2) return toast('2 caractères minimum.', 'warn');
        Online.setName(n); closeModal(); next();
      };
    });
  }
  async function netBuy(id, n) {
    const r = netRows.find(x => x.id === id);
    if (!r) return;
    n = Math.min(n, r.stock.length);
    if (W.money < r.price * n) return toast(`Pas assez de ${MONEY}.`, 'warn');
    withName(async () => {
      try {
        const res = await Online.buy(id, n);
        const dna = (res.dna || []).filter(Online.validDna);
        Economy.pay(W, +res.price * res.n);
        Economy.receive(W, res.genus, dna, res.entry, res.seller_name);
        Sim.log(W, `🌐 Acheté à ${res.seller_name} : ${res.n} × « ${res.entry.name} » pour ${moneyTxt(res.price * res.n)}.`, 'info', true);
        closeModal(); bagsModal();
      } catch (e) { toast(e.message, 'warn'); marketModal(); }
    });
  }
  async function netUnlist(id) {
    try {
      const res = await Online.unlist(id);
      const dna = (res.dna || []).filter(Online.validDna);
      Economy.receive(W, res.genus, dna, res.entry, 'retour du marché');
      toast(`Annonce retirée : ${dna.length} crevette(s) reviennent en colis.`);
      closeModal(); bagsModal();
    } catch (e) { toast(e.message, 'warn'); }
  }
  // Publication : les crevettes partent au marché (elles quittent le bac), payées à chaque vente
  function netPublish(s, list, price, note) {
    const genus = list[0].genus;
    if (list.some(sh => sh.genus !== genus)) return toast('Une annonce ne peut pas mélanger deux espèces.', 'warn');
    if (list.length > 50) return toast('50 crevettes maximum par annonce.', 'warn');
    withName(async () => {
      const strains = new Set(list.map(sh => sh.strain));
      const own = strains.size === 1 && list[0].strain ? Economy.entryOf(W, list[0].strain) : null;
      const cls = Gen.colorClass(list[0].g);
      const entry = {
        id: own && own.id.startsWith('u:') ? own.id : `u:${(Online.me || 'x').slice(0, 8)}:${own ? own.id : 'lot' + W.nextUid++}`,
        // signature : le créateur de la souche reste l'auteur, même quand elle est revendue
        name: own ? own.name : cls, author: own && own.source !== 'mine' && own.author && own.author !== 'Animalerie' ? own.author : Online.name, by: Online.name, genus, cls: own ? own.cls : cls, dna: list[0].dna,
        cond: Economy.condOf(list.map(sh => sh.g)), desc: own ? own.desc || '' : note || '', created: 0, source: 'market',
      };
      try {
        await Online.publish({ genus, entry, stock: list.map(sh => sh.dna), price, note: note || null });
        const ids = new Set(list.map(sh => sh.id));
        s.shrimp = s.shrimp.filter(sh => !ids.has(sh.id));
        Sim.log(W, `🌐 Mise en vente en ligne : ${list.length} × « ${entry.name} » à ${moneyTxt(price)} pièce. Elles sont parties au marché.`, 'info', true, s);
        net.clear(); closeModal(); refreshAll(true);
      } catch (e) { toast(e.message, 'warn'); }
    });
  }
  // Encaissement des ventes en ligne (toutes les 2 minutes)
  let lastCollect = 0;
  async function netCollect() {
    if (!W || !career() || !Online.enabled() || !Online.name || Date.now() - lastCollect < 120000) return;
    lastCollect = Date.now();
    try {
      const rows = await Online.collect();
      for (const r of rows || []) {
        Economy.earn(W, +r.total);
        W.stats.sold += r.n; W.stats.earned += +r.total;
        Achievements.flag(W, 'netSold');
        Sim.log(W, `💰 Vente en ligne : ${r.n} × « ${r.strain} » à ${r.buyer_name} pour ${moneyTxt(+r.total)}.`, 'birth', true);
      }
    } catch (e) { console.warn('Encaissement en ligne', e); }
  }

  // ---------- Bestiaire ----------
  let bookSel = null;
  function bookModal(id) {
    for (const s of W.tanks) for (const sh of s.shrimp) if (sh.strain) Economy.entryOf(W, sh.strain);
    const list = W.bestiary.slice().sort((a, b) => (a.source === 'mine' ? 0 : 1) - (b.source === 'mine' ? 0 : 1) || b.created - a.created);
    if (id) bookSel = id;
    const e = list.find(x => x.id === bookSel) || list[0];
    if (e) bookSel = e.id;
    const g = e && Gen.express(e.dna, e.genus);
    const st = e && Economy.stability(W, e);
    const mine = e && e.source === 'mine';
    modal(`<h2>📖 Bestiaire</h2>
      ${list.length ? `<div class="book"><div class="book-list">${list.map(x => {
        const xg = Gen.express(x.dna, x.genus);
        return `<div data-e="${esc(x.id)}" class="${x === e ? 'on' : ''}"><span class="sw" style="background:${swatchOf(xg)}"></span><span>${esc(x.name)}<br><small>${x.source === 'mine' ? '✍ toi' : esc(x.author)} · ${Economy.countAlive(W, x.id)} vivantes</small></span></div>`;
      }).join('')}</div>
      <div class="book-detail">
        <canvas id="bkPortrait"></canvas>
        ${mine ? `<div class="row">Nom <input id="bkName" value="${esc(e.name)}" maxlength="40"></div>` : `<h3 style="font-size:16px">${esc(e.name)}</h3>`}
        <div class="dimc" style="font-size:13px">${GENERA[e.genus].name} · phénotype de référence : <b>${esc(e.cls)}</b> · ✍ créée par ${mine ? 'toi' : `<b>${esc(e.author)}</b>`}${e.by && e.by !== e.author ? ` · vendue par ${esc(e.by)}` : ''} · le jour ${Math.floor(e.created / 24) + 1}</div>
        <h4>Description</h4>
        ${mine ? `<textarea id="bkDesc" placeholder="Origine, croisements, conseils…">${esc(e.desc)}</textarea>` : `<p style="font-size:14px">${esc(e.desc)}</p>`}
        <h4>Conditions de vie (moyenne des fondatrices)</h4>
        <div class="stat-grid" style="font-size:13px">
          <span>Température</span><b>${fmt(e.cond.tOpt - e.cond.tTol, 0)} – ${fmt(e.cond.tOpt + e.cond.tTol, 0)} °C</b>
          <span>pH</span><b>${fmt(e.cond.phOpt - e.cond.phTol, 1)} – ${fmt(e.cond.phOpt + e.cond.phTol, 1)}</b>
          <span>GH</span><b>${fmt(Math.max(0, e.cond.ghOpt - e.cond.ghTol), 0)} – ${fmt(e.cond.ghOpt + e.cond.ghTol, 0)} °d</b>
          <span>Taille adulte</span><b>${fmt(g.size, 0)} mm</b>
          <span>Stabilité</span><b>${st == null ? 'pas encore assez de bébés' : pct(st) + ' des bébés conformes'}</b>
          <span>Vivantes chez toi</span><b>${Economy.countAlive(W, e.id)}</b>
        </div>
        ${mine ? '<div class="row"><button id="bkSave">Enregistrer</button></div>' : ''}
      </div></div>` : '<p class="dimc">Ton bestiaire est vide. Achète des crevettes ou crée une souche depuis l\'onglet Sélection.</p>'}`, el => {
      el.querySelectorAll('[data-e]').forEach(d => d.onclick = () => bookModal(d.dataset.e));
      if (e) { try { Render.portrait($('bkPortrait'), fakeShrimp(e.dna, e.genus, 'b' + e.id)); } catch (err) { } }
      if (mine) $('bkSave').onclick = () => { e.name = $('bkName').value.trim() || e.name; e.desc = $('bkDesc').value.slice(0, 600); toast('Souche enregistrée.'); bookModal(e.id); };
    }, true);
  }

  // ---------- Sélection (épuisette) ----------
  function filtered(s) {
    return s.shrimp.filter(sh =>
      (!filt.cls || Gen.colorClass(sh.g) === filt.cls) &&
      (!filt.stage || stageOf(sh) === filt.stage) &&
      (!filt.sex || (Sim.isMature(sh) && sh.sex === filt.sex)) &&
      (!filt.strain || (filt.strain === '-' ? !sh.strain : sh.strain === filt.strain)));
  }
  function renderNet() {
    const s = T(), el = $('tab-net');
    if (!s) { el.innerHTML = ''; return; }
    for (const id of [...net]) if (!s.shrimp.some(sh => sh.id === id)) net.delete(id);
    const classes = [...new Set(s.shrimp.map(sh => Gen.colorClass(sh.g)))].sort();
    const strains = [...new Set(s.shrimp.map(sh => sh.strain).filter(Boolean))];
    const list = filtered(s);
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    el.innerHTML = `
      <div class="row"><select id="fCls">${opt('', 'Tous phénotypes', filt.cls)}${classes.map(c => opt(c, c, filt.cls)).join('')}</select>
        <select id="fStage">${opt('', 'Tous stades', filt.stage)}${['bébé', 'juvénile', 'adulte'].map(c => opt(c, c, filt.stage)).join('')}</select></div>
      <div class="row"><select id="fSex">${opt('', 'Tous sexes', filt.sex)}${opt('F', '♀ femelles adultes', filt.sex)}${opt('M', '♂ mâles adultes', filt.sex)}</select>
        <select id="fStrain">${opt('', 'Toutes souches', filt.strain)}${opt('-', 'Sans souche', filt.strain)}${strains.map(id => opt(id, strainName(id) || id, filt.strain)).join('')}</select></div>
      <div class="row">${list.length} correspondent · <b>${net.size}</b> dans l'épuisette</div>
      <div class="row"><button id="nAll">Tout prendre</button><button id="nNone">Vider</button>
        prendre <input type="number" id="nCount" class="qty" value="10" min="1"> au hasard <button id="nRand">OK</button></div>
      <div class="netlist">${list.slice(0, 150).map(sh => `<div data-id="${sh.id}"><input type="checkbox" ${net.has(sh.id) ? 'checked' : ''}><span class="sw" style="background:${swatchOf(sh.g)}"></span>
        <span>#${sh.id} ${sh.sex === 'F' ? '♀' : '♂'} ${esc(Gen.phenotype(sh.g))}${sh.strain ? ' · <i>' + esc(strainName(sh.strain) || '') + '</i>' : ''}${sh.listed ? ' 🏷' : ''}</span><small class="dimc">${fmt(sh.size, 0)} mm</small></div>`).join('')}
        ${list.length > 150 ? '<div class="dimc">… (150 premières)</div>' : ''}</div>
      <div class="row"><button id="nMove" ${net.size && W.tanks.length > 1 ? '' : 'disabled'}>🥅 Transférer…</button>
        ${career() ? `<button id="nSell" ${net.size ? '' : 'disabled'}>🏷 Vendre…</button>` : ''}
        <button id="nStrain" ${net.size ? '' : 'disabled'}>📖 Créer une souche…</button></div>
      ${W.tanks.length < 2 ? '<p class="dimc" style="font-size:12px">Pour sélectionner, il faut un 2ᵉ bac (boutique → Bacs).</p>' : ''}`;
    const setF = (k, v) => { filt[k] = v; renderNet(); };
    $('fCls').onchange = e => setF('cls', e.target.value);
    $('fStage').onchange = e => setF('stage', e.target.value);
    $('fSex').onchange = e => setF('sex', e.target.value);
    $('fStrain').onchange = e => setF('strain', e.target.value);
    $('nAll').onclick = () => { list.forEach(sh => net.add(sh.id)); renderNet(); };
    $('nNone').onclick = () => { net.clear(); renderNet(); };
    $('nRand').onclick = () => {
      const pool = list.filter(sh => !net.has(sh.id));
      for (let i = 0; i < +$('nCount').value && pool.length; i++) net.add(pool.splice((Math.random() * pool.length) | 0, 1)[0].id);
      renderNet();
    };
    el.querySelectorAll('.netlist [data-id]').forEach(d => d.onclick = e => {
      const id = +d.dataset.id;
      if (e.target.tagName === 'INPUT') { e.target.checked ? net.add(id) : net.delete(id); renderNet(); return; }
      Render.select(id, false); selected = id;
    });
    $('nMove').onclick = transferModal;
    if (career()) $('nSell').onclick = sellModal;
    $('nStrain').onclick = strainModal;
    lastNet = performance.now();
  }
  function transferModal() {
    const s = T();
    const others = W.tanks.filter(t => t !== s);
    const d = t => `écart GH ${fmt(Math.abs(t.w.gh - s.w.gh))} · pH ${fmt(Math.abs(t.w.ph - s.w.ph), 2)} · ${fmt(Math.abs(t.w.temp - s.w.temp))} °C`;
    modal(`<h2>🥅 Transférer ${net.size} crevette(s)</h2>
      <div class="row">Vers <select id="tTo">${others.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
      ${career() ? '' : `<p class="dimc" style="font-size:13px" id="tDiff"></p>`}
      <div class="row"><button class="big" id="tDrip">💧 Goutte-à-goutte (${Sim.DRIP_HOURS} h)</button><button id="tDirect">Direct</button></div>
      <p class="dimc" style="font-size:13px">${career() ? 'Teste l\'eau des deux bacs avant : un gros écart en direct peut tuer.' : 'Le goutte-à-goutte réduit le choc de ~90 %.'}</p>`, () => {
      const upd = () => { if ($('tDiff')) $('tDiff').textContent = d(Sim.tankById(W, +$('tTo').value)); };
      $('tTo').onchange = upd; upd();
      const go = m => { Sim.netFromTank(W, s, [...net], +$('tTo').value, m); net.clear(); closeModal(); refreshAll(true); };
      $('tDrip').onclick = () => go('drip');
      $('tDirect').onclick = () => go('direct');
    });
  }
  function sellModal() {
    const s = T();
    const list = s.shrimp.filter(sh => net.has(sh.id) && !sh.listed);
    const vals = list.map(sh => Economy.value(W, sh));
    const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    modal(`<h2>🏷 Vendre ${list.length} crevette(s)</h2>
      <p style="font-size:14px">Valeur estimée : <b>${money(Math.min(...vals))} – ${money(Math.max(...vals))}</b> (moyenne ${money(avg)}). Au-dessus, ça part lentement ; bien au-dessus, presque jamais.</p>
      <div class="row">Prix par crevette <input type="number" id="sPrice" class="qty" value="${Math.max(1, Math.round(avg))}" min="0.5" step="0.5"> ${MONEY}</div>
      <div class="row">Note <input id="sNote" placeholder="ex. couple reproducteur" style="flex:1;background:#0f1e22;border:2px solid var(--line)"></div>
      ${Online.enabled() && career() ? `<div class="row"><label class="chk"><input type="radio" name="sWhere" value="npc" checked> Éleveurs simulés</label><label class="chk"><input type="radio" name="sWhere" value="net"> 🌐 Joueurs en ligne</label></div>` : ''}
      <p class="dimc" style="font-size:13px">Éleveurs simulés : elles restent dans ton bac jusqu'à la vente. Joueurs en ligne : elles partent tout de suite au marché, tu es payé à chaque achat (même jeu fermé), et tu peux retirer l'annonce pour les récupérer. Astuce : nomme ta souche dans le bestiaire, sa fiche suit tes crevettes chez l'acheteur.</p>
      <button class="big" id="sGo">Mettre en vente</button>`, () => {
      $('sGo').onclick = () => {
        const where = document.querySelector('input[name=sWhere]:checked');
        if (where && where.value === 'net') return netPublish(s, list, Math.max(.5, +$('sPrice').value || 1), $('sNote').value.slice(0, 60));
        const err = Economy.sell(W, s, list.map(sh => sh.id), Math.max(.5, +$('sPrice').value || 1), $('sNote').value.slice(0, 60));
        if (err) return toast(err, 'warn');
        net.clear(); closeModal(); toast('Annonce publiée.'); refreshAll(true);
      };
    });
  }
  function strainModal() {
    const s = T();
    const list = s.shrimp.filter(sh => net.has(sh.id));
    const cls = list.length ? Gen.colorClass(list[0].g) : '';
    modal(`<h2>📖 Nouvelle souche</h2>
      <p style="font-size:14px">${list.length} fondatrices. Leur descendance « pure » (les deux parents de la souche) portera le nom. La stabilité mesure la part de bébés qui ressemblent au phénotype de référence.</p>
      <div class="row">Nom <input id="stName" value="${esc(cls)}" maxlength="40" style="flex:1;background:#0f1e22;border:2px solid var(--line)"></div>
      <div class="row" style="align-items:flex-start">Description <textarea id="stDesc" style="flex:1;min-height:70px;background:#0f1e22;border:2px solid var(--line);color:var(--txt)" placeholder="Origine, croisements…"></textarea></div>
      <button class="big" id="stGo">Créer</button>`, () => {
      $('stGo').onclick = () => {
        const r = Economy.createStrain(W, s, list.map(sh => sh.id), $('stName').value.trim(), $('stDesc').value);
        if (typeof r === 'string') return toast(r, 'warn');
        net.clear(); closeModal(); bookModal(r.id);
      };
    });
  }

  // ---------- Panneau eau ----------
  function cls(v, warn, bad, inv) {
    if (v == null) return 'dimc';
    if (inv) return v < bad ? 'bad' : v < warn ? 'warn' : 'ok';
    return v > bad ? 'bad' : v > warn ? 'warn' : 'ok';
  }
  function cycleRow(s) {
    const ci = Sim.cycleInfo(s);
    if (ci.pct >= 1) return ['Cycle azote', '✓ cyclé', 'ok'];
    const bar = `<span class="cycle"><i style="width:${(ci.a * 50).toFixed(0)}%"></i><b style="width:${(ci.b * 50).toFixed(0)}%"></b></span>`;
    const eta = !isFinite(ci.days) ? 'bloqué' : career() ? `~${fmt(ci.days, 0)} j de jeu (≈ ${fmt(ci.days, 0)} h réelles)` : `~${fmt(ci.days, 0)} j`;
    return ['Cycle azote', pct(ci.pct), ci.pct < .5 ? 'bad' : 'warn', `${bar}${ci.phase} · encore ${eta}${ci.fuel ? '' : ' · <b class="bad">rien à manger pour les bactéries : nourris un peu</b>'}`];
  }
  function renderWater() {
    const s = T();
    if (!s) { $('water').innerHTML = '<p class="dimc">Pas de bac.</p>'; $('alerts').innerHTML = ''; return; }
    const w = s.w, st = s._st || Sim.popStats(s), m = st.mean, aq = s.env === 'aquarium';
    const R = k => Economy.reading(W, s, k);
    const val = (r, d, unit = '') => r ? `${fmt(r.v, d)}${unit}` : '?';
    const sub = r => !r || r.kind === 'live' ? '' : `<span class="tested">${r.kind} · il y a ${r.age < 1 ? '<1' : fmt(r.age, 0)} h</span>`;
    const pf = (n, d) => st.n ? `pop. : ${fmt(m[n], d)} ± ${fmt(m[n.replace('Opt', 'Tol')], d)}` : '';
    const rangeCls = (r, o, t) => !r ? 'dimc' : !st.n ? 'ok' : Math.abs(r.v - o) <= t ? 'ok' : Math.abs(r.v - o) <= t * 1.6 ? 'warn' : 'bad';
    const V = s.cfg.volume;
    const food = (s.pools.food + s.pools.veg + s.pools.powder) / V;
    const Kb = Sim.bactCap(s);
    const rT = R('temp'), rP = R('ph'), rG = R('gh'), rK = R('kh'), rN = R('nh3'), r2 = R('no2'), r3 = R('no3'), rO = R('o2'), rC = R('co2'), rL = R('level');
    const rows = [
      ['Température', val(rT, 1, ' °C'), rangeCls(rT, m.tOpt, m.tTol), `${aq ? 'pièce' : 'air'} ${fmt(s.air)} °C · ${pf('tOpt', 1)}`],
      ['pH', val(rP, 2), rangeCls(rP, m.phOpt, m.phTol), [pf('phOpt', 2), sub(rP)].filter(Boolean).join(' · ')],
      ['GH', val(rG, 1, ' °d'), rangeCls(rG, m.ghOpt, m.ghTol), [pf('ghOpt', 1), sub(rG)].filter(Boolean).join(' · ')],
      ['KH', val(rK, 1, ' °d'), 'dimc', sub(rK)],
      ['NH3 (libre)', val(rN, 3, ' mg/L'), cls(rN?.v, .01, .03), sub(R('tan')) || (Economy.career(W) && !rN ? '' : `NH4 total ${fmt(w.tan, 2)}`)],
      ['NO2', val(r2, 2, ' mg/L'), cls(r2?.v, .15, .4), sub(r2)],
      ['NO3', val(r3, 0, ' mg/L'), cls(r3?.v, 30, 50), sub(r3)],
      ['O2', rO ? val(rO, 1, ' mg/L') : '?', cls(rO?.v, 5, 3.5, true), rO ? '' : 'contrôleur requis'],
      ['CO2', rC ? val(rC, 0, ' ppm') : '?', cls(rC?.v, 30, 45), rC ? '' : 'contrôleur requis'],
      ['Niveau', pct(rL.v), cls(rL.v, .9, .75, true)],
      ['Nourriture', `${fmt(food, 1)} mg/L`, food > 3 ? 'warn' : 'dimc', `déchets ${fmt(s.pools.det / V, 1)} mg/L`],
      cycleRow(s),
      ...(career() ? [] : [['Bactéries', `${pct(Math.min(1, s.bactA / Kb))} / ${pct(Math.min(1, s.bactB / Kb))}`, s.bactB / Kb < .15 ? 'warn' : 'dimc', 'nitrosomonas / nitrobacter']]),
      ['Algues', pct(s.algae), cls(s.algae, .4, .7)],
      ['Densité', `${fmt(s.crowd || 0, 1)} /L`, cls(s.crowd || 0, 4, 7)],
    ];
    const needSalt = s.shrimp.some(sh => GENERA[sh.genus].salt[0] > 0);
    if ((w.sal || 0) > .05 || needSalt) rows.splice(4, 0, ['Salinité', `${fmt(w.sal || 0, 1)} g/L`, needSalt ? cls(w.sal || 0, 12, 8, true) : cls(w.sal || 0, 3, 6), 'réfractomètre (gratuit)']);
    const sn = Object.entries(s.snails || {}).filter(([, n]) => n >= 1);
    if (sn.length) rows.push(['Escargots', sn.map(([k, n]) => `${Math.floor(n)} ${SNAILS[k].name.toLowerCase()}`).join(', '), 'dimc']);
    if (s.pred.hydra >= 1) rows.push(['Hydres', `~${Math.round(s.pred.hydra)}`, 'bad']);
    if (s.pred.plan >= 1) rows.push(['Planaires', `~${Math.round(s.pred.plan)}`, 'bad']);
    if (s.pred.fish > 0) rows.push(['Micro rasboras', `${s.pred.fish}`, s.pred.fishHealth < .5 ? 'warn' : 'dimc', `santé ${pct(s.pred.fishHealth)} · faim ${pct(s.pred.fishHunger)}`]);
    $('water').innerHTML = rows.map(([k, v, c, sb]) => `<div class="param"><span>${k}</span><span class="v ${c}">${v}</span>${sb ? `<span class="sub">${sb}</span>` : ''}</div>`).join('');
    const al = [];
    if (!W.power) al.push(`⚡ Coupure de courant (encore ~${Math.ceil(W.powerUntil - W.t)} h)`);
    if (s.heaterStuck) al.push('🔥 Chauffage bloqué ! <button id="fixH">Remplacer</button>');
    if (s.disease > W.t) al.push('🦠 Infection en cours');
    if (s.ice) al.push('❄️ Surface gelée');
    if (s.treat.fenben > W.t) al.push('💊 Traitement en cours');
    if (aq && s.eq.filter !== 'none' && s.eq.clog > .6) al.push(`Filtre encrassé (${pct(s.eq.clog)})`);
    if (w.level < .85) al.push(`Niveau d'eau bas (${pct(w.level)}) : complète !`);
    if (!career() && s.shrimp.length && w.no2 > .3) al.push('Nitrites élevés : change l\'eau');
    if (!career() && s.shrimp.length && s.nh3 > .02) al.push('Ammoniac toxique : change l\'eau');
    if (career() && !s.tests.ph && !s.eq.probeAll) al.push('Eau jamais testée : fais une bandelette');
    if (s.shrimp.some(sh => sh.health < .3)) al.push('Crevettes mal en point : vérifie l\'eau');
    for (const g in s.small || {}) al.push(`📏 Bac trop petit pour ${GENERA[g].short} (${GENERA[g].minVol} L conseillés)`);
    if (s.shrimp.some(sh => GENERA[sh.genus].predator) && s.shrimp.some(sh => !GENERA[sh.genus].predator)) al.push('🦞 Macrobrachium avec d\'autres crevettes : elles vont se faire chasser');
    const berLarv = s.shrimp.find(sh => sh.berried && GENERA[sh.genus].larvae === 'brackish');
    if (berLarv && (w.sal || 0) < LARVA_SALT) al.push(`🥚 ${GENERA[berLarv.genus].short} grainée : ses larves mourront en eau douce. Bac saumâtre (≥ ${LARVA_SALT} g/L) !`);
    if (W.weather.rain > W.t && !aq) al.push('🌧 Pluie');
    if (W.weather.heat > W.t) al.push('☀️ Canicule');
    if (W.weather.cold > W.t && !aq) al.push('❄️ Vague de froid');
    if (W.bags.length) al.push(`📦 ${W.bags.length} colis à acclimater <button id="openBags">Ouvrir</button>`);
    $('alerts').innerHTML = al.map(a => `<div class="alert${/Pluie|Filtre|Traitement|colis|testée/.test(a) ? ' w' : ''}">${a}</div>`).join('');
    const fx = $('fixH');
    if (fx) fx.onclick = () => {
      if (career() && !Economy.pay(W, SHOP.heater.price)) return toast('Il faut ' + moneyTxt(SHOP.heater.price) + ' pour un chauffage neuf.', 'warn');
      Sim.A.fixHeater(W, s); refreshAll(true);
    };
    const ob = $('openBags');
    if (ob) ob.onclick = bagsModal;
  }

  // ---------- Colonie ----------
  function renderPop() {
    const s = T();
    if (!s) { $('tab-pop').innerHTML = ''; return; }
    const st = s._st || Sim.popStats(s);
    const groups = {};
    for (const sh of s.shrimp) {
      const k = GENERA[sh.genus].short[0] + ' · ' + Gen.phenotype(sh.g);
      const gr = groups[k] || (groups[k] = { n: 0, r: 0, g: 0, b: 0 });
      const c = Gen.mix([.3, .4, .4], Gen.color(sh.g), sh.g.dens);
      gr.n++; gr.r += c[0]; gr.g += c[1]; gr.b += c[2];
    }
    const top = Object.entries(groups).sort((a, b) => b[1].n - a[1].n).slice(0, 14);
    const deaths = Object.entries(W.stats.dead).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = top.length ? top[0][1].n : 1;
    $('tab-pop').innerHTML = `
      <div class="stat-grid">
        <span>Total</span><b>${st.n}</b>
        <span>Adultes ♀ / ♂</span><b>${st.F} / ${st.M}</b>
        <span>Juvéniles</span><b>${st.juv}</b>
        <span>Grainées</span><b>${st.berried}</b>
        <span>Génération max</span><b>${W.stats.maxGen}</b>
        <span>Naissances (tous bacs)</span><b>${W.stats.born}</b>
        ${Object.keys(st.genus).length > 1 ? `<span>Espèces</span><b>${Object.entries(st.genus).map(([g, n]) => `${GENERA[g].short} ${n}`).join(' · ')}</b>` : ''}
      </div>
      <h4>Phénotypes (clic = une crevette au hasard)</h4>
      ${top.map(([k, g]) => `<div class="pheno" data-k="${esc(k)}"><span class="sw" style="background:${cssRGB([g.r / g.n, g.g / g.n, g.b / g.n])}"></span><span style="flex:2">${esc(k)}</span><span class="bar-mini"><div style="width:${g.n / max * 100}%"></div></span><b>${g.n}</b></div>`).join('') || '<div class="dimc">Aucune crevette.</div>'}
      <h4>Moyennes du bac</h4>
      ${st.n ? `<div class="stat-grid" style="font-size:13px">
        <span>T° optimale</span><b>${fmt(st.mean.tOpt)} ± ${fmt(st.mean.tTol)}</b>
        <span>pH optimal</span><b>${fmt(st.mean.phOpt, 2)} ± ${fmt(st.mean.phTol, 2)}</b>
        <span>GH optimal</span><b>${fmt(st.mean.ghOpt)} ± ${fmt(st.mean.ghTol)}</b>
        <span>Densité pigment</span><b>${pct(st.mean.dens)}</b>
        <span>Taille adulte</span><b>${fmt(st.mean.size)} mm</b>
        <span>Fertilité</span><b>×${fmt(st.mean.fert, 2)}</b></div>` : ''}
      <h4>Causes de mort (tous bacs)</h4>
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
    const el = $('tab-sheet'), s = T();
    const sh = s && selected != null && s.shrimp.find(x => x.id === selected);
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
    const parent = id => id ? (s.shrimp.find(x => x.id === id) ? `<span class="link" data-id="${id}">#${id}</span>` : `#${id}`) : 'achetée';
    const kids = s.shrimp.filter(x => x.mom === sh.id || x.dad === sh.id).length;
    const geno = Gen.genotype(sh.dna);
    const env = (k) => { const r = Economy.reading(W, s, k); return r ? r.v : null; };
    el.innerHTML = `
      <div class="sheet-head"><canvas class="portrait" id="portrait"></canvas>
        <div><b>#${sh.id}</b> ${sh.sex === 'F' ? '♀' : '♂'}<br>${esc(Gen.phenotype(g))}<br><small class="dimc">${GENERA[sh.genus].name}${sh.origin ? ' · ' + esc(sh.origin) : ''}</small>
        ${sh.strain ? `<br><span class="link" id="openStrain">📖 ${esc(strainName(sh.strain))}</span>${(e => e && e.source !== 'mine' && e.author && e.author !== 'Animalerie' ? ` <small class="dimc">✍ ${esc(e.author)}</small>` : '')(Economy.entryOf(W, sh.strain))}` : ''}</div></div>
      <div class="row"><button id="followBtn" class="${Render.follow ? 'on' : ''}">🎥 Suivre</button>
        <button id="toNet">${net.has(sh.id) ? '✓ Dans l\'épuisette' : '🥅 Épuisette'}</button><button id="closeSel">✕</button></div>
      <div class="stat-grid" style="font-size:13px">
        <span>Génération</span><b>${sh.gen}</b>
        <span>Âge</span><b>${Math.floor(sh.age)} j ${mature ? '(adulte)' : '(' + stageOf(sh) + ')'}</b>
        <span>Taille</span><b>${fmt(sh.size)} / ${fmt(g.size)} mm</b>
        <span>Santé</span><b class="${cls(sh.health, .6, .3, true)}">${pct(Math.max(0, sh.health))}</b>
        <span>Faim</span><b class="${cls(sh.hunger, .6, .85)}">${pct(sh.hunger)}</b>
        <span>Mère / Père</span><b>${parent(sh.mom)} / ${parent(sh.dad)}</b>
        <span>Descendants vivants</span><b>${kids} <small class="dimc">(${sh.kids} nés)</small></b>
        ${sh.berried ? `<span>Œufs</span><b>${sh.berried.n} · éclosion ~${Math.max(0, Math.ceil(sh.berried.days))} j</b>` : ''}
        <span>Prochaine mue</span><b>~${Math.max(0, Math.ceil(sh.molt))} j</b>
        ${career() ? `<span>Valeur estimée</span><b style="color:#ffd76a">${money(Economy.value(W, sh))}</b>` : ''}
      </div>
      <h4>Génotype</h4>
      ${career() ? '<p class="dimc" style="font-size:12px">Inconnu : seuls les croisements révèlent les gènes cachés (porteurs).</p>'
        : geno.length ? geno.map(x => `<div class="param"><span>${x.label}</span><span class="v">${x.pair} <small class="dimc">${x.state}</small></span></div>`).join('') : '<p class="dimc" style="font-size:12px">Type sauvage partout (+/+).</p>'}
      <h4>Adaptation à l'eau actuelle</h4>
      <div class="stat-grid" style="font-size:13px"><span>Température</span><b class="${cls(fit.fT, .8, .5, true)}">${pct(fit.fT)}</b>
        ${career() ? '' : `<span>pH</span><b class="${cls(fit.fP, .8, .5, true)}">${pct(fit.fP)}</b><span>GH (mues)</span><b class="${cls(fit.fG, .8, .5, true)}">${pct(fit.fG)}</b>`}
        <span>Visibilité</span><b>${pct(Gen.conspicuity(g, Sim.express(sh), SUBSTRATES[s.cfg.substrate].color))}</b></div>
      <h4>Couleur et motifs</h4>
      ${['hue', 'sat', 'dens', 'dark', 'stripe', 'bands', 'spots', 'rili'].map(k => geneRow(k)).join('')}
      <h4>Tolérances <small>(jaune = eau du bac${career() ? ', si testée' : ''})</small></h4>
      ${geneRow('tOpt', env('temp'))}${geneRow('phOpt', env('ph'))}${geneRow('ghOpt', env('gh'))}
      <h4>Vie</h4>
      ${['size', 'life', 'fert', 'growth'].map(k => geneRow(k)).join('')}`;
    try { Render.portrait($('portrait'), sh); } catch (e) { }
    $('followBtn').onclick = () => { Render.select(sh.id, !Render.follow); renderSheet(); };
    $('toNet').onclick = () => { net.has(sh.id) ? net.delete(sh.id) : net.add(sh.id); renderSheet(); };
    $('closeSel').onclick = () => { selected = null; Render.select(null); renderSheet(); };
    if ($('openStrain')) $('openStrain').onclick = () => bookModal(sh.strain);
    el.querySelectorAll('.link[data-id]').forEach(l => l.onclick = () => selectShrimp(+l.dataset.id));
  }

  // ---------- Graphes ----------
  const GRAPHS = {
    pop: { name: 'Population', series: [['n', '#5fe0b5', 'total'], ['juv', '#9fe6ff', 'juvéniles'], ['ber', '#f2c14e', 'grainées']] },
    color: { name: 'Couleur moyenne', color: true },
    motifs: { name: 'Motifs', series: [['m.stripe', '#ffffff', 'ligne'], ['m.bands', '#f2c14e', 'bandes'], ['m.spots', '#c49bff', 'taches'], ['m.rili', '#9fe6ff', 'rili'], ['m.dens', '#ff6b5e', 'densité']] },
    vie: { name: 'Taille & fertilité', series: [['m.size', '#5fe0b5', 'taille (mm)'], ['m.fert', '#f2c14e', 'fertilité ×10', 10], ['m.growth', '#9fe6ff', 'croissance ×10', 10]] },
    temp: { name: 'Température vs adaptation', env: 'temp', opt: 'tOpt', tol: 'tTol' },
    ph: { name: 'pH vs adaptation', env: 'ph', opt: 'phOpt', tol: 'phTol', probe: true },
    gh: { name: 'GH vs adaptation', env: 'gh', opt: 'ghOpt', tol: 'ghTol', probe: true },
    azote: { name: 'Azote', probe: true, series: [['no3', '#f2c14e', 'NO3'], ['no2', '#ff6b5e', 'NO2 ×10', 10], ['nh3', '#c49bff', 'NH3 ×100', 100]] },
    pred: { name: 'Prédateurs', series: [['hydra', '#bfdcae', 'hydres'], ['plan', '#e6dcc4', 'planaires'], ['fish', '#e0582c', 'rasboras']] },
  };
  function buildGraphSelects() {
    $('graphSel').innerHTML = Object.entries(GRAPHS).map(([k, g]) => `<option value="${k}">${g.name}${g.probe && career() ? ' (contrôleur)' : ''}</option>`).join('');
    $('histSel').innerHTML = GENE_KEYS.map(k => `<option value="${k}">${GENES[k].label}</option>`).join('');
    $('histSel').value = 'dens';
    $('graphSel').onchange = renderGraph;
    $('histSel').onchange = renderHist;
  }
  const get = (h, key) => key.startsWith('m.') ? (h.m ? h.m[key.slice(2)] : null) : h[key];
  function renderGraph() {
    const s = T();
    const cv = $('graph'), ctx = cv.getContext('2d');
    const Wd = cv.width, H = cv.height, P = { l: 34, r: 6, t: 8, b: 18 };
    ctx.fillStyle = '#08141a'; ctx.fillRect(0, 0, Wd, H);
    if (!s) return;
    const hist = s.hist;
    const def = GRAPHS[$('graphSel').value];
    const msg = t => { ctx.fillStyle = '#8fb0aa'; ctx.font = '12px monospace'; ctx.fillText(t, 14, H / 2); $('graphLegend').innerHTML = ''; };
    if (def.probe && career() && !s.eq.probeAll) return msg('Il faut un contrôleur multi-paramètres.');
    if (hist.length < 2) return msg('Pas encore de données (1 point / jour).');
    const t0 = hist[0].t, t1 = hist[hist.length - 1].t;
    const X = t => P.l + (t - t0) / (t1 - t0 || 1) * (Wd - P.l - P.r);
    let lines = [], bands = [], lo = Infinity, hi = -Infinity;
    if (def.color) {
      const bw = Math.max(1, (Wd - P.l - P.r) / hist.length + .5);
      for (const h of hist) { if (!h.n) continue; ctx.fillStyle = cssRGB(h.rgb); ctx.fillRect(X(h.t), P.t, bw, H - P.t - P.b); }
      $('graphLegend').innerHTML = 'Couleur moyenne visible de la colonie, jour après jour.';
      axisX(ctx, Wd, H, P, t0, t1);
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
      ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(Wd - P.r, y); ctx.stroke();
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
    axisX(ctx, Wd, H, P, t0, t1);
    $('graphLegend').innerHTML = lines.map(l => `<span><i style="background:${l.c}"></i>${l.label}</span>`).join('') + (bands.length ? '<span><i style="background:rgba(95,224,181,.4)"></i>tolérance</span>' : '');
  }
  function axisX(ctx, Wd, H, P, t0, t1) {
    ctx.fillStyle = '#8fb0aa'; ctx.font = '10px monospace';
    ctx.fillText('J' + Math.floor(t0 / 24 + 1), P.l, H - 4);
    const s1 = 'J' + Math.floor(t1 / 24 + 1);
    ctx.fillText(s1, Wd - P.r - s1.length * 6, H - 4);
  }
  function renderHist() {
    const s = T();
    const cv = $('hist'), ctx = cv.getContext('2d');
    const Wd = cv.width, H = cv.height;
    ctx.fillStyle = '#08141a'; ctx.fillRect(0, 0, Wd, H);
    const k = $('histSel').value, d = GENES[k];
    if (!s || !s.shrimp.length) { $('histInfo').textContent = ''; return; }
    const B = 32, bins = new Array(B).fill(0);
    let lo = d.min, hi = d.max;
    const envR = { tOpt: 'temp', phOpt: 'ph', ghOpt: 'gh' }[k];
    const env = envR ? Economy.reading(W, s, envR)?.v : null;
    if (!d.circ) {
      lo = Infinity; hi = -Infinity;
      for (const sh of s.shrimp) { lo = Math.min(lo, sh.g[k]); hi = Math.max(hi, sh.g[k]); }
      if (env != null) { lo = Math.min(lo, env); hi = Math.max(hi, env); }
      const pd = (hi - lo) * .1 || (d.max - d.min) * .05; lo = Math.max(d.min, lo - pd); hi = Math.min(d.max, hi + pd);
    }
    for (const sh of s.shrimp) bins[Math.min(B - 1, Math.max(0, Math.floor((sh.g[k] - lo) / (hi - lo) * B)))]++;
    const mx = Math.max(...bins);
    const bw = Wd / B;
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
    if (env != null) { const x = (env - lo) / (hi - lo) * Wd; ctx.fillStyle = '#f2c14e'; ctx.fillRect(x - 1, 0, 2, H - 12); }
    ctx.fillStyle = '#8fb0aa'; ctx.font = '10px monospace';
    const f = v => d.circ ? Math.round(v) + '°' : v >= 10 ? Math.round(v) : v.toFixed(2);
    ctx.fillText(f(lo), 2, H - 2); const sh = f(hi) + ''; ctx.fillText(sh, Wd - sh.length * 6 - 2, H - 2);
    const st = s._st || Sim.popStats(s);
    $('histInfo').innerHTML = d.circ ? 'Répartition des teintes dans le bac.' :
      `moyenne ${f(st.mean[k])} · écart-type ${f(st.sd[k] || 0)}${env != null ? ' · <span class="warn">jaune = eau du bac</span>' : ''}<br><small>Plus l'écart-type est grand, plus la colonie peut s'adapter vite.</small>`;
  }

  // ---------- Journal ----------
  function renderLog() {
    if (W.log.length === lastLog && W.log.length) return;
    lastLog = W.log.length;
    $('log').innerHTML = W.log.slice(-200).reverse().map(e => {
      const day = Math.floor(e.t / 24) + 1, h = Math.floor((W.start.hour + e.t) % 24);
      return `<div class="${e.kind}"><span class="t">J${day} ${String(h).padStart(2, '0')}h</span>${esc(e.msg)}</div>`;
    }).join('');
  }

  // ---------- Onglets / toasts / horloge ----------
  function setTab(t) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    for (const k of ['pop', 'net', 'graph', 'sheet', 'log']) $('tab-' + k).classList.toggle('hidden', k !== t);
    refreshAll(true);
  }
  function toast(msg, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = msg;
    d.title = 'Toucher pour fermer';
    d.onclick = () => d.remove();
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 5000);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  function renderClock() {
    const c = Sim.calendar(W);
    const hh = Math.floor(c.hour), mm = Math.floor((c.hour - hh) * 60);
    const date = W.mode === 'hardcore' ? new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' : '';
    const s = T();
    $('clock').innerHTML = `${date}Jour <b>${c.day}</b> · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${seasonOf(c.doy)}${s && s.light > 0 ? ' ☀' : ' ☾'}`;
    $('money').innerHTML = career() ? money(W.money) : '';
    if (W.stats.sold > (lastSold ?? W.stats.sold)) Sound.coin();
    netCollect();
    lastSold = W.stats.sold;
  }

  function refreshAll(force) {
    if (!W) return;
    const now = performance.now();
    if (W._toasts && W._toasts.length) { for (const t of W._toasts.splice(0)) { toast(t.msg, t.kind); Notify.fromLog(t.msg, t.kind); } }
    if (T() !== shownTank) { switchTank(Math.min(W.cur, Math.max(0, W.tanks.length - 1)), true); return; }
    renderClock();
    renderTankBar();
    const s = T();
    if ($('noTank').classList.contains('hidden') === !s) $('noTank').classList.toggle('hidden', !!s);
    if (force || now - lastWater > 400) { if (s) s._st = Sim.popStats(s); renderWater(); lastWater = now; }
    if (tab === 'pop' && (force || now - lastPop > 1500)) { renderPop(); lastPop = now; }
    if (tab === 'net' && (force || now - lastNet > 3000)) renderNet();
    if (tab === 'graph' && (force || now - lastGraph > 2000)) { renderGraph(); renderHist(); lastGraph = now; }
    if (tab === 'sheet' && (force || now - lastSheet > 700)) { renderSheet(); lastSheet = now; }
    if (tab === 'log') renderLog();
  }
  function setEffective(hps) {
    const el = $('effSpeed');
    if (el) el.textContent = speed >= 100 && hps < speed * .8 ? `(réel ×${Math.round(hps)})` : '';
  }

  // ---------- Liaisons fixes ----------
  function bind() {
    $('newCareer').onclick = () => {
      if (Save.load('career') && !confirm('Remplacer la carrière en cours ?')) return;
      Main.begin(Economy.newCareer());
    };
    $('newNormal').onclick = () => openSetup('sandbox');
    $('newHard').onclick = () => openSetup('hardcore');
    $('setupBack').onclick = showTitle;
    $('setupGo').onclick = () => {
      const cfg = readSetup();
      if (!Object.keys(cfg.tank.shrimp).length && !confirm('Démarrer sans crevette ?')) return;
      Main.newGame(cfg);
    };
    $('modalClose').onclick = closeModal;
    $('modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
    $('modalX').onclick = closeModal;
    // glisser vers le bas depuis le haut de la fenêtre : ferme (mobile)
    {
      let y0 = null;
      $('modalBox').addEventListener('touchstart', e => { y0 = $('modalBox').scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
      $('modalBox').addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 90) closeModal(); y0 = null; });
    }
    // panneaux latéraux sur mobile : toucher l'aquarium les referme
    $('view').addEventListener('pointerdown', () => document.body.classList.remove('m-left', 'm-right'));
    document.querySelectorAll('#left, #right').forEach(p => {
      const x = document.createElement('button');
      x.className = 'xclose mobile-only'; x.textContent = '✕'; x.title = 'Fermer';
      x.onclick = () => document.body.classList.remove('m-left', 'm-right');
      p.prepend(x);
    });
    document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    $('btnMenu').onclick = menuModal;
    $('btnShop').onclick = () => shopModal(W.tanks.length ? 'Équipement' : 'Bacs');
    $('noTankShop').onclick = () => shopModal('Bacs');
    $('btnMarket').onclick = marketModal;
    $('btnBook').onclick = () => bookModal();
    $('btnBags').onclick = bagsModal;
    const side = c => { const on = !document.body.classList.contains(c); document.body.classList.remove('m-left', 'm-right'); if (on) document.body.classList.add(c); };
    $('mLeft').onclick = () => side('m-left');
    $('mRight').onclick = () => side('m-right');
    if (window.innerWidth < 820) { $('pixSel').value = '2'; Render.setPixelScale(2); }
    $('btnSound').textContent = Sound.muted ? '🔇' : '🔊';
    $('btnSound').onclick = () => { $('btnSound').textContent = Sound.toggle() ? '🔊' : '🔇'; };
    $('btnView').onclick = () => Render.resetView();
    $('pixSel').onchange = e => Render.setPixelScale(+e.target.value);
    $('importFile').onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then(t => {
        try {
          const st = JSON.parse(t);
          if (st.v !== 2 || !st.tanks) throw new Error('format');
          if (st.mode !== 'career') st.mode = 'sandbox';
          if (Save.load(st.mode) && !confirm(`Ça remplace ta partie ${st.mode === 'career' ? 'Carrière' : 'Bac à sable'} actuelle sur cet appareil. Continuer ?`)) return;
          e.target.value = '';
          Main.begin(Sim.relink(st));
        } catch (err) { alert('Fichier invalide ou d\'une ancienne version.'); }
      });
    };
    window.addEventListener('keydown', e => {
      if (!W || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); setSpeed(speed ? 0 : 1); }
      const n = +e.key;
      if (n >= 1 && n <= 5) setSpeed(SPEEDS[n - 1]);
      if (deco) {
        if (e.key === 'Escape') { decoClose(); return; }
        if (deco.sel != null && (e.key === 'Delete' || e.key === 'Backspace')) { decoAct('del'); return; }
        if (deco.sel != null && (e.key === 'r' || e.key === 'R')) { decoAct(e.shiftKey ? 'rl' : 'rr'); return; }
      }
      if (e.key === 'Escape') { selected = null; Render.select(null); closeModal(); }
    });
  }

  return {
    bind, showTitle, start, refreshAll, toast, setEffective, selectShrimp, setSpeed, bagsModal,
    get world() { return W; }, set world(v) { W = v; }, get tank() { return T(); },
    get speed() { return speed; },
  };
})();
