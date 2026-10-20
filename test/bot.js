// Balance bot: plays levels with a simple strategy (aim at the best gate, use SUPER when ready). node test/bot.js
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://localhost:8791/"); await p.waitForTimeout(500);
  const upg = process.env.UPG ? JSON.parse(process.env.UPG) : { rate: 0, wall: 0, super: 0 };
  for (let n = 1; n <= (+process.env.N || 12); n++) {
    const r = await p.evaluate(async ({ n, upg }) => {
      const S = window.__sb; S.save.level = n; Object.assign(S.save.up, upg); S.startLevel();
      let t = 0, maxU = 0;
      while (!S.G.over && t < 180) {
        const L = S.L(); S.G.cannonX = L.bestX; S.G.firing = true;
        if (S.G.superReady) S.G.wantSuper = true;
        S.step(30); t += 0.5; maxU = Math.max(maxU, S.units().length);
      }
      return { n, win: S.G.result ? S.G.result.win : null, t, base: L_hp(S), maxU, wall: S.G.wall };
      function L_hp(S) { return Math.round(S.G.base) + "/" + S.G.baseMax; }
    }, { n, upg });
    console.log(JSON.stringify(r));
  }
  console.log("erreurs:", errs); await b.close();
})();
