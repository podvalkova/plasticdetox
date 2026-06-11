const puppeteer = require('puppeteer');
const fs = require('fs');
const { REGISTRY } = require('./registry-build.js');

const prev = JSON.parse(fs.readFileSync('/tmp/image-results.json', 'utf8'));
const queries = [];
for (const cat of REGISTRY) {
  for (let i = 0; i < cat.products.length; i++) {
    const p = cat.products[i];
    const key = `${cat.id}::${i}`;
    if (!p.img && p.searchQ && !prev[key]) queries.push({ q: p.searchQ, key, name: p.name });
  }
}

console.log(`Final pass: ${queries.length} queries, sequential, 7-12s delay`);
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const results = { ...prev };
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  let consecutiveFail = 0;
  for (const item of queries) {
    if (consecutiveFail >= 5) {
      console.log('5 consecutive failures, sleeping 60s to cool down');
      await sleep(60000);
      consecutiveFail = 0;
    }
    await sleep(7000 + Math.floor(Math.random() * 5000));
    let imgId = null;
    try {
      await page.goto('https://www.amazon.com/s?k=' + item.q, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('.s-image', { timeout: 10000 }).catch(() => null);
      imgId = await page.evaluate(() => {
        const img = document.querySelector('.s-image');
        if (!img) return null;
        const m = img.src.match(/images\/I\/([A-Za-z0-9+_%-]+)\./);
        return m ? m[1] : null;
      });
    } catch (e) {}
    results[item.key] = imgId;
    fs.writeFileSync('/tmp/image-results.json', JSON.stringify(results, null, 2));
    consecutiveFail = imgId ? 0 : consecutiveFail + 1;
    console.log(`${item.name.slice(0,50)}: ${imgId || 'NOT_FOUND'}`);
  }
  await browser.close();
  console.log('done');
})();
