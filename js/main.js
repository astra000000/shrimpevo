'use strict';
// Boucle principale : avance le monde selon le mode, rend le bac affiché, gère les sauvegardes.
// Bac à sable : vitesse libre · Carrière : temps réel ×24 · Hardcore : temps réel 1:1.

const Main = (() => {
  let W = null, running = false, last = 0, lastSave = 0, effHps = 0;
  const FRAME_BUDGET = 14; // ms de simulation max par image
  const REAL_RATE = { career: 24, hardcore: 1 }; // heures de jeu par heure réelle

  function newGame(cfg) { begin(Sim.newWorld(cfg)); }
  function begin(world) {
    W = world;
    Save.store(W);
    UI.start(W);
    running = true;
    last = performance.now();
    lastSave = last;
  }
  function resume(mode) {
    const st = Save.load(mode);
    if (!st || st.v !== 2) return;
    Sim.relink(st);
    if (REAL_RATE[mode]) catchUp(st, () => begin(st));
    else begin(st);
  }
  function stop() { running = false; W = null; UI.world = null; Sound.update(null); }

  // Temps réel : la période d'absence est simulée d'un coup
  function catchUp(st, done) {
    const hours = Math.max(0, (Date.now() - st.realLast) / 3.6e6 * REAL_RATE[st.mode]);
    if (hours < .05) { done(); return; }
    const box = document.getElementById('catchup');
    const txt = document.getElementById('catchupText'), bar = document.getElementById('catchupBar');
    box.classList.remove('hidden');
    document.getElementById('title').classList.add('hidden');
    const count = () => st.tanks.reduce((a, t) => a + t.shrimp.length, 0);
    const n0 = count(), born0 = st.stats.born, dead0 = Object.values(st.stats.dead).reduce((a, b) => a + b, 0), sold0 = st.stats.sold || 0;
    let rem = hours;
    const tick = () => {
      const t0 = performance.now();
      while (rem > 0 && performance.now() - t0 < 40) { const dt = Math.min(1, rem); Sim.step(st, dt); rem -= dt; }
      bar.style.width = ((1 - rem / hours) * 100) + '%';
      txt.textContent = `Simulation de ${hours < 48 ? Math.round(hours) + ' heures' : Math.round(hours / 24) + ' jours'} de jeu pendant ton absence…`;
      if (rem > 0) { setTimeout(tick, 0); return; }
      const dead = Object.values(st.stats.dead).reduce((a, b) => a + b, 0) - dead0;
      const sold = (st.stats.sold || 0) - sold0;
      st.realLast = Date.now();
      box.classList.add('hidden');
      st._toasts = (st._toasts || []).slice(-3);
      Sim.log(st, `Pendant ton absence : ${st.stats.born - born0} naissances, ${dead} morts${sold ? `, ${sold} ventes` : ''} (${n0} → ${count()} crevettes).`, 'info', true);
      done();
    };
    tick();
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dtR = Math.min(.25, (now - last) / 1000);
    last = now;
    // visite d'un bac depuis l'écran titre (lien partagé) : on affiche sans partie en cours
    if ((!running || !W) && UI.visiting) { Render.frame(UI.visiting, dtR); return; }
    if (!running || !W) return;
    const rate = REAL_RATE[W.mode];
    // temps réel : horloge murale (un onglet en arrière-plan ne perd pas de temps, le retard est rattrapé)
    if (rate && W.realLast == null) W.realLast = Date.now();
    let hours = rate ? Math.max(0, (Date.now() - W.realLast) / 3.6e6 * rate) : dtR * UI.speed;
    if (W.over && W.mode === 'hardcore') { hours = 0; W.realLast = Date.now(); }
    const t0 = performance.now(), want = hours;
    const maxDt = UI.speed >= 1000 ? 2 : 1;
    while (hours > 1e-9 && performance.now() - t0 < FRAME_BUDGET) {
      const dt = Math.min(maxDt, hours);
      Sim.step(W, dt);
      hours -= dt;
      if (W._alarm) break;
    }
    // Pause automatique sur un événement grave quand le temps défile vite (bac à sable)
    if (W._alarm) {
      W._alarm = false;
      if (W.mode === 'sandbox' && UI.speed >= 10) { UI.setSpeed(0); UI.toast('⏸ Pause automatique : événement grave.', 'warn'); }
    }
    if (dtR > 0) effHps = effHps * .9 + ((want - Math.max(0, hours)) / dtR) * .1;
    UI.setEffective(effHps);
    Render.frame(UI.tank, dtR);
    Sound.update(UI.tank, Render.cam.dist);
    UI.refreshAll(false);
    Social.poll();
    for (const a of Achievements.check(W)) {
      UI.toast(`🏆 Succès débloqué : ${a.ic} ${a.name}`, 'mut');
      Sound.coin();
      Notify.send('🏆 ShrimpEvo', `Succès : ${a.name}`, 'ach-' + a.id);
    }
    if (rate) W.realLast += (want - Math.max(0, hours)) / rate * 3.6e6;
    if (now - lastSave > 20000) { Save.store(W); lastSave = now; }
    if (W.over && !W._overShown) {
      W._overShown = true;
      if (W.mode === 'hardcore') {
        Save.bury(W);
        setTimeout(() => { alert('☠️ Il ne reste plus aucune crevette. La partie hardcore est terminée.'); stop(); UI.showTitle(); }, 300);
      } else UI.toast('Il ne reste plus aucune crevette. Rachète-en à la boutique.', 'bad');
    }
    if (!W.over) W._overShown = false;
  }

  function saveNow() { if (W && !(W.mode === 'hardcore' && W.over)) Save.store(W); }
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  window.addEventListener('DOMContentLoaded', () => {
    Render.init(document.getElementById('view'), id => UI.selectShrimp(id));
    UI.bind();
    UI.showTitle();
    document.getElementById('openGuide').onclick = e => { e.preventDefault(); Guide.open(); };
    if (new URLSearchParams(location.search).get('visit')) Social.fromUrl(); else Guide.firstTime();
    requestAnimationFrame(loop);
  });

  return { newGame, begin, resume, stop };
})();
