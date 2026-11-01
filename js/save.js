'use strict';
// Sauvegardes dans le navigateur (localStorage) : un emplacement par mode.

const Save = (() => {
  const KEY = { sandbox: 'shrimpevo.sandbox', hardcore: 'shrimpevo.hardcore', career: 'shrimpevo.career' };
  const GRAVE = 'shrimpevo.graveyard';

  // Ignore les champs temporaires (préfixe _) et le phénotype (recalculé depuis l'ADN), arrondit les nombres
  function serialize(W) {
    return JSON.stringify(W, function (k, v) {
      if (k.startsWith('_')) return undefined;
      if (k === 'g' && this.dna) return undefined;
      if (typeof v === 'number' && !Number.isInteger(v)) return Math.round(v * 1e4) / 1e4;
      return v;
    });
  }
  function store(W) {
    try {
      if (W.realLast == null) W.realLast = Date.now(); // temps réel : la boucle avance realLast au fil de la simulation
      localStorage.setItem(KEY[W.mode], serialize(W));
      return true;
    } catch (e) {
      console.warn('Sauvegarde impossible', e);
      if (W._toasts) W._toasts.push({ msg: 'Sauvegarde impossible : stockage du navigateur plein ?', kind: 'bad' });
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
  function summary(W) {
    const c = Sim.calendar(W);
    return {
      day: c.day, tanks: W.tanks.length, n: W.tanks.reduce((a, t) => a + t.shrimp.length, 0),
      gen: W.stats.maxGen, money: W.money, created: W.created,
    };
  }
  function graveyard() {
    try { return JSON.parse(localStorage.getItem(GRAVE) || '[]'); } catch (e) { return []; }
  }
  function bury(W) {
    const g = graveyard();
    g.unshift({ ...summary(W), ended: Date.now(), born: W.stats.born, cause: Object.entries(W.stats.dead).sort((a, b) => b[1] - a[1])[0]?.[0] || '?' });
    try { localStorage.setItem(GRAVE, JSON.stringify(g.slice(0, 20))); } catch (e) { }
    remove('hardcore');
  }
  function exportFile(W) {
    const blob = new Blob([serialize(W)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shrimpevo-${W.mode === 'career' ? 'carriere' : 'bac-a-sable'}-jour${Sim.calendar(W).day}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return { store, load, remove, summary, graveyard, bury, exportFile };
})();
