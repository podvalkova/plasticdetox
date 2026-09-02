// Step one: ask the listing.
//
// A listing states a material as a field, which is a fact rather than a
// sentence, so it does not need reading the way a product note does. Where the
// product is the container, a jar or a pan or a bottle, that field is the
// container and it is reliable: 22 of 24 sampled came back usable.
//
// Where the container is separate from the product it usually says nothing at
// all. Earth Mama's page mentions a jar exactly once, in a customer review.
// Those rows come back "none" and go to step two.
//
// Resumable on purpose. It skips anything already recorded, so it can be run in
// batches and stopped whenever.
//
//     node tools/packaging/fetch-listings.mjs --limit 40
//     node tools/packaging/fetch-listings.mjs --limit 40 --write

import puppeteer from '/Users/annapodvalkova/Documents/Plasticdetox/images/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/annapodvalkova/Documents/Plasticdetox';
const DATA = path.join(ROOT, 'brand-data.json');
const EVIDENCE = path.join(ROOT, 'data', 'front-evidence.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const args = process.argv.slice(2);
const limit = Number((args.find(a => a.startsWith('--limit')) || '').split('=')[1]
  || args[args.indexOf('--limit') + 1] || 40);
const write = args.includes('--write');

const brands = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const ev = fs.existsSync(EVIDENCE) ? JSON.parse(fs.readFileSync(EVIDENCE, 'utf8')) : {};

// Every row with an ASIN that has no material recorded yet.
const todo = [];
for (const b of brands) {
  for (const p of (b.products || [])) {
    const asin = (p.asins || [])[0];
    if (!asin) continue;
    const held = ev[asin]?.packaging?.material;
    if (held || ev[asin]?.packaging?.checkedListing) continue;
    todo.push({ asin, brand: b.brand, name: p.name, category: b.category || '' });
  }
}
console.log(`rows with an ASIN and no material yet: ${todo.length}`);
const batch = todo.slice(0, limit);
console.log(`this run: ${batch.length}\n`);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setRequestInterception(true);
// Images and fonts are most of the bytes and none of the answer.
page.on('request', r => ['image', 'font', 'media'].includes(r.resourceType()) ? r.abort() : r.continue());

let found = 0, none = 0, failed = 0;
for (const [i, row] of batch.entries()) {
  try {
    await page.goto(`https://www.amazon.com/dp/${row.asin}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await new Promise(r => setTimeout(r, 1400));
    const material = await page.evaluate(() => {
      const rows = [...document.querySelectorAll(
        '#productOverview_feature_div tr, #detailBullets_feature_div li, ' +
        '#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr')];
      for (const r of rows) {
        const t = r.textContent.replace(/\s+/g, ' ').trim();
        // "Material Feature" and "Material Care" are different fields that
        // happen to start with the same word, and matching loosely read a
        // conditioner bar's material as "Compostable Warning".
        const m = t.match(/^Material(?:\s*Type)?\s*[:‏‎\s]*(.+)$/i);
        const value = m ? m[1].replace(/‏|‎/g, '').trim() : '';
        const wrongField = /^(feature|care|composition|safety|warning|fabric type)\b/i.test(value);
        // "Material Type Free: Petroleum Free" is a formula claim wearing the
        // material label. It is about what is not in the product, not what the
        // container is made of.
        if (m && !wrongField && !/^\s*free\b/i.test(value) && !/\bfree\b.*\bfree\b/i.test(value)) {
          return m[1].replace(/‏|‎/g, '').trim().slice(0, 80);
        }
      }
      return null;
    });
    const slot = ev[row.asin] || (ev[row.asin] = { _product: `${row.brand} ${row.name}` });
    slot.packaging = slot.packaging || {};
    slot.packaging.checkedListing = new Date().toISOString().slice(0, 10);
    if (material) {
      slot.packaging.material = material;
      slot.packaging.source = `amazon:${row.asin}`;
      found++;
      console.log(`  ✓ ${row.brand} / ${row.name.slice(0, 30).padEnd(32)} ${material}`);
    } else {
      none++;
      console.log(`  · ${row.brand} / ${row.name.slice(0, 30).padEnd(32)} (listing says nothing)`);
    }
  } catch (e) {
    failed++;
    console.log(`  ! ${row.brand} / ${row.name.slice(0, 30)} ${e.message.slice(0, 40)}`);
  }
  if ((i + 1) % 20 === 0) console.log(`    … ${i + 1}/${batch.length}`);
}
await browser.close();

console.log(`\nfound a material: ${found}   listing silent: ${none}   failed: ${failed}`);
if (write) {
  fs.writeFileSync(EVIDENCE, JSON.stringify(ev, null, 1) + '\n');
  console.log(`wrote ${path.relative(ROOT, EVIDENCE)}`);
  console.log(`\nThe silent ones are step two: check the maker's own site.`);
} else {
  console.log('\ndry run. add --write to record.');
}
