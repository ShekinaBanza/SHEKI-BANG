// SHEKI BANG — 3D crowd cannon battler (Three.js). Green squad vs dark-blue army, multiplier gates, endless levels.
import * as THREE from "../vendor/three.module.min.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem("shekibang." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("shekibang." + k, JSON.stringify(v)); } catch (e) {} },
};
const fmt = (v) => Math.round(v).toLocaleString("fr-FR");
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mix = (s, n) => ((s >>> 0) ^ Math.imul(n, 2654435761)) >>> 0;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------- sound ----------------
const Snd = {
  ctx: null, on: store.get("sound", true), last: {},
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.g = this.ctx.createGain(); this.g.gain.value = 0.5; this.g.connect(this.ctx.destination); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {}); },
  tone(f, d, type, v, slide, delay, key, gap) {
    if (!this.on || !this.ctx) return;
    if (key) { const now = performance.now(); if (now - (this.last[key] || 0) < (gap || 60)) return; this.last[key] = now; }
    try { const t = this.ctx.currentTime + (delay || 0), o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v || 0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(this.g); o.start(t); o.stop(t + d + 0.03); } catch (e) {}
  },
  shot() { this.tone(240, 0.07, "triangle", 0.1, 1.9, 0, "shot", 60); },
  gate(m) { this.tone(500 + Math.min(m, 10) * 60, 0.12, "sine", 0.12, 1.5, 0, "gate", 80); },
  pop() { this.tone(170, 0.06, "square", 0.04, 0.5, 0, "pop", 40); },
  base() { this.tone(110, 0.25, "sawtooth", 0.12, 0.4, 0, "base", 110); },
  hurt() { this.tone(90, 0.35, "square", 0.2, 0.5, 0, "hurt", 200); },
  coin() { this.tone(1320, 0.08, "sine", 0.1, 1.2, 0, "coin", 70); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, "triangle", 0.18, 1, i * 0.09)); },
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.4, "sawtooth", 0.1, 0.8, i * 0.15)); },
  superOn() { this.tone(300, 0.5, "sawtooth", 0.14, 3); },
};

// ---------------- progress & upgrades ----------------
const save = { level: store.get("level", 1), coins: store.get("coins", 0), seed: store.get("seed", 0) >>> 0, up: Object.assign({ rate: 0, wall: 0, super: 0 }, store.get("up", {})) };
if (!save.seed) { save.seed = (Math.random() * 4294967296) >>> 0 || 7; store.set("seed", save.seed); }
const persist = () => { store.set("level", save.level); store.set("coins", save.coins); store.set("up", save.up); store.set("seed", save.seed); };
const UPG = {
  rate: { name: "Cadence", icon: "⚡", desc: (l) => (9 + l).toString() + " tirs/s", cost: (l) => Math.round(40 * Math.pow(1.45, l)) },
  wall: { name: "Rempart", icon: "🛡", desc: (l) => 20 + l * 4 + " PV", cost: (l) => Math.round(35 * Math.pow(1.4, l)) },
  super: { name: "Champion", icon: "★", desc: (l) => "prêt en " + Math.max(12, 36 - l * 3) + " tirs", cost: (l) => Math.round(50 * Math.pow(1.5, l)) },
};
const fireRate = () => 9 + save.up.rate;
const wallHP = () => 20 + save.up.wall * 4;
const superNeed = () => Math.max(12, 36 - save.up.super * 3);

// ---------------- level generation (endless) ----------------
const THEMES = [
  { name: "Désert", sky: 0x9bdcff, fog: 0xf6e3bf, ground: 0xe9b670, ground2: 0xd49a55, hill: 0xd98a4a, deco: "cactus" },
  { name: "Neige", sky: 0xa9dcff, fog: 0xe8f3fc, ground: 0xf2f7fb, ground2: 0xdce8f2, hill: 0xc6d8e8, deco: "pine" },
  { name: "Prairie", sky: 0x92dcff, fog: 0xe3f6e0, ground: 0x7fca5c, ground2: 0x67b448, hill: 0x5aa34a, deco: "tree" },
  { name: "Canyon", sky: 0xffc59a, fog: 0xffe2c0, ground: 0xd88958, ground2: 0xbd6d42, hill: 0xa75832, deco: "rock" },
];
const LEN = 56, HALF = 4.2; // road length (m) and half width (m)
function genLevel(n) {
  const r = mulberry32(mix(save.seed, n));
  const boss = n % 5 === 0, d = n - 1;
  const L = { n, boss, theme: THEMES[(n - 1 + (save.seed % 4)) % 4], len: LEN, rows: [], hazards: [], bridge: null };
  const nRows = Math.min(4, 2 + Math.floor(d / 6) + (r() < 0.4 ? 1 : 0));
  let z = 10 + r() * 3;
  for (let i = 0; i < nRows && z < 40; i++) {
    const late = i >= 1, pick = () => {
      const q = r(), bad = n >= 3 && r() < Math.min(0.35, 0.1 + d * 0.012);
      if (bad) return { op: "-", v: 10 + Math.floor(r() * (10 + d * 4)) };
      if (q < 0.4) return { op: "+", v: [1, 1, 2, 2, 3, 4][Math.floor(r() * (late ? 6 : 4))] };
      return { op: "x", v: [2, 2, 3, 3, 4, 5][Math.floor(r() * (late ? 6 : 4))] };
    };
    const layout = r(); let gates;
    if (layout < 0.45) gates = [{ x0: -1, x1: -0.02, ...pick() }, { x0: 0.02, x1: 1, ...pick() }];
    else if (layout < 0.75) gates = [{ x0: -1, x1: -0.36, ...pick() }, { x0: -0.32, x1: 0.32, ...pick() }, { x0: 0.36, x1: 1, ...pick() }];
    else { const w = 0.5 + r() * 0.4, c = (r() * 2 - 1) * (1 - w / 2) * 0.9; gates = [{ x0: c - w / 2, x1: c + w / 2, ...(r() < 0.5 ? { op: "x", v: 3 + Math.floor(r() * 3) } : pick()) }]; }
    if (gates.every((g) => g.op === "-")) Object.assign(gates[0], { op: "x", v: 2 });
    const row = { z, gates, move: null };
    if (n >= 4 && gates.length === 1 && r() < 0.7) row.move = { amp: 0.45, speed: 0.7 + r() * 0.8, ph: r() * 6 };
    L.rows.push(row); z += 7 + r() * 5;
  }
  if (n >= 7 && r() < 0.35) { const last = L.rows[L.rows.length - 1]; L.rows.push({ z: Math.min(45, last.z + 5.5), gates: [{ x0: -0.15, x1: 0.15, op: "x", v: n >= 15 && r() < 0.4 ? 100 : 10 }], move: { amp: 0.75, speed: 1.1 + r() * 0.6, ph: r() * 6 }, jackpot: true }); }
  if (n >= 4) { const k = Math.min(3, 1 + Math.floor((n - 4) / 7)); for (let i = 0; i < k; i++) { const hz = 8 + r() * 34; if (L.rows.some((rw) => Math.abs(rw.z - hz) < 3)) continue; L.hazards.push({ z: hz, x: (r() * 2 - 1) * 0.5, len: 0.38 + r() * 0.18, speed: (1.6 + r() * 1.4) * (r() < 0.5 ? -1 : 1), a: r() * 6 }); } }
  if (n >= 6 && r() < 0.45) { const bz = 15 + r() * 20; if (!L.rows.some((rw) => rw.z > bz - 1.5 && rw.z < bz + 7.5)) L.bridge = { z0: bz, z1: bz + 5.5, half: 0.34 + r() * 0.12, x: (r() * 2 - 1) * 0.25 }; }
  // balance from the best straight lane
  let expMult = 1, bestX = 0;
  for (let x = -0.9; x <= 0.9001; x += 0.05) {
    if (L.bridge && Math.abs(x - L.bridge.x) > L.bridge.half - 0.04) continue;
    let m = 1;
    for (const rw of L.rows) { if (rw.jackpot) continue; const g = rw.gates.find((g) => x >= g.x0 + 0.03 && x <= g.x1 - 0.03); if (g) m *= g.op === "x" ? g.v : g.op === "+" ? 1 + g.v : 0.75; }
    if (m > expMult) { expMult = m; bestX = x; }
  }
  expMult = Math.min(40, expMult); L.bestX = bestX;
  const k = Math.min(0.85, 0.42 + d * 0.022), out = 9 * expMult;
  L.enemyRate = out * k * 0.42; L.spawnEvery = 0.55; L.wave = Math.max(1, Math.round(L.enemyRate * 0.55));
  L.army = Math.round(L.enemyRate * (14 + Math.min(14, d * 0.8)));
  L.enemySpeed = 4.2 + Math.min(2.6, d * 0.08);
  L.baseHP = Math.max(60, Math.round((out * (1 - k * 0.42) * (20 + Math.min(18, d)) * 0.2 * (boss ? 1.4 : 1)) / 10) * 10);
  L.giantEvery = n >= 3 ? Math.max(5, 13 - d * 0.35) : 0; L.giantHP = Math.round(10 + expMult * 1.5 + d * 2);
  L.bossHP = boss ? Math.round(out * 5) : 0;
  L.decoSeed = mix(save.seed, n + 999);
  return L;
}

