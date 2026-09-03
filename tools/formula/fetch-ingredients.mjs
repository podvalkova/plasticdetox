// Step one for the formula front: ask the listing for the actual list.
//
// The standard (docs/rating-rules.md section 2) says the formula verdict is
// mechanical once the full list is on the table, and that a prose summary may
// warn but never clear. Today 363 passes rest on prose, and Osea's "no
// synthetic polymers" cleared a product whose own note admits a plastic pump.
// The fix is to stop reading sentences and start storing the list.
//
// Two shapes qualify as complete, and only two. A list published behind an
// "Ingredients" heading, and a stated single ingredient. Everything else is
// recorded as prose, which can carry a caution and can never carry a pass.
//
// Resumable. It skips anything already recorded, so run it in batches.
//
//     node tools/formula/fetch-ingredients.mjs --limit 40
//     node tools/formula/fetch-ingredients.mjs --limit 40 --write

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

// .slice() cuts on UTF-16 code units, so trimming a listing that uses styled
// unicode can sever a surrogate pair. The orphaned half is legal JSON and
// illegal UTF-8, which truncated this file once already. Cut, then repair.
const cut = (s, n) => String(s).slice(0, n)
  .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
  .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');

const brands = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const ev = fs.existsSync(EVIDENCE) ? JSON.parse(fs.readFileSync(EVIDENCE, 'utf8')) : {};

// A durable good has no ingredient list; rule 5.4 says its material IS the
// front, and the packaging fetcher already asks for that field. So this run is
// consumables only, using the standard's own vocabulary rather than a new one.
const CONSUMABLE = /cosmetic|personal care|sunscreen|skincare|supplement|bottled water|baby food|snack|pantry|formula|electrolyte|oral care|toothpaste|mouthwash|floss|cleaning|laundry|dish|coffee|tea|salt|spice|protein|diaper cream|lotion|balm|soap|shampoo|conditioner|deodorant|wipe|sunscreen|oil|honey|chocolate|supplement/i;

const todo = [];
for (const b of brands) {
  for (const p of (b.products || [])) {
    const asin = (p.asins || [])[0];
    if (!asin) continue;
    if (!CONSUMABLE.test(`${p.cat || ''} ${b.category || ''}`)) continue;
    const held = ev[asin]?.formula;
    if (held?.ingredients || held?.checkedListing) continue;
    todo.push({ asin, brand: b.brand, name: p.name, cat: p.cat || '' });
  }
}
console.log(`consumable rows with an ASIN and no list yet: ${todo.length}`);
const batch = todo.slice(0, limit);
console.log(`this run: ${batch.length}\n`);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
let page = await browser.newPage();
await page.setUserAgent(UA);
await page.setRequestInterception(true);
page.on('request', r => ['image', 'font', 'media'].includes(r.resourceType()) ? r.abort() : r.continue());

