/**
 * Bind a barcode to the exact product we researched, by ASIN.
 *
 * The scanner's whole promise is "check it before you buy it", and it could not
 * keep that promise for the things we recommend: all 1347 codes we held came
 * from the open facts databases, which name products in the manufacturer's
 * words ("Jumbo Baby Wipes") while our rows name them in ours ("Caboo Tree Free
 * Baby Wipes"). Zero of 323 store products had a barcode at all, so scanning a
 * product we sell fell through to a brand card.
 *
 * Matching those names to each other is the wrong fix. A name binder would have
 * bound 652 codes and put a researched `good` on variants nobody tested:
 * "Aquaphor ointment body spray" onto Baby Healing Ointment, "Always Ultra
 * Extra Long" onto Ultra Thin Pads. Rule 1.1 forbids exactly that, favourable
 * evidence never propagates.
 *
 * So this binds on identity, not resemblance. The UPC printed on the pack is
 * the same product as the ASIN whose listing prints it, and the ASIN is already
 * on the row we researched. Nothing is inferred.
 *
 * Usage:
 *   node tools/harvest-upc.mjs                 # dry run over store products
 *   node tools/harvest-upc.mjs --write
 *   node tools/harvest-upc.mjs --limit 20
 *   node tools/harvest-upc.mjs --all           # every rated row, not just the shop
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "../images/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = path.join(ROOT, "data/barcodes.json");
const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const ALL = args.includes("--all");
const LIMIT = (() => { const i = args.indexOf("--limit"); return i < 0 ? 0 : Number(args[i + 1]) || 0; })();

const brands = JSON.parse(fs.readFileSync(path.join(ROOT, "brand-data.json"), "utf8"));
const barcodes = JSON.parse(fs.readFileSync(OUT, "utf8"));

// Every ASIN we have researched, with the row and brand it belongs to. The
// brand is taken from our own data, never from the listing, so a code can
// never attach our verdict to another company's product.
const byAsin = new Map();
for (const b of brands) {
  for (const p of b.products || []) {
    const verdict = (p.ext || {}).verdict;
    if (!["good", "careful", "skip"].includes(verdict)) continue;
    for (const a of p.asins || []) {
      if (!byAsin.has(a)) byAsin.set(a, { brand: b, row: p, verdict });
    }
  }
}

// The shop first: those are the products we actively tell people to buy, so
// they are the ones a scan most needs to answer.
const shop = new Set();
const sp = fs.readFileSync(path.join(ROOT, "data/store-products.js"), "utf8");
for (const m of sp.matchAll(/asin:\s*"([A-Z0-9]{10})"/g)) shop.add(m[1]);

const bound = new Set(Object.values(barcodes).map((v) => v && v.asin).filter(Boolean));
let targets = [...byAsin.keys()].filter((a) => (ALL || shop.has(a)) && !bound.has(a));
if (LIMIT) targets = targets.slice(0, LIMIT);

console.log(`researched ASINs: ${byAsin.size}   in the shop: ${shop.size}`);
console.log(`already bound to a barcode: ${bound.size}   to try now: ${targets.length}\n`);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
let browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const found = [];
const missing = [];
const throttled = [];
const PACE = 4000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const asin of targets) {
  const { brand, row } = byAsin.get(asin);
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  let code = null;
  let blocked = false;
  try {
    await page.goto(`https://www.amazon.com/dp/${asin}`, { waitUntil: "domcontentloaded", timeout: 40000 });
    const shape = await page.evaluate(() => ({
      rows: document.querySelectorAll(
        "#productDetails_detailBullets_sections1 tr, .prodDetTable tr, #detailBullets_feature_div li").length,
      bot: /not a robot|Sorry, we just need|api-services-support/i.test(document.body.innerText),
    }));
    // A listing with no detail rows at all is a page Amazon did not serve us,
    // not a product without a barcode.
    blocked = shape.bot || shape.rows === 0;
    code = await page.evaluate(() => {
      const rows = [...document.querySelectorAll(
        "#productDetails_detailBullets_sections1 tr, .prodDetTable tr, #detailBullets_feature_div li")]
        .map((r) => r.innerText.replace(/\s+/g, " ").trim());
      for (const r of rows) {
        const m = r.match(/\b(?:UPC|EAN|GTIN)\b\D{0,6}(\d{12,14})/i);
        if (m) return m[1];
      }
      const m2 = document.documentElement.innerHTML.match(/"(?:gtin13|gtin12|upc|ean)"\s*:\s*"(\d{12,14})"/i);
      return m2 ? m2[1] : null;
    });
  } catch { /* a listing that will not load is simply unbound */ }
  try { await page.close(); } catch { /* the tab is already gone */ }
  if (!browser.connected) {
    try { await browser.close(); } catch { /* already down */ }
    browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  }

  if (!code) {
    if (blocked) {
      throttled.push([asin, row.name]);
      process.stdout.write(`  BLOCKED       ${asin}  ${String(row.name).slice(0, 46)}\n`);
      await sleep(20000);   // back off hard, then carry on
    } else {
      missing.push([asin, row.name]);
      process.stdout.write(`  none          ${asin}  ${String(row.name).slice(0, 46)}\n`);
    }
    await sleep(PACE);
    continue;
  }
  // A listing can print several codes for a multipack. Store each separately;
  // they are all the same researched product.
  for (const c of code.split(/\s+/)) {
    const digits = c.replace(/\D/g, "");
    if (digits.length < 12) continue;
    const existing = barcodes[digits];
    if (existing && existing.asin && existing.asin !== asin) {
      console.log(`  ! clash      ${digits} already bound to ${existing.asin}, skipping ${asin}`);
      continue;
    }
    found.push([digits, asin, brand, row]);
    process.stdout.write(`  UPC ${digits}  ${asin}  ${String(row.name).slice(0, 46)}\n`);
    await sleep(PACE);
    // Persist each binding as it is found, so an interrupted run keeps its work.
    if (WRITE) {
      barcodes[digits] = { brand: brand.brand, brandId: brand.id, name: row.name, asin, source: "amazon" };
      fs.writeFileSync(OUT, JSON.stringify(barcodes, null, 0) + "\n");
    }
  }
}
await browser.close();

if (WRITE) {
  console.log(`\nwrote ${found.length} bindings into ${path.relative(ROOT, OUT)}`);
} else {
  console.log(`\nwould bind ${found.length}, no UPC on the listing for ${missing.length}. dry run, re-run with --write`);
}
if (throttled.length) {
  console.log(`\n${throttled.length} listings came back empty, which is throttling rather than a missing`);
  console.log("barcode. Re-run later; they are not recorded either way.");
}