// ---------------- three.js scene ----------------
const cv = $("cv"), ov = $("ov"), o2 = ov.getContext("2d");
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a6a4a, 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-8, 20, 10); scene.add(sun);
const toon = (() => { const d = new Uint8Array([90, 170, 255]); const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const M = (color, extra) => new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: toon }, extra || {}));
const W2 = (gx) => gx * HALF;           // game x (-1..1) -> metres
const Z3 = (gz) => -gz;                 // game z (forward) -> three z

// characters: one capsule body shared by every soldier, eyes as separate instanced meshes (enemies face the camera)
const MAXU = 900, MAXE = 700, MAXB = 40;
const bodyGeo = new THREE.CapsuleGeometry(0.24, 0.3, 4, 10); bodyGeo.translate(0, 0.45, 0);
function twoSpheres(r, dx, y, z) { const a = new THREE.SphereGeometry(r, 8, 6).toNonIndexed(); a.translate(-dx, y, z); const b = new THREE.SphereGeometry(r, 8, 6).toNonIndexed(); b.translate(dx, y, z); const g = new THREE.BufferGeometry(); for (const k of ["position", "normal"]) { const A = a.getAttribute(k).array, B = b.getAttribute(k).array, C = new Float32Array(A.length + B.length); C.set(A); C.set(B, A.length); g.setAttribute(k, new THREE.BufferAttribute(C, 3)); } return g; }
const eyeGeo = twoSpheres(0.09, 0.1, 0.6, 0.18), pupilGeo = twoSpheres(0.048, 0.1, 0.6, 0.25);
const backGeo = new THREE.SphereGeometry(0.12, 8, 6); backGeo.scale(1.1, 1, 0.6); backGeo.translate(0, 0.5, 0.24); // little backpack on the green squad
const mkInst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
const uBody = mkInst(bodyGeo, M(0x3fdc52), MAXU), uPack = mkInst(backGeo, M(0x1f8f36), MAXU);
const eBody = mkInst(bodyGeo, M(0x22398f), MAXE), eEyes = mkInst(eyeGeo, M(0xffffff), MAXE), ePup = mkInst(pupilGeo, M(0x111111), MAXE);
const bBody = mkInst(bodyGeo, M(0xffffff), MAXB), bEyes = mkInst(eyeGeo, M(0xffffff), MAXB), bPup = mkInst(pupilGeo, M(0x111111), MAXB);
bBody.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXB * 3), 3);
const shadowGeo = new THREE.CircleGeometry(0.26, 12); shadowGeo.rotateX(-Math.PI / 2);
const shadows = mkInst(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }), MAXU + MAXE + MAXB);
const tmp = new THREE.Object3D(), col = new THREE.Color();

// particles
const PMAX = 1600, pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
const pMat = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, depthWrite: false });
const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; scene.add(points);
let parts = [];
function puff(x, y, z, hex, n, sp) { col.setHex(hex); for (let i = 0; i < n && parts.length < PMAX; i++) parts.push({ x, y, z, vx: (Math.random() - 0.5) * sp, vy: Math.random() * sp * 1.2 + 1, vz: (Math.random() - 0.5) * sp, life: 0.5 + Math.random() * 0.4, r: col.r, g: col.g, b: col.b }); }

