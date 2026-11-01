'use strict';
// Vie du bac : comportements des crevettes (territoire, chasse, fuite, danse nuptiale, banc, cachette de mue),
// escargots visibles et petites bulles d'événements (mue, ponte, naissance, nouveau phénotype, attaque).
// Branché sur Render : il reçoit les agents visuels et décide de leurs cibles ; il ne touche pas à la simulation.

const Life = (() => {
  let ctx = null;          // { agents, dims, surfY, scene, world, time }
  let labels = null;       // calque HTML des bulles
  const bubbles = [];
  let lastEv = new WeakMap();

  function attach(c) { ctx = c; }

  // ---------- Bulles d'événements ----------
  function ensureLayer() {
    if (labels) return labels;
    labels = document.createElement('div');
    labels.id = 'lifeLabels';
    document.body.appendChild(labels);
    return labels;
  }
  function bubble(id, text, kind = '') {
    ensureLayer();
    if (bubbles.length > 24) { bubbles[0].el.remove(); bubbles.shift(); }
    const el = document.createElement('div');
    el.className = 'lbub ' + kind;
    el.textContent = text;
    labels.appendChild(el);
    bubbles.push({ id, el, t0: ctx.time, life: kind === 'big' ? 4 : 2.6 });
  }
  function updateBubbles(project, show) {
    if (!labels) return;
    labels.style.display = show ? '' : 'none';
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i], a = ctx.agents.get(b.id), age = ctx.time - b.t0;
      if (age > b.life || !a) { b.el.remove(); bubbles.splice(i, 1); continue; }
      const p = project(a.x, a.y + 1.2 + age * .6, a.z);
      if (!p) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      b.el.style.transform = `translate(${p[0]}px, ${p[1]}px) translate(-50%, -100%)`;
      b.el.style.opacity = Math.min(1, (b.life - age) * 1.5);
    }
  }
  // Événements poussés par la simulation dans s._ev
  function events(s) {
    const ev = s._ev;
    if (!ev || !ev.length) return;
    const seen = lastEv.get(s) || 0;
    for (const e of ev) {
      if (e.seq <= seen) continue;
      if (e.k === 'molt') bubble(e.id, '✨ mue');
      else if (e.k === 'berried') bubble(e.id, '🥚 grainée !');
      else if (e.k === 'hatch') bubble(e.id, `🐣 +${e.n}`, 'big');
      else if (e.k === 'new') bubble(e.id, '🌟 nouveau !', 'big');
      else if (e.k === 'attack') { bubble(e.id, '💥', 'big'); strike(e.id, e.victim); }
      else if (e.k === 'mate') bubble(e.id, '💕');
    }
    lastEv.set(s, ev[ev.length - 1].seq);
  }

  // ---------- Comportements ----------
  const G = sh => GENERA[sh.genus] || GENERA.neo;
  let mating = null;     // { id, genus, until }
  const schools = {};    // genre -> point de rassemblement
  function onMolt(s, sh, a) {
    // une femelle adulte vient de muer : les mâles la cherchent (nage nuptiale)
    if (sh.sex === 'F' && Sim.isMature(sh) && !sh.berried) {
      mating = { id: sh.id, genus: sh.genus, until: ctx.time + 25 };
      bubble(sh.id, '💕');
      for (const [id, o] of ctx.agents) {
        const m = o.sh;
        if (!m || m.sex !== 'M' || m.genus !== sh.genus || !Sim.isMature(m) || Math.random() < .3) continue;
        o.mode = 'swim'; o.rush = 1.8; o.tx = a.x + (Math.random() - .5) * 3; o.tz = a.z + (Math.random() - .5) * 3; o.ty = a.y + Math.random() * 2;
      }
    }
  }
  function nearestPrey(a, sh, range) {
    let best = null, bd = range;
    for (const [, o] of ctx.agents) {
      const v = o.sh;
      if (!v || o === a || G(v).predator || v.size > sh.size * .6) continue;
      const d = Math.hypot(o.x - a.x, o.z - a.z, o.y - a.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  function flee(o, from, cm) {
    const dx = o.x - from.x, dz = o.z - from.z, d = Math.hypot(dx, dz) || 1;
    let x = o.x + dx / d * (6 + Math.random() * 6), z = o.z + dz / d * (6 + Math.random() * 6);
    if (!ctx.dims.inside(x, z)) [x, z] = ctx.dims.rand();
    o.mode = 'swim'; o.rush = 2.6; o.tx = x; o.tz = z; o.ty = ctx.surfY(x, z) + cm * .17 + 1 + Math.random() * 3; o.perch = false; o.food = null;
    o.flip = .35;   // coup de queue : bascule rapide vers l'arrière
  }
  function strike(id, victimId) {
    const a = ctx.agents.get(id), v = ctx.agents.get(victimId);
    if (!a) return;
    if (v) { a.mode = 'swim'; a.rush = 2.2; a.tx = v.x; a.tz = v.z; a.ty = v.y; }
  }
  // Appelé à chaque frame pour chaque crevette ; renvoie true si le comportement a pris la main sur la cible
  function think(a, sh, dt) {
    const g = G(sh), cm = sh.size / 10;
    a.sh = sh;
    if (a.flip) a.flip = Math.max(0, a.flip - dt);
    if (a.rush) a.rush = Math.max(0, a.rush - dt * .5);
    // territoire : un grand individu garde sa zone et charge les intrus
    if (g.territorial && Sim.isMature(sh)) {
      if (!a.home) a.home = [a.x, a.z];
      a.cool = (a.cool || 0) - dt;
      if (a.cool <= 0) {
        a.cool = 1.5 + Math.random() * 2;
        const v = nearestPrey(a, sh, cm * 3.5);
        if (v) {
          a.mode = 'walk'; a.rush = 2; a.tx = v.x; a.tz = v.z; a.ty = v.y; a.chase = v;
          flee(v, a, v.sh ? v.sh.size / 10 : 1);
          return true;
        }
        if (a.mode === 'graze' && Math.hypot(a.x - a.home[0], a.z - a.home[1]) > cm * 4) {
          a.mode = 'walk'; a.tx = a.home[0]; a.tz = a.home[1]; a.ty = ctx.surfY(a.tx, a.tz) + cm * .17;
          return true;
        }
      }
      return false;
    }
    // les petites crevettes fuient un prédateur qui s'approche
    if (a.mode !== 'swim' || !a.rush) {
      for (const [, o] of ctx.agents) {
        if (!o.sh || !G(o.sh).predator || o === a || sh.size > o.sh.size * .6) continue;
        if (Math.hypot(o.x - a.x, o.z - a.z) < o.sh.size / 10 * 2.2) { flee(a, o, cm); return true; }
      }
    }
    // nage nuptiale : les mâles tournent autour de la femelle qui vient de muer
    if (mating && ctx.time < mating.until && sh.sex === 'M' && sh.genus === mating.genus && a.mode === 'graze' && Math.random() < dt * .8) {
      const f = ctx.agents.get(mating.id);
      if (f) { a.mode = 'swim'; a.rush = 1.5; a.tx = f.x + (Math.random() - .5) * 4; a.tz = f.z + (Math.random() - .5) * 4; a.ty = f.y + Math.random() * 3; return true; }
    }
    return false;
  }
  // Choix d'une nouvelle cible (à la place du hasard) : banc, cachette de mue, algues
  function pick(a, sh) {
    const g = G(sh), cm = sh.size / 10, w = ctx.world;
    // juste avant la mue : se cacher dans les plantes ou le décor
    if (sh.molt < .4 && w.anchors.length && Math.random() < .7) {
      const an = w.anchors[(Math.random() * w.anchors.length) | 0];
      a.mode = 'swim'; a.tx = an.x + (Math.random() - .5); a.tz = an.z + (Math.random() - .5);
      a.ty = Math.min(ctx.dims.waterTop() - 1, an.y); a.perch = true;
      return true;
    }
    // banc : les Rhino nagent ensemble vers un point qui bouge
    if (g.school && Math.random() < .75) {
      let p = schools[sh.genus];
      if (!p || ctx.time > p.t) {
        const [x, z] = ctx.dims.rand();
        p = schools[sh.genus] = { x, z, y: ctx.surfY(x, z) + 2 + Math.random() * ctx.dims.H * .35, t: ctx.time + 6 + Math.random() * 6 };
      }
      a.mode = 'swim'; a.tx = p.x + (Math.random() - .5) * 4; a.tz = p.z + (Math.random() - .5) * 3; a.ty = p.y + (Math.random() - .5) * 2;
      return true;
    }
    // mangeuses d'algues : beaucoup de temps perchées sur le décor et les plantes
    if (g.algae && w.anchors.length && Math.random() < .45) {
      const an = w.anchors[(Math.random() * w.anchors.length) | 0];
      a.mode = 'walk'; a.tx = an.x + (Math.random() - .5) * 2; a.tz = an.z + (Math.random() - .5) * 2;
      a.ty = Math.min(ctx.dims.waterTop() - 1, an.y + Math.random()); a.perch = true;
      return true;
    }
    return false;
  }

  // ---------- Escargots visibles ----------
  const MAX_SN = 90;
  let snMesh = null, snBody = null, snAgents = [];
  function snailGeometry() {
    // coquille en spirale : trois blocs qui rétrécissent, posés sur un pied plat
    const parts = [];
    const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); parts.push(b); };
    box(1, 1, 1, 0, .75, 0); box(.7, .7, .8, -.35, 1.25, 0); box(.4, .4, .5, -.55, 1.55, 0);
    return mergeGeos(parts);
  }
  function bodyGeometry() {
    const parts = [];
    const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); parts.push(b); };
    box(1.7, .3, .6, .15, .15, 0); box(.08, .4, .08, 1, .45, .18); box(.08, .4, .08, 1, .45, -.18);
    return mergeGeos(parts);
  }
  function mergeGeos(list) {
    const P = [], N = [], I = [];
    for (const g of list) {
      const base = P.length / 3;
      const p = g.attributes.position.array, n = g.attributes.normal.array, idx = g.index.array;
      for (let i = 0; i < p.length; i++) P.push(p[i]);
      for (let i = 0; i < n.length; i++) N.push(n[i]);
      for (let i = 0; i < idx.length; i++) I.push(idx[i] + base);
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    out.setIndex(I);
    return out;
  }
  function buildSnails() {
    snMesh = new THREE.InstancedMesh(snailGeometry(), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_SN);
    snBody = new THREE.InstancedMesh(bodyGeometry(), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_SN);
    for (const m of [snMesh, snBody]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ctx.scene.add(m); }
    snAgents = [];
  }
  const UP = new THREE.Vector3(0, 1, 0), tq2 = new THREE.Quaternion();
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), te = new THREE.Euler(0, 0, 0, 'YXZ'), tv = new THREE.Vector3(), ts = new THREE.Vector3(), tc = new THREE.Color();
  function newSnail(k) {
    const d = SNAILS[k], aq = ctx.world.aq;
    if (d.glass && aq && Math.random() < .7) {
      const side = Math.random() < .5 ? 1 : -1;
      return { k, glass: side, x: (Math.random() - .5) * (ctx.dims.L - 3), y: 3 + Math.random() * ctx.dims.H * .5, z: side * (ctx.dims.W / 2 - .15), a: Math.random() * 6, ph: Math.random() * 10 };
    }
    const [x, z] = ctx.dims.rand();
    return { k, glass: 0, x, z, y: 0, a: Math.random() * 6, ph: Math.random() * 10 };
  }
  function updateSnails(s, dt, night) {
    if (!snMesh) return;
    const want = [];
    for (const k in s.snails || {}) for (let i = 0; i < Math.min(30, Math.floor(s.snails[k])); i++) want.push(k);
    // garde les escargots existants, ajoute ou retire selon la population
    const byK = {};
    for (const sa of snAgents) (byK[sa.k] || (byK[sa.k] = [])).push(sa);
    const next = [];
    for (const k of want) { const l = byK[k]; next.push(l && l.length ? l.shift() : newSnail(k)); }
    snAgents = next.slice(0, MAX_SN);
    const top = ctx.dims.waterTop(), foods = ctx.world.food ? ctx.world.food.filter(f => f.landed) : [];
    let i = 0;
    for (const sa of snAgents) {
      const d = SNAILS[sa.k], sc = d.size;
      const sp = .25 * dt * (d.hunt ? 1.6 : 1);
      if (sa.glass) {
        sa.a += Math.sin(ctx.time * .3 + sa.ph) * dt * .4;
        sa.x += Math.cos(sa.a) * sp; sa.y += Math.sin(sa.a) * sp;
        if (Math.abs(sa.x) > ctx.dims.L / 2 - 1.5 || sa.y < 3 || sa.y > top - 1) sa.a += Math.PI;
        // collé à la vitre : le « haut » de l'escargot pointe vers l'intérieur du bac
        tq.setFromUnitVectors(UP, tv.set(0, 0, -sa.glass)).multiply(tq2.setFromAxisAngle(UP, sa.a));
        tv.set(sa.x, sa.y, sa.z);
      } else {
        // vers la nourriture tombée (planorbes, ampullaires) sinon promenade
        if (d.eat.food && foods.length && !sa.goal) { const f = foods[(Math.random() * foods.length) | 0]; sa.goal = [f.x, f.z]; }
        if (sa.goal) { sa.a = Math.atan2(-(sa.goal[1] - sa.z), sa.goal[0] - sa.x); if (Math.hypot(sa.goal[0] - sa.x, sa.goal[1] - sa.z) < 1) sa.goal = null; }
        else sa.a += Math.sin(ctx.time * .25 + sa.ph) * dt * .5;
        sa.x += Math.cos(sa.a) * sp; sa.z -= Math.sin(sa.a) * sp;
        if (!ctx.dims.inside(sa.x, sa.z)) { sa.a += Math.PI; sa.goal = null; }
        const sink = d.burrow && !night ? sc * 1.3 : 0;   // les mélanoïdes s'enterrent le jour
        te.set(0, sa.a, 0, 'YXZ'); tq.setFromEuler(te);
        tv.set(sa.x, ctx.surfY(sa.x, sa.z) - sink, sa.z);
      }
      const k = sc * .55;
      tm.compose(tv, tq, ts.set(k, k, k));
      snMesh.setMatrixAt(i, tm); snBody.setMatrixAt(i, tm);
      const c = d.color, st = d.stripe;
      tc.setRGB(c[0], c[1], c[2]);
      if (st && (i % 2)) tc.lerp(new THREE.Color(st[0], st[1], st[2]), .35);
      snMesh.setColorAt(i, tc);
      snBody.setColorAt(i, tc.setRGB(.55, .5, .42));
      i++;
    }
    snMesh.count = snBody.count = i;
    snMesh.instanceMatrix.needsUpdate = snBody.instanceMatrix.needsUpdate = true;
    if (snMesh.instanceColor) snMesh.instanceColor.needsUpdate = true;
    if (snBody.instanceColor) snBody.instanceColor.needsUpdate = true;
  }
  function reset() { mating = null; for (const k in schools) delete schools[k]; lastEv = new WeakMap(); for (const b of bubbles) b.el.remove(); bubbles.length = 0; }

  return { attach, think, pick, onMolt, events, updateBubbles, buildSnails, updateSnails, reset, bubble };
})();
