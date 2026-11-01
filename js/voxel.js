'use strict';
// Crevette en voxels : la forme est voxelisée à partir d'un profil, la couleur de chaque voxel vient des gènes.

const Voxel = (() => {
  const prof = [[0, .045], [.1, .06], [.3, .088], [.55, .112], [.72, .125], [.88, .1], [1, .04]];
  const rad = u => {
    if (u <= 0) return prof[0][1];
    for (let i = 1; i < prof.length; i++) if (u <= prof[i][0]) {
      const a = prof[i - 1], b = prof[i];
      return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]);
    }
    return .04;
  };
  const cy = u => .06 * Math.sin(Math.PI * u) - (u < .3 ? (.3 - u) * .25 : 0);
  const SEG = [.14, .215, .29, .365, .44, .515, .585]; // sillons entre les segments de l'abdomen
  const groove = u => { let f = 1; for (const s of SEG) f -= .09 * Math.exp(-(((u - s) / .012) ** 2)); return f; };
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function hash(a, b, c) { const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return x - Math.floor(x); }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  const WHITE = [.95, .94, .9], CLEAR = [.78, .84, .84], EYE = [.22, .03, .05], EGG = [.62, .45, .14], SADDLE = [1, .82, .25];

  // ---------- Couleur d'un voxel ----------
  function colorOf(a, o) {
    const g = o.g, ex = o.express ?? 1, seed = o.seed || 1;
    if (o.ghost) {
      if (a.part === 1) return [[.7, .72, .72], .35];
      return [mix(CLEAR, WHITE, .45), .3];
    }
    if (a.part === 1) return [a.hl ? [.75, .55, .55] : EYE, 1];
    if (a.part === 3) return [mix(EGG, [.3, .2, .05], hash(a.i, a.j, a.k) * .4), 1];
    const base = Gen.color(g);
    let d = g.dens * ex;
    const bands = sst(.15, .5, g.bands);
    if (a.part === 2 || a.part === 6) {
      // pattes et antennes : anneaux blancs si le gène « bandes » est fort
      if (a.part === 2 && bands > .3 && Math.floor(a.t * 5 + seed % 2) % 2 === 0) return [mix(CLEAR, WHITE, Math.max(.4, g.dens) * ex), .4 + .6 * ex];
      const dd = d * (a.part === 6 ? .65 : .85);
      return [mix(CLEAR, base, dd), .35 + .65 * dd];
    }
    // corps
    const u = a.u, v = a.v;
    let W = 0;
    if (bands > 0) {
      const n = (hash(a.i >> 1, a.k >> 1, seed) - .5) * 1.1 + Math.sin(v * 3 + seed) * .5;
      const wave = Math.sin(u * Math.PI * 2 * 4.3 + seed * .37 + n) * .5 + .5;
      if (wave > 1 - g.bands * .62) W = bands;
      if (u > .9 && g.bands > .3 && hash(a.i, a.j, a.k + seed) < .78) W = bands;   // tête blanche
      if (u < .09 && g.bands > .3) W = bands;                                        // queue blanche
    }
    if (sst(.25, .6, g.stripe) > 0 && v < .14 && u > .12 && u < .93) W = Math.max(W, sst(.25, .6, g.stripe));
    if (g.spots > .15 && hash(a.i, a.j * 1.3, a.k + seed * 2) < g.spots * .4) W = Math.max(W, sst(.15, .5, g.spots));
    if (g.rili > .15 && u > .28 && u < .58) d *= 1 - sst(.15, .5, g.rili) * .9;
    let col = mix(CLEAR, base, d);
    let alpha = .3 + .7 * d;
    if (W > .5) { col = mix(CLEAR, WHITE, Math.max(.45, g.dens) * ex); alpha = Math.max(alpha, .4 + .6 * ex); }
    if (o.saddle && ((u - .75) / .09) ** 2 + (a.z / .055) ** 2 < 1 && v < .5) col = mix(col, SADDLE, .6);
    const sh = 1 + (hash(a.i, a.j, a.k) - .5) * .06;
    return [[col[0] * sh, col[1] * sh, col[2] * sh], alpha];
  }

  // ---------- Voxelisation ----------
  function build(o) {
    const N = o.res || 56, vs = 1 / N;
    const vox = new Map();
    const key = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
    const put = (i, j, k, a, force) => { const kk = key(i, j, k); if (!force && vox.has(kk)) return; vox.set(kk, Object.assign({ i, j, k }, a)); };
    const at = (x, y, z, a, force) => put(Math.floor(x / vs), Math.floor(y / vs), Math.floor(z / vs), Object.assign({ z }, a), force);
    const slim = o.sex === 'M' ? .88 : 1, belly = o.sex === 'F' ? 1.18 : 1;
    const eyeS = o.eyeScale || 1, ant = o.antenna ?? 1;

    // corps
    for (let i = Math.floor(-.01 * N); i <= Math.ceil(N); i++) {
      const u = (i + .5) / N;
      const r = rad(u) * slim * groove(u), c = cy(u);
      for (let j = Math.floor((c - r * 1.35) / vs); j <= Math.ceil((c + r) / vs); j++) {
        const y = (j + .5) * vs, dy = y - c, ry = dy < 0 && u < .62 ? r * belly : r;
        for (let k = Math.floor(-r / vs) - 1; k <= Math.ceil(r / vs); k++) {
          const z = (k + .5) * vs;
          if ((dy / ry) ** 2 + (z / (r * .75)) ** 2 <= 1) put(i, j, k, { u, v: Math.acos(clamp(dy / ry, -1, 1)) / Math.PI, part: 0, t: 0, z });
        }
      }
    }
    // éventail caudal (telson + uropodes)
    const c0 = cy(0) - .01;
    for (let u = -.11; u < .04; u += vs * .5) {
      const hw = .03 + (.04 - u) * .75;
      for (let z = -hw; z <= hw; z += vs * .5) {
        if (u < -.07 && ((Math.abs(z) / hw) * 2.5 % 1) < .16) continue;
        const y = c0 - (.04 - u) * .25;
        const a = { u: Math.max(0, u), v: .4, part: 0, t: 0 };
        at(u, y, z, a);
        if (Math.abs(z) < hw * .8) at(u, y + vs, z, a);
      }
    }
    // segments 3D
    const line = (pts, part, thick = 1) => {
      let total = 0;
      for (let s = 1; s < pts.length; s++) total += Math.hypot(pts[s][0] - pts[s - 1][0], pts[s][1] - pts[s - 1][1], pts[s][2] - pts[s - 1][2]);
      let acc = 0;
      for (let s = 1; s < pts.length; s++) {
        const p = pts[s - 1], q = pts[s];
        const L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), n = Math.max(1, Math.ceil(L / (vs * .4)));
        for (let m = 0; m <= n; m++) {
          const f = m / n, x = p[0] + (q[0] - p[0]) * f, y = p[1] + (q[1] - p[1]) * f, z = p[2] + (q[2] - p[2]) * f;
          const a = { u: x, v: 1, part, t: (acc + L * f) / total };
          at(x, y, z, a);
          if (thick > 1 && (acc + L * f) / total < .5) at(x, y + vs, z, a);
        }
        acc += L;
      }
    };
    const ch = cy(.95);
    // rostre
    line([[.93, ch + .03, 0], [1.13, ch + .065, 0]], 2);
    for (const s of [-1, 1]) {
      // yeux pédonculés
      const ec = [.93, cy(.93) + .045, s * .072 * Math.max(1, eyeS * .9)], er = .027 * eyeS;
      line([[.89, cy(.9) + .02, s * .03], ec], 2);
      for (let x = ec[0] - er; x <= ec[0] + er; x += vs * .5)
        for (let y = ec[1] - er; y <= ec[1] + er; y += vs * .5)
          for (let z = ec[2] - er; z <= ec[2] + er; z += vs * .5)
            if ((x - ec[0]) ** 2 + (y - ec[1]) ** 2 + (z - ec[2]) ** 2 <= er * er)
              at(x, y, z, { u: .93, v: 0, part: 1, t: 0, hl: y > ec[1] + er * .35 && x > ec[0] + er * .1 }, true);
      // antennes : deux longues qui montent en courbe, deux courtes fourchues
      line([[.96, ch + .03, .025 * s], [1.05, ch + .14 * ant, .06 * s * ant], [1.1 + .1 * ant, ch + .32 * ant, .1 * s * ant], [1.18 + .22 * ant, ch + .45 * ant, .15 * s * ant], [1.2 + .45 * ant, ch + .55 * ant, .22 * s * ant]], 6);
      line([[.97, ch + .02, .02 * s], [1.08, ch + .06, .04 * s], [1.17, ch + .04, .08 * s]], 6);
      // maxillipèdes
      line([[.94, ch - .05, .02 * s], [1.04, ch - .09, .04 * s], [1.08, ch - .07, .05 * s]], 2);
      // pattes marcheuses
      for (let k = 0; k < 5; k++) {
        const u = .63 + k * .065, r = rad(u) * slim, c = cy(u);
        const p0 = [u, c - r * .7, s * r * .45];
        const front = k === 4;
        // genou haut et écarté, pied loin du corps : silhouette « araignée »
        const p1 = front ? [u + .05, c - r - .02, s * (r * .45 + .06)] : [u + .015 * (k - 2), c - r * .45 + .02, s * (r * .45 + .16)];
        const p2 = front ? [u + .11, c - r - .06, s * (r * .45 + .05)] : [p1[0] + .04 * (k - 2), -.17, p1[2] + s * .09];
        line([p0, p1, p2], 2);
      }
      // pléopodes
      for (let k = 0; k < 5; k++) {
        const u = .2 + k * .08, r = rad(u) * slim, c = cy(u);
        const len = o.sex === 'F' ? .07 : .045;
        line([[u, c - r * belly * .9, s * .03], [u - .025, c - r * belly - len, s * .045]], 2);
      }
    }
    // œufs sous l'abdomen
    if (o.eggs) {
      for (let e = 0; e < 26; e++) {
        const u = .2 + hash(e, 1, 3) * .32, r = rad(u) * belly;
        const ec = [u, cy(u) - r - .025 - hash(e, 2, 3) * .035, (hash(e, 3, 3) - .5) * .12], er = .022;
        for (let x = ec[0] - er; x <= ec[0] + er; x += vs * .5)
          for (let y = ec[1] - er; y <= ec[1] + er; y += vs * .5)
            for (let z = ec[2] - er; z <= ec[2] + er; z += vs * .5)
              if ((x - ec[0]) ** 2 + (y - ec[1]) ** 2 + (z - ec[2]) ** 2 <= er * er) at(x, y, z, { u, v: 1, part: 3, t: 0 }, true);
      }
    }
    return mesh(vox, vs, a => colorOf(a, o), -.5);
  }

  // Œuf : coque translucide + embryon recroquevillé avec ses yeux
  function egg(o) {
    const N = 40, vs = 1 / N, R = .42;
    const shell = new Map(), emb = new Map();
    const key = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
    for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) for (let k = -20; k <= 20; k++) {
      const x = (i + .5) * vs, y = (j + .5) * vs, z = (k + .5) * vs;
      const d = Math.hypot(x / R, y / (R * .82), z / (R * .82));
      if (d <= 1 && d > .86) shell.set(key(i, j, k), { i, j, k });
      // embryon : un arc épais avec deux yeux
      const ang = Math.atan2(y, x), rr = Math.hypot(x, y);
      if (d < .8 && Math.abs(rr - .2) < .07 && ang > -2.4 && ang < 1.9 && Math.abs(z) < .09 - Math.abs(rr - .2) * .5)
        emb.set(key(i, j, k), { i, j, k, eye: false, ang });
      if (Math.hypot(x - .15, y - .17, Math.abs(z) - .06) < .045) emb.set(key(i, j, k), { i, j, k, eye: true });
    }
    const base = Gen.color(o.g);
    const g1 = mesh(shell, vs, a => [mix([.85, .7, .3], [.95, .85, .5], hash(a.i, a.j, a.k) * .3), .45], 0);
    const g2 = mesh(emb, vs, a => a.eye ? [EYE, 1] : [mix(mix(CLEAR, base, .35), [.9, .6, .2], .4), 1], 0);
    return [g1, g2];
  }

  // Génère les faces visibles des voxels (couleur RGBA par sommet)
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const FACE = {
    '1,0,0': [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], '-1,0,0': [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
    '0,1,0': [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], '0,-1,0': [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    '0,0,1': [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], '0,0,-1': [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
  };
  function mesh(vox, vs, colorFn, offX) {
    const P = [], Nn = [], C = [], I = [];
    const key = (i, j, k) => ((i + 512) * 1024 + (j + 512)) * 1024 + (k + 512);
    for (const a of vox.values()) {
      const [col, alpha] = colorFn(a);
      for (const d of DIRS) {
        if (vox.has(key(a.i + d[0], a.j + d[1], a.k + d[2]))) continue;
        const base = P.length / 3;
        for (const c of FACE[d.join()]) {
          P.push((a.i + c[0]) * vs + offX, (a.j + c[1]) * vs, (a.k + c[2]) * vs);
          Nn.push(d[0], d[1], d[2]);
          C.push(col[0], col[1], col[2], alpha);
        }
        I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
    g.setIndex(I);
    g.computeBoundingBox();
    return g;
  }

  return { build, egg, colorOf };
})();
