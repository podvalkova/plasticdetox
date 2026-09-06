import puppeteer from "puppeteer";
const OUT = process.argv[2];
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.goto("http://localhost:4321/", { waitUntil: "domcontentloaded", timeout: 20000 });
await new Promise(r => setTimeout(r, 2500));
await p.screenshot({ path: `${OUT}/v2-check.png` });
const hit = await p.evaluate(() => {
  const t = [...document.querySelectorAll("*")]
    .filter(e => /^detox$/i.test((e.textContent||"").trim()) && e.children.length === 0);
  if (t.length) { (t[0].closest("button,a,[role=tab]") || t[0]).click(); return true; }
  return false;
});
console.log("clicked detox:", hit);
await new Promise(r => setTimeout(r, 2000));
await p.screenshot({ path: `${OUT}/v2-detox.png`, fullPage: true });
await b.close();
process.exit(0);
