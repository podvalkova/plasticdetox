const puppeteer = require('puppeteer');
const fs = require('fs');
const { REGISTRY } = require('./registry-build.js');

const prev = JSON.parse(fs.readFileSync('/tmp/image-results.json', 'utf8'));

// Find queries that came back null
const queries = [];
for (const cat of REGISTRY) {
  for (let i = 0; i < cat.products.length; i++) {
    const p = cat.products[i];
    const key = `${cat.id}::${i}`;
    if (!p.img && p.searchQ && !prev[key]) {
      queries.push({ q: p.searchQ, key, name: p.name });
    }
  }
}

console.log(`Retrying ${queries.length} queries with concurrency 2 and delays...`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const results = { ...prev };

  async function worker(workerId) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', req => {
      const t = req.resourceType();
      if (t === 'image' || t === 'font' || t === 'media' || t === 'stylesheet') req.abort();
      else req.continue();
    });
    while (queries.length) {
      const item = queries.shift();
      if (!item) break;
      // randomized delay 2-5 seconds between requests
      await sleep(2000 + Math.floor(Math.random() * 3000));
      let imgId = null;
      for (let attempt = 0; attempt < 2 && !imgId; attempt++) {
        try {
          await page.goto('https://www.amazon.com/s?k=' + item.q, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await page.waitForSelector('.s-image', { timeout: 10000 }).catch(() => null);
          imgId = await page.evaluate(() => {
            const img = document.querySelector('.s-image');
            if (!img) return null;
            const m = img.src.match(/images\/I\/([A-Za-z0-9+_%-]+)\./);
            return m ? m[1] : null;
          });
          if (!imgId) await sleep(3000);
        } catch (e) {
          await sleep(3000);
        }
      }
      results[item.key] = imgId;
      // Save incrementally so we can recover
      fs.writeFileSync('/tmp/image-results.json', JSON.stringify(results, null, 2));
      process.stdout.write(`[${workerId}] ${item.name.slice(0,45)}: ${imgId || 'NOT_FOUND'}\n`);
    }
    await page.close();
  }

  await Promise.all([1, 2].map(worker));
  await browser.close();
  console.log(`\nDone. Total results: ${Object.keys(results).length}.`);
})();
