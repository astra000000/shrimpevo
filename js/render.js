'use strict';
// Rendu 3D basse résolution (Three.js r149) : la scène est rendue dans un petit buffer puis agrandie sans lissage.

const Render = (() => {
  let renderer, scene, camera, canvas;
  let pixelScale = 3;
  let world = null;        // objets de la scène courante
  let dims = null;         // dimensions du bac
  const agents = new Map(); // id crevette -> état visuel
  let fishAgents = [], planAgents = [], hydraSpots = [];
  let time = 0;
  let selectedId = null, follow = false;
  let onPick = null;
  const cam = { yaw: .5, pitch: .25, dist: 80, target: new THREE.Vector3() };
  const MAX_SHRIMP = 1600, MAX_FISH = 40, MAX_PLAN = 200, MAX_HYDRA = 150;
  // Niveau de détail : les crevettes proches de la caméra passent en modèle voxel
  const VOX_MAX = 24, VOX_NEAR = 40, VOX_BUILDS = 2;
  const voxCache = new Map(); // "id|stade" -> géométrie (ordre = LRU)
  let voxMat = null, voxPool = [], portraitR = null;

  // ---------- RNG déterministe ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---------- Géométries ----------
  function shrimpGeometry() {
    const P = [], N = [], I = [], idx = [];
    const add = (x, y, z, nx, ny, nz, u, v, part) => {
      P.push(x, y, z);
      const l = Math.hypot(nx, ny, nz) || 1;
      N.push(nx / l, ny / l, nz / l);
      I.push(u, v, part);
      return P.length / 3 - 1;
    };
    const prof = [[0, .04], [.1, .06], [.3, .085], [.55, .11], [.75, .12], [.9, .09], [1, .03]];
    const rad = u => {
      for (let i = 1; i < prof.length; i++) if (u <= prof[i][0]) {
        const a = prof[i - 1], b = prof[i], t = (u - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * t;
      }
      return .03;
    };
    const cy = u => .06 * Math.sin(Math.PI * u) - (u < .3 ? (.3 - u) * .25 : 0);
    // corps
    const NU = 20, NV = 10;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, r = rad(u), c = cy(u);
      for (let j = 0; j < NV; j++) {
        const th = j / NV * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
        const v = th <= Math.PI ? th / Math.PI : (Math.PI * 2 - th) / Math.PI;
        add(u - .5, c + r * ct, r * .72 * st, 0, ct, st / .72, u, v, 0);
      }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = i * NV + j, b = i * NV + (j + 1) % NV, c = (i + 1) * NV + j, d = (i + 1) * NV + (j + 1) % NV;
      idx.push(a, b, c, b, d, c);
    }
    // éventail caudal
    {
      const c0 = cy(0), o = add(-.49, c0, 0, 0, 1, 0, .02, .5, 0);
      let prev = null;
      for (let k = 0; k <= 6; k++) {
        const a = (-70 + k * 140 / 6) * Math.PI / 180;
        const p = add(-.49 - .2 * Math.cos(a), c0 - .02, .2 * Math.sin(a), 0, 1, 0, .02, .5, 0);
        if (prev !== null) idx.push(o, prev, p);
        prev = p;
      }
    }
    // rostre
    {
      const c = cy(.97);
      const a = add(.45, c + .035, 0, 0, 0, 1, 1, 0, 0), b = add(.45, c - .01, 0, 0, 0, 1, 1, 0, 0), t = add(.63, c + .06, 0, 0, 0, 1, 1, 0, 0);
      idx.push(a, b, t);
    }
    // yeux
    const sphere = (cx, cy0, cz, r, part, u, v) => {
      const start = P.length / 3, S = 6, R = 4;
      for (let i = 0; i <= R; i++) for (let j = 0; j <= S; j++) {
        const th = i / R * Math.PI, ph = j / S * Math.PI * 2;
        const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
        add(cx + nx * r, cy0 + ny * r, cz + nz * r, nx, ny, nz, u, v, part);
      }
      for (let i = 0; i < R; i++) for (let j = 0; j < S; j++) {
        const a = start + i * (S + 1) + j, b = a + 1, c = a + S + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    };
    for (const z of [-.055, .055]) sphere(.42, cy(.92) + .035, z, .028, 1, .92, .3);
    // appendices fins (antennes, pattes)
    const strip = (pts, w, nrm, part, u, v) => {
      let pa = null, pb = null;
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k], q = pts[Math.min(k + 1, pts.length - 1)], o = pts[Math.max(k - 1, 0)];
        const dx = q[0] - o[0], dy = q[1] - o[1], dz = q[2] - o[2];
        // côté perpendiculaire à la direction et à la normale
        let sx = dy * nrm[2] - dz * nrm[1], sy = dz * nrm[0] - dx * nrm[2], sz = dx * nrm[1] - dy * nrm[0];
        const l = Math.hypot(sx, sy, sz) || 1, ww = w * (1 - k / pts.length * .6);
        sx *= ww / l; sy *= ww / l; sz *= ww / l;
        const a = add(p[0] + sx, p[1] + sy, p[2] + sz, ...nrm, u, v, part), b = add(p[0] - sx, p[1] - sy, p[2] - sz, ...nrm, u, v, part);
        if (pa !== null) idx.push(pa, pb, a, pb, b, a);
        pa = a; pb = b;
      }
    };
    const ch = cy(.95);
    for (const sgn of [-1, 1]) {
      strip([[.45, ch + .02, .02 * sgn], [.8, ch + .14, .12 * sgn], [1.1, ch + .2, .25 * sgn], [1.35, ch + .18, .38 * sgn]], .012, [0, 1, 0], 2, .95, .3);
      strip([[.47, ch + .03, .02 * sgn], [.62, ch + .09, .05 * sgn], [.76, ch + .1, .09 * sgn]], .01, [0, 1, 0], 2, .95, .3);
      for (let k = 0; k < 5; k++) {
        const u = .58 + k * .07, r = rad(u), c = cy(u), x = u - .5;
        strip([[x, c - r * .7, r * .5 * sgn], [x + .03, c - r - .06, (r * .5 + .07) * sgn], [x + .05, c - r - .14, (r * .5 + .11) * sgn]], .012, [0, 0, sgn], 2, u, 1);
      }
      for (let k = 0; k < 4; k++) {
        const u = .22 + k * .08, r = rad(u), c = cy(u), x = u - .5;
        strip([[x, c - r * .8, r * .4 * sgn], [x - .02, c - r - .05, r * .5 * sgn]], .018, [0, 0, sgn], 2, u, 1);
      }
    }
    // œufs
    const er = rng(7);
    for (let k = 0; k < 12; k++) {
      const u = .3 + er() * .22, r = rad(u);
      sphere(u - .5, cy(u) - r - .015, (er() - .5) * .08, .03, 3, u, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(I, 3));
    g.setIndex(idx);
    return g;
  }

  // Fusion simple de géométries (non indexées) avec transformation
  function merge(list) {
    const P = [], N = [];
    for (const [geo, m] of list) {
      const g = (geo.index ? geo.toNonIndexed() : geo.clone());
      if (m) g.applyMatrix4(m);
      P.push(...g.attributes.position.array);
      N.push(...g.attributes.normal.array);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    return g;
  }
  const M4 = () => new THREE.Matrix4();
  function fishGeometry() {
    const body = new THREE.SphereGeometry(1, 8, 6);
    const tail = new THREE.ConeGeometry(.35, .6, 4);
    return merge([
      [body, M4().makeScale(.5, .17, .09)],
      [tail, M4().makeRotationZ(Math.PI / 2).premultiply(M4().makeScale(1, 1, .25)).premultiply(M4().makeTranslation(-.62, 0, 0))],
    ]);
  }
  function hydraGeometry() {
    const parts = [[new THREE.CylinderGeometry(.03, .05, .5, 4), M4().makeTranslation(0, .25, 0)]];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2;
      const m = M4().makeTranslation(0, .25, 0)
        .premultiply(M4().makeRotationZ(.9)).premultiply(M4().makeRotationY(a)).premultiply(M4().makeTranslation(0, .5, 0));
      parts.push([new THREE.CylinderGeometry(.006, .012, .5, 3), m]);
    }
    return merge(parts);
  }

  // ---------- Shader crevettes ----------
  const shrimpVS = `
    attribute vec3 aInfo;
    attribute vec3 iColor;
    attribute vec4 iPat;
    attribute vec4 iMisc;
    attribute vec2 iAnim;
    uniform float uTime;
    varying vec3 vN; varying vec3 vInfo; varying vec3 vColor; varying vec4 vPat; varying vec4 vMisc; varying float vDepth;
    void main() {
      vec3 p = position;
      float u = aInfo.x, part = aInfo.z;
      if (part > 2.5 && iMisc.y < .5) p = vec3(-.05, 0., 0.);
      float sw = iAnim.y;
      float bend = sin(uTime * (3. + sw * 14.) + iAnim.x) * (.03 + sw * .22) * (1. - u) * (1. - u);
      p.y += bend * .4;
      if (part > 1.5 && part < 2.5) {
        p.z += sin(uTime * 9. + iAnim.x + u * 25.) * .012 * (1. - sw);
        if (u > .9) p.y += sin(uTime * 2.3 + iAnim.x + p.x * 4.) * .03 * (p.x - .4);
      }
      vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.);
      vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
      vInfo = aInfo; vColor = iColor; vPat = iPat; vMisc = iMisc;
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const shrimpFS = `
    uniform vec3 uWater; uniform vec3 uLightDir; uniform vec3 uLightCol; uniform vec3 uAmb;
    uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
    varying vec3 vN; varying vec3 vInfo; varying vec3 vColor; varying vec4 vPat; varying vec4 vMisc; varying float vDepth;
    float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
    void main() {
      float u = vInfo.x, v = vInfo.y, part = vInfo.z;
      float expr = vMisc.z;
      float dens = vMisc.x * expr;
      float white = 0.;
      float st = smoothstep(.25, .6, vPat.x);
      white = max(white, st * (1. - smoothstep(.07, .14, v)) * step(.12, u) * step(u, .93));
      float bd = smoothstep(.15, .5, vPat.y);
      float wave = sin(u * 18.85 + 1.2) * .5 + .5;
      white = max(white, bd * step(1. - vPat.y * 1.3, wave) * step(.08, u));
      float sp = smoothstep(.15, .5, vPat.z);
      float h = hash(vec3(floor(u * 24.), floor(v * 9.), vMisc.w));
      white = max(white, sp * step(1. - vPat.z * .45, h) * step(v, .8));
      float rl = smoothstep(.15, .5, vPat.w) * (smoothstep(.24, .3, u) - smoothstep(.56, .62, u));
      float d = dens * (1. - rl * .92);
      vec3 alb = mix(uWater, vColor, d);
      alb = mix(alb, vec3(.95, .95, .92), white * max(.45, vMisc.x) * expr);
      if (part > .5 && part < 1.5) alb = vec3(.03);
      else if (part > 1.5 && part < 2.5) alb = mix(uWater, vColor, d * .55);
      else if (part > 2.5) alb = mix(vec3(.9, .78, .2), vColor, .3);
      float ndl = max(dot(normalize(vN), uLightDir), 0.);
      ndl = floor(ndl * 4. + .5) / 4.;
      vec3 col = alb * (uAmb + uLightCol * ndl);
      col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth) * .6);
      gl_FragColor = vec4(col, 1.);
    }`;

  // ---------- Init ----------
  function init(cv, pickCb) {
    canvas = cv;
    onPick = pickCb;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    camera = new THREE.PerspectiveCamera(45, 1, .5, 2000);
    bindControls();
    window.addEventListener('resize', resize);
    resize();
  }
  function setPixelScale(p) { pixelScale = p; resize(); }
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(Math.max(1, Math.ceil(w / pixelScale)), Math.max(1, Math.ceil(h / pixelScale)), false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ---------- Construction de la scène ----------
  let curTank = null;
  function build(s) {
    if (world) disposeScene();
    scene = new THREE.Scene();
    curTank = s;
    if (!s) { scene.background = new THREE.Color(0x0d1117); dims = null; return; }
    agents.clear(); fishAgents = []; planAgents = []; hydraSpots = [];
    const R = rng(s.seed || 1);
    const aq = s.env === 'aquarium';
    const vol = s.cfg.volume;
    const sub = SUBSTRATES[s.cfg.substrate];
    world = { aq, R, plants: {}, anchors: [], moss: [], equip: {}, fx: fxUniforms(), exu: [] };

    if (aq) {
      const L = Math.cbrt(vol * 1000 / .3), W = L * .5, H = L * .6;
      dims = { L, W, H, aq: true };
      dims.surf = (x, z) => 2.5 + 3 * ((z + W / 2) / W) + .6 * Math.sin(x * .3) * Math.cos(z * .4);
      dims.inside = (x, z) => Math.abs(x) < L / 2 - 1 && Math.abs(z) < W / 2 - 1;
      dims.rand = (r = Math.random) => [(r() - .5) * (L - 3), (r() - .5) * (W - 3)];
      dims.waterTop = () => H * .93 * s.w.level;
      scene.background = new THREE.Color(0x0d1117);
      world.fx.uFloor.value = 2.5; world.fx.uSpan.value = H * .85;
      buildAquarium(s, R, sub);
      cam.target.set(0, H * .4, 0); cam.dist = L * 1.5; cam.pitch = .18; cam.yaw = .35;
    } else {
      const D = 30 + vol / 50;
      const Rr = Math.sqrt(vol * 1000 / (Math.PI * D * .6));
      dims = { D, R: Rr, aq: false, L: Rr * 2, W: Rr * 2, H: D };
      dims.surf = (x, z) => { const r = Math.min(1, Math.hypot(x, z) / Rr); return 2 + D * .85 * r ** 3; };
      dims.inside = (x, z) => Math.hypot(x, z) < Rr * .9;
      dims.rand = (r = Math.random) => { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * Rr * .82; return [Math.cos(a) * d, Math.sin(a) * d]; };
      dims.waterTop = () => D * s.w.level;
      world.fx.uFloor.value = 2; world.fx.uSpan.value = D * .8;
      buildPond(s, R, sub);
      cam.target.set(0, D * .5, 0); cam.dist = Rr * 2.6; cam.pitch = .75; cam.yaw = .3;
    }

    // Lumières
    world.sun = new THREE.DirectionalLight(0xffffff, 1);
    world.sun.position.set(.3, 1, .5);
    world.amb = new THREE.AmbientLight(0x8899aa, .5);
    scene.add(world.sun, world.amb);
    scene.fog = new THREE.Fog(0x557766, 100, 400);

    // Rochers
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x6b6b66, flatShading: true });
    world.rockMat = causticMat(rockMat);
    const nRocks = aq ? 3 + (R() * 3 | 0) : 7;
    for (let i = 0; i < nRocks; i++) {
      const [x, z] = dims.rand(R);
      const r = (aq ? dims.L * .04 : dims.R * .07) * (.6 + R());
      const g = new THREE.DodecahedronGeometry(r, 0);
      const m = new THREE.Mesh(g, rockMat);
      m.scale.set(1, .6 + R() * .4, .8 + R() * .4);
      m.rotation.set(R(), R() * 6, R());
      m.position.set(x, dims.surf(x, z) + r * .2, z);
      scene.add(m);
      world.anchors.push({ x, y: dims.surf(x, z) + r * .7, z, r });
      world.moss.push({ x, z, y: dims.surf(x, z) + r * .5, r: r * 1.3 });
    }
    for (let i = 0; i < 4; i++) { const [x, z] = dims.rand(R); world.moss.push({ x, z, y: dims.surf(x, z), r: 3 }); }

    buildPlants(s, R);
    buildMotes();

    // Crevettes (un seul InstancedMesh)
    const sg = shrimpGeometry();
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHRIMP * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    sg.setAttribute('iColor', mk(3)); sg.setAttribute('iPat', mk(4)); sg.setAttribute('iMisc', mk(4)); sg.setAttribute('iAnim', mk(2));
    world.shrimpU = {
      uTime: { value: 0 }, uWater: { value: new THREE.Color(.55, .66, .62) },
      uLightDir: { value: new THREE.Vector3(.3, 1, .5).normalize() }, uLightCol: { value: new THREE.Color(1, 1, 1) },
      uAmb: { value: new THREE.Color(.45, .5, .55) }, uFogColor: { value: new THREE.Color(.3, .4, .4) },
      uFogNear: { value: 100 }, uFogFar: { value: 400 },
    };
    const smat = new THREE.ShaderMaterial({ vertexShader: shrimpVS, fragmentShader: shrimpFS, uniforms: world.shrimpU, side: THREE.DoubleSide });
    world.shrimp = new THREE.InstancedMesh(sg, smat, MAX_SHRIMP);
    world.shrimp.count = 0;
    world.shrimp.frustumCulled = false;
    world.shrimp.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(world.shrimp);
    if (!voxMat) voxMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });
    voxPool = [];
    for (let i = 0; i <= VOX_MAX; i++) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), animVoxMat());
      m.visible = false; m.frustumCulled = false; m.userData.vox = true;
      scene.add(m);
      voxPool.push(m);
    }

    // Prédateurs
    world.fish = new THREE.InstancedMesh(fishGeometry(), new THREE.MeshLambertMaterial({ color: 0xe0582c }), MAX_FISH);
    world.fish.count = 0; world.fish.frustumCulled = false;
    world.plan = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshLambertMaterial({ color: 0xe6dcc4 }), MAX_PLAN);
    world.plan.count = 0; world.plan.frustumCulled = false;
    world.hydra = new THREE.InstancedMesh(hydraGeometry(), new THREE.MeshLambertMaterial({ color: 0xbfdcae }), MAX_HYDRA);
    world.hydra.count = 0; world.hydra.frustumCulled = false;
    scene.add(world.fish, world.plan, world.hydra);
    for (let i = 0; i < MAX_HYDRA; i++) hydraSpots.push(hydraSpot(R));
    for (let i = 0; i < MAX_PLAN; i++) planAgents.push(newPlan());

    // Marqueur de sélection
    world.marker = new THREE.Mesh(new THREE.ConeGeometry(.5, 1, 4), new THREE.MeshBasicMaterial({ color: 0xffe14d, depthTest: false }));
    world.marker.rotation.x = Math.PI;
    world.marker.renderOrder = 10;
    world.marker.visible = false;
    scene.add(world.marker);
    buildFood();
  }

  // Sols mélangés (sable de Loire, galets…) : une couleur de grain au hasard
  const grainColor = (sub, R) => sub.mix ? sub.mix[(R() * sub.mix.length) | 0] : sub.color;
  function substrateMesh(sub, R, w, d, segX, segZ, heightFn, maskFn) {
    const g = new THREE.PlaneGeometry(w, d, segX, segZ);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, cols = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, heightFn(x, z));
      const c = grainColor(sub, R);
      const n = (R() - .5) * .18;
      cols.push(c[0] + n, c[1] + n * .9, c[2] + n * .8);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, causticMat(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  }

  function buildAquarium(s, R, sub) {
    const { L, W, H } = dims;
    // meuble
    const stand = new THREE.Mesh(new THREE.BoxGeometry(L + 8, 3, W + 6), new THREE.MeshLambertMaterial({ color: 0x3a2a1e }));
    stand.position.y = -1.6;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(L + 6, 60, W + 4), new THREE.MeshLambertMaterial({ color: 0x241a13 }));
    cab.position.y = -33;
    scene.add(stand, cab);
    // fond
    world.back = new THREE.Mesh(new THREE.PlaneGeometry(L, H), new THREE.MeshLambertMaterial({ color: 0x0e1a1c }));
    world.back.position.set(0, H / 2, -W / 2 - .05);
    scene.add(world.back);
    // verre
    const box = new THREE.BoxGeometry(L, H, W);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x9fd0d6 }));
    edges.position.y = H / 2;
    world.glass = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x9fd6d6, transparent: true, opacity: .05, depthWrite: false, side: THREE.DoubleSide }));
    world.glass.position.y = H / 2;
    scene.add(edges, world.glass);
    // sol + tranche avant visible à travers la vitre
    const sm = substrateMesh(sub, R, L, W, 40, 20, dims.surf);
    scene.add(sm);
    const fr = new THREE.BufferGeometry(), P = [], C = [];
    for (let i = 0; i < 40; i++) {
      const x0 = -L / 2 + i * L / 40, x1 = x0 + L / 40;
      const y0 = dims.surf(x0, W / 2), y1 = dims.surf(x1, W / 2);
      P.push(x0, 0, W / 2, x1, 0, W / 2, x1, y1, W / 2, x0, 0, W / 2, x1, y1, W / 2, x0, y0, W / 2);
      const c = sub.color, n = (R() - .5) * .15;
      for (let k = 0; k < 6; k++) C.push(c[0] * .8 + n, c[1] * .8 + n, c[2] * .8 + n);
    }
    fr.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    fr.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    fr.computeVertexNormals();
    scene.add(new THREE.Mesh(fr, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // surface de l'eau
    const wg = new THREE.PlaneGeometry(L - .2, W - .2, 24, 12);
    wg.rotateX(-Math.PI / 2);
    world.water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x8fc8c8, transparent: true, opacity: .28, side: THREE.DoubleSide, depthWrite: false }));
    scene.add(world.water);
    // rampe d'éclairage
    world.lamp = new THREE.Mesh(new THREE.BoxGeometry(L * .9, .8, W * .35), new THREE.MeshBasicMaterial({ color: 0x333333 }));
    world.lamp.position.set(0, H + 2.5, 0);
    scene.add(world.lamp);
    // équipement
    const eqp = world.equip;
    eqp.sponge = new THREE.Group();
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 6, 8), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
    sp.position.y = 3;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, H * .9, 6), new THREE.MeshLambertMaterial({ color: 0x9ab, transparent: true, opacity: .6 }));
    tube.position.y = H * .45;
    eqp.sponge.add(sp, tube);
    eqp.sponge.position.set(-L / 2 + 3.5, dims.surf(-L / 2 + 3.5, -W / 2 + 3) - 1, -W / 2 + 3);
    eqp.canister = new THREE.Group();
    const pipeMat = new THREE.MeshLambertMaterial({ color: 0x2f4f2f });
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, H * .8, 6), pipeMat);
    intake.position.y = H * .5;
    eqp.guard = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.5, 8), new THREE.MeshLambertMaterial({ color: 0x222 }));
    eqp.guard.position.y = H * .1 + 1.2;
    eqp.canister.add(intake, eqp.guard);
    eqp.canister.position.set(L / 2 - 3, 0, -W / 2 + 2);
    eqp.heater = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, H * .5, 8), new THREE.MeshLambertMaterial({ color: 0xbbccdd, transparent: true, opacity: .7, emissive: 0x000000 }));
    eqp.heater.position.set(-L / 2 + 8, H * .45, -W / 2 + 1.5);
    eqp.heater.rotation.z = .25;
    eqp.air = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .8, 8), new THREE.MeshLambertMaterial({ color: 0x777777 }));
    eqp.air.position.set(L / 4, dims.surf(L / 4, -W / 2 + 3) + .3, -W / 2 + 3);
    eqp.co2 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, .5, 10), new THREE.MeshLambertMaterial({ color: 0xccddee, transparent: true, opacity: .8 }));
    eqp.co2.position.set(L / 2 - 7, H * .25, -W / 2 + .8);
    eqp.co2.rotation.x = Math.PI / 2;
    // sortie du filtre externe : tuyau qui déverse une petite cascade
    const ox = L / 2 - 9, oz = -W / 2 + 1.6, oy = H * .93 + 1.4;
    eqp.outlet = new THREE.Group();
    const vp = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, H + 4 - oy, 6), pipeMat);
    vp.position.set(ox, (H + 4 + oy) / 2, oz);
    const spout = new THREE.Mesh(new THREE.BoxGeometry(2.2, .5, 2), pipeMat);
    spout.position.set(ox - .9, oy, oz);
    eqp.outlet.add(vp, spout);
    world.fall = { ox: ox - 2, oy: oy - .2, oz, ix: ox - 2 };
    for (const k of ['sponge', 'canister', 'heater', 'air', 'co2', 'outlet']) scene.add(eqp[k]);
    world.spray = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPRAY_N * 3), 3)),
      new THREE.PointsMaterial({ color: 0xeaffff, size: .4, transparent: true, opacity: .75, depthWrite: false }));
    world.spray.frustumCulled = false;
    world.spraySeeds = Array.from({ length: SPRAY_N * 2 }, () => Math.random());
    scene.add(world.spray);
    // rayons de lumière sous la rampe
    world.rays = [];
    for (let i = 0; i < 5; i++) {
      const w = 3 + R() * 4;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H * .9).translate(0, H * .45, 0), new THREE.ShaderMaterial({
        uniforms: { uTime: world.fx.uTime, uI: { value: 0 }, uSeed: { value: R() * 10 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec2 vUv; uniform float uTime, uI, uSeed; void main() { float e = sin(vUv.x * 3.1416); float a = e * e * pow(vUv.y, 1.6) * uI * (.55 + .45 * sin(uTime * .6 + uSeed)); gl_FragColor = vec4(vec3(.8, .95, 1.) * a, 1.); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.position.set((R() - .5) * (L - 8), 1.5, (R() - .5) * (W - 6));
      m.rotation.z = (R() - .5) * .15;
      scene.add(m); world.rays.push(m);
    }
    // bulles
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(120 * 3), 3));
    world.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xe8ffff, size: .5, transparent: true, opacity: .8 }));
    world.bubbleSeeds = Array.from({ length: 120 }, () => Math.random());
    scene.add(world.bubbles);
  }

  function buildPond(s, R, sub) {
    const { D } = dims, Rr = dims.R;
    world.sky = new THREE.Color(0x87b8de);
    scene.background = world.sky;
    const ground = new THREE.Mesh(new THREE.RingGeometry(Rr + 1.5, 600, 64, 1), new THREE.MeshLambertMaterial({ color: 0x4f7a35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = D + 2;
    scene.add(ground);
    // herbes
    const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(.6, 4, 3), new THREE.MeshLambertMaterial({ color: 0x5f9440, flatShading: true }), 500);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 500; i++) {
      const a = R() * Math.PI * 2, d = Rr + 3 + R() * Rr * 1.8;
      e.set((R() - .5) * .4, R() * 6, (R() - .5) * .4); q.setFromEuler(e);
      const sc = .6 + R();
      m.compose(new THREE.Vector3(Math.cos(a) * d, D + 2 + 1.5 * sc, Math.sin(a) * d), q, new THREE.Vector3(sc, sc, sc));
      tuft.setMatrixAt(i, m);
    }
    scene.add(tuft);
    // margelle de pierres
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8a857c, flatShading: true });
    const nS = Math.round(Rr * .9);
    for (let i = 0; i < nS; i++) {
      const a = i / nS * Math.PI * 2 + R() * .1;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(2.5 + R() * 1.5, 0), stoneMat);
      st.position.set(Math.cos(a) * (Rr + 1.5), D + 2, Math.sin(a) * (Rr + 1.5));
      st.scale.set(1.3, .6, 1); st.rotation.y = -a + R();
      scene.add(st);
    }
    // parois et fond
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(Rr + .5, Rr * .3, D + 2, 48, 6, true), new THREE.MeshLambertMaterial({ color: 0x5a4630, side: THREE.BackSide }));
    wall.position.y = (D + 2) / 2;
    scene.add(wall);
    const bottom = substrateMesh(sub, R, Rr * 2, Rr * 2, 40, 40, (x, z) => dims.surf(x, z));
    scene.add(bottom);
    // eau
    const wg = new THREE.CircleGeometry(Rr + .8, 48);
    wg.rotateX(-Math.PI / 2);
    world.water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x6fa0a8, transparent: true, opacity: .35, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(world.water);
    // pluie
    const rg = new THREE.BufferGeometry();
    const rp = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) { rp[i * 3] = (Math.random() - .5) * Rr * 5; rp[i * 3 + 1] = Math.random() * 120; rp[i * 3 + 2] = (Math.random() - .5) * Rr * 5; }
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    world.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0xc8d8e8, size: .6, transparent: true, opacity: .6 }));
    world.rain.visible = false;
    scene.add(world.rain);
    world.equip.air = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, .8, 8), new THREE.MeshLambertMaterial({ color: 0x777777 }));
    world.equip.air.position.set(Rr * .3, dims.surf(Rr * .3, 0) + .3, 0);
    scene.add(world.equip.air);
    world.shade = new THREE.Mesh(new THREE.PlaneGeometry(Rr * 1.6, Rr * 1.6), new THREE.MeshLambertMaterial({ color: 0x2e3a2e, transparent: true, opacity: .55, side: THREE.DoubleSide }));
    world.shade.rotation.x = -Math.PI / 2; world.shade.position.y = D + 30;
    scene.add(world.shade);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(120 * 3), 3));
    world.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xe8ffff, size: .6, transparent: true, opacity: .8 }));
    world.bubbleSeeds = Array.from({ length: 120 }, () => Math.random());
    scene.add(world.bubbles);
  }

  // ---------- Plantes ----------
  // Construites à la demande : seulement les plantes présentes dans le bac
  function buildPlants(s) {
    for (const key of Object.keys(s.plants)) ensurePlant(s, key);
  }
  function ensurePlant(s, key) {
    if (world.plants[key] || !PLANTS[key]) return;
    let h = s.seed || 1;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 2147483647;
    buildPlant(key, rng(h));
  }
  function buildPlant(key, R) {
    const { aq } = world;
    const H = aq ? dims.H * .9 : dims.D;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const col = new THREE.Color();
    const pl = { key, meshes: [], max: 0 };
    const place = (mesh, list) => {
      list.forEach((it, i) => {
        e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e);
        m.compose(v.set(it.x, it.y, it.z), q, sc.set(it.sx, it.sy, it.sz));
        mesh.setMatrixAt(i, m);
        col.setRGB(...it.c); mesh.setColorAt(i, col);
      });
      mesh.count = 0; mesh.frustumCulled = false;
      scene.add(mesh);
      pl.meshes.push({ mesh, n: list.length, list });
    };
    const backZ = () => aq ? -dims.W / 2 + 2 + R() * dims.W * .35 : null;
    const spot = (back) => {
      if (aq) {
        const x = (R() - .5) * (dims.L - 4);
        const z = back ? backZ() : (R() - .5) * (dims.W - 4);
        return [x, z];
      }
      return dims.rand(R);
    };
    const L = PLANTS[key].look;
    const jit = (c, a = .08) => [c[0] + (R() - .5) * a, c[1] + (R() - .5) * a, c[2] + (R() - .5) * a];
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const frontSpot = () => aq ? [(R() - .5) * (dims.L - 4), dims.W / 2 - 2 - R() * dims.W * .4] : dims.rand(R);
    const rocks = world.anchors.filter(a => a.r);
    const lambert = (o = {}) => new THREE.MeshLambertMaterial({ flatShading: true, ...o });

    if (L.shape === 'moss') {
      const list = [], s1 = L.s || 1;
      for (let i = 0; i < 220; i++) {
        const a = world.moss[(R() * world.moss.length) | 0];
        const ang = R() * Math.PI * 2, d = R() * a.r * 1.2;
        const x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d;
        if (!dims.inside(x, z)) continue;
        const y = Math.max(dims.surf(x, z), a.y - d * .5) + .3;
        const s0 = (.5 + R() * .9) * s1;
        list.push({ x, y, z, sx: s0, sy: s0 * .6, sz: s0, ry: R() * 6, c: jit(L.c, .1) });
      }
      place(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lambert(), list.length), list);
    } else if (L.shape === 'ball') {
      const list = [];
      for (let i = 0; i < L.n; i++) {
        const [x, z] = frontSpot(), r = L.size * (.7 + R() * .5);
        list.push({ x, y: dims.surf(x, z) + r * .8, z, sx: r, sy: r * .9, sz: r, ry: R() * 6, c: jit(L.c, .05) });
      }
      place(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), lambert(), list.length), list);
    } else if (L.shape === 'stem') {
      const nStem = L.nStem || 26, levels = 14, ny = L.ny, hh = L.h || [.55, .35];
      const stems = [], leaves = [];
      for (let i = 0; i < nStem; i++) {
        const [x, z] = L.h ? (hh[0] < .3 ? frontSpot() : spot(true)) : spot(true);
        stems.push({ x, z, y0: dims.surf(x, z), h: H * (hh[0] + R() * hh[1]) });
      }
      for (let l = 0; l < levels; l++) for (let i = 0; i < nStem; i++) {
        const st = stems[i];
        const y = st.y0 + (l + .5) / levels * st.h;
        const c = L.c2 ? lerp(L.c, L.c2, (l / levels) ** 1.5) : L.c;
        for (let k = 0; k < ny; k++) {
          const ry = k / ny * Math.PI * 2 + l * .9;
          leaves.push({ x: st.x + Math.cos(ry) * L.len * .5, y, z: st.z - Math.sin(ry) * L.len * .5, sx: L.len, sy: .08, sz: L.wid, ry, rz: .25, c: jit(c), level: l, stem: i });
        }
      }
      const stemList = stems.map(st => ({ x: st.x, y: st.y0, z: st.z, sx: 1, sy: 1, sz: 1, c: L.c2 ? lerp(L.c, L.c2, .3) : [.3, .45, .2], st }));
      const stemMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .15, 1, 4).translate(0, .5, 0), new THREE.MeshLambertMaterial(), nStem);
      place(stemMesh, stemList);
      place(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 3), lambert(), leaves.length), leaves);
      pl.stems = { mesh: stemMesh, stems, levels, nStem, ny };
      stems.forEach(st => world.anchors.push({ x: st.x, y: st.y0 + st.h * .5, z: st.z, plant: key }));
    } else if (L.shape === 'ribbon') {
      const list = [];
      const g = new THREE.PlaneGeometry(L.w, 1, 1, 6).translate(0, .5, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, Math.sin(y * 2.2) * L.wave * y); }
      g.computeVertexNormals();
      for (let i = 0; i < L.n; i++) {
        const [x, z] = L.front ? frontSpot() : spot(true);
        list.push({ x, y: dims.surf(x, z), z, sx: 1, sy: H * (L.h[0] + R() * L.h[1]), sz: 1 + R(), ry: R() * 6, c: jit(L.c, .1) });
      }
      place(new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), list.length), list);
      pl.sway = true;
    } else if (L.shape === 'rosette') {
      const list = [];
      for (let i = 0; i < L.n; i++) {
        const [x, z] = L.front ? frontSpot() : spot(R() < .6);
        const y0 = dims.surf(x, z), sz0 = .7 + R() * .5;
        for (let k = 0; k < L.k; k++) {
          const ry = k / L.k * Math.PI * 2 + R() * .5, rz = L.tilt * (.7 + R() * .5), len = L.len * sz0 * (.7 + R() * .4);
          list.push({ x: x + Math.cos(ry) * Math.cos(rz) * len * .5, y: y0 + Math.sin(rz) * len * .5 + .2, z: z - Math.sin(ry) * Math.cos(rz) * len * .5,
            sx: len * .5, sy: .08, sz: L.wid * sz0 * .5, ry, rz, c: jit(L.c) });
        }
      }
      // mélange pour que la croissance fasse apparaître des feuilles partout
      for (let i = list.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [list[i], list[j]] = [list[j], list[i]]; }
      place(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 3), lambert(), list.length), list);
    } else if (L.shape === 'epi') {
      const list = [];
      for (let i = 0; i < L.n; i++) {
        const a = rocks[i % Math.max(1, rocks.length)] || { x: 0, y: 3, z: 0, r: 2 };
        const ang = R() * Math.PI * 2;
        list.push({ x: a.x + Math.cos(ang) * a.r * .8, y: a.y + R() * 1.5, z: a.z + Math.sin(ang) * a.r * .8, sx: L.sx, sy: .16, sz: L.sz, ry: -ang, rz: L.rz * (.8 + R() * .5), c: jit(L.c, .06) });
      }
      place(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 3), lambert(), list.length), list);
    } else if (L.shape === 'carpet') {
      const list = [];
      for (let i = 0; i < L.n; i++) {
        const [x, z] = frontSpot();
        const s0 = L.size * (.7 + R() * .6);
        list.push({ x, y: dims.surf(x, z) + s0 * L.sy * .5, z, sx: s0, sy: s0 * L.sy * 2, sz: s0, ry: R() * 6, c: jit(L.c, .1) });
      }
      place(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lambert(), list.length), list);
    } else if (L.shape === 'float') {
      const list = [];
      for (let i = 0; i < L.n; i++) {
        const [x, z] = aq ? [(R() - .5) * (dims.L - 1), (R() - .5) * (dims.W - 1)] : (() => { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * dims.R; return [Math.cos(a) * d, Math.sin(a) * d]; })();
        const s0 = L.size * (.75 + R() * .5);
        list.push({ x, y: 0, z, sx: s0, sy: (L.sy || .15) * s0, sz: s0, ry: R() * 6, c: jit(L.c, .1) });
      }
      place(new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, L.size > 1.5 ? 9 : 6), new THREE.MeshLambertMaterial(), list.length), list);
      pl.floating = true;
    }
    const amp = L.shape === 'stem' && L.h && L.h[0] < .3 ? .5 : SWAY_AMP[L.shape];
    if (amp) for (const pm of pl.meshes) swayMat(pm.mesh.material, amp);
    world.plants[key] = pl;
  }

  function updatePlants(s) {
    const top = dims.waterTop();
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), e = new THREE.Euler();
    for (const key in s.plants) ensurePlant(s, key);
    for (const key in world.plants) {
      const pl = world.plants[key];
      const cover = s.plants[key] || 0;
      if (pl.stems) {
        const { stems, levels, mesh, ny } = pl.stems;
        const lv = Math.round(cover * levels);
        const leafMesh = pl.meshes[1];
        leafMesh.mesh.count = cover > 0 ? Math.min(leafMesh.n, lv * stems.length * ny) : 0;
        mesh.count = cover > 0 ? stems.length : 0;
        stems.forEach((st, i) => {
          m.compose(v.set(st.x, st.y0, st.z), q.identity(), sc.set(1, Math.max(.1, st.h * lv / levels), 1));
          mesh.setMatrixAt(i, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
      } else {
        for (const pm of pl.meshes) {
          pm.mesh.count = Math.round(pm.n * cover);
          if (pl.floating) {
            for (let i = 0; i < pm.mesh.count; i++) {
              const it = pm.list[i];
              e.set(0, it.ry + Math.sin(time * .2 + i) * .1, 0); q.setFromEuler(e);
              m.compose(v.set(it.x + Math.sin(time * .3 + i) * .2, top + .05, it.z), q, sc.set(it.sx, it.sy, it.sz));
              pm.mesh.setMatrixAt(i, m);
            }
            pm.mesh.instanceMatrix.needsUpdate = true;
          } else if (pl.sway) {
            for (let i = 0; i < pm.mesh.count; i++) {
              const it = pm.list[i];
              const fl = world.fx.uFlow.value;
              e.set(Math.sin(time * .7 + i * 1.3) * .08 * (1 + fl), it.ry, Math.cos(time * .5 + i) * .06 * (1 + fl) - fl * .12); q.setFromEuler(e);
              m.compose(v.set(it.x, it.y, it.z), q, sc.set(it.sx, Math.min(it.sy, top - it.y - .5), it.sz));
              pm.mesh.setMatrixAt(i, m);
            }
            pm.mesh.instanceMatrix.needsUpdate = true;
          }
        }
      }
    }
  }

  // ---------- Agents visuels ----------
  const BODY_Y = .17; // hauteur du centre du corps (en longueurs de corps) : les pattes voxel touchent le sol
  function surfY(x, z) { return dims.surf(x, z); }
  function newAgent(sh) {
    let x, z;
    const mom = sh.mom && agents.get(sh.mom);
    if (mom) { x = mom.x + (Math.random() - .5) * 2; z = mom.z + (Math.random() - .5) * 2; }
    else[x, z] = dims.rand();
    const a = { x, z, y: surfY(x, z) + 1, yaw: Math.random() * 6, pitch: 0, mode: 'graze', t: Math.random() * 3, tx: x, ty: 0, tz: z, phase: Math.random() * 100, swim: 0 };
    a.ty = surfY(x, z);
    return a;
  }
  function pickTarget(a, sh) {
    const baby = sh.size < 7;
    // de la nourriture au fond : on y va (les plus proches d'abord)
    const foods = world.food.filter(f => f.landed);
    if (foods.length && Math.random() < .75) {
      let f = foods[0], best = Infinity;
      for (const g of foods) { const d = Math.hypot(g.x - a.x, g.z - a.z) * (.5 + Math.random()); if (d < best) { best = d; f = g; } }
      const ang = Math.random() * Math.PI * 2, rr = f.r * (.5 + Math.random() * .7);
      const x = f.x + Math.cos(ang) * rr, z = f.z + Math.sin(ang) * rr;
      a.mode = Math.hypot(x - a.x, z - a.z) < 10 ? 'walk' : 'swim';
      a.tx = x; a.tz = z; a.ty = surfY(x, z) + sh.size / 10 * BODY_Y;
      a.food = f;
      return;
    }
    const r = Math.random();
    const cm = sh.size / 10;
    if (r < .55 || baby && r < .8) {
      const range = baby ? 2 : 6;
      let x = a.x + (Math.random() - .5) * range * 2, z = a.z + (Math.random() - .5) * range * 2;
      if (!dims.inside(x, z)) [x, z] = dims.rand();
      a.mode = 'walk'; a.tx = x; a.tz = z; a.ty = surfY(x, z) + cm * BODY_Y;
    } else if (r < .85 || !world.anchors.length) {
      const [x, z] = dims.rand();
      a.mode = 'swim'; a.tx = x; a.tz = z; a.ty = surfY(x, z) + cm * BODY_Y;
    } else {
      const an = world.anchors[(Math.random() * world.anchors.length) | 0];
      if (an.plant && !(curTank && curTank.plants[an.plant])) { a.mode = 'graze'; a.t = 2; return; }
      a.mode = 'swim';
      a.tx = an.x + (Math.random() - .5) * 2; a.tz = an.z + (Math.random() - .5) * 2;
      a.ty = Math.min(dims.waterTop() - 1, an.y + (Math.random() - .3) * 3);
      a.perch = true;
    }
  }
  function stepAgent(a, sh, dt) {
    const cm = sh.size / 10;
    const lazy = sh.berried ? .5 : 1;
    if (a.mode === 'graze') {
      a.t -= dt;
      a.swim = 0;
      a.yaw += Math.sin(time * .7 + a.phase) * dt * .3;
      if (a.t <= 0) pickTarget(a, sh);
      return;
    }
    const dx = a.tx - a.x, dy = a.ty - a.y, dz = a.tz - a.z;
    const d = Math.hypot(dx, dy, dz);
    const sp = a.mode === 'swim' ? (2.5 + cm * 1.2) * lazy : (.35 + cm * .25) * lazy;
    if (d < .15) {
      a.mode = 'graze'; a.t = (2 + Math.random() * 8) / lazy; a.pitch = 0;
      if (a.food) { a.yaw = Math.atan2(-(a.food.z - a.z), a.food.x - a.x); a.t = 6 + Math.random() * 14; a.food = null; }
      if (!a.perch) a.y = surfY(a.x, a.z) + cm * BODY_Y;
      a.perch = false;
      return;
    }
    const st = Math.min(d, sp * dt);
    a.x += dx / d * st; a.z += dz / d * st;
    if (a.mode === 'walk') { a.y = surfY(a.x, a.z) + cm * BODY_Y; a.swim = .05; }
    else {
      const arc = Math.sin(Math.min(1, d / 8) * Math.PI) * .6;
      a.y += dy / d * st + arc * st * .5;
      a.y = Math.min(a.y, dims.waterTop() - .5);
      a.swim = 1;
    }
    a.y = Math.max(a.y, surfY(a.x, a.z) + cm * BODY_Y);
    const ty = Math.atan2(-dz, dx);
    let dyaw = ((ty - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    a.yaw += dyaw * Math.min(1, dt * 4);
    a.pitch += ((a.mode === 'swim' ? Math.atan2(dy, Math.hypot(dx, dz)) * .5 : 0) - a.pitch) * Math.min(1, dt * 3);
  }

  // ---------- Nourriture visible ----------
  const MAX_FOOD = 60;
  const FOOD_POOL = { granules: 'food', veg: 'veg', powder: 'powder' };
  function buildFood() {
    world.food = [];
    world.foodMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX_FOOD);
    world.foodMesh.count = 0; world.foodMesh.frustumCulled = false;
    scene.add(world.foodMesh);
  }
  function spawnFood(s, type) {
    const top = dims.waterTop();
    const [cx, cz] = world.aq ? [(Math.random() - .5) * dims.L * .5, (Math.random() - .2) * dims.W * .4] : dims.rand();
    const start = Math.max(1e-6, s.pools[FOOD_POOL[type]]);
    const n = type === 'veg' ? 1 : type === 'granules' ? 7 : 30;
    for (let i = 0; i < n && world.food.length < MAX_FOOD; i++) {
      const sp = type === 'veg' ? 0 : type === 'granules' ? 1.6 : 4;
      const x = cx + (Math.random() - .5) * sp * 2, z = cz + (Math.random() - .5) * sp * 2;
      const size = type === 'veg' ? [3, .5, 2] : type === 'granules' ? [.35, .22, .35] : [.15, .15, .15];
      const col = type === 'veg' ? [.35 + Math.random() * .05, .6, .2] : type === 'granules' ? [.45, .28, .14] : [.85, .78, .6];
      world.food.push({ type, x, z, y: top - .3, floor: dims.surf(x, z) + size[1] * .5, size, col, start, k: 1, r: type === 'veg' ? 2 : sp + .6,
        rot: Math.random() * 6, fall: type === 'powder' ? .8 + Math.random() : 3 + Math.random() * 2, landed: false });
    }
    // les crevettes qui traînent sentent la nourriture
    for (const a of agents.values()) if (a.mode === 'graze' && Math.random() < .7) a.t = Math.random() * 2;
  }
  function updateFood(s, dt) {
    const fed = s._fed;
    if (fed && fed !== world.lastFed) {
      world.lastFed = fed;
      if (s.t - fed.t < 2) spawnFood(s, fed.type);
    }
    const fm = world.foodMesh;
    let i = 0;
    world.food = world.food.filter(f => {
      const k = Math.min(1, s.pools[FOOD_POOL[f.type]] / f.start);
      f.k = Math.min(f.k, k);
      if (f.k < .08) return false;
      if (!f.landed) {
        f.y -= f.fall * dt;
        f.x += Math.sin(time * 2 + f.rot) * dt * .3;
        if (f.y <= f.floor) { f.y = f.floor; f.landed = true; }
      }
      const sc = Math.sqrt(f.k);
      tmpE.set(0, f.rot, f.landed ? 0 : time * .5);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(f.x, f.landed ? f.floor - f.size[1] * (1 - sc) * .5 : f.y, f.z), tmpQ, tmpS.set(f.size[0] * sc, f.size[1] * Math.max(.4, sc), f.size[2] * sc));
      fm.setMatrixAt(i, tmpM);
      fm.setColorAt(i, new THREE.Color(...f.col));
      i++;
      return true;
    });
    fm.count = i;
    fm.instanceMatrix.needsUpdate = true;
    if (fm.instanceColor) fm.instanceColor.needsUpdate = true;
  }

  function newPlan() {
    const onGlass = Math.random() < .5 && world.aq;
    if (onGlass) return { glass: true, x: (Math.random() - .5) * (dims.L - 2), y: 2 + Math.random() * dims.H * .6, z: dims.W / 2 - .1, a: Math.random() * 6 };
    const [x, z] = dims.rand();
    return { glass: false, x, z, y: 0, a: Math.random() * 6 };
  }
  function hydraSpot(R) {
    if (world.aq) {
      const side = R();
      if (side < .5) return { x: (R() - .5) * (dims.L - 2), y: 4 + R() * dims.H * .6, z: dims.W / 2 - .05, n: [0, 0, -1] };
      if (side < .8) return { x: (R() - .5) * (dims.L - 2), y: 4 + R() * dims.H * .6, z: -dims.W / 2 + .05, n: [0, 0, 1] };
      const sx = R() < .5 ? -1 : 1;
      return { x: sx * (dims.L / 2 - .05), y: 4 + R() * dims.H * .6, z: (R() - .5) * (dims.W - 2), n: [-sx, 0, 0] };
    }
    const a = R() * Math.PI * 2, d = dims.R * (.75 + R() * .15);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    return { x, y: dims.surf(x, z) + .2, z, n: [0, 1, 0] };
  }

  // ---------- Mise à jour par frame ----------
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YZX'), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
  function frame(s, dtReal) {
    if (!world) { if (scene) renderer.render(scene, camera); return; }
    curTank = s;
    time += dtReal;
    const aq = world.aq, w = s.w;
    const dt = Math.min(dtReal, .1);

    // Lumière et ambiance
    const L = s.light || 0;
    const U = world.shrimpU;
    let sunI, ambI, ambCol, sunCol;
    if (aq) {
      sunI = .3 + .9 * L; ambI = .35 + .2 * L;
      sunCol = L > 0 ? new THREE.Color(1, .98, .94) : new THREE.Color(.4, .5, .9);
      ambCol = L > 0 ? new THREE.Color(.55, .62, .7) : new THREE.Color(.25, .3, .5);
      world.lamp.material.color.setRGB(.2 + L * .8, .2 + L * .8, .2 + L * .75);
    } else {
      sunI = .1 + 1.1 * L; ambI = .18 + .4 * L;
      const dusk = L > 0 && L < .35;
      sunCol = dusk ? new THREE.Color(1, .7, .45) : L > 0 ? new THREE.Color(1, .97, .9) : new THREE.Color(.35, .45, .8);
      ambCol = L > 0 ? new THREE.Color(.6, .68, .78) : new THREE.Color(.2, .25, .45);
      const night = new THREE.Color(0x0b1224), day = new THREE.Color(s._wx && s._wx.rain > s.t ? 0x8c97a3 : 0x87b8de), sunset = new THREE.Color(0xe39a6a);
      world.sky.copy(night).lerp(day, Math.min(1, L * 2.2));
      if (dusk) world.sky.lerp(sunset, (1 - L / .35) * .45);
      world.rain.visible = !!(s._wx && s._wx.rain > s.t);
      if (world.rain.visible) {
        const p = world.rain.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * 80; if (y < dims.waterTop()) y += 120; p.setY(i, y); }
        p.needsUpdate = true;
      }
      world.shade.visible = !!s.eq.shade;
    }
    world.sun.intensity = sunI; world.sun.color.copy(sunCol);
    world.amb.intensity = ambI; world.amb.color.copy(ambCol);
    U.uLightCol.value.copy(sunCol).multiplyScalar(sunI * .75);
    U.uAmb.value.copy(ambCol).multiplyScalar(ambI * 1.1);
    U.uTime.value = time;

    // Couleur de l'eau : tanins → ambre, algues → vert, ammoniac → trouble
    const wc = new THREE.Color(.55, .68, .66);
    wc.lerp(new THREE.Color(.55, .42, .2), Math.min(.8, w.tannin * 1.5));
    wc.lerp(new THREE.Color(.35, .58, .28), Math.min(.6, s.algae * .7));
    U.uWater.value.copy(wc);
    const fogC = wc.clone().multiplyScalar(aq ? .45 : .5);
    scene.fog.color.copy(fogC);
    U.uFogColor.value.copy(fogC);
    const fn = cam.dist * .9, ff = cam.dist + Math.max(dims.L, dims.W) * (2.5 - Math.min(1.5, s.algae * 2 + w.tannin));
    scene.fog.near = fn; scene.fog.far = ff;
    U.uFogNear.value = fn; U.uFogFar.value = ff;
    if (aq) {
      world.back.material.color.setRGB(.05 + s.algae * .1, .1 + s.algae * .25, .11 + s.algae * .05);
      world.glass.material.color.setRGB(.6 - s.algae * .3, .84, .6 - s.algae * .3);
      world.glass.material.opacity = .05 + s.algae * .15;
    }
    world.rockMat.color.setRGB(.42 - s.algae * .15, .42 + s.algae * .05, .4 - s.algae * .2);

    // Surface de l'eau
    const top = dims.waterTop();
    world.water.position.y = top;
    world.water.material.color.copy(wc).lerp(aq ? new THREE.Color(.8, .9, .9) : world.sky, aq ? .5 : .25);
    if (s.ice) world.water.material.color.setRGB(.85, .92, .97), world.water.material.opacity = .8;
    else world.water.material.opacity = aq ? .28 : .2 + Math.min(.4, s.algae * .5 + w.tannin * .4);
    if (aq) {
      const p = world.water.geometry.attributes.position;
      const fallOn = world.sprayOn, fx0 = world.fall.ix, fz0 = world.fall.oz;
      const fl = world.fx.uFlow.value;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        let y = (Math.sin(x * .4 + time * (1.5 + fl)) * .08 + Math.cos(z * .5 + time) * .06) * (1 + fl);
        if (fallOn) { const d = Math.hypot(x - fx0, (z - fz0) * 1.2); y += Math.exp(-d * .35) * Math.sin(d * 2.2 - time * 9) * .3; }
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }

    // Équipement
    if (aq) {
      const eq = s.eq, on = s.power;
      world.equip.sponge.visible = eq.filter === 'sponge';
      world.equip.canister.visible = eq.filter === 'canister' || eq.filter === 'guarded';
      world.equip.guard.visible = eq.filter === 'guarded';
      world.equip.heater.visible = eq.heater || s.heaterStuck;
      const heating = on && (s.heaterStuck || (eq.heater && w.temp < eq.target + .1));
      world.equip.heater.material.emissive.setRGB(heating ? .6 : 0, heating ? .2 : 0, 0);
      world.equip.air.visible = eq.air;
      world.equip.co2.visible = eq.co2;
    } else world.equip.air.visible = s.eq.air;
    updateBubbles(s, dt, top);
    updateFx(s, dt, top);
    updateExuviae(s);
    updatePlants(s);
    updateFood(s, dt);

    // Crevettes
    const sm = world.shrimp, ga = sm.geometry.attributes;
    const live = new Set();
    let i = 0;
    for (const sh of s.shrimp) {
      if (i >= MAX_SHRIMP) break;
      live.add(sh.id);
      let a = agents.get(sh.id);
      if (!a) { a = newAgent(sh); agents.set(sh.id, a); }
      stepAgent(a, sh, dt);
      if (a.lm != null && sh.molt > a.lm + .5 && sh.size > 8) spawnExuvia(s, sh, a);
      a.lm = sh.molt;
      const sc = sh.size / 10;
      tmpE.set(0, a.yaw, a.pitch);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(a.x, a.y, a.z), tmpQ, tmpS.set(sc, sc, sc));
      sm.setMatrixAt(i, tmpM);
      const c = sh._rgb || (sh._rgb = Gen.color(sh.g));
      ga.iColor.setXYZ(i, c[0], c[1], c[2]);
      ga.iPat.setXYZW(i, sh.g.stripe, sh.g.bands, sh.g.spots, sh.g.rili);
      ga.iMisc.setXYZW(i, sh.g.dens, sh.berried ? 1 : 0, Sim.express(sh), (sh.id * 7.31) % 97);
      ga.iAnim.setXY(i, a.phase, a.swim);
      a.idx = i;
      i++;
    }
    sm.count = i;
    updateVoxels(s, sm);
    sm.instanceMatrix.needsUpdate = true;
    ga.iColor.needsUpdate = ga.iPat.needsUpdate = ga.iMisc.needsUpdate = ga.iAnim.needsUpdate = true;
    if (agents.size > live.size + 50) for (const id of agents.keys()) if (!live.has(id)) agents.delete(id);

    updatePredators(s, dt, top);

    // Sélection / caméra
    const sel = selectedId != null && agents.get(selectedId);
    if (sel && live.has(selectedId)) {
      world.marker.visible = true;
      const sz = Math.max(.25, (s.shrimp.find(x => x.id === selectedId)?.size || 20) / 40);
      world.marker.scale.setScalar(sz);
      world.marker.position.set(sel.x, sel.y + sz * 2 + Math.sin(time * 4) * .1 * sz, sel.z);
      if (follow) cam.target.lerp(tmpV.set(sel.x, sel.y, sel.z), Math.min(1, dt * 3));
    } else world.marker.visible = false;
    updateCamera();
    renderer.render(scene, camera);
  }

  // ---------- Effets d'eau ----------
  // Uniformes partagés : temps, courant (force + direction), hauteur du sol, caustiques
  function fxUniforms() {
    return { uTime: { value: 0 }, uFlow: { value: 0 }, uDir: { value: new THREE.Vector2(-1, .3).normalize() },
      uFloor: { value: 2 }, uSpan: { value: 20 }, uCaus: { value: 0 } };
  }
  const SWAY_AMP = { moss: .25, stem: 2.2, ribbon: .9, rosette: 1, epi: .6, carpet: .5 };
  const SWAY_VS = `
    vec4 mvPosition = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
    #endif
    vec4 wp = modelMatrix * mvPosition;
    float hg = clamp((wp.y - uFloor) / uSpan, 0., 1.);
    float k = uAmp * hg * hg;
    float wv = sin(uTime * 1.3 + wp.x * .25 + wp.z * .18) + .5 * sin(uTime * 2.3 + wp.x * .6 + wp.y * .3);
    float push = uFlow * (1. + .4 * sin(uTime * .7 + wp.x * .1));
    wp.x += (uDir.x * push + wv * (.3 + uFlow * .5)) * k;
    wp.z += (uDir.y * push + cos(uTime * 1.1 + wp.z * .3 + wp.y * .2) * .3) * k;
    mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;`;
  // Plantes : ondulent avec le courant, d'autant plus qu'elles sont hautes
  function swayMat(mat, amp) {
    const U = world.fx, uAmp = { value: amp };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uTime: U.uTime, uFlow: U.uFlow, uDir: U.uDir, uFloor: U.uFloor, uSpan: U.uSpan, uAmp });
      sh.vertexShader = 'uniform float uTime, uFlow, uFloor, uSpan, uAmp;\nuniform vec2 uDir;\n' + sh.vertexShader.replace('#include <project_vertex>', SWAY_VS);
    };
    mat.customProgramCacheKey = () => 'sway';
    return mat;
  }
  // Caustiques : reflets de la surface qui dansent sur le sol et les roches
  const CAUSTIC_FN = `
    float caustic(vec2 uv, float t) {
      vec2 p = mod(uv * 6.2831, 6.2831) - 250.;
      vec2 i = p; float c = 1.;
      for (int n = 0; n < 4; n++) {
        float tt = t * (1. - (3.5 / float(n + 1)));
        i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1. / length(vec2(p.x / (sin(i.x + tt) / .005), p.y / (cos(i.y + tt) / .005)));
      }
      c /= 4.;
      c = 1.17 - pow(c, 1.4);
      return clamp(pow(abs(c), 8.), 0., 1.);
    }
  `;
  function causticMat(mat) {
    const U = world.fx;
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uTime: U.uTime, uCaus: U.uCaus });
      sh.vertexShader = 'varying vec3 vWpC;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vWpC = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uTime, uCaus;\nvarying vec3 vWpC;\n' + CAUSTIC_FN + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float cf = 1.;
        #ifdef USE_FOG
          cf = 1. - fogFactor;
        #endif
        gl_FragColor.rgb += vec3(.7, .92, 1.) * caustic(vWpC.xz * .04, uTime * .35) * uCaus * cf;`);
    };
    mat.customProgramCacheKey = () => 'caustic';
    return mat;
  }
  // Particules en suspension qui dérivent avec le courant
  const MOTES = 160;
  function buildMotes() {
    const P = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) {
      const [x, z] = dims.rand();
      P[i * 3] = x; P[i * 3 + 1] = 3 + Math.random() * (dims.waterTop() - 4); P[i * 3 + 2] = z;
    }
    world.motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(P, 3)),
      new THREE.PointsMaterial({ color: world.aq ? 0xd8d0b0 : 0xb8c890, size: .16, transparent: true, opacity: .45, depthWrite: false }));
    world.motes.frustumCulled = false;
    scene.add(world.motes);
  }
  const SPRAY_N = 300;
  function updateFx(s, dt, top) {
    const U = world.fx, aq = world.aq, eq = s.eq;
    U.uTime.value = time;
    // force du courant : filtre, bulleur, vent et pluie dehors
    let flow;
    if (aq) flow = s.power ? ({ canister: .9, guarded: .85, sponge: .35 }[eq.filter] || 0) + (eq.air ? .15 : 0) : 0;
    else flow = .2 + (s._wx && s._wx.rain > s.t ? .35 : 0) + (s.power && eq.air ? .15 : 0);
    if (s.ice) flow = 0;
    U.uFlow.value += (flow - U.uFlow.value) * Math.min(1, dt * .6);
    const L = s.light || 0;
    U.uCaus.value = s.ice ? 0 : L * (aq ? .55 : .4) * Math.max(.2, 1 - s.algae * .8 - s.w.tannin * .6);

    // particules
    const mp = world.motes.geometry.attributes.position, fl = U.uFlow.value, d = U.uDir.value;
    for (let i = 0; i < MOTES; i++) {
      let x = mp.getX(i) + (d.x * fl * 1.2 + Math.sin(time * .4 + i) * .15) * dt;
      let y = mp.getY(i) + Math.sin(time * .3 + i * 1.7) * .12 * dt;
      let z = mp.getZ(i) + (d.y * fl * 1.2 + Math.cos(time * .35 + i * .7) * .15) * dt;
      if (!dims.inside(x, z) || y < dims.surf(x, z) || y > top - .2) { [x, z] = dims.rand(); y = dims.surf(x, z) + 1 + Math.random() * Math.max(.5, top - dims.surf(x, z) - 2); }
      mp.setXYZ(i, x, y, z);
    }
    mp.needsUpdate = true;

    if (!aq) return;
    // rayons de lumière (tournés vers la caméra)
    for (const r of world.rays) {
      r.material.uniforms.uI.value = L * .1 * Math.max(.2, 1 - s.algae);
      r.visible = L > 0;
      r.rotation.y = Math.atan2(camera.position.x - r.position.x, camera.position.z - r.position.z);
    }
    // cascade du filtre externe, ou bulles qui éclatent au-dessus du filtre éponge
    const canister = s.power && (eq.filter === 'canister' || eq.filter === 'guarded');
    const sponge = s.power && eq.filter === 'sponge';
    world.equip.outlet.visible = eq.filter === 'canister' || eq.filter === 'guarded';
    world.sprayOn = canister;
    const sp = world.spray, p = sp.geometry.attributes.position, sd = world.spraySeeds, f = world.fall;
    sp.visible = canister || sponge;
    if (!sp.visible) return;
    const g = 30, v0 = 3.2, hf = Math.max(.3, f.oy - top), T = Math.sqrt(2 * hf / g);
    f.ix = f.ox - v0 * T;
    const hide = i => p.setXYZ(i, 0, -1000, 0);
    for (let i = 0; i < SPRAY_N; i++) {
      const a = sd[i], b = sd[i + SPRAY_N];
      if (i < 150) {                                   // filet d'eau qui tombe
        if (!canister) { hide(i); continue; }
        const t = ((time / T * .8 + a) % 1) * T;
        p.setXYZ(i, f.ox - v0 * t * (.9 + b * .2) + (a - .5) * .3, f.oy - .5 * g * t * t, f.oz + (b - .5) * 1.9);
      } else if (i < 240) {                            // bulles entraînées sous la surface
        if (!canister) { hide(i); continue; }
        const ph = (time * (.5 + a * .4) + b) % 1;
        p.setXYZ(i, f.ix - ph * (2 + b * 5), top - (1 + b * 5) * Math.sin(ph * Math.PI), f.oz + (a - .5) * 2.5 + ph * 1.5);
      } else {                                         // écume / éclatement des bulles
        const ph = (time * 1.3 + a) % 1, ang = b * Math.PI * 2;
        const [cx, cz, rr] = canister ? [f.ix, f.oz, 2.6] : [world.equip.sponge.position.x, world.equip.sponge.position.z, 1.3];
        p.setXYZ(i, cx + Math.cos(ang) * ph * rr, top + .05 + Math.sin(ph * Math.PI) * .25, Math.max(-dims.W / 2 + .3, cz + Math.sin(ang) * ph * rr * .7));
      }
    }
    p.needsUpdate = true;
  }
  // Mues : l'exuvie reste au sol puis disparaît (mangée)
  const ghostCache = new Map();
  function spawnExuvia(s, sh, a) {
    if (!world.exu || world.exuBuilt > 0) return;
    const st = voxStage(sh);
    const key = [st.o.res, st.o.sex, st.o.antenna].join();
    let geo = ghostCache.get(key);
    if (!geo) { geo = Voxel.build(Object.assign({}, st.o, { ghost: true, eggs: false, saddle: false })); ghostCache.set(key, geo); world.exuBuilt = 1; }
    const m = new THREE.Mesh(geo, voxMat);
    m.userData.vox = true;
    const cm = sh.size / 10;
    m.position.set(a.x, surfY(a.x, a.z) + cm * .08, a.z);
    m.rotation.set(1.35 + Math.random() * .3, Math.random() * 6, 0, 'YXZ');
    m.scale.setScalar(cm);
    m.userData.t0 = s.t; m.userData.sc = cm;
    scene.add(m);
    world.exu.push(m);
    if (world.exu.length > 12) scene.remove(world.exu.shift());
  }
  function updateExuviae(s) {
    world.exuBuilt = 0;
    world.exu = world.exu.filter(m => {
      const age = s.t - m.userData.t0;
      if (age > 48 || age < 0) { scene.remove(m); return false; }
      m.scale.setScalar(m.userData.sc * Math.min(1, 1.6 - age / 48));
      return true;
    });
  }

  // Matériau voxel animé (un par maillage du pool : uniformes propres, même programme GPU)
  const VOX_ANIM_VS = `
    float sw = uAnim.y, wk = uAnim.z, ph = uAnim.x;
    // queue : battement en nage, respiration au repos
    float tail = clamp((.15 - position.x) / .65, 0., 1.);
    transformed.y += sin(uTime * (3. + sw * 13.) + ph) * (.012 + sw * .11) * tail * tail;
    float code = aAnim.x, t = aAnim.y, off = aAnim.z;
    if (code > .5 && code < 1.5) {          // pattes marcheuses
      float w = sin(uTime * 11. + ph + off);
      transformed.x += w * (.006 + wk * .03) * t;
      transformed.y += (max(0., cos(uTime * 11. + ph + off)) * .018 * wk + sw * .05) * t;
    } else if (code < 2.5 && code > 1.5) {  // pléopodes : pagaient
      transformed.x += sin(uTime * (7. + sw * 16.) + off * 1.3 + ph) * (.006 + sw * .022) * t;
    } else if (code > 2.5 && code < 3.5) {  // grandes antennes
      float a2 = t * t;
      transformed.y += sin(uTime * 1.8 + ph + off * 1.7) * .07 * a2 - sw * .12 * a2;
      transformed.z += cos(uTime * 1.3 + ph + off) * .05 * a2;
      transformed.x -= sw * .1 * a2;
    } else if (code > 3.5) {                // petites antennes, maxillipèdes : grignotage
      transformed.y += sin(uTime * (6. + (1. - sw) * (1. - wk) * 8.) + ph + off) * .018 * t;
    }`;
  function animVoxMat() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });
    m.userData.u = { uTime: { value: 0 }, uAnim: { value: new THREE.Vector3() } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, m.userData.u);
      sh.vertexShader = 'uniform float uTime;\nuniform vec3 uAnim;\nattribute vec3 aAnim;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + VOX_ANIM_VS);
    };
    m.customProgramCacheKey = () => 'voxAnim';
    return m;
  }

  // Paramètres du modèle voxel selon le stade de vie (quantifiés pour réutiliser le cache)
  function voxStage(sh) {
    const size = sh.size, mature = Sim.isMature(sh);
    const res = size < 5 ? 24 : size < 10 ? 32 : size < 18 ? 40 : 48;
    const express = Math.round(Sim.express(sh) * 10) / 10;
    const saddle = sh.sex === 'F' && mature && !sh.berried && sh.molt < 6;
    const eggs = !!sh.berried;
    const antenna = Math.round((.5 + .5 * Math.min(1, size / 20) + (mature && sh.sex === 'M' ? .15 : 0)) * 10) / 10;
    const eyeScale = Math.round((1 + .4 * (1 - Math.min(1, size / 15))) * 10) / 10;
    const sex = mature ? sh.sex : null;
    return { k: [res, express, +saddle, +eggs, antenna, eyeScale, sex].join(), o: { g: sh.g, seed: sh.id, express, sex, saddle, eggs, antenna, eyeScale, res } };
  }
  function voxGeo(sh, force) {
    const g = sh.g;
    const st = voxStage(sh), key = [sh.id, st.k, g.hue.toFixed(0), g.dens.toFixed(2), g.bands.toFixed(2), g.stripe.toFixed(2), g.rili.toFixed(2)].join('|');
    let geo = voxCache.get(key);
    if (geo) { voxCache.delete(key); voxCache.set(key, geo); return geo; }
    if (!force) return null;
    geo = Voxel.build(st.o);
    voxCache.set(key, geo);
    return geo;
  }
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function updateVoxels(s, sm) {
    const cp = camera.position, cand = [];
    for (const sh of s.shrimp) {
      const a = agents.get(sh.id);
      if (!a || a.idx == null) continue;
      const d = Math.hypot(a.x - cp.x, a.y - cp.y, a.z - cp.z);
      if (sh.id === selectedId) cand.push([-1, sh, a]);
      else if (d < VOX_NEAR * Math.max(.4, sh.size / 25)) cand.push([d, sh, a]);
    }
    cand.sort((x, y) => x[0] - y[0]);
    let builds = 0, used = 0;
    for (const [, sh, a] of cand) {
      if (used >= voxPool.length) break;
      let geo = voxGeo(sh, false);
      if (!geo) {
        if (builds >= VOX_BUILDS) continue;
        geo = voxGeo(sh, true); builds++;
      }
      const m = voxPool[used++];
      m.geometry = geo; m.visible = true;
      m.position.set(a.x, a.y, a.z);
      m.rotation.set(0, a.yaw, a.pitch + Math.sin(time * 7 + a.phase) * .05 * a.swim, 'YZX');
      const u = m.material.userData.u;
      u.uTime.value = time;
      u.uAnim.value.set(a.phase, a.swim > .5 ? 1 : 0, a.mode === 'walk' ? 1 : 0);
      m.scale.setScalar(sh.size / 10);
      sm.setMatrixAt(a.idx, ZERO);
    }
    for (let i = used; i < voxPool.length; i++) voxPool[i].visible = false;
    if (voxCache.size > 150) {
      const inUse = new Set(voxPool.map(m => m.geometry));
      for (const [k, g] of voxCache) {
        if (voxCache.size <= 110) break;
        if (!inUse.has(g)) { g.dispose(); voxCache.delete(k); }
      }
    }
  }

  // Portrait voxel pour la fiche (rendu hors écran)
  function portrait(cv, sh) {
    if (!portraitR) {
      const c = document.createElement('canvas');
      const r = new THREE.WebGLRenderer({ canvas: c, antialias: false });
      r.setPixelRatio(1); r.setSize(160, 80, false);
      const sc = new THREE.Scene();
      sc.background = new THREE.Color(0x0a1a1e);
      sc.add(new THREE.HemisphereLight(0xe8f2ff, 0x404850, .85));
      const dl = new THREE.DirectionalLight(0xffffff, .8);
      dl.position.set(-1, 2, 2);
      sc.add(dl);
      const cam2 = new THREE.PerspectiveCamera(30, 2, .01, 20);
      cam2.position.set(.35, .38, 1.55); cam2.lookAt(.22, .03, 0);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), voxMat || (voxMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true })));
      mesh.rotation.y = -.4;
      sc.add(mesh);
      portraitR = { r, c, sc, cam: cam2, mesh };
    }
    portraitR.mesh.geometry = voxGeo(sh, true);
    portraitR.r.render(portraitR.sc, portraitR.cam);
    cv.width = 160; cv.height = 80;
    cv.getContext('2d').drawImage(portraitR.c, 0, 0);
  }

  function updateBubbles(s, dt, top) {
    const p = world.bubbles.geometry.attributes.position;
    const srcs = [];
    if (world.aq) {
      if (s.power && s.eq.filter === 'sponge') srcs.push(world.equip.sponge.position.clone().add(new THREE.Vector3(0, 6, 0)));
      if (s.power && s.eq.air) srcs.push(world.equip.air.position.clone());
      if (s.power && s.eq.co2 && s.light > 0) srcs.push(world.equip.co2.position.clone());
    } else if (s.power && s.eq.air) srcs.push(world.equip.air.position.clone());
    world.bubbles.visible = srcs.length > 0;
    if (!srcs.length) return;
    for (let i = 0; i < p.count; i++) {
      const sd = world.bubbleSeeds[i];
      const src = srcs[i % srcs.length];
      const h = top - src.y;
      const ph = ((time * (6 + sd * 6)) / h + sd) % 1;
      p.setXYZ(i, src.x + Math.sin(time * 3 + i) * .3 + (sd - .5), src.y + ph * h, src.z + Math.cos(time * 2 + i) * .3);
    }
    p.needsUpdate = true;
  }

  function updatePredators(s, dt, top) {
    // Rasboras : banc qui suit un point mobile
    const nf = Math.min(MAX_FISH, s.pred.fish);
    while (fishAgents.length < nf) { const [x, z] = dims.rand(); fishAgents.push({ x, y: top * .6, z, vx: 0, vy: 0, vz: 0, ph: Math.random() * 10 }); }
    fishAgents.length = nf;
    const cx = Math.sin(time * .13) * dims.L * .3, cz = Math.cos(time * .17) * dims.W * .25;
    const cyy = (world.aq ? dims.H * .5 : dims.D * .55) + Math.sin(time * .2) * 3;
    fishAgents.forEach((f, i) => {
      const tx = cx + Math.sin(time * .9 + f.ph) * 4, ty = cyy + Math.cos(time * .7 + f.ph) * 2, tz = cz + Math.cos(time * .8 + f.ph * 1.3) * 3;
      f.vx += ((tx - f.x) * .6 - f.vx) * dt * 2; f.vy += ((ty - f.y) * .6 - f.vy) * dt * 2; f.vz += ((tz - f.z) * .6 - f.vz) * dt * 2;
      f.x += f.vx * dt; f.y = Math.min(top - 1, Math.max(f.y + f.vy * dt, surfY(f.x, f.z) + 2)); f.z += f.vz * dt;
      const yaw = Math.atan2(-f.vz, f.vx);
      tmpE.set(0, yaw, Math.sin(time * 10 + f.ph) * .05); tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(f.x, f.y, f.z), tmpQ, tmpS.set(2.2, 2.2, 2.2));
      world.fish.setMatrixAt(i, tmpM);
    });
    world.fish.count = nf; world.fish.instanceMatrix.needsUpdate = true;
    // Planaires
    const np = Math.min(MAX_PLAN, Math.round(s.pred.plan));
    for (let i = 0; i < np; i++) {
      const p = planAgents[i];
      p.a += (Math.random() - .5) * dt * 2;
      const sp = .15 * dt;
      if (p.glass) {
        p.x += Math.cos(p.a) * sp; p.y += Math.sin(p.a) * sp;
        if (Math.abs(p.x) > dims.L / 2 - 1 || p.y < 2 || p.y > top - 1) p.a += Math.PI;
        tmpE.set(0, 0, p.a); tmpQ.setFromEuler(tmpE);
        tmpM.compose(tmpV.set(p.x, p.y, p.z), tmpQ, tmpS.set(.4, .1, .06));
      } else {
        p.x += Math.cos(p.a) * sp; p.z -= Math.sin(p.a) * sp;
        if (!dims.inside(p.x, p.z)) p.a += Math.PI;
        tmpE.set(0, p.a, 0); tmpQ.setFromEuler(tmpE);
        tmpM.compose(tmpV.set(p.x, surfY(p.x, p.z) + .05, p.z), tmpQ, tmpS.set(.4, .05, .1));
      }
      world.plan.setMatrixAt(i, tmpM);
    }
    world.plan.count = np; world.plan.instanceMatrix.needsUpdate = true;
    // Hydres
    const nh = Math.min(MAX_HYDRA, Math.round(s.pred.hydra));
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < nh; i++) {
      const h = hydraSpots[i];
      tmpQ.setFromUnitVectors(up, tmpV.set(...h.n));
      const sw = Math.sin(time * 1.3 + i) * .1;
      tmpQ.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(sw, 0, sw)));
      tmpM.compose(tmpV.set(h.x, Math.min(h.y, top - 1), h.z), tmpQ, tmpS.set(1, 1, 1));
      world.hydra.setMatrixAt(i, tmpM);
    }
    world.hydra.count = nh; world.hydra.instanceMatrix.needsUpdate = true;
  }

  // ---------- Caméra ----------
  function updateCamera() {
    const { yaw, pitch, dist, target } = cam;
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(target);
  }
  function bindControls() {
    let drag = null;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY, b: e.button, moved: 0, shift: e.shiftKey };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.b === 2 || drag.shift) {
        follow = false;
        const k = cam.dist * .0015;
        const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
        cam.target.addScaledVector(right, -dx * k);
        cam.target.y += dy * k;
      } else {
        cam.yaw -= dx * .006;
        cam.pitch = Math.max(world && !world.aq ? .12 : -.15, Math.min(1.45, cam.pitch + dy * .005));
      }
    });
    canvas.addEventListener('pointerup', e => {
      if (drag && drag.moved < 6 && drag.b === 0) {
        const id = pick(e.clientX, e.clientY);
        if (onPick) onPick(id);
      }
      drag = null;
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const lim = dims ? Math.max(dims.L, dims.W) : 100;
      cam.dist = Math.max(3, Math.min(lim * 4, cam.dist * (1 + Math.sign(e.deltaY) * .12)));
    }, { passive: false });
  }
  function pick(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    let best = null, bd = 28;
    for (const [id, a] of agents) {
      tmpV.set(a.x, a.y, a.z).project(camera);
      if (tmpV.z > 1) continue;
      const sx = (tmpV.x + 1) / 2 * rect.width + rect.left, sy = (1 - tmpV.y) / 2 * rect.height + rect.top;
      const d = Math.hypot(sx - cx, sy - cy);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  function select(id, fol) {
    selectedId = id;
    follow = !!fol && id != null;
    if (follow) cam.dist = Math.min(cam.dist, 14);
  }
  function resetView() {
    follow = false;
    if (!dims) return;
    if (dims.aq) { cam.target.set(0, dims.H * .4, 0); cam.dist = dims.L * 1.5; cam.pitch = .18; cam.yaw = .35; }
    else { cam.target.set(0, dims.D * .5, 0); cam.dist = dims.R * 2.6; cam.pitch = .75; cam.yaw = .3; }
  }

  function disposeScene() {
    scene.traverse(o => {
      if (o.userData.vox) return; // géométries voxel en cache, matériau partagé
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
    world = null;
  }

  // Position écran d'une crevette (débogage / tests)
  function screenOf(id) {
    const a = agents.get(id);
    if (!a) return null;
    const rect = canvas.getBoundingClientRect();
    tmpV.set(a.x, a.y, a.z).project(camera);
    return [(tmpV.x + 1) / 2 * rect.width + rect.left, (1 - tmpV.y) / 2 * rect.height + rect.top];
  }

  return { init, build, frame, select, setPixelScale, resetView, screenOf, portrait, get follow() { return follow; }, set follow(v) { follow = v; }, cam };
})();
