'use strict';
// Boucle principale : avance la simulation selon la vitesse, rend la scène, gère les sauvegardes.

const Main = (() => {
  let s = null, running = false, last = 0, lastSave = 0, effHps = 0;
  const FRAME_BUDGET = 14; // ms de simulation max par image

  function newGame(cfg) {
    const st = Sim.newGame(cfg);
    Save.store(st);
    begin(st);
  }
  function load(st) { begin(st); }
  function resume(mode) {
    const st = Save.load(mode);
    if (!st) return;
    if (mode === 'hardcore') catchUp(st, () => begin(st));
    else begin(st);
  }
  function begin(st) {
    s = st;
    UI.start(s);
    Render.build(s);
    running = true;
    last = performance.now();
    lastSave = last;
  }
  function stop() { running = false; s = null; UI.state = null; }

  // Hardcore : le temps réel écoulé depuis la dernière visite est simulé d'un coup
  function catchUp(st, done) {
    const hours = Math.max(0, (Date.now() - st.realLast) / 3.6e6);
    if (hours < .05) { done(); return; }
    const box = document.getElementById('catchup');
    const txt = document.getElementById('catchupText'), bar = document.getElementById('catchupBar');
    box.classList.remove('hidden');
    document.getElementById('title').classList.add('hidden');
    const n0 = st.shrimp.length, born0 = st.stats.born, dead0 = Object.values(st.stats.dead).reduce((a, b) => a + b, 0);
    let rem = hours;
    const tick = () => {
      const t0 = performance.now();
      while (rem > 0 && performance.now() - t0 < 40) { const dt = Math.min(1, rem); Sim.step(st, dt); rem -= dt; }
      bar.style.width = ((1 - rem / hours) * 100) + '%';
      txt.textContent = `Simulation de ${hours < 48 ? Math.round(hours) + ' heures' : Math.round(hours / 24) + ' jours'} d'absence…`;
      if (rem > 0) { setTimeout(tick, 0); return; }
      const dead = Object.values(st.stats.dead).reduce((a, b) => a + b, 0) - dead0;
      st.realLast = Date.now();
      box.classList.add('hidden');
      Sim.log(st, `Pendant ton absence : ${st.stats.born - born0} naissances, ${dead} morts (${n0} → ${st.shrimp.length}).`, 'info', true);
      done();
    };
    tick();
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!running || !s) return;
    const dtR = Math.min(.25, (now - last) / 1000);
    last = now;
    const hc = s.mode === 'hardcore';
    let hours = hc ? dtR / 3600 : dtR * UI.speed;
    if (s.over) hours = 0;
    const t0 = performance.now(), want = hours;
    const maxDt = UI.speed >= 1000 ? 2 : 1;
    while (hours > 1e-9 && performance.now() - t0 < FRAME_BUDGET) {
      const dt = Math.min(maxDt, hours);
      Sim.step(s, dt);
      hours -= dt;
      if (s._alarm) break;
    }
    // Pause automatique sur un événement grave quand le temps défile vite
    if (s._alarm) {
      s._alarm = false;
      if (!hc && UI.speed >= 10) { UI.setSpeed(0); UI.toast('⏸ Pause automatique : événement grave.', 'warn'); }
    }
    if (dtR > 0) effHps = effHps * .9 + ((want - Math.max(0, hours)) / dtR) * .1;
    UI.setEffective(effHps);
    Render.frame(s, dtR);
    UI.refreshAll(false);
    if (hc) s.realLast = Date.now();
    if (now - lastSave > 20000) { Save.store(s); lastSave = now; }
    if (s.over && !s._overShown) {
      s._overShown = true;
      if (hc) {
        Save.bury(s);
        setTimeout(() => { alert('☠️ La colonie est éteinte. La partie hardcore est terminée.'); stop(); UI.showTitle(); }, 300);
      } else UI.toast('La colonie est éteinte. Tu peux remettre des crevettes (Ajouter).', 'bad');
    }
    if (!s.over) s._overShown = false;
  }

  function saveNow() { if (s && !(s.mode === 'hardcore' && s.over)) Save.store(s); }
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  window.addEventListener('DOMContentLoaded', () => {
    Render.init(document.getElementById('view'), id => UI.selectShrimp(id));
    UI.bind();
    UI.showTitle();
    requestAnimationFrame(loop);
  });

  return { newGame, load, resume, stop };
})();
