'use strict';
// Succès : vérifiés toutes les quelques secondes, gardés dans la sauvegarde (W.ach = { id: heure de jeu }).

const Achievements = (() => {
  const alive = W => W.tanks.flatMap(s => s.shrimp);
  const genera = W => new Set(alive(W).map(sh => sh.genus));
  const seenAll = W => { const set = new Set(); for (const s of W.tanks) for (const k in s.seen) set.add(k); return set.size; };
  const career = W => W.mode === 'career';
  const LIST = [
    { id: 'tank', ic: '🫙', name: 'Premier bac', desc: 'Mettre un bac en eau.', ok: W => W.tanks.length > 0 },
    { id: 'cycled', ic: '🧪', name: 'Cycle bouclé', desc: 'Avoir un bac cyclé.', ok: W => W.tanks.some(s => Sim.cycleInfo(s).phase === 'Cyclé') },
    { id: 'birth', ic: '🐣', name: 'Premier bébé', desc: 'Une première naissance.', ok: W => W.stats.born >= 1 },
    { id: 'born100', ic: '🍼', name: 'Pouponnière', desc: '100 naissances.', ok: W => W.stats.born >= 100 },
    { id: 'born1000', ic: '🏭', name: 'Usine à bébés', desc: '1 000 naissances.', ok: W => W.stats.born >= 1000 },
    { id: 'gen5', ic: '🧬', name: 'Lignée', desc: 'Atteindre la 5e génération.', ok: W => W.stats.maxGen >= 5 },
    { id: 'gen20', ic: '👑', name: 'Dynastie', desc: 'Atteindre la 20e génération.', ok: W => W.stats.maxGen >= 20 },
    { id: 'mutation', ic: '☢️', name: 'Mutation !', desc: 'Obtenir une mutation.', ok: W => W.stats.mutations >= 1 },
    { id: 'pheno5', ic: '🌈', name: 'Arc-en-ciel', desc: '5 phénotypes différents dans tes bacs.', ok: W => seenAll(W) >= 5 },
    { id: 'pheno15', ic: '🎨', name: 'Collectionneur', desc: '15 phénotypes différents.', ok: W => seenAll(W) >= 15 },
    { id: 'strain', ic: '📖', name: 'Ma souche', desc: 'Créer et nommer une souche.', ok: W => W.bestiary.some(e => e.source === 'mine') },
    { id: 'stable', ic: '💎', name: 'Lignée pure', desc: 'Une souche à toi stable à plus de 80 %.', ok: W => W.bestiary.some(e => e.source === 'mine' && (Economy.stability(W, e) || 0) > .8) },
    { id: 'community', ic: '🏘️', name: 'Bac communautaire', desc: '3 espèces dans le même bac.', ok: W => W.tanks.some(s => new Set(s.shrimp.map(sh => sh.genus)).size >= 3) },
    { id: 'zoo', ic: '🦐', name: 'Zoologiste', desc: 'Posséder les 7 espèces en même temps.', ok: W => genera(W).size >= GENUS_ORDER.length },
    { id: 'hawaii', ic: '🌋', name: 'Hawaï à la maison', desc: 'Des Halocaridina qui se reproduisent.', ok: W => alive(W).some(sh => sh.genus === 'halo' && sh.gen >= 1) },
    { id: 'larvae', ic: '🧂', name: 'Élevage de larves', desc: 'Réussir des bébés Amano, Rhino ou Macrobrachium (eau saumâtre).', ok: W => alive(W).some(sh => GENERA[sh.genus].larvae === 'brackish' && sh.gen >= 1) },
    { id: 'king', ic: '🦞', name: 'Le roi du bac', desc: 'Avoir un Macrobrachium adulte.', ok: W => alive(W).some(sh => sh.genus === 'macro' && Sim.isMature(sh)) },
    { id: 'snails', ic: '🐌', name: 'Escargothèque', desc: '3 espèces d\'escargots.', ok: W => new Set(W.tanks.flatMap(s => Object.keys(s.snails || {}))).size >= 3 },
    { id: 'clean', ic: '🪟', name: 'Vitres nickel', desc: 'Un bac avec des néritines et des vitres propres.', ok: W => W.tanks.some(s => (s.snails || {}).nerite >= 1 && (s.glass || 0) < .05) },
    { id: 'room', ic: '🏠', name: 'Fish room', desc: '5 bacs en même temps.', ok: W => W.tanks.length >= 5 },
    { id: 'pond', ic: '🌿', name: 'En plein air', desc: 'Un bassin extérieur peuplé.', ok: W => W.tanks.some(s => s.env === 'pond' && s.shrimp.length >= 10) },
    { id: 'deco', ic: '🪨', name: 'Décorateur', desc: '10 éléments de décor dans un bac.', ok: W => W.tanks.some(s => (s.decor || []).length >= 10) },
    { id: 'moon', ic: '🌙', name: 'Noctambule', desc: 'Installer une LED lunaire.', ok: W => W.tanks.some(s => s.eq.moon) },
    { id: 'pop200', ic: '🌊', name: 'Grouillant', desc: '200 crevettes dans un seul bac.', ok: W => W.tanks.some(s => s.shrimp.length >= 200) },
    { id: 'rich', ic: '💰', name: 'Riche', desc: 'Carrière : 2 000 SC en poche.', ok: W => career(W) && W.money >= 2000 },
    { id: 'seller', ic: '🏷️', name: 'Commerçant', desc: 'Carrière : 50 crevettes vendues.', ok: W => career(W) && (W.stats.sold || 0) >= 50 },
    { id: 'net', ic: '🌐', name: 'Vendu à un joueur', desc: 'Vendre une crevette à un autre joueur.', ok: W => !!(W.flags && W.flags.netSold) },
    { id: 'gift', ic: '🎁', name: 'Généreux', desc: 'Envoyer un cadeau à un ami.', ok: W => !!(W.flags && W.flags.gift) },
    { id: 'visit', ic: '👀', name: 'Curieux', desc: 'Visiter le bac d\'un autre joueur.', ok: W => !!(W.flags && W.flags.visit) },
    { id: 'contest', ic: '🗳️', name: 'Candidat', desc: 'Inscrire une crevette au concours de la semaine.', ok: W => !!(W.flags && W.flags.contest) },
    { id: 'podium', ic: '🏆', name: 'Podium', desc: 'Finir dans le top 3 d\'un concours.', ok: W => !!(W.flags && W.flags.podium) },
    { id: 'survivor', ic: '💀', name: 'Survivant', desc: 'Hardcore : tenir 30 jours.', ok: W => W.mode === 'hardcore' && Sim.calendar(W).day >= 30 },
    { id: 'year', ic: '📅', name: 'Un an déjà', desc: 'Atteindre le jour 365.', ok: W => Sim.calendar(W).day >= 365 },
  ];

  let last = 0;
  // Vérifie et débloque ; renvoie la liste des nouveaux succès
  function check(W, force) {
    if (!W || (!force && Date.now() - last < 3000)) return [];
    last = Date.now();
    W.ach = W.ach || {};
    const fresh = [];
    for (const a of LIST) {
      if (W.ach[a.id] != null) continue;
      let ok = false;
      try { ok = a.ok(W); } catch (e) { ok = false; }
      if (ok) { W.ach[a.id] = W.t; fresh.push(a); }
    }
    return fresh;
  }
  function flag(W, k) { if (!W) return; W.flags = W.flags || {}; W.flags[k] = true; }
  const count = W => Object.keys((W && W.ach) || {}).length;
  return { LIST, check, flag, count };
})();
