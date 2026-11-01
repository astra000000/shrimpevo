'use strict';
// En ligne entre amis : visiter les bacs des autres, s'envoyer des cadeaux, concours de la semaine (top 3 = décors exclusifs).
// Tout passe par Supabase (js/online.js) ; le schéma est dans supabase/schema_v2.sql.

const Social = (() => {
  const $ = id => document.getElementById(id);
  const W = () => UI.world;
  const esc = t => UI.esc(t);
  const career = () => !!W() && W().mode === 'career';
  const THEMES = ['La plus rouge', 'La plus colorée', 'Le plus beau motif', 'La plus grosse', 'La plus rare', 'Thème libre',
    'La plus bleue', 'La plus étrange (mutante)', 'La plus sombre', 'La plus claire', 'Espèce originale (pas Neocaridina)', 'La plus jolie souche à toi'];
  let tab = 'visit', received = [];

  // ---------- Semaines ----------
  const pad = n => String(n).padStart(2, '0');
  function weekId(offsetDays = 0) {
    const d = new Date(Date.now() + offsetDays * 864e5), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const n = Math.ceil(((t - y0) / 864e5 + 1) / 7);
    return { id: `${t.getUTCFullYear()}-${pad(n)}`, n };
  }
  const theme = n => THEMES[n % THEMES.length];
  function timeLeft() {
    const d = new Date(), end = new Date(d);
    end.setDate(d.getDate() + ((7 - d.getDay()) % 7)); end.setHours(23, 59, 59, 0);
    const h = Math.max(0, (end - d) / 36e5);
    return h > 48 ? `${Math.floor(h / 24)} j ${Math.floor(h % 24)} h` : `${Math.floor(h)} h ${Math.floor((h % 1) * 60)} min`;
  }
  // Récompenses : or/argent/bronze + un décor spécial qui change chaque semaine pour le 1er
  function rewardsFor(rank, weekNum) {
    const special = ['chest', 'statue', 'arch', 'shell'][weekNum % 4];
    return rank === 1 ? ['trophy_gold', special] : rank === 2 ? ['trophy_silver'] : ['trophy_bronze'];
  }

  // ---------- Bac → instantané partageable ----------
  function snapshot(s) {
    const keep = s.shrimp.slice().sort((a, b) => b.size - a.size).slice(0, 160);
    const strip = JSON.parse(JSON.stringify(Object.assign({}, s, { shrimp: [], hist: [], tests: {}, seen: {} }), (k, v) => k.startsWith('_') ? undefined : v));
    strip.shrimp = keep.map(sh => ({ id: sh.id, genus: sh.genus, dna: sh.dna, sex: sh.sex, size: Math.round(sh.size * 10) / 10, age: Math.round(sh.age), molt: 8, berried: sh.berried ? { days: 5, n: 1 } : null, strain: null }));
    return strip;
  }
  function restore(data) {
    const s = data;
    s.shrimp = (s.shrimp || []).filter(sh => GENERA[sh.genus] && Online.validDna(sh.dna));
    for (const sh of s.shrimp) { sh.g = Gen.express(sh.dna, sh.genus); sh.health = 1; sh.hunger = .3; }
    s._wx = { rain: 0 }; s.t = 0; s.power = true;
    if (s.env === 'aquarium') s.light = Math.max(s.light || 0, .75);
    s.pools = Object.assign({ food: 0, veg: 0, powder: 0, det: 0, biofilm: 0 }, s.pools);
    s.pred = Object.assign({ hydra: 0, plan: 0, fish: 0 }, s.pred);
    s.snails = s.snails || {};
    s.w = Object.assign({ temp: 22, tannin: 0, level: 1, sal: 0 }, s.w);
    if (!s.decor) Sim.ensureDecor({ mode: 'sandbox' }, s);
    return s;
  }
  async function share() {
    const s = UI.tank;
    if (!s || UI.visiting) return UI.toast('Ouvre d\'abord un de tes bacs.', 'warn');
    UI.withName(async () => {
      try {
        const gen = [...new Set(s.shrimp.map(sh => sh.genus))];
        await Online.share({ slot: 0, name: s.name.slice(0, 30), info: { vol: s.cfg.volume, env: s.env, n: s.shrimp.length, genera: gen, sub: s.cfg.substrate }, data: snapshot(s) });
        UI.toast(`🌐 ${s.name} est visible par les autres joueurs.`);
        open('visit');
      } catch (e) { UI.toast(e.message, 'warn'); }
    });
  }
  async function visitOwner(owner, slot = 0) {
    try {
      const row = await Online.showcase(owner, slot);
      if (!row) return UI.toast('Ce bac n\'est plus partagé.', 'warn');
      UI.visit(restore(row.data), row.owner_name);
      if (W()) Achievements.flag(W(), 'visit');
    } catch (e) { UI.toast(e.message, 'warn'); }
  }
  const link = owner => `${location.origin}${location.pathname}?visit=${encodeURIComponent(owner)}`;

  // ---------- Cadeaux ----------
  async function claimGifts() {
    if (!W() || !Online.enabled() || !Online.registered) return;
    let rows;
    try { rows = await Online.claimGifts(); } catch (e) { return; }
    for (const g of rows || []) {
      const from = g.sender_name, msg = g.message ? ` « ${g.message} »` : '';
      if (g.kind === 'shrimp') {
        const p = g.payload || {};
        const dnas = (p.stock || []).filter(Online.validDna);
        if (GENERA[p.genus] && dnas.length) Economy.receive(W(), p.genus, dnas, p.entry && p.entry.id ? p.entry : null, `cadeau de ${from}`);
        Sim.log(W(), `🎁 ${from} t'envoie ${dnas.length} crevette(s) !${msg} Elles t'attendent dans 📦 Colis.`, 'birth', true);
      } else if (g.kind === 'sc') {
        const n = Math.max(0, Math.min(5000, +g.payload.amount || 0));
        if (career()) Economy.earn(W(), n);
        Sim.log(W(), `🎁 ${from} t'envoie ${Economy.fmt(n)} !${msg}${career() ? '' : ' (comptés seulement en carrière)'}`, 'birth', true);
      } else if (g.kind === 'decor') {
        const k = g.payload.k;
        if (DECOR[k] && !DECOR[k].excl) { if (career()) W().inv['d_' + k] = (W().inv['d_' + k] || 0) + 1; }
        Sim.log(W(), `🎁 ${from} t'envoie : ${DECOR[k] ? DECOR[k].name : 'un décor'} !${msg}`, 'birth', true);
      }
      received.unshift({ from, kind: g.kind, msg: g.message });
    }
  }
  async function sendGift() {
    const to = $('gTo').value.trim(), kind = $('gKind').value, message = $('gMsg').value.trim();
    if (to.length < 2) return UI.toast('Écris le pseudo de ton ami.', 'warn');
    const w = W();
    let payload, undo = () => { };
    if (kind === 'shrimp') {
      const s = UI.tank, list = s ? s.shrimp.filter(sh => UI.net.has(sh.id)) : [];
      if (!list.length) return UI.toast('Mets d\'abord des crevettes dans l\'épuisette (onglet Sélection ou fiche).', 'warn');
      if (list.length > 20) return UI.toast('20 crevettes maximum par cadeau.', 'warn');
      if (list.some(sh => sh.genus !== list[0].genus)) return UI.toast('Une seule espèce par cadeau.', 'warn');
      const e = list[0].strain ? Economy.entryOf(w, list[0].strain) : null;
      const entry = e && list.every(sh => sh.strain === e.id) ? Object.assign({}, e, { id: e.id.startsWith('u:') ? e.id : `u:${(Online.me || 'x').slice(0, 8)}:${e.id}`, author: e.source === 'mine' ? Online.name : e.author, by: Online.name, source: 'market' }) : null;
      payload = { genus: list[0].genus, stock: list.map(sh => sh.dna), entry };
      const ids = new Set(list.map(sh => sh.id));
      s.shrimp = s.shrimp.filter(sh => !ids.has(sh.id));
      undo = () => s.shrimp.push(...list);
    } else if (kind === 'sc') {
      const n = Math.round(+$('gAmount').value || 0);
      if (n < 1) return UI.toast('Montant invalide.', 'warn');
      if (!Economy.pay(w, n)) return UI.toast(`Pas assez de ${MONEY}.`, 'warn');
      payload = { amount: n };
      undo = () => Economy.earn(w, n);
    } else {
      const k = $('gDecor').value;
      if (!k) return UI.toast('Choisis un décor.', 'warn');
      if (career()) { if (!(w.inv['d_' + k] > 0)) return UI.toast('Tu n\'en as plus en stock.', 'warn'); w.inv['d_' + k]--; undo = () => { w.inv['d_' + k]++; }; }
      payload = { k };
    }
    try {
      const r = await Online.sendGift(to, kind, payload, message);
      UI.net.clear();
      Sim.log(w, `🎁 Cadeau envoyé à ${r.to} !`, 'info', true);
      Achievements.flag(w, 'gift');
      UI.refreshAll(true);
      open('gifts');
    } catch (e) { undo(); UI.toast(e.message, 'warn'); }
  }

  // ---------- Concours ----------
  async function claimContest() {
    if (!W() || !Online.enabled() || !Online.registered) return;
    let rows;
    try { rows = await Online.contestClaim(); } catch (e) { return; }
    for (const r of rows || []) {
      const n = +String(r.week).split('-')[1] || 0;
      const got = rewardsFor(r.rank, n);
      got.forEach(k => Online.addTrophy(k));
      Achievements.flag(W(), 'podium');
      Sim.log(W(), `🏆 Concours ${r.week} : tu finis ${r.rank === 1 ? '1er' : r.rank + 'e'} ! Tu gagnes : ${got.map(k => DECOR[k].name).join(' + ')} (bouton Décor).`, 'mut', true);
      Notify.send('🏆 ShrimpEvo', `Tu finis ${r.rank === 1 ? '1er' : r.rank + 'e'} du concours !`, 'contest');
    }
  }
  async function enter() {
    const w = W(), id = UI.selected, s = UI.tank;
    const sh = s && s.shrimp.find(x => x.id === id);
    if (!sh) return UI.toast('Clique d\'abord sur la crevette à inscrire (dans ton bac), puis reviens ici.', 'warn');
    UI.withName(async () => {
      try {
        await Online.contestEnter(sh.genus, { dna: sh.dna, sex: sh.sex, size: Math.round(sh.size * 10) / 10, age: Math.round(sh.age), id: sh.id }, $('cTitle') ? $('cTitle').value.trim() : '');
        Achievements.flag(w, 'contest');
        UI.toast(`🗳️ #${sh.id} inscrite au concours de la semaine !`);
        open('contest');
      } catch (e) { UI.toast(e.message, 'warn'); }
    });
  }
  function portraitInto(cv, e) {
    const dna = e.shrimp && e.shrimp.dna;
    if (!GENERA[e.genus] || !Online.validDna(dna)) return;
    const sh = { id: 900000 + e.id, genus: e.genus, dna, g: Gen.express(dna, e.genus), sex: e.shrimp.sex === 'M' ? 'M' : 'F', size: Math.max(5, Math.min(90, +e.shrimp.size || 20)), age: 200, molt: 10, berried: null };
    try { Render.portrait(cv, sh); } catch (err) { }
  }

  // ---------- Fenêtre « En ligne » ----------
  async function open(which) {
    if (which) tab = which;
    if (!Online.enabled()) return UI.modal('<h2>🌐 En ligne</h2><p>Le serveur en ligne n\'est pas configuré (js/config.js).</p>');
    const tabs = [['visit', '👀 Visiter'], ['gifts', '🎁 Cadeaux'], ['contest', '🏆 Concours']];
    const head = `<h2>🌐 En ligne ${Online.registered ? `<small class="dimc">— ${esc(Online.name)}</small>` : ''}</h2>
      <div class="shop-tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    UI.modal(head + '<div id="soBody"><p class="dimc">Chargement…</p></div>', el => el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => open(b.dataset.tab)), true);
    const body = $('soBody');
    try {
      if (tab === 'visit') await renderVisit(body);
      if (tab === 'gifts') await renderGifts(body);
      if (tab === 'contest') await renderContest(body);
    } catch (e) { body.innerHTML = `<p class="warn">${esc(e.message)}</p><p class="dimc" style="font-size:12px">Si c'est la première fois : le script supabase/schema_v2.sql doit être lancé dans Supabase.</p>`; }
  }
  async function renderVisit(body) {
    const rows = await Online.showcases();
    const me = Online.me;
    body.innerHTML = `<div class="row">${UI.tank && !UI.visiting ? `<button class="big" id="soShare">🌐 Partager « ${esc(UI.tank.name)} »</button>` : ''}
      <span class="dimc" style="font-size:12px">Ton bac partagé est une photo : republie-le quand il a changé.</span></div>
      <div class="items">${(rows || []).map(r => `<div class="item"><span class="t">${esc(r.name)} <small class="dimc">de ${esc(r.owner_name)}${r.owner === me ? ' (toi)' : ''}</small></span>
        <span class="d">${r.info.env === 'pond' ? '🌿 Bassin' : '🐟 Aquarium'} ${r.info.vol || '?'} L · ${r.info.n || 0} crevettes · ${(r.info.genera || []).map(g => GENERA[g] ? GENERA[g].short : g).join(', ')}</span>
        <span class="p dimc">${new Date(r.updated).toLocaleDateString('fr-FR')}</span>
        <div class="row"><button data-visit="${esc(r.owner)}">👀 Visiter</button><button data-link="${esc(r.owner)}" title="Copier le lien à envoyer">🔗</button></div></div>`).join('') || '<p class="dimc">Personne n\'a encore partagé de bac. Sois le premier !</p>'}</div>`;
    if ($('soShare')) $('soShare').onclick = share;
    body.querySelectorAll('[data-visit]').forEach(b => b.onclick = () => visitOwner(b.dataset.visit));
    body.querySelectorAll('[data-link]').forEach(b => b.onclick = async () => {
      try { await navigator.clipboard.writeText(link(b.dataset.link)); UI.toast('🔗 Lien copié : envoie-le à tes potes.'); }
      catch (e) { prompt('Lien à copier :', link(b.dataset.link)); }
    });
  }
  async function renderGifts(body) {
    if (!Online.registered) { body.innerHTML = '<p>Choisis d\'abord ton pseudo : c\'est avec lui que tes amis t\'envoient des cadeaux.</p><button class="big" id="soName">Choisir mon pseudo</button>'; $('soName').onclick = () => UI.withName(() => open('gifts')); return; }
    await claimGifts();
    const w = W(), s = UI.tank;
    const inNet = s ? s.shrimp.filter(sh => UI.net.has(sh.id)).length : 0;
    const decos = Object.keys(DECOR).filter(k => !DECOR[k].excl && (!career() || (w.inv['d_' + k] || 0) > 0));
    body.innerHTML = `<p class="dimc" style="font-size:13px">Ton pseudo : <b>${esc(Online.name)}</b> — donne-le à tes potes pour recevoir des cadeaux.</p>
      <div class="fs" style="border:2px solid var(--line);padding:8px">
        <div class="row">Pour : <input id="gTo" maxlength="24" placeholder="pseudo de ton ami" style="flex:1"></div>
        <div class="row">Cadeau : <select id="gKind">
          <option value="shrimp">🦐 Crevettes de l'épuisette (${inNet})</option>
          ${career() ? '<option value="sc">🪙 Shrimp Coins</option>' : ''}
          <option value="decor">🪨 Décor</option></select>
          <input id="gAmount" type="number" min="1" max="5000" value="20" style="width:80px" class="hidden">
          <select id="gDecor" class="hidden">${decos.map(k => `<option value="${k}">${esc(DECOR[k].name)}${career() ? ` (${w.inv['d_' + k]})` : ''}</option>`).join('')}</select></div>
        <div class="row">Mot : <input id="gMsg" maxlength="80" placeholder="(facultatif)" style="flex:1"></div>
        <div class="row"><button class="big" id="gSend">🎁 Envoyer</button><span class="dimc" style="font-size:12px">Les crevettes partent dans un colis : ton ami devra les acclimater.</span></div>
      </div>
      <h4>Reçus</h4>${received.length ? received.slice(0, 10).map(r => `<div class="dimc" style="font-size:13px">🎁 ${esc(r.from)} : ${r.kind === 'shrimp' ? 'crevettes' : r.kind === 'sc' ? 'Shrimp Coins' : 'décor'}${r.msg ? ` « ${esc(r.msg)} »` : ''}</div>`).join('') : '<p class="dimc" style="font-size:13px">Rien pour l\'instant. Les cadeaux arrivent tout seuls quand tu joues.</p>'}`;
    const sync = () => { const k = $('gKind').value; $('gAmount').classList.toggle('hidden', k !== 'sc'); $('gDecor').classList.toggle('hidden', k !== 'decor'); };
    $('gKind').onchange = sync; sync();
    $('gSend').onclick = sendGift;
  }
  async function renderContest(body) {
    const wk = weekId(), prev = weekId(-7);
    await claimContest();
    const [board, last] = await Promise.all([Online.contestBoard(wk.id), Online.contestBoard(prev.id)]);
    const myVotes = (board || []).filter(e => e.voted).length;
    const sel = UI.tank && UI.selected && UI.tank.shrimp.find(x => x.id === UI.selected);
    const win = rewardsFor(1, wk.n).map(k => DECOR[k].name).join(' + ');
    body.innerHTML = `<div class="contest-head"><div><b>Thème de la semaine :</b> ${esc(theme(wk.n))}<br><small class="dimc">Fin dans ${timeLeft()} · ${myVotes}/3 votes utilisés · tu ne peux pas voter pour toi</small></div>
        <div class="dimc" style="font-size:12px">🥇 ${esc(win)}<br>🥈 Trophée d'argent · 🥉 Trophée de bronze</div></div>
      <div class="row">${sel ? `<input id="cTitle" maxlength="30" placeholder="Nom de ta candidate (facultatif)"><button class="big" id="cEnter">🗳️ Inscrire #${sel.id}</button>` : '<span class="dimc">Pour participer : clique une crevette dans ton bac, puis reviens ici (une seule par semaine, tu peux la remplacer).</span>'}</div>
      <div class="contest-grid">${(board || []).map((e, i) => `<div class="centry${e.mine ? ' mine' : ''}"><canvas data-por="${i}" width="160" height="80"></canvas>
        <b>${esc(e.title || Gen.phenotype(Gen.express(e.shrimp.dna, e.genus)))}</b><small class="dimc">${esc(e.owner_name)} · ${GENERA[e.genus] ? GENERA[e.genus].short : ''}</small>
        <div class="row"><span>❤️ ${e.votes}</span>${e.mine ? '<small class="dimc">ta candidate</small>' : `<button data-vote="${e.id}" class="${e.voted ? 'on' : ''}">${e.voted ? '✓ Voté' : 'Voter'}</button>`}</div></div>`).join('') || '<p class="dimc">Aucune inscrite pour l\'instant.</p>'}</div>
      <h4>Semaine dernière (${esc(theme(prev.n))})</h4>
      <div class="dimc" style="font-size:13px">${(last || []).filter(e => e.votes > 0).slice(0, 3).map((e, i) => `${['🥇', '🥈', '🥉'][i]} ${esc(e.owner_name)} (${e.votes} ❤️)`).join(' · ') || 'Pas de podium.'}</div>`;
    body.querySelectorAll('[data-por]').forEach(cv => portraitInto(cv, board[+cv.dataset.por]));
    if ($('cEnter')) $('cEnter').onclick = enter;
    body.querySelectorAll('[data-vote]').forEach(b => b.onclick = () => UI.withName(async () => {
      try { await Online.contestVote(+b.dataset.vote); open('contest'); } catch (e) { UI.toast(e.message, 'warn'); }
    }));
  }

  // Tâches de fond : cadeaux et récompenses arrivent toutes les 2 minutes
  let lastPoll = 0;
  function poll() {
    if (!W() || !Online.enabled() || !Online.registered || Date.now() - lastPoll < 120000) return;
    lastPoll = Date.now();
    claimGifts(); claimContest();
  }
  // Lien direct ?visit=<joueur> : ouvre son bac au lancement
  function fromUrl() {
    const owner = new URLSearchParams(location.search).get('visit');
    if (owner && Online.enabled()) visitOwner(owner);
  }
  return { open, share, poll, fromUrl, enter, snapshot, restore };
})();