// level scenery
let levelGroup = null, gateMeshes = [], hazardMeshes = [], baseMesh = null, cannon = null, aimLine = null, tube = null, tubeFill = null;
function labelTexture(text, bg) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128; const g = c.getContext("2d");
  g.font = "800 92px 'Baloo 2', 'Arial Black', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 12; g.strokeStyle = "rgba(0,0,0,0.35)"; g.strokeText(text, 128, 70); g.fillStyle = "#ffffff"; g.fillText(text, 128, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function box(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function buildLevel(L) {
  if (levelGroup) { scene.remove(levelGroup); levelGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
  levelGroup = new THREE.Group(); scene.add(levelGroup); gateMeshes = []; hazardMeshes = [];
  const th = L.theme, r = mulberry32(L.decoSeed);
  scene.background = new THREE.Color(th.sky); scene.fog = new THREE.Fog(th.fog, 45, 120);
  hemi.groundColor.setHex(th.ground2);
  // ground with two tones of stripes for depth
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), M(th.ground)); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -60); levelGroup.add(ground);
  for (let i = 0; i < 14; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(3 + r() * 6, 16), M(th.ground2)); p.rotation.x = -Math.PI / 2; p.position.set((r() < 0.5 ? -1 : 1) * (8 + r() * 30), -0.01, -r() * 90 + 6); levelGroup.add(p); }
  // road (with a gap for the bridge)
  const asphalt = M(0x6b7180), curb = M(0xf2efe6), dash = M(0xffffff);
  const segs = L.bridge ? [[-4, L.bridge.z0], [L.bridge.z1, LEN + 6]] : [[-4, LEN + 6]];
  for (const [a, b] of segs) {
    const len = b - a, mid = (a + b) / 2;
    levelGroup.add(box(HALF * 2, 0.1, len, asphalt, 0, 0.0, Z3(mid)));
    for (const s of [-1, 1]) levelGroup.add(box(0.35, 0.16, len, curb, s * (HALF + 0.17), 0.04, Z3(mid)));
    for (let z = a + 1; z < b - 1; z += 3) levelGroup.add(box(0.14, 0.11, 1.4, dash, 0, 0.01, Z3(z + 0.7)));
  }
  if (L.bridge) {
    const B = L.bridge, plank = M(0xb07a44), plank2 = M(0x9a6635), rope = M(0x6b4423);
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 6, B.z1 - B.z0), M(0x5b3a26)); pit.rotation.x = -Math.PI / 2; pit.position.set(0, -0.015, Z3((B.z0 + B.z1) / 2)); levelGroup.add(pit);
    for (let z = B.z0; z < B.z1; z += 0.5) levelGroup.add(box(W2(B.half) * 2, 0.12, 0.42, z % 1 < 0.5 ? plank : plank2, W2(B.x), 0.05, Z3(z + 0.25)));
    for (const s of [-1, 1]) { levelGroup.add(box(0.08, 0.08, B.z1 - B.z0, rope, W2(B.x + s * B.half), 0.7, Z3((B.z0 + B.z1) / 2))); for (let z = B.z0; z <= B.z1; z += 1.1) levelGroup.add(box(0.12, 0.8, 0.12, rope, W2(B.x + s * B.half), 0.4, Z3(z))); }
  }
  // wooden fences
  const wood = M(0x9b6534);
  for (const s of [-1, 1]) {
    for (const [a, b] of segs) {
      for (let z = Math.max(0, a); z < b; z += 1.8) levelGroup.add(box(0.14, 0.7, 0.14, wood, s * (HALF + 0.5), 0.35, Z3(z)));
      levelGroup.add(box(0.08, 0.1, b - Math.max(0, a), wood, s * (HALF + 0.5), 0.55, Z3((Math.max(0, a) + b) / 2)));
      levelGroup.add(box(0.08, 0.1, b - Math.max(0, a), wood, s * (HALF + 0.5), 0.3, Z3((Math.max(0, a) + b) / 2)));
    }
  }
  // scenery
  const green = M(0x3f9e45), green2 = M(0x2f7f3f), trunk = M(0x7a5230), rock = M(0xb06a40), rock2 = M(0x98593a), snow = M(0xffffff);
  for (let i = 0; i < 70; i++) {
    const s = r() < 0.5 ? -1 : 1, x = s * (HALF + 1.6 + r() * 14), z = Z3(r() * (LEN + 30) - 6), sc = 0.7 + r() * 0.9, g = new THREE.Group();
    if (th.deco === "cactus") { g.add(box(0.36, 1.6, 0.36, green, 0, 0.8, 0)); g.add(box(0.26, 0.6, 0.26, green, -0.38, 0.95, 0)); g.add(box(0.3, 0.12, 0.26, green, -0.2, 0.7, 0)); g.add(box(0.26, 0.7, 0.26, green, 0.38, 1.1, 0)); g.add(box(0.3, 0.12, 0.26, green, 0.2, 0.8, 0)); }
    else if (th.deco === "pine") { g.add(box(0.2, 0.5, 0.2, trunk, 0, 0.25, 0)); for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.9 - k * 0.22, 0.9, 7), k === 2 ? snow : green2); c.position.y = 0.8 + k * 0.5; g.add(c); } }
    else if (th.deco === "tree") { g.add(box(0.22, 0.8, 0.22, trunk, 0, 0.4, 0)); const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), r() < 0.5 ? green : green2); c.position.y = 1.3; g.add(c); }
    else { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), r() < 0.5 ? rock : rock2); c.position.y = 0.4; c.scale.set(1, 0.7 + r() * 0.6, 1); g.add(c); }
    g.position.set(x, 0, z); g.scale.setScalar(sc); g.rotation.y = r() * 6; levelGroup.add(g);
  }
  // far mountains / mesas
  const hillMat = M(th.hill), capMat = th.deco === "pine" ? snow : M(th.ground);
  for (let i = 0; i < 14; i++) {
    const x = (r() * 2 - 1) * 90, z = -(LEN + 25 + r() * 50), h = 8 + r() * 14;
    if (th.deco === "cactus" || th.deco === "rock") { const m = new THREE.Mesh(new THREE.CylinderGeometry(4 + r() * 5, 7 + r() * 6, h, 7), hillMat); m.position.set(x, h / 2 - 1, z); levelGroup.add(m); }
    else { const m = new THREE.Mesh(new THREE.ConeGeometry(8 + r() * 8, h * 1.4, 6), hillMat); m.position.set(x, h * 0.7 - 1, z); levelGroup.add(m); const c = new THREE.Mesh(new THREE.ConeGeometry(3, h * 0.45, 6), capMat); c.position.set(x, h * 1.2 - 0.6, z); levelGroup.add(c); }
  }
  // gates: translucent glossy panels with a header bar, like the arcade crowd games
  L.rows.forEach((row, ri) => row.gates.forEach((g, gi) => {
    const w = W2(g.x1 - g.x0) - 0.12, h = 1.5;
    const c = g.op === "-" ? 0xff4d4d : g.op === "+" ? 0x2f8cff : row.jackpot ? 0xffc21a : 0x9b4dff;
    const grp = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), new THREE.MeshToonMaterial({ color: c, gradientMap: toon, transparent: true, opacity: 0.55 }));
    glass.position.y = h / 2; grp.add(glass);
    const frame = M(new THREE.Color(c).multiplyScalar(0.65).getHex());
    grp.add(box(w + 0.16, 0.42, 0.34, M(c), 0, h + 0.18, 0));
    for (const s of [-1, 1]) grp.add(box(0.14, h + 0.4, 0.3, frame, s * (w / 2 + 0.02), (h + 0.4) / 2, 0));
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.95, 2.6), Math.min(w * 0.95, 2.6) / 2), new THREE.MeshBasicMaterial({ map: labelTexture((g.op === "x" ? "×" : g.op === "+" ? "+" : "−") + g.v), transparent: true, depthWrite: false }));
    lab.position.set(0, h * 0.62, 0.08); grp.add(lab);
    grp.position.set(W2((g.x0 + g.x1) / 2), 0.05, Z3(row.z)); levelGroup.add(grp);
    gateMeshes.push({ grp, row, g, baseX: W2((g.x0 + g.x1) / 2), glass });
  }));
  // spinning hammers
  for (const h of L.hazards) {
    const grp = new THREE.Group(), post = box(0.3, 1.0, 0.3, M(0x555c69), 0, 0.5, 0); grp.add(post);
    const arm = new THREE.Group(); arm.position.y = 0.9; grp.add(arm);
    const len = W2(h.len); arm.add(box(len, 0.16, 0.16, M(0x8b939f), len / 2, 0, 0));
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 12), M(0xd84a3a)); head.rotation.z = Math.PI / 2; head.position.set(len, 0, 0); arm.add(head);
    grp.position.set(W2(h.x), 0, Z3(h.z)); levelGroup.add(grp); hazardMeshes.push({ arm, h });
  }
  // enemy fortress (dark blue)
  const navy = M(0x1b2c6b), navy2 = M(0x13204f), red = M(0xff3b3b);
  baseMesh = new THREE.Group();
  baseMesh.add(box(7.2, 3.4, 2.4, navy, 0, 1.7, 0));
  for (let i = 0; i < 7; i++) baseMesh.add(box(0.7, 0.6, 2.4, navy2, -3.1 + i * 1.03, 3.7, 0));
  for (const s of [-1, 1]) { baseMesh.add(box(1.8, 4.6, 2.8, navy2, s * 3.9, 2.3, 0)); baseMesh.add(new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.6, 4), red)).position.set(s * 3.9, 5.4, 0); }
  baseMesh.add(box(2.2, 2.4, 0.3, M(0x0a1230), 0, 1.2, 1.1));
  const pole = box(0.1, 2.4, 0.1, M(0x333333), 0, 4.6, 0); baseMesh.add(pole);
  const flag = box(1.2, 0.7, 0.05, red, 0.62, 5.4, 0); baseMesh.add(flag);
  baseMesh.position.set(0, 0, Z3(LEN + 1.2)); levelGroup.add(baseMesh);
  // coin tube beside the road (fills with the coins earned in the level)
  tube = new THREE.Group();
  tube.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3.6, 18, 1, true), new THREE.MeshToonMaterial({ color: 0xbfe8ff, gradientMap: toon, transparent: true, opacity: 0.35, side: THREE.DoubleSide }))).position.y = 1.9;
  tube.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 18), M(0x2f6fd1))).position.y = 0.15;
  tube.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.25, 18), M(0x2f6fd1))).position.y = 3.75;
  tubeFill = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1, 18), M(0xffc21a)); tubeFill.position.y = 0.3; tube.add(tubeFill);
  tube.position.set(HALF + 2.6, 0, Z3(8)); levelGroup.add(tube);
  // cannon on its cart
  cannon = new THREE.Group();
  const cg = M(0x2ecc4a), cd = M(0x1a7f30), tyre = M(0x1d2433), hub = M(0xffcf3a);
  cannon.add(box(1.7, 0.35, 1.5, cd, 0, 0.45, 0));
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.5, 0.5]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14), tyre); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.34, sz); cannon.add(w); const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 10), hub); hb.rotation.z = Math.PI / 2; hb.position.set(sx, 0.34, sz); cannon.add(hb); }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.9, 16), cg); barrel.rotation.x = -Math.PI / 2 + 0.25; barrel.position.set(0, 1.0, -0.5); cannon.add(barrel);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.09, 8, 18), cd); ring.position.set(0, 1.23, -1.42); ring.rotation.x = 0.25; cannon.add(ring);
  cannon.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), cg)).position.set(0, 0.85, 0.25);
  cannon.position.set(0, 0, 0.9); levelGroup.add(cannon);
  const lineGeo = new THREE.PlaneGeometry(0.12, 16); lineGeo.rotateX(-Math.PI / 2); lineGeo.translate(0, 0.08, -8);
  aimLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.75, depthWrite: false })); levelGroup.add(aimLine);
}

