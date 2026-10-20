// Screenshots: menu, battles, bridge, boss, result. node test/shots.js (server on :8791)
const { chromium } = require("playwright"); const path = require("path"); const OUT = process.env.OUT || "/tmp";
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/net::|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto("http://localhost:8791/"); await p.evaluate(() => localStorage.setItem("shekibang.coins", "260")); await p.reload(); await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(OUT, "t_menu.png") });
  const play = async (n, name, waits) => {
    await p.evaluate((n) => { const S = window.__sb; S.save.level = n; S.save.seed = 12345; S.startLevel(); S.G.cannonX = S.genLevel(n).bestX; }, n);
    await p.mouse.move(195, 700); await p.mouse.down();
    let i = 0; for (const w of waits) { await p.waitForTimeout(w); await p.evaluate(() => { const S = window.__sb; S.G.cannonX = S.L().bestX; }); await p.screenshot({ path: path.join(OUT, name + "_" + i++ + ".png") }); }
    await p.mouse.up();
  };
  await play(1, "t_l1", [1800, 3500]);
  const lv = await p.evaluate(() => { const S = window.__sb; S.save.seed = 12345; let a = null; for (let n = 2; n < 30; n++) if (S.genLevel(n).bridge) { a = n; break; } return a; });
  if (lv) await play(lv, "t_bridge", [4000]);
  await play(10, "t_boss", [7500]);
  await p.evaluate(() => { const S = window.__sb; S.save.level = 2; S.startLevel(); S.G.base = 3; S.G.cannonX = S.L().bestX; });
  await p.mouse.move(195, 700); await p.mouse.down(); await p.waitForTimeout(4500); await p.mouse.up(); await p.waitForTimeout(1800);
  await p.screenshot({ path: path.join(OUT, "t_result.png") });
  const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
  console.log("bridge level", lv, "fps headless (logiciel)", fps, "erreurs:", errs); await b.close();
})();
