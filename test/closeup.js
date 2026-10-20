// Close-up of the toy soldiers (green squad and dark-blue army). node test/closeup.js
const { chromium } = require("playwright"); const path = require("path"); const OUT = process.env.OUT || "/tmp";
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:8791/"); await p.waitForTimeout(2000);
  await p.evaluate(() => { const S = window.__sb; S.save.level = 3; S.startLevel(); S.G.cannonX = S.L().bestX; S.G.firing = true; S.step(150); S.G.firing = false; S.G.paused = true; });
  await p.waitForTimeout(800); await p.screenshot({ path: path.join(OUT, "c_battle.png") });
  await p.screenshot({ path: path.join(OUT, "c_zoom.png"), clip: { x: 60, y: 260, width: 270, height: 260 } });
  console.log("erreurs:", errs); await b.close();
})();
