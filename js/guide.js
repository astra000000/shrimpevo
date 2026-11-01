'use strict';
// Guide du débutant : un petit livre illustré (pixel art en SVG), ouvert au premier lancement puis depuis le titre ou le menu.

const Guide = (() => {
  const LS = 'shrimpevo.guide';
  const $ = id => document.getElementById(id);

  // ---------- Pixel art ----------
  // Une grille de caractères → des rectangles SVG ; '.' = transparent
  function sprite(grid, pal, x, y, s, flip) {
    let out = '';
    grid.forEach((row, j) => [...row].forEach((ch, i) => {
      const c = pal[ch];
      if (!c) return;
      const xi = flip ? row.length - 1 - i : i;
      out += `<rect x="${x + xi * s}" y="${y + j * s}" width="${s}" height="${s}" fill="${c}"/>`;
    }));
    return out;
  }
  const SHRIMP = [
    'aa..............',
    '..a..bbbbbb.....',
    '...ebbbbbbbbbb..',
    '..bbbbbbbbbbbbbt',
    '...bbbbbbbbbbbtt',
    '...l.l.l.l.p.p..',
    '..l.l.l.l.......',
  ];
  // Bandes blanches : colonnes remplacées par du blanc
  function shrimp(x, y, s, col, opt = {}) {
    const dark = opt.dark || col;
    const pal = { a: '#c9b8a8', b: col, e: '#111', l: dark, p: dark, t: dark, w: '#f4f4f0' };
    const g = opt.bands ? SHRIMP.map(r => [...r].map((ch, i) => ch === 'b' && (i === 6 || i === 7 || i === 11) ? 'w' : ch).join('')) : SHRIMP;
    return sprite(g, pal, x, y, s, opt.flip);
  }
  const tank = (inner, opt = {}) => `
    <rect x="8" y="10" width="184" height="110" fill="${opt.water || '#3f7f86'}" opacity=".9"/>
    <rect x="8" y="10" width="184" height="6" fill="#6fb3b8"/>
    <rect x="8" y="104" width="184" height="16" fill="${opt.sand || '#8a6d4b'}"/>
    ${[14, 40, 66, 120, 150, 176].map((x, i) => `<rect x="${x}" y="${104 + (i % 2) * 3}" width="6" height="3" fill="#a88a63"/>`).join('')}
    ${inner}
    <rect x="6" y="8" width="188" height="114" fill="none" stroke="#cfe3e6" stroke-width="3"/>
    <rect x="12" y="20" width="3" height="40" fill="#ffffff" opacity=".25"/>`;
  const plant = (x, h, c = '#3e9a4a') => Array.from({ length: h }, (_, i) =>
    `<rect x="${x + (i % 3 === 1 ? 2 : 0)}" y="${104 - (i + 1) * 6}" width="4" height="6" fill="${c}"/>` +
    (i % 2 ? `<rect x="${x + (i % 4 === 1 ? -5 : 5)}" y="${104 - (i + 1) * 6 + 1}" width="5" height="3" fill="#56b85e"/>` : '')).join('');
  const rock = (x, w) => `<rect x="${x}" y="96" width="${w}" height="8" fill="#6f6f6a"/><rect x="${x + 3}" y="92" width="${w - 8}" height="4" fill="#85857f"/>`;
  const svg = body => `<svg viewBox="0 0 200 130" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  const txt = (x, y, t, c = '#e9f2f1', size = 9) => `<text x="${x}" y="${y}" fill="${c}" font-family="Silkscreen, monospace" font-size="${size}" text-anchor="middle">${t}</text>`;
  const arrow = (x, y, w = 18) => `<rect x="${x}" y="${y}" width="${w - 6}" height="3" fill="#cfe3e6"/><rect x="${x + w - 7}" y="${y - 3}" width="3" height="9" fill="#cfe3e6"/><rect x="${x + w - 4}" y="${y - 1}" width="3" height="5" fill="#cfe3e6"/>`;
  const vial = (x, y, s = 3) => sprite([
    '.kk.',
    '.gg.',
    'g..g',
    'gvvg',
    'gvvg',
    '.gg.',
  ], { k: '#8a5a2b', g: '#cfe3e6', v: '#7be08a' }, x, y, s);
  const coin = (x, y, s = 3) => sprite([
    '.yyyy.',
    'yYYYYy',
    'yYrrYy',
    'yYrrYy',
    'yYYYYy',
    '.yyyy.',
  ], { y: '#b8862b', Y: '#f2c14e', r: '#d9534f' }, x, y, s);

  // ---------- Pages ----------
  const PAGES = [
    {
      t: 'Bienvenue !',
      img: () => svg(tank(plant(30, 9) + plant(160, 7) + rock(90, 30) + shrimp(60, 84, 2, '#d33') + shrimp(120, 60, 2, '#d33', { bands: true, flip: true }) + shrimp(140, 90, 2, '#2f6fd6'))),
      p: `Tu élèves des <b>crevettes d'eau douce</b>. Chaque bébé hérite des gènes de ses parents, avec parfois une mutation.<br><br>
        Garde-les en vie, fais-les se reproduire, et <b>sélectionne</b> les plus belles : génération après génération, ta souche évolue.`,
    },
    {
      t: 'Trois façons de jouer',
      img: () => svg(`
        <rect x="6" y="20" width="58" height="80" fill="#1d3a40"/>${txt(35, 40, 'BAC', '#7be08a')}${txt(35, 50, 'À SABLE', '#7be08a')}${shrimp(19, 64, 2, '#f2c14e')}${txt(35, 94, 'libre', '#9fb7b9', 7)}
        <rect x="71" y="20" width="58" height="80" fill="#1d3a40"/>${txt(100, 40, 'CARRIÈRE', '#f2c14e')}${coin(91, 56, 3)}${txt(100, 94, 'h = 1 jour', '#9fb7b9', 7)}
        <rect x="136" y="20" width="58" height="80" fill="#3a1d1d"/>${txt(165, 40, 'HARDCORE', '#ff6b6b')}${shrimp(149, 64, 2, '#888')}${txt(165, 94, '1 seule vie', '#9fb7b9', 7)}`),
      p: `<b>Bac à sable</b> : tout est gratuit, tu règles la vitesse. Idéal pour apprendre.<br>
        <b>Carrière</b> : tu démarres avec 400 Shrimp Coin. 1 heure réelle = 1 jour de jeu, même quand le jeu est fermé.<br>
        <b>Hardcore</b> : temps réel 1:1 et une seule vie.`,
    },
    {
      t: 'Le cycle de l\'azote',
      img: () => svg(`
        ${txt(30, 30, 'NH3', '#ff6b6b', 11)}${arrow(48, 26)}${txt(95, 30, 'NO2', '#f2c14e', 11)}${arrow(113, 26)}${txt(165, 30, 'NO3', '#7be08a', 11)}
        ${txt(30, 44, 'toxique', '#9fb7b9', 7)}${txt(95, 44, 'toxique', '#9fb7b9', 7)}${txt(165, 44, 'ok', '#9fb7b9', 7)}
        ${[20, 34, 48, 140, 154].map((x, i) => `<rect x="${x + 50}" y="${58 + (i % 2) * 6}" width="4" height="4" fill="#c8a2e0"/>`).join('')}
        ${txt(100, 80, 'bactéries', '#c8a2e0', 8)}
        ${vial(40, 88, 4)}${arrow(64, 104, 26)}${txt(140, 110, 'CYCLÉ !', '#7be08a', 12)}`),
      p: `Les déchets donnent de l'<b>ammoniac</b>, puis des <b>nitrites</b> : les deux tuent les crevettes. Des bactéries les transforment en nitrates, sans danger. Dans un bac neuf, il faut <b>2 à 4 semaines</b> pour qu'elles s'installent. C'est le « cycle ».<br><br>
        🧪 Cadeau : ta <b>fiole de départ</b> (en bas, groupe « Départ ») cycle <b>tout de suite</b> le bac de ton choix. Une seule par partie !`,
    },
    {
      t: 'Ton premier bac',
      img: () => svg(tank(plant(24, 6) + plant(170, 8) + rock(70, 26) + `<rect x="150" y="16" width="14" height="60" fill="#2b2b2b" opacity=".8"/><rect x="146" y="70" width="22" height="8" fill="#555"/>` + vial(110, 40, 3))),
      p: `<b>Carrière</b> : 🛒 Boutique → « Bacs ». Choisis un sol et une eau, puis verse la fiole.<br><br>
        <b>Conseils</b> : un <b>filtre</b> (éponge, c'est parfait), un peu de <b>mousse</b> ou de plantes pour cacher les bébés.<br>
        Les <b>Neocaridina</b> (Red Cherry…) sont faciles. Les <b>Caridina</b> (Crystal, Bee…) veulent une eau douce et acide : soil + eau osmosée.`,
    },
    {
      t: 'Accueillir les crevettes',
      img: () => svg(tank(plant(30, 7) + `<rect x="90" y="18" width="40" height="34" fill="#dfe9ea" opacity=".55"/><rect x="88" y="16" width="44" height="4" fill="#cfe3e6"/>` + shrimp(96, 30, 2, '#d33') + `<rect x="109" y="0" width="2" height="16" fill="#cfe3e6"/>` + [0, 1, 2].map(i => `<rect x="109" y="${55 + i * 12}" width="2" height="4" fill="#9fd3e0"/>`).join(''))),
      p: `Tes achats arrivent dans 📦 <b>Colis</b>. Choisis le bac et une <b>acclimatation</b> : le <b>goutte-à-goutte</b> (3 h de jeu) évite presque tout le choc.<br><br>
        Verser le sac d'un coup dans une eau trop différente (GH, pH, température), c'est des morts dans les heures qui suivent.`,
    },
    {
      t: 'Nourrir… mais pas trop',
      img: () => svg(tank(plant(24, 5) + `<rect x="96" y="98" width="8" height="6" fill="#7a4a1e"/><rect x="98" y="96" width="4" height="2" fill="#a0652a"/>` + shrimp(66, 94, 2, '#d33') + shrimp(108, 94, 2, '#d33', { flip: true }) + shrimp(80, 70, 2, '#2f6fd6'))),
      p: `Boutons <b>Nourrir</b> en bas. Une petite pincée par jour : les crevettes vont la manger, tu les vois y aller.<br><br>
        Ce qui reste <b>pourrit et fait monter l'ammoniac</b>. Un bac bien planté et mûr produit aussi du biofilm : les crevettes s'en nourrissent toutes seules.`,
    },
    {
      t: 'Surveiller l\'eau',
      img: () => svg(`
        <rect x="20" y="20" width="16" height="96" fill="#f4f4f0"/>${['#f2c14e', '#d9534f', '#7be08a', '#2f6fd6', '#c8a2e0'].map((c, i) => `<rect x="22" y="${26 + i * 17}" width="12" height="10" fill="${c}"/>`).join('')}
        ${[['GH', '#7be08a', .6], ['pH', '#f2c14e', .45], ['NH3', '#7be08a', .05], ['NO2', '#7be08a', .05], ['°C', '#f2c14e', .55]].map(([n, c, v], i) =>
          txt(70, 32 + i * 20, n, '#9fb7b9', 8) + `<rect x="88" y="${25 + i * 20}" width="96" height="8" fill="#0d1f23"/><rect x="88" y="${25 + i * 20}" width="${96 * v}" height="8" fill="${c}"/>`).join('')}`),
      p: `Panneau <b>💧 Eau</b> : température, GH, pH, ammoniac, nitrites, nitrates. Une alerte s'affiche quand ça déraille.<br><br>
        En carrière, il faut <b>tester</b> (bandelette gratuite). Le remède à presque tout : un <b>changement d'eau</b> de 10 à 20 % par semaine, avec une eau proche de celle du bac.`,
    },
    {
      t: 'Génétique',
      img: () => svg(`
        ${shrimp(14, 14, 2, '#d33')}${txt(56, 26, '×', '#e9f2f1', 12)}${shrimp(66, 14, 2, '#2f6fd6')}
        ${arrow(110, 22, 22)}${shrimp(140, 14, 2, '#7a6a55')}${txt(172, 44, 'F1', '#9fb7b9', 8)}
        ${arrow(90, 66, 22)}${txt(70, 70, 'F1 × F1', '#9fb7b9', 8)}
        ${shrimp(10, 90, 2, '#d33')}${shrimp(56, 90, 2, '#2f6fd6')}${shrimp(102, 90, 2, '#7a6a55')}${shrimp(148, 90, 2, '#5a2fa0')}${txt(176, 126, 'F2', '#9fb7b9', 8)}`),
      p: `Les couleurs (rouge, bleu, jaune…) sont <b>récessives</b> : Red × Blue donne des bébés couleur sauvage. Mais <b>croise ces bébés entre eux</b> et les couleurs réapparaissent, parfois mélangées en nouvelles variétés.<br><br>
        Clique une crevette pour voir sa <b>fiche</b> et ses gènes.`,
    },
    {
      t: 'Sélectionner',
      img: () => svg(`
        <rect x="6" y="30" width="76" height="70" fill="#3f7f86"/><rect x="6" y="90" width="76" height="10" fill="#8a6d4b"/>
        ${shrimp(12, 50, 2, '#7a6a55')}${shrimp(40, 76, 2, '#7a6a55', { flip: true })}${shrimp(14, 78, 2, '#d33', { bands: true })}
        ${arrow(88, 64, 26)}
        <rect x="118" y="30" width="76" height="70" fill="#3f7f86"/><rect x="118" y="90" width="76" height="10" fill="#8a6d4b"/>
        ${shrimp(126, 56, 2, '#d33', { bands: true })}${shrimp(150, 78, 2, '#d33', { bands: true, flip: true })}
        ${txt(156, 22, 'les plus belles', '#7be08a', 7)}`),
      p: `L'onglet <b>Sélection</b> filtre les crevettes (couleur, stade, sexe…) et les <b>transfère</b> dans un autre bac.<br><br>
        Garde un bac pour tes meilleures et fais-les se reproduire entre elles : c'est comme ça qu'on <b>fixe une souche</b>.`,
    },
    {
      t: 'Vendre et collectionner',
      img: () => svg(`${coin(30, 40, 6)}${arrow(78, 58, 26)}${shrimp(118, 46, 3, '#d33', { bands: true })}
        ${txt(100, 112, '📖 bestiaire · 📈 marché', '#9fb7b9', 8)}`),
      p: `<b>📖 Bestiaire</b> : toutes les variétés que tu as obtenues.<br>
        <b>📈 Marché</b> (carrière) : vends tes souches au prix que tu veux, aux PNJ ou aux <b>🌐 autres joueurs</b>. Une souche stable et rare se vend cher.`,
    },
    {
      t: '7 espèces, des escargots',
      img: () => svg(`${shrimp(8, 14, 2, '#d33')}${shrimp(70, 14, 2, '#7a6a55')}${shrimp(134, 14, 2, '#c9c9c0')}<rect x="166" y="22" width="12" height="2" fill="#e33"/>
        ${shrimp(8, 54, 2, '#e22')}${shrimp(70, 54, 3, '#6b5a40')}<rect x="118" y="66" width="22" height="2" fill="#6b5a40"/>
        ${sprite(['.ooo.', 'ooooo', 'ooOoo', '.bbbbb'], { o: '#c98a2a', O: '#7a4a1e', b: '#8a8070' }, 30, 100, 3)}${sprite(['.ooo.', 'ooooo', 'ooOoo', '.bbbbb'], { o: '#3a2a14', O: '#e0c050', b: '#8a8070' }, 90, 100, 3)}
        ${txt(170, 60, 'Macro', '#9fb7b9', 7)}${txt(170, 112, 'escargots', '#9fb7b9', 7)}`),
      p: `Neocaridina, Caridina, <b>Amano</b> (mange les algues), <b>Atyaephyra</b> (froid, bassin), <b>Rhino</b> (nez rouge, en banc), <b>Halocaridina</b> (eau salée) et <b>Macrobrachium</b> (grosse, territoriale : elle chasse les autres !).<br><br>
        Chaque espèce a un <b>volume conseillé</b>. Amano, Rhino et Macrobrachium ont des larves qui ne vivent qu'en <b>eau saumâtre</b> : pour les faire naître, mets la femelle grainée dans un bac salé 🧂.<br>
        <b>Escargots</b> : néritine (vitres), planorbe et mélanoïde (restes), ampullaire, assassin (mange les autres escargots).`,
    },
    {
      t: 'Jouer entre potes',
      img: () => svg(`${tank(plant(30, 6) + shrimp(70, 80, 2, '#d33') + shrimp(120, 60, 2, '#2f6fd6', { flip: true }))}
        ${txt(100, 8, '🌐', '#fff', 9)}`),
      p: `Bouton <b>🌐 En ligne</b> :<br>
        👀 <b>Visiter</b> : partage ton bac et visite celui des autres (un lien à envoyer).<br>
        🎁 <b>Cadeaux</b> : envoie des crevettes, des Shrimp Coins ou du décor à un pseudo.<br>
        🏆 <b>Concours</b> : chaque semaine un thème. Inscris ta plus belle crevette, vote pour 3 autres. Le <b>top 3</b> gagne des <b>décors exclusifs</b> introuvables en boutique.<br>
        Et sur 📈 le marché : vends tes souches signées à ton nom.`,
    },
    {
      t: 'Commandes',
      img: () => svg(`
        <rect x="30" y="24" width="30" height="46" rx="0" fill="#cfe3e6"/><rect x="44" y="24" width="2" height="18" fill="#3f7f86"/><rect x="30" y="42" width="30" height="2" fill="#3f7f86"/>
        ${txt(45, 90, 'PC', '#e9f2f1', 10)}
        <rect x="128" y="18" width="44" height="80" fill="#1d3a40" stroke="#cfe3e6" stroke-width="3"/>
        <rect x="140" y="50" width="6" height="6" fill="#f2c14e"/><rect x="156" y="62" width="6" height="6" fill="#f2c14e"/>
        ${txt(150, 116, 'MOBILE', '#e9f2f1', 10)}`),
      p: `<b>PC</b> : clic gauche + glisser = tourner, clic droit (ou Maj) = déplacer, molette = zoom, clic sur une crevette = sa fiche.<br>
        <b>Mobile</b> : un doigt = tourner, deux doigts = zoom et déplacement. Les boutons <b>💧</b> et <b>🦐</b> ouvrent les panneaux.<br><br>
        Le jeu se sauvegarde tout seul. Menu → <b>Exporter</b> pour passer sur un autre appareil. Bon élevage ! 🦐`,
    },
  ];

  // ---------- Livre ----------
  let page = 0, el = null;
  function build() {
    el = document.createElement('div');
    el.id = 'guide';
    el.className = 'screen hidden';
    el.innerHTML = `<div class="book"><button class="xclose book-x" id="gX" title="Fermer">✕</button>
      <div class="book-img" id="gImg"></div>
      <div class="book-txt"><h2 id="gT"></h2><div id="gP"></div></div>
      <div class="book-foot"><button id="gPrev">◀</button><span id="gN"></span><button id="gNext">▶</button><button id="gClose">Fermer</button></div>
    </div>`;
    document.body.appendChild(el);
    $('gPrev').onclick = () => go(page - 1);
    $('gNext').onclick = () => page < PAGES.length - 1 ? go(page + 1) : close();
    $('gClose').onclick = close;
    $('gX').onclick = close;
    el.onclick = e => { if (e.target === el) close(); };
    // glisser sur mobile
    let x0 = null;
    el.addEventListener('touchstart', e => x0 = e.touches[0].clientX, { passive: true });
    el.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) go(page + (dx < 0 ? 1 : -1));
    });
    addEventListener('keydown', e => {
      if (el.classList.contains('hidden')) return;
      if (e.key === 'ArrowRight') go(page + 1);
      if (e.key === 'ArrowLeft') go(page - 1);
      if (e.key === 'Escape') close();
      e.stopPropagation();
    }, true);
  }
  function go(i) {
    const n = Math.max(0, Math.min(PAGES.length - 1, i));
    const dir = n > page ? 'next' : 'prev';
    page = n;
    const P = PAGES[page];
    $('gImg').innerHTML = P.img();
    $('gT').textContent = P.t;
    $('gP').innerHTML = P.p;
    $('gN').textContent = `${page + 1} / ${PAGES.length}`;
    $('gPrev').disabled = page === 0;
    $('gNext').textContent = page === PAGES.length - 1 ? 'Jouer !' : '▶';
    const book = el.querySelector('.book');
    book.classList.remove('flip-next', 'flip-prev');
    void book.offsetWidth;
    book.classList.add('flip-' + dir);
  }
  function open(i = 0) {
    if (!el) build();
    el.classList.remove('hidden');
    page = -1;
    go(i);
  }
  function close() {
    if (el) el.classList.add('hidden');
    try { localStorage.setItem(LS, '1'); } catch (e) { }
  }
  function firstTime() {
    let seen = false;
    try { seen = !!localStorage.getItem(LS); } catch (e) { }
    if (!seen) open();
  }
  return { open, close, firstTime, pages: PAGES.length };
})();
