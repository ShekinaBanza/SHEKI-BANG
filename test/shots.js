// Screenshots of the menu, battles (desert, snow, bridge, boss) and the result card. node test/shots.js
const { chromium } = require("playwright"); const path = require("path"); const OUT = process.env.OUT || "/tmp";
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/net::|Failed to load/.test(m.text())) errs.push(m.text()); });
  await p.goto("http://localhost:8791/"); await p.evaluate(() => { localStorage.setItem("shekibang.coins", "260"); }); await p.reload(); await p.waitForTimeout(700);
  await p.screenshot({ path: path.join(OUT, "s_menu.png") });
  const play = async (n, name, waits) => {
    await p.evaluate((n) => { const S = window.__sb; S.save.level = n; S.save.seed = 12345; document.getElementById("menu").hidden = true; S.startLevel(); }, n);
    const x = await p.evaluate(() => window.__sb.L().bestX);
    const px = 195 + x * Math.min(390 * 0.43, 844 * 0.24);
    await p.mouse.move(px, 700); await p.mouse.down();
    let i = 0; for (const w of waits) { await p.waitForTimeout(w); await p.screenshot({ path: path.join(OUT, name + "_" + i++ + ".png") }); }
    await p.mouse.up();
  };
  await play(1, "s_l1", [2500, 3000]);
  const lv = await p.evaluate(() => { const S = window.__sb; let a = null, bb = null; for (let n = 2; n < 30; n++) { const L = S.genLevel(n); if (!a && L.bridge) a = n; if (!bb && L.hazards.length && L.theme.name === "Neige") bb = n; } return [a, bb]; });
  console.log("pont au niveau", lv[0], "neige+lames au niveau", lv[1]);
  await p.evaluate(() => { window.__sb.save.seed = 12345; });
  if (lv[0]) await play(lv[0], "s_bridge", [3500]);
  if (lv[1]) await play(lv[1], "s_snow", [3500]);
  await play(10, "s_boss", [8500]);
  // finish a level quickly to show the result card
  await p.evaluate(() => { const S = window.__sb; S.save.level = 2; S.startLevel(); S.G.base = 1; });
  await p.mouse.move(195, 700); await p.mouse.down(); await p.waitForTimeout(4500); await p.mouse.up(); await p.waitForTimeout(1600);
  await p.screenshot({ path: path.join(OUT, "s_result.png") });
  console.log("erreurs:", errs); await b.close();
})();