// ---------------- state ----------------
let L = null, units = [], enemies = [], pops = [], coinsFx = [];
const G = { screen: "menu", t: 0, base: 0, baseMax: 1, wall: 0, wallMax: 1, cannonX: 0, firing: false, fireAcc: 0, spawnAcc: 0, giantAcc: 0, shots: 0, superCharge: 0, superReady: false, wantSuper: false, kills: 0, earned: 0, over: true, shake: 0, bossSpawned: false, result: null, paused: false, armyLeft: 0, camX: 0, intro: 0 };
let W = 0, H = 0;
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  renderer.setSize(W, H, false); camera.aspect = W / H;
  camera.fov = W / H < 0.6 ? 62 : 50; camera.updateProjectionMatrix();
  const dpr = Math.min(window.devicePixelRatio || 1, 2); ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr); o2.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const proj = new THREE.Vector3();
function toScreen(x, y, z) { proj.set(x, y, z).project(camera); return { x: (proj.x * 0.5 + 0.5) * W, y: (-proj.y * 0.5 + 0.5) * H, vis: proj.z < 1 }; }

function startLevel() {
  L = genLevel(save.level); buildLevel(L);
  units = []; enemies = []; pops = []; coinsFx = []; parts = [];
  Object.assign(G, { t: 0, base: L.baseHP, baseMax: L.baseHP, wall: wallHP(), wallMax: wallHP(), cannonX: 0, firing: false, fireAcc: 0, spawnAcc: 0.4, giantAcc: 0, shots: 0, superCharge: 0, superReady: false, wantSuper: false, kills: 0, earned: 0, over: false, shake: 0, bossSpawned: false, result: null, paused: false, armyLeft: L.army, intro: 1.2 });
  G.screen = "play";
  $("menu").hidden = true; $("hud").hidden = false; $("result").hidden = true;
  $("hLevel").textContent = (L.boss ? "BOSS · " : "NIVEAU ") + L.n;
  pops.push({ s: L.boss ? "NIVEAU BOSS" : "NIVEAU " + L.n, x: 0, y: 3, z: Z3(20), life: 1.5, max: 1.5, size: 40, col: "#ffffff" });
  $("hand").hidden = save.level > 2;
  renderHUD();
}

