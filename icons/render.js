// Renders the PNG icons from icon.svg (node icons/render.js, needs playwright)
const { chromium } = require("playwright"); const fs = require("fs"), path = require("path");
(async () => { const b = await chromium.launch(), p = await b.newPage(); const svg = fs.readFileSync(path.join(__dirname, "icon.svg"), "utf8");
  const full = svg.replace('rx="112" fill="url(#sky)"', 'fill="url(#sky)"');
  const mask = full.replace(/<rect width="512" height="512" fill="url\(#sky\)"\/>([\s\S]*)<\/svg>/, '<rect width="512" height="512" fill="url(#sky)"/><g transform="translate(256 256) scale(0.8) translate(-256 -256)">$1</g></svg>');
  for (const [src, out, sz, tr] of [[svg, "icon-512.png", 512, true], [svg, "icon-192.png", 192, true], [mask, "maskable-512.png", 512, false], [mask, "maskable-192.png", 192, false], [full, "apple-touch-icon.png", 180, false]]) {
    await p.setViewportSize({ width: sz, height: sz });
    await p.setContent('<body style="margin:0;background:transparent">' + src.replace('width="512" height="512"', 'width="' + sz + '" height="' + sz + '"') + "</body>");
    await p.screenshot({ path: path.join(__dirname, out), omitBackground: tr });
  }
  await b.close(); console.log("icons ok"); })();
