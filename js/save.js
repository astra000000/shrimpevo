'use strict';
// Sauvegardes dans le navigateur (localStorage). Normal et hardcore ont chacun leur emplacement.

const Save = (() => {
  const KEY = { normal: 'shrimpevo.normal', hardcore: 'shrimpevo.hardcore' };
  const GRAVE = 'shrimpevo.graveyard';

  // Arrondit les nombres et ignore les champs temporaires (préfixe _)
  function serialize(s) {
    return JSON.stringify(s, (k, v) => {
      if (k.startsWith('_')) return undefined;
      if (typeof v === 'number' && !Number.isInteger(v)) return Math.round(v * 1e4) / 1e4;
      return v;
    });
  }
  function store(s) {
    try {
      s.realLast = Date.now();
      localStorage.setItem(KEY[s.mode], serialize(s));
      return true;
    } catch (e) {
      console.warn('Sauvegarde impossible', e);
      return false;
    }
  }
  function load(mode) {
    try {
      const raw = localStorage.getItem(KEY[mode]);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function remove(mode) { try { localStorage.removeItem(KEY[mode]); } catch (e) { } }
  function summary(s) {
    if (!s) return null;
    const c = Sim.calendar(s);
    return { day: c.day, n: s.shrimp.length, env: s.env, vol: s.cfg.volume, gen: s.stats.maxGen, created: s.created };
  }
  function graveyard() {
    try { return JSON.parse(localStorage.getItem(GRAVE) || '[]'); } catch (e) { return []; }
  }
  function bury(s) {
    const g = graveyard();
    const sm = summary(s);
    g.unshift({ ...sm, ended: Date.now(), born: s.stats.born, cause: Object.entries(s.stats.dead).sort((a, b) => b[1] - a[1])[0]?.[0] || '?' });
    try { localStorage.setItem(GRAVE, JSON.stringify(g.slice(0, 20))); } catch (e) { }
    remove('hardcore');
  }
  function exportFile(s) {
    const blob = new Blob([serialize(s)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shrimpevo-jour${Sim.calendar(s).day}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return { store, load, remove, summary, graveyard, bury, exportFile };
})();