// ---------------- simulation ----------------
function addUnit(x, z, big, passed) {
  if (!big && units.length >= MAXU) return null;
  if (big && units.filter((u) => u.big).length >= 6) return null;
  const u = { x, z, vz: big ? 7.5 : 12, hp: big ? 30 + save.level * 2 : 1, big: !!big, passed: passed ? new Set(passed) : new Set(), wob: Math.random() * 6, dead: false };
  units.push(u); return u;
}
function addEnemy(x, z, kind) { const e = { x, z, vz: kind === "boss" ? 1.4 : kind === "giant" ? 2.3 : L.enemySpeed * (0.85 + Math.random() * 0.3), hp: kind === "boss" ? L.bossHP : kind === "giant" ? L.giantHP : 1, kind: kind || "soldier", wob: Math.random() * 6, dead: false, tx: null }; e.maxHp = e.hp; enemies.push(e); return e; }
function fire() {
  const big = G.superReady && G.wantSuper;
  if (big) { G.superReady = false; G.wantSuper = false; G.superCharge = 0; Snd.superOn(); pops.push({ s: "CHAMPION !", x: W2(G.cannonX), y: 2.5, z: Z3(4), life: 1.1, max: 1.1, size: 28, col: "#7dff7a" }); }
  addUnit(G.cannonX + (Math.random() - 0.5) * 0.08, 1.2, big);
  G.shots++; Snd.shot();
  if (!G.superReady && !big) { G.superCharge += 1 / superNeed(); if (G.superCharge >= 1) { G.superCharge = 1; G.superReady = true; } }
  puff(W2(G.cannonX), 1.3, Z3(1.6), 0xffffff, 3, 1.2);
}
const gateOff = (row) => (row.move ? Math.sin(G.t * row.move.speed + row.move.ph) * row.move.amp : 0);
const gateX = (row, g) => { const o = gateOff(row); return [Math.max(-1, g.x0 + o), Math.min(1, g.x1 + o)]; };
const roadHalf = (z) => (L.bridge && z > L.bridge.z0 && z < L.bridge.z1 ? { c: L.bridge.x, h: L.bridge.half } : { c: 0, h: 0.96 });

