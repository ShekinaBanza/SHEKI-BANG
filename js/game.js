// SHEKI BANG — crowd cannon battler. Green squad vs dark-blue army, multiplier gates, endless levels.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cv = $("cv"), ctx = cv.getContext("2d");
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
    shot() { this.tone(260, 0.08, "triangle", 0.12, 1.8, 0, "shot", 70); },
    gate(m) { this.tone(520 + m * 60, 0.12, "sine", 0.12, 1.5, 0, "gate", 90); },
    pop() { this.tone(180, 0.07, "square", 0.05, 0.5, 0, "pop", 45); },
    base() { this.tone(110, 0.3, "sawtooth", 0.14, 0.4, 0, "base", 120); },
    hurt() { this.tone(90, 0.35, "square", 0.2, 0.5, 0, "hurt", 200); },
    coin() { this.tone(1320, 0.08, "sine", 0.1, 1.2, 0, "coin", 80); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, "triangle", 0.18, 1, i * 0.09)); },
    lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.4, "sawtooth", 0.1, 0.8, i * 0.15)); },
    superOn() { this.tone(300, 0.5, "sawtooth", 0.14, 3); },
  };

  // ---------------- progress & upgrades ----------------
  const save = {
    level: store.get("level", 1), coins: store.get("coins", 0), seed: store.get("seed", 0) >>> 0,
    up: Object.assign({ rate: 0, wall: 0, super: 0 }, store.get("up", {})),
  };
  if (!save.seed) { save.seed = (Math.random() * 4294967296) >>> 0 || 7; store.set("seed", save.seed); }
  const persist = () => { store.set("level", save.level); store.set("coins", save.coins); store.set("up", save.up); store.set("seed", save.seed); };
  const UPG = {
    rate: { name: "Cadence", desc: (l) => (7 + l * 0.8).toFixed(1).replace(".", ",") + " tirs/s", cost: (l) => Math.round(40 * Math.pow(1.45, l)) },
    wall: { name: "Rempart", desc: (l) => 20 + l * 4 + " PV", cost: (l) => Math.round(35 * Math.pow(1.4, l)) },
    super: { name: "Super soldat", desc: (l) => "charge en " + Math.max(12, 40 - l * 3) + " tirs", cost: (l) => Math.round(50 * Math.pow(1.5, l)) },
  };
  const fireRate = () => 7 + save.up.rate * 0.8;
  const wallHP = () => 20 + save.up.wall * 4;
  const superNeed = () => Math.max(12, 40 - save.up.super * 3);

  // ---------------- level generation (endless) ----------------
  const THEMES = [
    { name: "Désert", sky: ["#7fd0ff", "#fde7c2"], g1: "#efc27e", g2: "#dba862", side: "#c98b4a", deco: "cactus" },
    { name: "Neige", sky: ["#9fd6ff", "#eef7ff"], g1: "#f1f6fb", g2: "#d9e6f2", side: "#b8cde0", deco: "pine" },
    { name: "Prairie", sky: ["#8fd8ff", "#e8fbe3"], g1: "#86cc62", g2: "#6db84d", side: "#4f9a3b", deco: "tree" },
    { name: "Canyon", sky: ["#ffb58a", "#ffe2b8"], g1: "#d9875a", g2: "#c06f45", side: "#94502f", deco: "rock" },
  ];
  const LEN = 54;
  function genLevel(n) {
    const r = mulberry32(mix(save.seed, n));
    const boss = n % 5 === 0, d = n - 1;
    const L = {
      n, boss, theme: THEMES[(n - 1 + (save.seed % 4)) % 4], len: LEN,
      baseHP: Math.round(25 + d * 18 + (boss ? 60 + d * 10 : 0)),
      spawnEvery: Math.max(0.28, 1.25 - d * 0.035), wave: 1 + Math.floor(d / 3), enemySpeed: 3.2 + Math.min(2.4, d * 0.07),
      giantEvery: n >= 3 ? Math.max(5, 14 - d * 0.35) : 0, giantHP: 8 + Math.round(d * 3.2),
      bossHP: boss ? 120 + d * 28 : 0, rows: [], hazards: [], bridge: null, deco: [],
    };
    // gate rows between the cannon and the enemy base
    const nRows = Math.min(4, 2 + Math.floor(d / 6) + (r() < 0.4 ? 1 : 0));
    const zs = []; let z = 9 + r() * 3;
    for (let i = 0; i < nRows && z < 40; i++) { zs.push(z); z += 7 + r() * 5; }
    zs.forEach((gz, i) => {
      const late = i >= 1, pick = () => {
        const q = r(), bad = n >= 3 && r() < Math.min(0.35, 0.1 + d * 0.012);
        if (bad) return { op: "-", v: 10 + Math.floor(r() * (10 + d * 4)) };
        if (q < 0.4) return { op: "+", v: [1, 1, 2, 2, 3, 4][Math.floor(r() * (late ? 6 : 4))] };
        return { op: "x", v: [2, 2, 3, 3, 4, 5][Math.floor(r() * (late ? 6 : 4))] };
      };
      const layout = r();
      let gates = [];
      if (layout < 0.45) { const a = pick(), b = pick(); gates = [{ x0: -1, x1: -0.02, ...a }, { x0: 0.02, x1: 1, ...b }]; }
      else if (layout < 0.75) { gates = [{ x0: -1, x1: -0.36, ...pick() }, { x0: -0.32, x1: 0.32, ...pick() }, { x0: 0.36, x1: 1, ...pick() }]; }
      else { const w = 0.5 + r() * 0.4, c = (r() * 2 - 1) * (1 - w / 2) * 0.9; gates = [{ x0: c - w / 2, x1: c + w / 2, ...(r() < 0.5 ? { op: "x", v: 3 + Math.floor(r() * 3) } : pick()) }]; }
      // always keep at least one good gate in the row
      if (gates.every((g) => g.op === "-")) gates[0] = Object.assign(gates[0], { op: "x", v: 2 });
      const row = { z: gz, gates, move: null };
      if (n >= 4 && gates.length === 1 && r() < 0.7) row.move = { amp: 0.45, speed: 0.7 + r() * 0.8, ph: r() * 6 };
      L.rows.push(row);
    });
    // jackpot: a narrow, moving x10 / x100 gate on later levels
    if (n >= 7 && r() < 0.35) {
      const last = L.rows[L.rows.length - 1], jz = Math.min(44, last.z + 5.5);
      L.rows.push({ z: jz, gates: [{ x0: -0.14, x1: 0.14, op: "x", v: n >= 15 && r() < 0.4 ? 100 : 10 }], move: { amp: 0.75, speed: 1.1 + r() * 0.6, ph: r() * 6 }, jackpot: true });
    }
    // hazards: spinning blades between rows
    if (n >= 4) {
      const k = Math.min(3, 1 + Math.floor((n - 4) / 7));
      for (let i = 0; i < k; i++) {
        const hz = 7 + r() * 34;
        if (L.rows.some((rw) => Math.abs(rw.z - hz) < 2.5)) continue;
        L.hazards.push({ z: hz, x: (r() * 2 - 1) * 0.55, len: 0.35 + r() * 0.2, speed: (1.5 + r() * 1.5) * (r() < 0.5 ? -1 : 1), a: r() * 6 });
      }
    }
    // narrow bridge over a gap
    if (n >= 6 && r() < 0.45) { const bz = 14 + r() * 20; if (!L.rows.some((rw) => rw.z > bz - 1 && rw.z < bz + 7)) L.bridge = { z0: bz, z1: bz + 5, half: 0.32 + r() * 0.12, x: (r() * 2 - 1) * 0.25 }; }
    // balance: the enemy army is sized from what this level's gates can produce
    // best straight lane: what a good player gets by firing from one spot (moving gates counted at rest)
    let expMult = 1, bestX = 0;
    for (let x = -0.9; x <= 0.9001; x += 0.05) {
      if (L.bridge && Math.abs(x - L.bridge.x) > L.bridge.half - 0.04) continue;
      let m = 1;
      for (const rw of L.rows) { if (rw.jackpot) continue; const g = rw.gates.find((g) => x >= g.x0 + 0.03 && x <= g.x1 - 0.03); if (g) m *= g.op === "x" ? g.v : g.op === "+" ? 1 + g.v : 0.75; }
      if (m > expMult) { expMult = m; bestX = x; }
    }
    expMult = Math.min(40, expMult); L.bestX = bestX;
    const k = Math.min(0.85, 0.42 + d * 0.022), out = 7 * expMult;
    L.expMult = expMult;
    L.enemyRate = out * k * 0.42;                               // blue soldiers per second
    L.spawnEvery = 0.6; L.wave = Math.max(1, Math.round(L.enemyRate * 0.6));
    L.army = Math.round(L.enemyRate * (16 + Math.min(14, d * 0.8)));     // finite blue army: beat it, then smash the base
    L.baseHP = Math.max(60, Math.round(out * (1 - k * 0.42) * (22 + Math.min(18, d)) * 0.22 * (boss ? 1.4 : 1) / 10) * 10);
    L.giantHP = Math.round(10 + expMult * 1.5 + d * 2);
    L.bossHP = boss ? Math.round(out * 6) : 0;
    // scenery
    for (let i = 0; i < 46; i++) { const side = r() < 0.5 ? -1 : 1; L.deco.push({ x: side * (1.35 + r() * 2.6), z: r() * (LEN + 18) - 2, s: 0.7 + r() * 0.7, k: r() }); }
    return L;
  }

  // ---------------- state ----------------
  let L = null, units = [], enemies = [], fx = [], texts = [], coinsFx = [];
  const G = { screen: "menu", t: 0, base: 0, baseMax: 1, wall: 0, wallMax: 1, cannonX: 0, firing: false, fireAcc: 0, spawnAcc: 0, giantAcc: 0,
    shots: 0, superCharge: 0, superReady: false, kills: 0, earned: 0, over: false, shake: 0, bossSpawned: false, result: null, paused: false };
  let W = 0, H = 0, DPR = 1;
  const view = { y0: 0, yH: 0, halfW: 0, cx: 0, Zs: 34 };
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    view.cx = W / 2; view.y0 = H * 0.86; view.yH = H * 0.1; view.halfW = Math.min(W * 0.47, H * 0.27);
  }
  const P = (z) => 1 / (1 + z / view.Zs);
  const sy = (z) => view.yH + (view.y0 - view.yH) * P(z);
  const sx = (x, z) => view.cx + x * view.halfW * P(z);

  function startLevel() {
    L = genLevel(save.level);
    units = []; enemies = []; fx = []; texts = []; coinsFx = [];
    Object.assign(G, { t: 0, base: L.baseHP, baseMax: L.baseHP, wall: wallHP(), wallMax: wallHP(), cannonX: 0, firing: false, fireAcc: 0, spawnAcc: 0.5, giantAcc: 0,
      shots: 0, superCharge: 0, superReady: false, kills: 0, earned: 0, over: false, shake: 0, bossSpawned: false, result: null, paused: false, armyLeft: L.army });
    G.screen = "play";
    $("menu").hidden = true; $("hud").hidden = false; $("result").hidden = true;
    $("hLevel").textContent = (L.boss ? "BOSS · " : "NIVEAU ") + L.n;
    $("hTheme").textContent = L.theme.name;
    texts.push({ s: L.boss ? "NIVEAU BOSS" : "NIVEAU " + L.n, x: 0, z: 22, life: 1.4, max: 1.4, size: 34, col: "#ffffff" });
    renderHUD();
  }

  // ---------------- entities ----------------
  function addUnit(x, z, big, passed) {
    if (units.length >= 900 && !big) return null;
    const u = { x, z, vz: big ? 6 : 9, hp: big ? 30 + save.level * 2 : 1, big: !!big, passed: passed ? new Set(passed) : new Set(), wob: Math.random() * 6, dead: false, fall: 0 };
    units.push(u); return u;
  }
  function addEnemy(x, z, kind) {
    const e = { x, z, vz: kind === "boss" ? 1.1 : kind === "giant" ? 1.9 : L.enemySpeed * (0.85 + Math.random() * 0.3), hp: kind === "boss" ? L.bossHP : kind === "giant" ? L.giantHP : 1, kind: kind || "soldier", wob: Math.random() * 6, dead: false };
    e.maxHp = e.hp; enemies.push(e); return e;
  }
  function fire() {
    const big = G.superReady && G.wantSuper;
    if (big) { G.superReady = false; G.wantSuper = false; G.superCharge = 0; Snd.superOn(); texts.push({ s: "SUPER SOLDAT !", x: G.cannonX, z: 6, life: 1.1, max: 1.1, size: 22, col: "#7dff7a" }); }
    addUnit(G.cannonX + (Math.random() - 0.5) * 0.1, 0.6, big);
    G.shots++; Snd.shot();
    if (!G.superReady && !big) { G.superCharge += 1 / superNeed(); if (G.superCharge >= 1) { G.superCharge = 1; G.superReady = true; } }
    puff(G.cannonX, 0.7, "#ffffff", 4, 0.4);
  }
  function puff(x, z, col, n, sp) { for (let i = 0; i < n; i++) fx.push({ x, z, vx: (Math.random() - 0.5) * sp * 0.25, vz: (Math.random() - 0.3) * sp * 3, vy: Math.random() * 1.5, y: 0, life: 0.5 + Math.random() * 0.3, max: 0.8, col, r: 2 + Math.random() * 3 }); }
  const gateX = (row, g) => { const o = row.move ? Math.sin(G.t * row.move.speed + row.move.ph) * row.move.amp : 0; let a = g.x0 + o, b = g.x1 + o; return [Math.max(-1, a), Math.min(1, b)]; };
  function roadHalf(z) { if (L.bridge && z > L.bridge.z0 && z < L.bridge.z1) return { c: L.bridge.x, h: L.bridge.half }; return { c: 0, h: 1 }; }

  // ---------------- update ----------------
  function update(dt) {
    for (const p of fx) { p.x += p.vx * dt; p.z += p.vz * dt; p.vy -= 3 * dt; p.y = Math.max(0, p.y + p.vy * dt); p.life -= dt; }
    fx = fx.filter((p) => p.life > 0);
    for (const t of texts) { t.life -= dt; t.z += dt * 1.2; }
    texts = texts.filter((t) => t.life > 0);
    for (const c of coinsFx) { c.t += dt; }
    coinsFx = coinsFx.filter((c) => c.t < 0.9);
    G.shake = Math.max(0, G.shake - dt * 30);
    if (G.screen !== "play" || G.paused || G.over) return;
    G.t += dt;
    // cannon
    if (G.firing) { G.fireAcc += dt * fireRate(); while (G.fireAcc >= 1) { G.fireAcc -= 1; fire(); } }
    // enemy spawning
    G.spawnAcc += dt;
    if (G.spawnAcc >= L.spawnEvery) { G.spawnAcc -= L.spawnEvery; const room = 650 - enemies.length, k = Math.min(L.wave, room, G.armyLeft); G.armyLeft -= Math.max(0, k); for (let i = 0; i < k; i++) addEnemy((Math.random() * 2 - 1) * 0.7, L.len - 1.5 - Math.random() * 1.5); }
    if (L.giantEvery) { G.giantAcc += dt; if (G.giantAcc >= L.giantEvery) { G.giantAcc = 0; addEnemy((Math.random() * 2 - 1) * 0.4, L.len - 2, "giant"); } }
    if (L.boss && !G.bossSpawned && G.t > 6) { G.bossSpawned = true; addEnemy(0, L.len - 2.5, "boss"); texts.push({ s: "LE BOSS ARRIVE !", x: 0, z: 30, life: 1.6, max: 1.6, size: 26, col: "#ff5a5a" }); Snd.hurt(); }
    // units
    const born = [];
    for (const u of units) {
      if (u.dead) continue;
      const pz = u.z; u.z += u.vz * dt; u.wob += dt * 8;
      u.x += Math.sin(u.wob) * 0.004;
      // gates
      for (let ri = 0; ri < L.rows.length; ri++) {
        const row = L.rows[ri];
        if (pz < row.z && u.z >= row.z) row.gates.forEach((g, gi) => {
          const key = ri * 8 + gi; if (u.passed.has(key)) return;
          const [a, b] = gateX(row, g);
          if (u.x < a || u.x > b) return;
          u.passed.add(key);
          if (g.op === "-") { if ((g.used || 0) < g.v) { g.used = (g.used || 0) + 1; u.dead = true; puff(u.x, u.z, "#ff6b6b", 3, 0.6); } return; }
          const extra = g.op === "+" ? g.v : g.v - 1;
          const spread = Math.min((b - a) * 0.9, 0.16 + 0.05 * Math.sqrt(extra));
          for (let k = 0; k < extra; k++) born.push({ x: clamp(u.x + (Math.random() - 0.5) * spread, a + 0.03, b - 0.03), z: u.z - Math.random() * 1.2, passed: u.passed });
          g.flash = 0.25; Snd.gate(Math.min(10, g.v));
        });
      }
      // hazards
      for (const h of L.hazards) {
        if (Math.abs(u.z - h.z) > h.len * 3) continue;
        const ang = h.a + G.t * h.speed, ex = h.x + Math.cos(ang) * h.len, ez = h.z + Math.sin(ang) * h.len * 2.6;
        const t = clamp(((u.x - h.x) * (ex - h.x) + ((u.z - h.z) / 2.6) * ((ez - h.z) / 2.6)) / (h.len * h.len), 0, 1);
        const qx = h.x + (ex - h.x) * t, qz = h.z + (ez - h.z) * t;
        if (Math.abs(u.x - qx) < 0.06 && Math.abs(u.z - qz) < 0.5) { if (u.big) { u.hp -= 1; if (u.hp <= 0) u.dead = true; } else u.dead = true; puff(u.x, u.z, "#3ddc5a", 3, 0.8); Snd.pop(); }
      }
      // road edges / bridge
      const rh = roadHalf(u.z);
      if (Math.abs(u.x - rh.c) > rh.h) { if (L.bridge && u.z > L.bridge.z0 && u.z < L.bridge.z1) { u.dead = true; u.fell = true; fx.push({ x: u.x, z: u.z, vx: 0, vz: 0, vy: 0, y: 0, life: 0.6, max: 0.6, col: "#3ddc5a", r: 6, fall: true }); continue; } u.x = clamp(u.x, rh.c - rh.h, rh.c + rh.h); }
      // reaching the enemy base
      if (u.z >= L.len - 1.2) {
        const dmg = u.big ? Math.max(5, u.hp) : 1;
        G.base -= dmg; u.dead = true; Snd.base(); puff(u.x, u.z, "#ffd34d", u.big ? 14 : 3, 1.2);
        if (Math.random() < 0.15 || u.big) coinsFx.push({ x: u.x, z: u.z, t: 0 });
        if (G.base <= 0) { G.base = 0; return endLevel(true); }
      }
    }
    for (const b of born) addUnit(b.x, b.z, false, b.passed);
    // enemies
    for (const e of enemies) {
      if (e.dead) continue;
      e.z -= e.vz * dt; e.wob += dt * 7;
      e.x += clamp((e.tx != null ? e.tx : G.cannonX) - e.x, -1, 1) * dt * (e.kind === "soldier" ? 0.9 : 0.4);
      const rh = roadHalf(e.z); e.x = clamp(e.x, rh.c - rh.h + 0.05, rh.c + rh.h - 0.05);
      if (e.z <= 0.8) { e.dead = true; G.wall -= e.kind === "boss" ? 10 : e.kind === "giant" ? 3 : 1; G.shake = 10; Snd.hurt(); puff(e.x, 0.8, "#1c2f6e", 8, 1); if (G.wall <= 0) { G.wall = 0; return endLevel(false); } }
    }
    // enemies lock on the closest green unit in front of them
    if (units.length) for (const e of enemies) { if (e.dead) continue; let bd = 9, bx = null; for (let i = 0; i < units.length; i += Math.max(1, units.length >> 6)) { const u = units[i], dz = e.z - u.z; if (dz > 0 && dz < 6) { const dd = Math.abs(u.x - e.x) + dz * 0.1; if (dd < bd) { bd = dd; bx = u.x; } } } e.tx = bx; } else for (const e of enemies) e.tx = null;
    // fights: bucket enemies by z
    const buckets = new Map();
    for (const e of enemies) { if (e.dead) continue; const k = Math.floor(e.z); (buckets.get(k) || buckets.set(k, []).get(k)).push(e); }
    for (const u of units) {
      if (u.dead) continue;
      const k = Math.floor(u.z), rx = u.big ? 0.12 : 0.06, rz = u.big ? 1.0 : 0.55;
      for (let kk = k - 1; kk <= k + 1 && !u.dead; kk++) {
        const list = buckets.get(kk); if (!list) continue;
        for (const e of list) {
          if (e.dead) continue;
          const ex = e.kind === "boss" ? 0.3 : e.kind === "giant" ? 0.14 : 0.06, ez = e.kind === "boss" ? 1.6 : e.kind === "giant" ? 1.0 : 0.55;
          if (Math.abs(u.x - e.x) < rx + ex && Math.abs(u.z - e.z) < (rz + ez) / 2) {
            const hit = Math.min(u.hp, e.hp); u.hp -= hit; e.hp -= hit;
            if (e.hp <= 0) { e.dead = true; G.kills++; puff(e.x, e.z, "#2a4aa8", e.kind === "soldier" ? 3 : 16, 1); if (e.kind !== "soldier") { G.earned += e.kind === "boss" ? 40 : 6; coinsFx.push({ x: e.x, z: e.z, t: 0 }); Snd.coin(); } }
            if (u.hp <= 0) { u.dead = true; puff(u.x, u.z, "#3ddc5a", 2, 0.8); }
            Snd.pop();
            if (u.dead) break;
          }
        }
      }
    }
    units = units.filter((u) => !u.dead); enemies = enemies.filter((e) => !e.dead);
    for (const row of L.rows) for (const g of row.gates) if (g.flash) g.flash = Math.max(0, g.flash - dt);
    if (Math.random() < 0.1) renderHUD();
  }
  function endLevel(win) {
    G.over = true; G.firing = false;
    const reward = win ? 20 + L.n * 6 + Math.floor(G.kills / 4) + G.earned : Math.floor(G.kills / 8) + Math.floor(G.earned / 2);
    G.result = { win, reward };
    if (win) { Snd.win(); G.shake = 14; for (let i = 0; i < 80; i++) fx.push({ x: (Math.random() * 2 - 1) * 0.9, z: L.len - 2 - Math.random() * 6, vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, y: 0, life: 1.4, max: 1.4, col: ["#ffd34d", "#3ddc5a", "#ff6b6b", "#5ad1ff", "#ffffff"][i % 5], r: 3 + Math.random() * 3, confetti: true }); }
    else Snd.lose();
    setTimeout(() => showResult(), win ? 1300 : 900);
  }
  function showResult() {
    const r = G.result; if (!r || G.screen !== "play") return;
    save.coins += r.reward; if (r.win) save.level++; persist();
    $("rTitle").textContent = r.win ? (L.boss ? "BOSS VAINCU !" : "VICTOIRE !") : "LA BASE EST TOMBÉE";
    $("rText").textContent = r.win ? "Base ennemie détruite. " + fmt(G.kills) + " ennemis éliminés." : "L'armée bleue a percé ton rempart. Améliore ton canon et réessaie.";
    $("rCoins").textContent = "+" + fmt(r.reward);
    $("bNext").textContent = r.win ? "NIVEAU " + save.level : "RÉESSAYER";
    $("result").hidden = false; $("result").className = "screen modal " + (r.win ? "won" : "lost");
    renderUpgrades("rUp"); renderHUD();
  }

  // ---------------- draw ----------------
  function roadPoly(z0, z1, c, h) { return [[sx(c - h, z0), sy(z0)], [sx(c + h, z0), sy(z0)], [sx(c + h, z1), sy(z1)], [sx(c - h, z1), sy(z1)]]; }
  function fillPoly(pts, col) { ctx.fillStyle = col; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); }
  function drawScene() {
    const th = L ? L.theme : THEMES[0];
    const sk = ctx.createLinearGradient(0, 0, 0, sy(LEN + 10)); sk.addColorStop(0, th.sky[0]); sk.addColorStop(1, th.sky[1]);
    ctx.fillStyle = sk; ctx.fillRect(0, 0, W, H);
    // far hills
    ctx.fillStyle = th.side; const hy = sy(LEN + 12);
    ctx.beginPath(); ctx.moveTo(0, hy + 10); for (let i = 0; i <= 12; i++) ctx.lineTo((W * i) / 12, hy - 18 - Math.sin(i * 1.7) * 14 - (i % 3) * 6); ctx.lineTo(W, hy + 10); ctx.fill();
    // ground
    const gg = ctx.createLinearGradient(0, hy, 0, H); gg.addColorStop(0, th.g2); gg.addColorStop(1, th.g1);
    ctx.fillStyle = gg; ctx.fillRect(0, hy, W, H - hy);
    if (!L) return;
    // road with optional bridge gap
    const segs = L.bridge ? [[0, L.bridge.z0], [L.bridge.z1, LEN + 1]] : [[0, LEN + 1]];
    for (const [a, b] of segs) {
      fillPoly(roadPoly(a, b, 0, 1.08), "#d8d2c6");
      fillPoly(roadPoly(a, b, 0, 1), "#6c7280");
    }
    if (L.bridge) {
      const B = L.bridge;
      fillPoly(roadPoly(B.z0, B.z1, 0, 1.25), "rgba(60,40,30,0.55)");
      for (let z = B.z0; z < B.z1; z += 0.45) fillPoly(roadPoly(z, z + 0.38, B.x, B.half), z % 0.9 < 0.45 ? "#a8743f" : "#94642f");
      ctx.strokeStyle = "#5a3a1c"; ctx.lineWidth = 2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx(B.x + s * B.half, B.z0), sy(B.z0) - 14 * P(B.z0)); ctx.lineTo(sx(B.x + s * B.half, B.z1), sy(B.z1) - 14 * P(B.z1)); ctx.stroke(); }
    }
    // lane dashes
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let z = 1; z < LEN; z += 2.4) { if (L.bridge && z > L.bridge.z0 - 1 && z < L.bridge.z1) continue; fillPoly(roadPoly(z, z + 1.1, 0, 0.018), "rgba(255,255,255,0.7)"); }
    // fences
    for (let z = 0; z < LEN; z += 1.6) for (const s of [-1, 1]) {
      if (L.bridge && z > L.bridge.z0 - 0.5 && z < L.bridge.z1) continue;
      const x = sx(s * 1.1, z), y = sy(z), p = P(z);
      ctx.fillStyle = "#8a5a2b"; ctx.fillRect(x - 2 * p, y - 16 * p, 4 * p, 16 * p);
    }
    for (const s of [-1, 1]) { ctx.strokeStyle = "#a87038"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx(s * 1.1, 0), sy(0) - 12); ctx.lineTo(sx(s * 1.1, LEN), sy(LEN) - 12 * P(LEN)); ctx.stroke(); }
  }
  function drawDeco(d) {
    const p = P(d.z), x = sx(d.x, d.z), y = sy(d.z), s = 26 * p * d.s, k = L.theme.deco;
    ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.beginPath(); ctx.ellipse(x, y, s * 0.6, s * 0.18, 0, 0, 6.3); ctx.fill();
    if (k === "cactus") { ctx.fillStyle = "#3f9b4a"; rr(x - s * 0.15, y - s * 1.3, s * 0.3, s * 1.3, s * 0.15); rr(x - s * 0.5, y - s * 0.95, s * 0.22, s * 0.5, s * 0.11); rr(x + s * 0.28, y - s * 1.05, s * 0.22, s * 0.55, s * 0.11); }
    else if (k === "pine") { ctx.fillStyle = "#6b4a2b"; ctx.fillRect(x - s * 0.08, y - s * 0.4, s * 0.16, s * 0.4); ctx.fillStyle = "#2f6b4f"; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x, y - s * (1.6 - i * 0.35)); ctx.lineTo(x + s * (0.35 + i * 0.12), y - s * (0.75 - i * 0.2)); ctx.lineTo(x - s * (0.35 + i * 0.12), y - s * (0.75 - i * 0.2)); ctx.fill(); } ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(x, y - s * 1.6); ctx.lineTo(x + s * 0.12, y - s * 1.35); ctx.lineTo(x - s * 0.12, y - s * 1.35); ctx.fill(); }
    else if (k === "tree") { ctx.fillStyle = "#7a5230"; ctx.fillRect(x - s * 0.08, y - s * 0.6, s * 0.16, s * 0.6); ctx.fillStyle = d.k < 0.5 ? "#3f9e43" : "#56b04a"; ctx.beginPath(); ctx.arc(x, y - s * 0.95, s * 0.5, 0, 6.3); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.arc(x - s * 0.15, y - s * 1.1, s * 0.2, 0, 6.3); ctx.fill(); }
    else { ctx.fillStyle = d.k < 0.5 ? "#b8673e" : "#a35a34"; ctx.beginPath(); ctx.moveTo(x - s * 0.6, y); ctx.lineTo(x - s * 0.35, y - s * 0.7); ctx.lineTo(x + s * 0.2, y - s * 0.85); ctx.lineTo(x + s * 0.6, y); ctx.fill(); }
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill(); }
  function drawGateRow(row, ri) {
    const z = row.z, p = P(z), y = sy(z), h = 52 * p + 12;
    for (const g of row.gates) {
      const [a, b] = gateX(row, g), x0 = sx(a, z) + 2, x1 = sx(b, z) - 2;
      const col = g.op === "-" ? ["#ff5d5d", "#c9302c"] : g.op === "+" ? ["#4aa8ff", "#1f6fd1"] : row.jackpot ? ["#ffd34d", "#e09b12"] : ["#b56cff", "#7b35d6"];
      const gr = ctx.createLinearGradient(0, y - h, 0, y); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]);
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, y + 2, (x1 - x0) / 2, 5 * p + 2, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = col[1]; rr(x0, y - h - 7 * p, x1 - x0, 10 * p + 4, 4);
      ctx.globalAlpha = 0.9; ctx.fillStyle = gr; rr(x0, y - h, x1 - x0, h, 6 * p + 2); ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x0, y - 6 * p - 2, x1 - x0, 6 * p + 2);
      ctx.strokeStyle = g.flash ? "#ffffff" : "rgba(255,255,255,0.7)"; ctx.lineWidth = g.flash ? 4 : 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y - h, x1 - x0, h, 6 * p + 2) : ctx.rect(x0, y - h, x1 - x0, h); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(x0 + 4, y - h + 3, x1 - x0 - 8, h * 0.18);
      const label = (g.op === "x" ? "×" : g.op === "+" ? "+" : "−") + g.v + (g.op === "-" && g.used ? "" : "");
      ctx.font = "900 " + Math.round(h * 0.62) + "px 'Baloo 2', 'Arial Black', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, h * 0.1); ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.strokeText(label, (x0 + x1) / 2, y - h / 2 + 1);
      ctx.fillStyle = "#ffffff"; ctx.fillText(label, (x0 + x1) / 2, y - h / 2 + 1);
      if (g.op === "-") { const left = Math.max(0, g.v - (g.used || 0)); if (left === 0) { ctx.fillStyle = "rgba(0,0,0,0.35)"; rr(x0, y - h, x1 - x0, h, 6 * p + 2); } }
    }
  }
  function blob(x, z, col, dark, size, wob, eyes, extra) {
    const p = P(z), X = sx(x, z), Y = sy(z), r = size * p, bob = Math.abs(Math.sin(wob)) * r * 0.3;
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(X, Y, r * 0.9, r * 0.32, 0, 0, 6.3); ctx.fill();
    const by = Y - r - bob;
    const g = ctx.createRadialGradient(X - r * 0.35, by - r * 0.4, r * 0.1, X, by, r * 1.1); g.addColorStop(0, col); g.addColorStop(1, dark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X, by, r * 0.85, r, 0, 0, 6.3); ctx.fill();
    if (eyes && r > 2.5) {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X - r * 0.3, by - r * 0.15, r * 0.24, 0, 6.3); ctx.arc(X + r * 0.3, by - r * 0.15, r * 0.24, 0, 6.3); ctx.fill();
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(X - r * 0.28, by - r * 0.12 + (extra ? -r * 0.04 : r * 0.04), r * 0.11, 0, 6.3); ctx.arc(X + r * 0.32, by - r * 0.12 + (extra ? -r * 0.04 : r * 0.04), r * 0.11, 0, 6.3); ctx.fill();
      if (extra) { ctx.strokeStyle = "#0a0f24"; ctx.lineWidth = Math.max(1, r * 0.12); ctx.beginPath(); ctx.moveTo(X - r * 0.55, by - r * 0.5); ctx.lineTo(X - r * 0.1, by - r * 0.32); ctx.moveTo(X + r * 0.55, by - r * 0.5); ctx.lineTo(X + r * 0.1, by - r * 0.32); ctx.stroke(); }
    }
    return { X, by, r };
  }
  function hpBar(X, Y, w, v, max, col, label) {
    ctx.fillStyle = "rgba(0,0,0,0.45)"; rr(X - w / 2 - 2, Y - 2, w + 4, 12, 6);
    ctx.fillStyle = col; rr(X - w / 2, Y, Math.max(0, w * (v / max)), 8, 4);
    if (label != null) { ctx.font = "900 16px 'Baloo 2', 'Arial Black', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.strokeText(label, X, Y - 3); ctx.fillStyle = "#fff"; ctx.fillText(label, X, Y - 3); }
  }
  function drawBase() {
    const z = L.len, p = P(z), X = sx(0, z), Y = sy(z), w = view.halfW * p * 1.5, h = 70 * p + 30;
    const dmg = 1 - G.base / G.baseMax;
    ctx.fillStyle = "#14224f"; rr(X - w / 2, Y - h, w, h, 6);
    ctx.fillStyle = "#1f3a8a"; rr(X - w / 2 + 4, Y - h + 4, w - 8, h * 0.45, 4);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = "#14224f"; ctx.fillRect(X - w / 2 + (i * w) / 4.5, Y - h - 10, w / 9, 12); }
    ctx.fillStyle = "#0a1230"; rr(X - w * 0.14, Y - h * 0.5, w * 0.28, h * 0.5, w * 0.1);
    ctx.fillStyle = "#ff4d4d"; ctx.beginPath(); ctx.moveTo(X, Y - h - 34); ctx.lineTo(X + 22, Y - h - 27); ctx.lineTo(X, Y - h - 20); ctx.fill(); ctx.fillStyle = "#333"; ctx.fillRect(X - 1.5, Y - h - 36, 3, 26);
    if (dmg > 0.3) { ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X - w * 0.3, Y - h * 0.9); ctx.lineTo(X - w * 0.15, Y - h * 0.6); ctx.lineTo(X - w * 0.25, Y - h * 0.4); ctx.stroke(); }
    hpBar(X, Y - h - 52, Math.max(90, w), G.base, G.baseMax, "#ff4d4d", fmt(Math.ceil(G.base)));
  }
  function drawCannon() {
    const X = sx(G.cannonX, 0), Y = sy(0) + 6, s = Math.min(1.4, view.halfW / 150);
    // aim line
    ctx.setLineDash([6, 8]); ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X, Y - 40 * s); ctx.lineTo(sx(G.cannonX, 14), sy(14)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(X, Y + 8 * s, 40 * s, 10 * s, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#1d2433"; for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(X + d * 26 * s, Y, 12 * s, 0, 6.3); ctx.fill(); }
    ctx.fillStyle = "#ffcf3a"; for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(X + d * 26 * s, Y, 5 * s, 0, 6.3); ctx.fill(); }
    const g = ctx.createLinearGradient(X - 20 * s, 0, X + 20 * s, 0); g.addColorStop(0, "#2fbf4a"); g.addColorStop(0.5, "#6dff7d"); g.addColorStop(1, "#1e9a37");
    ctx.fillStyle = "#2a8f3c"; rr(X - 28 * s, Y - 16 * s, 56 * s, 18 * s, 8 * s);
    ctx.fillStyle = g; rr(X - 13 * s, Y - 54 * s, 26 * s, 44 * s, 12 * s);
    ctx.fillStyle = "#145c25"; ctx.beginPath(); ctx.ellipse(X, Y - 52 * s, 11 * s, 5 * s, 0, 0, 6.3); ctx.fill();
    if (G.superReady) { ctx.strokeStyle = "rgba(125,255,122," + (0.5 + 0.5 * Math.sin(G.t * 8)) + ")"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(X, Y - 20 * s, 46 * s, 0, 6.3); ctx.stroke(); }
    hpBar(X, Y + 22 * s, 120, G.wall, G.wallMax, "#3ddc5a", null);
  }
  function drawHazard(h) {
    const ang = h.a + G.t * h.speed, x0 = sx(h.x, h.z), y0 = sy(h.z) - 10 * P(h.z), ex = h.x + Math.cos(ang) * h.len, ez = h.z + Math.sin(ang) * h.len * 2.6;
    ctx.strokeStyle = "#5d6470"; ctx.lineWidth = 10 * P(h.z) + 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(sx(ex, ez), sy(ez) - 10 * P(ez)); ctx.stroke();
    ctx.fillStyle = "#c7ccd6"; ctx.beginPath(); ctx.arc(sx(ex, ez), sy(ez) - 10 * P(ez), 12 * P(ez) + 4, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#ff5d5d"; for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28 + G.t * 10, R = 12 * P(ez) + 7; ctx.beginPath(); ctx.arc(sx(ex, ez) + Math.cos(a) * R, sy(ez) - 10 * P(ez) + Math.sin(a) * R * 0.6, 2.2, 0, 6.3); ctx.fill(); }
    ctx.fillStyle = "#2b2f38"; ctx.beginPath(); ctx.arc(x0, y0, 6 * P(h.z) + 3, 0, 6.3); ctx.fill();
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.save(); if (G.shake) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
    drawScene();
    if (L) {
      const items = [];
      for (const d of L.deco) items.push([d.z, 0, d]);
      L.rows.forEach((row, i) => items.push([row.z + 0.05, 1, row, i]));
      for (const h of L.hazards) items.push([h.z, 2, h]);
      for (const u of units) items.push([u.z, 3, u]);
      for (const e of enemies) items.push([e.z, 4, e]);
      for (const p of fx) items.push([p.z, 5, p]);
      items.sort((a, b) => b[0] - a[0]);
      drawBase();
      for (const it of items) {
        const o = it[2];
        if (it[1] === 0) { if (o.z > 0) drawDeco(o); }
        else if (it[1] === 1) drawGateRow(o, it[3]);
        else if (it[1] === 2) drawHazard(o);
        else if (it[1] === 3) { const b = blob(o.x, o.z, o.big ? "#9dff8a" : "#5cf06f", o.big ? "#1e8a32" : "#1aa33a", o.big ? 30 : 13, o.wob, true, false); if (o.big) hpBar(b.X, b.by - b.r - 16, 34, o.hp, 30 + save.level * 2, "#3ddc5a", null); }
        else if (it[1] === 4) { const big = o.kind !== "soldier", b = blob(o.x, o.z, o.kind === "boss" ? "#3550b8" : "#2b47a8", "#0c173f", o.kind === "boss" ? 64 : o.kind === "giant" ? 30 : 13, o.wob, true, true); if (big) hpBar(b.X, b.by - b.r - 8, o.kind === "boss" ? 90 : 40, o.hp, o.maxHp, "#ff4d4d", fmt(Math.ceil(o.hp))); }
        else { const P0 = P(o.z); ctx.globalAlpha = Math.max(0, o.life / o.max); ctx.fillStyle = o.col; ctx.beginPath(); if (o.confetti) ctx.rect(sx(o.x, o.z), sy(o.z) - o.y * 40 * P0, o.r * 1.6, o.r); else if (o.fall) ctx.arc(sx(o.x, o.z), sy(o.z) + (1 - o.life / o.max) * 60, o.r * P0 * 2, 0, 6.3); else ctx.arc(sx(o.x, o.z), sy(o.z) - o.y * 30 * P0 - 6 * P0, o.r * (0.6 + P0), 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
      }
      drawCannon();
      for (const c of coinsFx) { const u = c.t / 0.9, X = sx(c.x, c.z) + (W - 40 - sx(c.x, c.z)) * u * u, Y = sy(c.z) + (30 - sy(c.z)) * u * u; ctx.fillStyle = "#ffcf3a"; ctx.beginPath(); ctx.arc(X, Y, 7, 0, 6.3); ctx.fill(); ctx.strokeStyle = "#c98d00"; ctx.lineWidth = 2; ctx.stroke(); }
      for (const t of texts) { const a = Math.min(1, t.life / t.max * 2.5); ctx.globalAlpha = a; ctx.font = "900 " + t.size + "px 'Baloo 2', 'Arial Black', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.strokeText(t.s, sx(t.x, t.z), sy(t.z)); ctx.fillStyle = t.col; ctx.fillText(t.s, sx(t.x, t.z), sy(t.z)); ctx.globalAlpha = 1; }
    }
    ctx.restore();
  }

  // ---------------- HUD & screens ----------------
  function renderHUD() {
    $("hCoins").textContent = fmt(save.coins + (G.screen === "play" ? G.earned : 0));
    $("mCoins").textContent = fmt(save.coins);
    if (G.screen === "play") {
      $("hUnits").textContent = fmt(units.length);
      $("hEnemies").textContent = fmt(enemies.length + Math.max(0, G.armyLeft || 0));
      $("bSuper").classList.toggle("ready", G.superReady);
      $("superFill").style.width = Math.round(G.superCharge * 100) + "%";
    }
  }
  function renderUpgrades(id) {
    const el = $(id);
    el.innerHTML = Object.keys(UPG).map((k) => { const l = save.up[k], u = UPG[k], c = u.cost(l); return '<button class="upg" data-k="' + k + '"' + (save.coins < c ? " disabled" : "") + '><b>' + u.name + "</b><small>Niv. " + (l + 1) + " · " + u.desc(l) + '</small><span class="price"><i class="coin"></i>' + fmt(c) + "</span></button>"; }).join("");
    el.querySelectorAll(".upg").forEach((b) => (b.onclick = () => { const k = b.dataset.k, c = UPG[k].cost(save.up[k]); if (save.coins < c) return; save.coins -= c; save.up[k]++; persist(); Snd.init(); Snd.coin(); renderUpgrades(id); renderHUD(); if (id === "mUp") renderMenu(); }));
  }
  function renderMenu() {
    $("mLevel").textContent = "Niveau " + save.level + (save.level % 5 === 0 ? " · BOSS" : "");
    $("bSound").textContent = "Son : " + (Snd.on ? "oui" : "non");
    renderUpgrades("mUp"); renderHUD();
  }
  function toMenu() { G.screen = "menu"; G.over = true; $("menu").hidden = false; $("hud").hidden = true; $("result").hidden = true; $("pause").hidden = true; L = genLevel(save.level); units = []; enemies = []; renderMenu(); }

  // ---------------- input: hold to fire, slide to aim ----------------
  const toX = (cx) => clamp((cx - view.cx) / view.halfW, -0.9, 0.9);
  cv.addEventListener("pointerdown", (e) => { Snd.init(); if (G.screen !== "play" || G.over || G.paused) return; try { cv.setPointerCapture(e.pointerId); } catch (_) {} G.firing = true; G.cannonX = toX(e.clientX); $("hint").hidden = true; });
  cv.addEventListener("pointermove", (e) => { if (G.firing) G.cannonX = toX(e.clientX); });
  const stop = () => { G.firing = false; };
  cv.addEventListener("pointerup", stop); cv.addEventListener("pointercancel", stop);
  window.addEventListener("keydown", (e) => {
    if (G.screen !== "play") return;
    if (e.key === "ArrowLeft") G.cannonX = clamp(G.cannonX - 0.08, -0.9, 0.9);
    if (e.key === "ArrowRight") G.cannonX = clamp(G.cannonX + 0.08, -0.9, 0.9);
    if (e.key === " ") { G.firing = true; e.preventDefault(); }
    if (e.key === "s" || e.key === "S") G.wantSuper = G.superReady;
  });
  window.addEventListener("keyup", (e) => { if (e.key === " ") G.firing = false; });
  $("bSuper").onclick = () => { if (G.superReady) { G.wantSuper = true; Snd.init(); if (!G.firing) fire(); } };
  $("bPlay").onclick = () => { Snd.init(); startLevel(); $("hint").hidden = save.level > 2; };
  $("bNext").onclick = () => { startLevel(); };
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
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt;
    try { while (acc >= 1 / 60) { update(1 / 60); acc -= 1 / 60; } } catch (err) { console.error(err); acc = 0; }
    try { draw(); } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  resize(); L = genLevel(save.level); renderMenu();
  requestAnimationFrame(frame);
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  window.__sb = { G, save, genLevel, startLevel, units: () => units, enemies: () => enemies, L: () => L, step: (k) => { for (let i = 0; i < k && !G.over; i++) update(1 / 60); } };
})();
