import fs from "node:fs";
import puppeteer from "puppeteer";
const asins = fs.readFileSync("/tmp/need-images.txt", "utf8").split("\n").filter(Boolean);
const out = {};
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
for (const [i, asin] of asins.entries()) {
  const p = await b.newPage();
  await p.setUserAgent(ua);
  try {
    await p.goto("https://www.amazon.com/dp/" + asin, { waitUntil: "domcontentloaded", timeout: 40000 });
    await new Promise(r => setTimeout(r, 1600));
    const id = await p.evaluate(() => {
      const im = document.querySelector("#landingImage, #imgTagWrapperId img");
      const s = im && (im.getAttribute("data-old-hires") || im.src) || "";
      const m = s.match(/\/images\/I\/([^.]+)\./);
      return m ? m[1] : "";
    });
    if (id) out[asin] = id;
    console.log(`${i + 1}/${asins.length} ${asin} ${id || "none"}`);
  } catch (e) { console.log(`${i + 1}/${asins.length} ${asin} ERR`); }
  await p.close();
}
fs.writeFileSync("/tmp/harvested-images.json", JSON.stringify(out, null, 1));
console.log("\nharvested", Object.keys(out).length, "of", asins.length);
await b.close(); process.exit(0);