function update(dt) {
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 9 * dt; if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; } p.life -= dt; }
  parts = parts.filter((p) => p.life > 0);
  for (const t of pops) { t.life -= dt; t.y += dt * 0.8; }
  pops = pops.filter((t) => t.life > 0);
  for (const c of coinsFx) c.t += dt;
  coinsFx = coinsFx.filter((c) => c.t < 0.8);
  G.shake = Math.max(0, G.shake - dt * 3);
  if (G.screen !== "play" || G.paused || G.over) return;
  G.t += dt; if (G.intro > 0) G.intro -= dt;
  if (G.firing) { G.fireAcc += dt * fireRate(); while (G.fireAcc >= 1) { G.fireAcc -= 1; fire(); } }
  G.spawnAcc += dt;
  if (G.spawnAcc >= L.spawnEvery) { G.spawnAcc -= L.spawnEvery; const k = Math.min(L.wave, MAXE - enemies.length, G.armyLeft); G.armyLeft -= Math.max(0, k); for (let i = 0; i < k; i++) addEnemy((Math.random() * 2 - 1) * 0.7, L.len - 1.2 - Math.random() * 2); }
  if (L.giantEvery) { G.giantAcc += dt; if (G.giantAcc >= L.giantEvery) { G.giantAcc = 0; addEnemy((Math.random() * 2 - 1) * 0.4, L.len - 2, "giant"); } }
  if (L.boss && !G.bossSpawned && G.t > 5) { G.bossSpawned = true; addEnemy(0, L.len - 2.5, "boss"); pops.push({ s: "LE BOSS ARRIVE !", x: 0, y: 4, z: Z3(L.len - 8), life: 1.8, max: 1.8, size: 30, col: "#ff5a5a" }); Snd.hurt(); }
  const born = [];
  for (const u of units) {
    if (u.dead) continue;
    const pz = u.z; u.z += u.vz * dt; u.wob += dt * 14; u.x += Math.sin(u.wob * 0.5) * 0.003;
    for (let ri = 0; ri < L.rows.length; ri++) {
      const row = L.rows[ri];
      if (pz < row.z && u.z >= row.z) row.gates.forEach((g, gi) => {
        const key = ri * 8 + gi; if (u.passed.has(key)) return;
        const [a, b] = gateX(row, g); if (u.x < a || u.x > b) return;
        u.passed.add(key);
        if (g.op === "-") { if ((g.used || 0) < g.v) { g.used = (g.used || 0) + 1; u.dead = true; puff(W2(u.x), 0.6, Z3(u.z), 0xff6b6b, 3, 2); } return; }
        const extra = g.op === "+" ? g.v : g.v - 1, spread = Math.min((b - a) * 0.9, 0.16 + 0.05 * Math.sqrt(extra));
        for (let k = 0; k < extra; k++) born.push({ x: clamp(u.x + (Math.random() - 0.5) * spread, a + 0.03, b - 0.03), z: u.z - Math.random() * 1.2, passed: u.passed });
        g.flash = 0.2; Snd.gate(g.v);
      });
    }
    for (const h of L.hazards) {
      if (Math.abs(u.z - h.z) > 2.5) continue;
      const ang = h.a + G.t * h.speed, ex = h.x + (Math.cos(ang) * h.len), ez = h.z + (Math.sin(ang) * h.len * HALF);
      if (Math.abs(u.x - ex) < 0.12 && Math.abs(u.z - ez) < 0.6) { if (u.big) { u.hp -= 1; if (u.hp <= 0) u.dead = true; } else u.dead = true; puff(W2(u.x), 0.5, Z3(u.z), 0x3fdc52, 4, 3); Snd.pop(); }
    }
    const rh = roadHalf(u.z);
    if (Math.abs(u.x - rh.c) > rh.h) { if (L.bridge && u.z > L.bridge.z0 && u.z < L.bridge.z1) { u.dead = true; puff(W2(u.x), 0.2, Z3(u.z), 0x3fdc52, 2, 1); continue; } u.x = clamp(u.x, rh.c - rh.h, rh.c + rh.h); }
    if (u.z >= L.len - 0.5) {
      G.base -= u.big ? Math.max(5, u.hp) : 1; u.dead = true; Snd.base(); puff(W2(u.x), 1, Z3(u.z), 0xffd34d, u.big ? 16 : 2, 3);
      if (Math.random() < 0.12 || u.big) coinsFx.push({ x: W2(u.x), y: 1.5, z: Z3(u.z), t: 0 });
      if (G.base <= 0) { G.base = 0; return endLevel(true); }
    }
  }
  for (const b of born) addUnit(b.x, b.z, false, b.passed);
  if (units.length) for (const e of enemies) { if (e.dead) continue; let bd = 9, bx = null; for (let i = 0; i < units.length; i += Math.max(1, units.length >> 6)) { const u = units[i], dz = e.z - u.z; if (dz > 0 && dz < 7) { const dd = Math.abs(u.x - e.x) + dz * 0.1; if (dd < bd) { bd = dd; bx = u.x; } } } e.tx = bx; } else for (const e of enemies) e.tx = null;
  for (const e of enemies) {
    if (e.dead) continue;
    e.z -= e.vz * dt; e.wob += dt * 12;
    e.x += clamp((e.tx != null ? e.tx : G.cannonX) - e.x, -1, 1) * dt * (e.kind === "soldier" ? 0.9 : 0.4);
    const rh = roadHalf(e.z); e.x = clamp(e.x, rh.c - rh.h + 0.05, rh.c + rh.h - 0.05);
    if (e.z <= 1.6) { e.dead = true; G.wall -= e.kind === "boss" ? 10 : e.kind === "giant" ? 3 : 1; G.shake = 0.5; Snd.hurt(); puff(W2(e.x), 0.8, Z3(1.6), 0x22398f, 8, 3); if (G.wall <= 0) { G.wall = 0; return endLevel(false); } }
  }
  const buckets = new Map();
  for (const e of enemies) { if (e.dead) continue; const k = Math.floor(e.z); (buckets.get(k) || buckets.set(k, []).get(k)).push(e); }
  for (const u of units) {
    if (u.dead) continue;
    const k = Math.floor(u.z), rx = u.big ? 0.12 : 0.05, rz = u.big ? 1.0 : 0.5;
    for (let kk = k - 1; kk <= k + 1 && !u.dead; kk++) {
      const list = buckets.get(kk); if (!list) continue;
      for (const e of list) {
        if (e.dead) continue;
        const ex = e.kind === "boss" ? 0.3 : e.kind === "giant" ? 0.14 : 0.05, ez = e.kind === "boss" ? 1.8 : e.kind === "giant" ? 1.1 : 0.5;
        if (Math.abs(u.x - e.x) < rx + ex && Math.abs(u.z - e.z) < (rz + ez) / 2) {
          const hit = Math.min(u.hp, e.hp); u.hp -= hit; e.hp -= hit;
          if (e.hp <= 0) { e.dead = true; G.kills++; puff(W2(e.x), 0.6, Z3(e.z), 0x2a4aa8, e.kind === "soldier" ? 3 : 20, 3); if (e.kind !== "soldier") { G.earned += e.kind === "boss" ? 40 : 6; coinsFx.push({ x: W2(e.x), y: 1.5, z: Z3(e.z), t: 0 }); Snd.coin(); } }
          if (u.hp <= 0) { u.dead = true; puff(W2(u.x), 0.6, Z3(u.z), 0x3fdc52, 2, 2); }
          Snd.pop(); if (u.dead) break;
        }
      }
    }
  }
  units = units.filter((u) => !u.dead); enemies = enemies.filter((e) => !e.dead);
  for (const row of L.rows) for (const g of row.gates) if (g.flash) g.flash = Math.max(0, g.flash - dt);
}
function endLevel(win) {
  G.over = true; G.firing = false;
  const reward = win ? 20 + L.n * 6 + Math.floor(G.kills / 4) + G.earned : Math.floor(G.kills / 8) + Math.floor(G.earned / 2);
  G.result = { win, reward };
  if (win) { Snd.win(); G.shake = 0.8; for (let i = 0; i < 160; i++) { const c = [0xffd34d, 0x3fdc52, 0xff6b6b, 0x5ad1ff, 0xffffff][i % 5]; puff((Math.random() * 2 - 1) * 4, 3 + Math.random() * 2, Z3(LEN - Math.random() * 6), c, 1, 7); } }
  else Snd.lose();
  setTimeout(showResult, win ? 1400 : 900);
}
function showResult() {
  const r = G.result; if (!r || G.screen !== "play") return;
  save.coins += r.reward; if (r.win) save.level++; persist();
  $("rTitle").textContent = r.win ? (L.boss ? "BOSS VAINCU !" : "VICTOIRE !") : "DÉFAITE";
  $("rText").textContent = r.win ? fmt(G.kills) + " ennemis éliminés" : "L'armée bleue a percé ton rempart";
  $("rCoins").textContent = "+" + fmt(r.reward);
  $("rStars").innerHTML = r.win ? '<i class="on"></i><i class="' + (G.wall / G.wallMax > 0.5 ? "on" : "") + '"></i><i class="' + (G.wall === G.wallMax ? "on" : "") + '"></i>' : "";
  $("bNext").textContent = r.win ? "NIVEAU " + save.level : "RÉESSAYER";
  $("result").hidden = false; $("result").className = "screen modal " + (r.win ? "won" : "lost");
  renderUpgrades("rUp"); renderHUD();
}

