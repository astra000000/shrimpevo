'use strict';
// Sons d'ambiance générés en direct (Web Audio) : pompe, cascade, bulles, pluie, vent, oiseaux, grillons.
// Aucun fichier : du bruit filtré et des oscillateurs.

const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null, nextBlip = 0, nextBird = 0;
  const ch = {};
  const pref = (() => { try { return JSON.parse(localStorage.getItem('shrimpevo.audio') || '{}'); } catch (e) { return {}; } })();
  let vol = pref.vol ?? .5, muted = !!pref.muted;
  function savePref() { try { localStorage.setItem('shrimpevo.audio', JSON.stringify({ vol, muted })); } catch (e) { } }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : vol;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // canal = bruit en boucle → filtre → volume
    const chan = (type, f, q) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = .9 + Math.random() * .2;
      const fl = ctx.createBiquadFilter();
      fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(fl).connect(g).connect(master);
      src.start();
      return { g, fl };
    };
    ch.pump = chan('lowpass', 160, .7);   // pompe du filtre externe
    ch.fall = chan('bandpass', 1400, .6); // cascade
    ch.fizz = chan('highpass', 4000, .5); // pétillement des bulles en surface
    ch.rain = chan('bandpass', 2600, .4);
    ch.wind = chan('lowpass', 400, .3);
    // ronron du moteur
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = 100;
    const og = ctx.createGain(); og.gain.value = 0;
    o.connect(og).connect(master); o.start();
    ch.hum = { g: og };
    // grillons : sinus aigu modulé en amplitude
    const cr = ctx.createOscillator(); cr.frequency.value = 4400;
    const am = ctx.createGain(); am.gain.value = .5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 28;
    const lg = ctx.createGain(); lg.gain.value = .5;
    lfo.connect(lg).connect(am.gain);
    const cg = ctx.createGain(); cg.gain.value = 0;
    cr.connect(am).connect(cg).connect(master);
    cr.start(); lfo.start();
    ch.crick = { g: cg };
  }

  // Bulle : petit « bloop » qui monte en fréquence
  function blip(when, f0, g0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.6, when + .07);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(g0, when + .008);
    g.gain.exponentialRampToValueAtTime(.0001, when + .09);
    o.connect(g).connect(master);
    o.start(when); o.stop(when + .1);
  }
  function chirp(when) {
    const n = 2 + ((Math.random() * 3) | 0), base = 2500 + Math.random() * 1800;
    for (let i = 0; i < n; i++) {
      const t = when + i * .11, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(base * (1 + Math.random() * .2), t);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * .4), t + .06);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.02, t + .01);
      g.gain.exponentialRampToValueAtTime(.0001, t + .08);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + .1);
    }
  }
  function tone(f, t, dur, g0, type = 'square') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(g0, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + .02);
  }

  // Nourriture qui tombe dans l'eau
  function plop() {
    if (!ctx) return;
    const t = ctx.currentTime;
    blip(t, 160, .12);
    blip(t + .05, 320, .05);
  }
  // Vente : pièce
  function coin() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(988, t, .08, .04);
    tone(1319, t + .08, .3, .04);
  }

  // Appelé à chaque image : ajuste les ambiances selon le bac affiché et la distance de la caméra
  function update(s, camDist) {
    if (!ctx) return;
    const now = ctx.currentTime, set = (c, v) => c.g.gain.setTargetAtTime(v, now, .25);
    if (!s) { for (const k in ch) set(ch[k], 0); return; }
    const size = Math.cbrt(s.cfg.volume * 1000 / .3);
    const near = Math.max(.25, Math.min(1, size * 1.6 / Math.max(1, camDist)));
    const aq = s.env === 'aquarium', eq = s.eq, on = s.power;
    const canister = aq && on && (eq.filter === 'canister' || eq.filter === 'guarded');
    const sponge = aq && on && eq.filter === 'sponge';
    const air = on && eq.air;
    set(ch.pump, canister ? .05 * near : 0);
    set(ch.hum, canister ? .005 * near : 0);
    set(ch.fall, canister ? (.035 + (1 - s.w.level) * .3) * near : 0);
    set(ch.fizz, canister ? .012 * near : sponge || air ? .006 * near : 0);
    const raining = !aq && s._wx && s._wx.rain > s.t;
    set(ch.rain, raining ? .06 : 0);
    set(ch.wind, aq ? 0 : .02 + (raining ? .02 : 0));
    const night = !aq && (s.light || 0) <= 0;
    set(ch.crick, night && (s.air || 0) > 14 ? (Math.sin(now * 1.7) > .2 ? .01 : .001) : 0);
    // bulles : filtre éponge, bulleur, cascade
    const rate = (sponge ? 6 : 0) + (air ? 10 : 0) + (canister ? 4 : 0);
    if (rate && now > nextBlip) {
      blip(now + .02, 250 + Math.random() * 700, (.02 + Math.random() * .03) * near);
      nextBlip = now + -Math.log(Math.random() + 1e-6) / rate;
    }
    // oiseaux le jour au bord du bassin
    if (!aq && (s.light || 0) > .1 && !raining && now > nextBird) {
      if (nextBird) chirp(now);
      nextBird = now + 3 + Math.random() * 10;
    }
  }
  function setVolume(v) {
    vol = v;
    if (master && !muted) master.gain.setTargetAtTime(vol, ctx.currentTime, .05);
    savePref();
  }
  function toggle() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : vol, ctx.currentTime, .05);
    savePref();
    return !muted;
  }
  // le navigateur exige un geste de l'utilisateur avant de jouer du son
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, ensure, { passive: true });

  return { update, plop, coin, setVolume, toggle, get volume() { return vol; }, get muted() { return muted; } };
})();