let full = 0, prose = 0, none = 0, failed = 0, mismatch = 0, stripped = 0;
for (const [i, row] of batch.entries()) {
  try {
    await page.goto(`https://www.amazon.com/dp/${row.asin}`, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await new Promise(r => setTimeout(r, 1400));

    const got = await page.evaluate(() => {
      const clean = s => s.replace(/\s+/g, ' ').replace(/‏|‎/g, '').trim();
      const title = clean(document.querySelector('#productTitle, span#title')?.textContent || '');
      const wrap = r => r && Object.assign(r, { title });

      // Amazon puts the real list under a heading in #important-information.
      // The heading is the thing that makes it quotable: text under an
      // "Ingredients" header is the list, text anywhere else is description.
      const blocks = [...document.querySelectorAll('#important-information .content, #important-information div')];
      for (const b of blocks) {
        const h = b.querySelector('h4, h5, b, strong');
        if (!h || !/^\s*ingredients\b/i.test(h.textContent)) continue;
        const body = clean(b.textContent.replace(h.textContent, ''));
        if (body.length > 12) return wrap({ text: body, complete: true, where: 'important-information' });
      }

      // Same shape, different container, on food and supplement pages.
      for (const sel of ['#nic-ingredients-content', '#nutrition-and-ingredients', '#ingredients']) {
        const el = document.querySelector(sel);
        if (el) {
          const t = clean(el.textContent);
          if (t.length > 12) return wrap({ text: t, complete: true, where: sel });
        }
      }

      // A detail bullet naming ingredients. Same rule: the label makes it the
      // list, not our reading of it.
      for (const li of [...document.querySelectorAll('#detailBullets_feature_div li, #productOverview_feature_div tr')]) {
        const t = clean(li.textContent);
        const m = t.match(/^Ingredients?\s*[:‏‎\s]\s*(.+)$/i);
        if (m && m[1].length > 12) return wrap({ text: m[1], complete: true, where: 'detail-bullet' });
      }

      // Nothing labelled. Take the description so a hazard can still be seen,
      // and mark it prose: it may warn, it may never clear.
      // Signature of a degraded serve: the informational block is absent AND
      // the page is a fraction of its normal weight. A real page that simply
      // has no Ingredients section still carries its reviews and detail bullets.
      if (!document.querySelector('#important-information')
          && document.body.innerText.length < 12000) {
        return wrap({ text: '', complete: false, where: 'stripped' });
      }

      const desc = document.querySelector('#productDescription, #feature-bullets');
      if (desc) {
        const t = clean(desc.textContent);
        if (t.length > 40) return wrap({ text: t.slice(0, 1200), complete: false, where: 'description' });
      }
      return wrap({ text: '', complete: false, where: 'none' });
    });

    // B0194EGJRK is filed as Aquaphor Baby Healing Ointment and serves a
    // Superbalm organic ointment: a live page, a real ingredient list, the
    // wrong product. A 404 announces itself and this does not, so the brand
    // has to be visible in the title before anything is recorded.
    // Accent folded, and matched token by token rather than whole. Our brand
    // field carries noise the listing does not ("Earth Mama Organics" against
    // "Earth Mama", "Henne" against "Henné"), and demanding the whole string
    // flagged good rows as wrong products. One distinctive token is the test.
    const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const tokens = fold(row.brand).split(/[^a-z0-9]+/).filter(t => t.length >= 4);
    const t = fold(got?.title || '');
    const titleOk = !got?.title || !tokens.length || tokens.some(k => t.includes(k));

    // "See label", "refer to package" is a pointer, not a list.
    const punt = got && /^(see|refer to|check)\b.{0,40}\b(label|package|packaging|product)/i.test(got.text);
    if (got && got.where === 'stripped') {
      stripped++;
      console.log(`  ? ${row.brand} / ${row.name.slice(0, 28).padEnd(30)} (page came back stripped, will retry)`);
      await new Promise(r => setTimeout(r, 6000));
      continue;
    }

    const slot = ev[row.asin] || (ev[row.asin] = { _product: `${row.brand} ${row.name}` });
    slot.formula = slot.formula || {};
    slot.formula.checkedListing = new Date().toISOString().slice(0, 10);

    if (got && got.title && !titleOk) {
      slot.formula.asinMismatch = cut(got.title, 120);
      mismatch++;
      console.log(`  ✗ ${row.brand} / ${row.name.slice(0, 28).padEnd(30)} listing is: ${got.title.slice(0, 46)}`);
    } else if (got && got.complete && !punt) {
      slot.formula.ingredients = cut(got.text, 4000);
      slot.formula.kind = 'ingredients';
      slot.formula.complete = true;
      slot.formula.source = `amazon:${row.asin}`;
      full++;
      console.log(`  ✓ ${row.brand} / ${row.name.slice(0, 28).padEnd(30)} ${got.text.slice(0, 60)}`);
    } else if (got && !punt) {
      slot.formula.prose = cut(got.text, 1200);
      slot.formula.complete = false;
      slot.formula.source = `amazon:${row.asin}`;
      prose++;
      console.log(`  ~ ${row.brand} / ${row.name.slice(0, 28).padEnd(30)} (description only)`);
    } else {
      delete slot.formula.asinMismatch;
      none++;
      console.log(`  · ${row.brand} / ${row.name.slice(0, 28).padEnd(30)} (listing has no list)`);
    }
  } catch (e) {
    failed++;
    console.log(`  ! ${row.brand} / ${row.name.slice(0, 28)} ${e.message.slice(0, 40)}`);
  }
  await new Promise(r => setTimeout(r, 2500));
  // A fresh context every 25 rows. Reputation attaches to the session, so the
  // hit rate decays within a run and resets when the browser does.
  if ((i + 1) % 25 === 0) {
    await page.close();
    page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setRequestInterception(true);
    page.on('request', r => ['image', 'font', 'media'].includes(r.resourceType()) ? r.abort() : r.continue());
    console.log(`    … ${i + 1}/${batch.length}, new session`);
  }
}
await browser.close();

console.log(`\nfull list: ${full}   description only: ${prose}   silent: ${none}   wrong product: ${mismatch}   stripped: ${stripped}   failed: ${failed}`);
if (write) {
  fs.writeFileSync(EVIDENCE, JSON.stringify(ev, null, 1) + '\n');
  console.log(`wrote ${path.relative(ROOT, EVIDENCE)}`);
  console.log(`\nThe silent and description-only rows are step two: the maker's own site.`);
} else {
  console.log('\ndry run. add --write to record.');
}