// ---------------- render ----------------
function syncScene(dt) {
  if (!L) return;
  // camera behind the cannon, gently following it
  G.camX += (W2(G.cannonX) * 0.35 - G.camX) * Math.min(1, dt * 4);
  const intro = Math.max(0, G.intro), sh = G.shake;
  camera.position.set(G.camX + (Math.random() - 0.5) * sh, 11.5 + intro * 6, 12.5 + intro * 4 + (Math.random() - 0.5) * sh);
  camera.lookAt(G.camX * 0.6, 0, -20);
  cannon.position.x = W2(G.cannonX); aimLine.position.x = W2(G.cannonX); aimLine.position.z = 0.2; aimLine.visible = G.screen === "play" && !G.over;
  cannon.children.forEach((c, i) => { if (i === 9) c.position.z = -0.5 + (G.firing ? Math.sin(G.t * 60) * 0.05 : 0); });
  for (const gm of gateMeshes) { gm.grp.position.x = gm.baseX + W2(gateOff(gm.row)); gm.glass.material.opacity = gm.g.flash ? 0.85 : 0.55; if (gm.g.op === "-" && (gm.g.used || 0) >= gm.g.v) gm.grp.visible = false; }
  for (const hm of hazardMeshes) hm.arm.rotation.y = hm.h.a + G.t * hm.h.speed;
  baseMesh.scale.setScalar(1 + (G.base < G.baseMax && Math.random() < 0.3 ? 0.01 : 0));
  tubeFill.scale.y = Math.max(0.05, Math.min(3.2, 0.1 + G.earned / 25 + G.kills / 400)); tubeFill.position.y = 0.3 + tubeFill.scale.y / 2;
  // soldiers
  let nu = 0, ns = 0, nb = 0;
  for (const u of units) {
    if (u.big) continue;
    const y = Math.abs(Math.sin(u.wob)) * 0.12;
    tmp.position.set(W2(u.x), y, Z3(u.z)); tmp.rotation.set(0, 0, Math.sin(u.wob) * 0.12); tmp.scale.setScalar(1); tmp.updateMatrix();
    uBody.setMatrixAt(nu, tmp.matrix); uPack.setMatrixAt(nu, tmp.matrix); nu++;
    tmp.position.y = 0.02; tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); shadows.setMatrixAt(ns++, tmp.matrix);
  }
  let ne = 0;
  for (const e of enemies) {
    if (e.kind !== "soldier") continue;
    const y = Math.abs(Math.sin(e.wob)) * 0.12;
    tmp.position.set(W2(e.x), y, Z3(e.z)); tmp.rotation.set(0, 0, Math.sin(e.wob) * 0.12); tmp.scale.setScalar(1); tmp.updateMatrix();
    eBody.setMatrixAt(ne, tmp.matrix); eEyes.setMatrixAt(ne, tmp.matrix); ePup.setMatrixAt(ne, tmp.matrix); ne++;
    tmp.position.y = 0.02; tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); shadows.setMatrixAt(ns++, tmp.matrix);
  }
  const bigs = units.filter((u) => u.big).map((u) => [u, 2.2, 0x6dff6a, Math.PI]).concat(enemies.filter((e) => e.kind !== "soldier").map((e) => [e, e.kind === "boss" ? 4.6 : 2.4, e.kind === "boss" ? 0x2a3f9f : 0x1d3388, 0]));
  for (const [o, s, c, ry] of bigs) {
    if (nb >= MAXB) break;
    tmp.position.set(W2(o.x), Math.abs(Math.sin(o.wob * 0.6)) * 0.15 * s, Z3(o.z)); tmp.rotation.set(0, ry, Math.sin(o.wob * 0.6) * 0.08); tmp.scale.setScalar(s); tmp.updateMatrix();
    bBody.setMatrixAt(nb, tmp.matrix); col.setHex(c); bBody.setColorAt(nb, col);
    if (ry) { tmp.scale.setScalar(0.0001); tmp.updateMatrix(); }
    bEyes.setMatrixAt(nb, tmp.matrix); bPup.setMatrixAt(nb, tmp.matrix); nb++;
    tmp.position.y = 0.02; tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(s); tmp.updateMatrix(); shadows.setMatrixAt(ns++, tmp.matrix);
  }
  for (const [m, n] of [[uBody, nu], [uPack, nu], [eBody, ne], [eEyes, ne], [ePup, ne], [bBody, nb], [bEyes, nb], [bPup, nb], [shadows, ns]]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  if (bBody.instanceColor) bBody.instanceColor.needsUpdate = true;
  // particles
  for (let i = 0; i < PMAX; i++) {
    const p = parts[i];
    if (p) { pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z; pCol[i * 3] = p.r; pCol[i * 3 + 1] = p.g; pCol[i * 3 + 2] = p.b; }
    else { pPos[i * 3 + 1] = -100; }
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}
function bar(x, y, w, v, max, color, label) {
  o2.fillStyle = "rgba(0,0,0,0.5)"; rr(x - w / 2 - 2, y - 2, w + 4, 13, 7);
  o2.fillStyle = color; rr(x - w / 2, y, Math.max(0, w * (v / max)), 9, 5);
  if (label != null) { o2.font = "800 18px 'Baloo 2', 'Arial Black', sans-serif"; o2.textAlign = "center"; o2.textBaseline = "bottom"; o2.lineWidth = 4; o2.strokeStyle = "rgba(0,0,0,0.55)"; o2.strokeText(label, x, y - 2); o2.fillStyle = "#fff"; o2.fillText(label, x, y - 2); }
}
function rr(x, y, w, h, r) { o2.beginPath(); if (o2.roundRect) o2.roundRect(x, y, w, h, r); else o2.rect(x, y, w, h); o2.fill(); }
function drawOverlay() {
  o2.clearRect(0, 0, W, H);
  if (!L || G.screen !== "play") return;
  const b = toScreen(0, 6.6, Z3(LEN + 1.2)); bar(b.x, b.y, 120, G.base, G.baseMax, "#ff4d4d", fmt(Math.ceil(G.base)));
  for (const e of enemies) if (e.kind !== "soldier") { const s = toScreen(W2(e.x), e.kind === "boss" ? 5.2 : 2.8, Z3(e.z)); if (s.vis) bar(s.x, s.y, e.kind === "boss" ? 100 : 54, e.hp, e.maxHp, "#ff4d4d", fmt(Math.ceil(e.hp))); }
  for (const u of units) if (u.big) { const s = toScreen(W2(u.x), 2.6, Z3(u.z)); if (s.vis) bar(s.x, s.y, 50, u.hp, 30 + save.level * 2, "#3ddc5a", fmt(Math.ceil(u.hp))); }
  const c = toScreen(W2(G.cannonX), -0.2, 1.8); bar(c.x, c.y + 6, 110, G.wall, G.wallMax, "#3ddc5a", null);
  const t = toScreen(HALF + 2.6, 4.5, Z3(8)); if (t.vis) { o2.font = "800 22px 'Baloo 2', 'Arial Black', sans-serif"; o2.textAlign = "center"; o2.lineWidth = 5; o2.strokeStyle = "rgba(0,0,0,0.5)"; o2.strokeText(fmt(G.earned), t.x, t.y); o2.fillStyle = "#fff"; o2.fillText(fmt(G.earned), t.x, t.y); }
  const crowd = units.length; if (crowd > 1) { let sx = 0, sz = 0, n = 0; for (let i = 0; i < units.length; i += Math.max(1, units.length >> 5)) { sx += units[i].x; sz = Math.max(sz, units[i].z); n++; } const s = toScreen(W2(sx / n), 1.6, Z3(sz)); if (s.vis) { o2.font = "800 20px 'Baloo 2', 'Arial Black', sans-serif"; o2.textAlign = "center"; o2.lineWidth = 5; o2.strokeStyle = "rgba(10,60,20,0.75)"; o2.strokeText(fmt(crowd), s.x, s.y - 4); o2.fillStyle = "#b8ffb0"; o2.fillText(fmt(crowd), s.x, s.y - 4); } }
  for (const p of pops) { const s = toScreen(p.x, p.y, p.z); o2.globalAlpha = Math.min(1, (p.life / p.max) * 2.5); o2.font = "800 " + p.size + "px 'Baloo 2', 'Arial Black', sans-serif"; o2.textAlign = "center"; o2.textBaseline = "middle"; o2.lineWidth = 7; o2.strokeStyle = "rgba(0,0,0,0.45)"; o2.strokeText(p.s, s.x, s.y); o2.fillStyle = p.col; o2.fillText(p.s, s.x, s.y); o2.globalAlpha = 1; }
  for (const k of coinsFx) { const s = toScreen(k.x, k.y, k.z), u = k.t / 0.8, tx = W - 60, ty = 34, x = s.x + (tx - s.x) * u * u, y = s.y + (ty - s.y) * u * u; o2.fillStyle = "#ffcf3a"; o2.beginPath(); o2.arc(x, y, 9, 0, 6.3); o2.fill(); o2.strokeStyle = "#c98d00"; o2.lineWidth = 2; o2.stroke(); }
}

// ---------------- HUD & screens ----------------
function renderHUD() {
  $("hCoins").textContent = fmt(save.coins + (G.screen === "play" ? G.earned : 0));
  $("mCoins").textContent = fmt(save.coins);
  if (G.screen === "play" && L) {
    $("hProg").style.width = Math.round((1 - G.base / G.baseMax) * 100) + "%";
    $("hUnits").textContent = fmt(units.length);
    $("hEnemies").textContent = fmt(enemies.length + Math.max(0, G.armyLeft));
    $("bSuper").classList.toggle("ready", G.superReady);
    $("superFill").style.height = Math.round(G.superCharge * 100) + "%";
  }
}
function renderUpgrades(id) {
  const el = $(id);
  el.innerHTML = Object.keys(UPG).map((k) => { const l = save.up[k], u = UPG[k], c = u.cost(l); return '<button class="upg upg-' + k + '" data-k="' + k + '"' + (save.coins < c ? " disabled" : "") + '><span class="ico">' + u.icon + "</span><b>" + u.name + "</b><small>Niv. " + (l + 1) + " · " + u.desc(l) + '</small><span class="price"><i class="coin"></i>' + fmt(c) + "</span></button>"; }).join("");
  el.querySelectorAll(".upg").forEach((b) => (b.onclick = () => { const k = b.dataset.k, c = UPG[k].cost(save.up[k]); if (save.coins < c) return; save.coins -= c; save.up[k]++; persist(); Snd.init(); Snd.coin(); renderUpgrades(id); renderHUD(); if (id === "mUp") renderMenu(); }));
}
function renderMenu() {
  $("mLevel").textContent = "Niveau " + save.level + (save.level % 5 === 0 ? " · BOSS" : "");
  $("bSound").textContent = Snd.on ? "Son : oui" : "Son : non";
  renderUpgrades("mUp"); renderHUD();
}
function toMenu() {
  G.screen = "menu"; G.over = true; G.firing = false;
  $("menu").hidden = false; $("hud").hidden = true; $("result").hidden = true; $("pause").hidden = true;
  L = genLevel(save.level); buildLevel(L); units = []; enemies = []; G.intro = 0; renderMenu();
}

// ---------------- input: hold to fire, slide to aim ----------------
let dragFrom = null;
const toX = (cx) => clamp(G.cannonX + (cx - dragFrom.cx) / (W * 0.45), -0.92, 0.92);
cv.addEventListener("pointerdown", (e) => { Snd.init(); if (G.screen !== "play" || G.over || G.paused) return; try { cv.setPointerCapture(e.pointerId); } catch (_) {} dragFrom = { cx: e.clientX }; G.firing = true; $("hand").hidden = true; });
cv.addEventListener("pointermove", (e) => { if (G.firing && dragFrom) { G.cannonX = toX(e.clientX); dragFrom.cx = e.clientX; } });
const stop = () => { G.firing = false; dragFrom = null; };
cv.addEventListener("pointerup", stop); cv.addEventListener("pointercancel", stop);
window.addEventListener("keydown", (e) => {
  if (G.screen !== "play") return;
  if (e.key === "ArrowLeft") G.cannonX = clamp(G.cannonX - 0.08, -0.92, 0.92);
  if (e.key === "ArrowRight") G.cannonX = clamp(G.cannonX + 0.08, -0.92, 0.92);
  if (e.key === " ") { G.firing = true; e.preventDefault(); }
  if (e.key === "s" || e.key === "S") G.wantSuper = G.superReady;
});
window.addEventListener("keyup", (e) => { if (e.key === " ") G.firing = false; });
$("bSuper").onclick = () => { if (G.superReady) { G.wantSuper = true; Snd.init(); fire(); } };
$("bPlay").onclick = () => { Snd.init(); startLevel(); };
$("bNext").onclick = () => startLevel();
$("bResMenu").onclick = toMenu;
$("bPause").onclick = () => { if (G.screen !== "play" || G.over) return; G.paused = true; G.firing = false; $("pause").hidden = false; };
$("bResume").onclick = () => { G.paused = false; $("pause").hidden = true; };
$("bQuit").onclick = toMenu;
$("bSound").onclick = () => { Snd.on = !Snd.on; store.set("sound", Snd.on); renderMenu(); };
$("bNewRun").onclick = () => { save.seed = (Math.random() * 4294967296) >>> 0 || 9; save.level = 1; persist(); toMenu(); };
document.addEventListener("visibilitychange", () => { if (document.hidden && G.screen === "play" && !G.over) { G.paused = true; G.firing = false; $("pause").hidden = false; } });
let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("bInstall").hidden = false; });
$("bInstall").onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; $("bInstall").hidden = true; };
window.addEventListener("resize", resize);

// ---------------- loop ----------------
let last = performance.now(), acc = 0, hudT = 0, menuT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt;
  try { while (acc >= 1 / 60) { update(1 / 60); acc -= 1 / 60; } } catch (err) { console.error(err); acc = 0; }
  if (G.screen === "menu") { menuT += dt; G.cannonX = Math.sin(menuT * 0.6) * 0.5; }
  hudT += dt; if (hudT > 0.15) { hudT = 0; renderHUD(); }
  try { syncScene(dt); renderer.render(scene, camera); drawOverlay(); } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
(async () => {
  try { await Promise.race([document.fonts.load("800 40px 'Baloo 2'"), new Promise((r) => setTimeout(r, 1500))]); } catch (e) {}
  resize(); L = genLevel(save.level); buildLevel(L); renderMenu();
  requestAnimationFrame(frame);
})();
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
window.__sb = { G, save, genLevel, startLevel, units: () => units, enemies: () => enemies, L: () => L, step: (k) => { for (let i = 0; i < k && !G.over; i++) update(1 / 60); } };
