const puppeteer = require('puppeteer');
const { REGISTRY } = require('./registry-build.js');
const fs = require('fs');

const queries = [];
for (const cat of REGISTRY) {
  for (let i = 0; i < cat.products.length; i++) {
    const p = cat.products[i];
    if (!p.img && p.searchQ) {
      queries.push({ q: p.searchQ, key: `${cat.id}::${i}`, name: p.name });
    }
  }
}

console.log(`Scraping ${queries.length} queries with concurrency 5...`);

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const results = {};

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
      try {
        await page.goto('https://www.amazon.com/s?k=' + item.q, { waitUntil: 'domcontentloaded', timeout: 20000 });
        // Wait for image to load
        await page.waitForSelector('.s-image', { timeout: 8000 }).catch(() => null);
        const imgId = await page.evaluate(() => {
          const img = document.querySelector('.s-image');
          if (!img) return null;
          const m = img.src.match(/images\/I\/([A-Za-z0-9+_%-]+)\./);
          return m ? m[1] : null;
        });
        results[item.key] = imgId;
        process.stdout.write(`[${workerId}] ${item.name.slice(0,40)}: ${imgId || 'NOT_FOUND'}\n`);
      } catch (e) {
        results[item.key] = null;
        process.stdout.write(`[${workerId}] ${item.name.slice(0,40)}: ERROR\n`);
      }
    }
    await page.close();
  }

  await Promise.all([1,2,3,4,5].map(worker));
  await browser.close();
  fs.writeFileSync('/tmp/image-results.json', JSON.stringify(results, null, 2));
  console.log(`\nDone. ${Object.keys(results).length} results written.`);
})();
