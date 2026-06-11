const puppeteer = require('puppeteer');
const fs = require('fs');

const needs = JSON.parse(fs.readFileSync('/tmp/needs-asin.json', 'utf8'));

function getQuery(url) {
  if (!url) return null;
  const m = url.match(/[?&]k=([^&]+)/);
  return m ? m[1] : null;
}

const queries = needs.map(item => ({ ...item, q: getQuery(item.url) })).filter(item => item.q);

let prev = {};
try { prev = JSON.parse(fs.readFileSync('/tmp/asin-results.json', 'utf8')); } catch {}
const remaining = queries.filter(item => !(item.key in prev));
console.log(`Have ${Object.keys(prev).length} already. Scraping ${remaining.length} more...`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter() { return 8000 + Math.floor(Math.random() * 7000); }

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
  await page.setRequestInterception(true);
  page.on('request', req => {
    const t = req.resourceType();
    if (t === 'image' || t === 'font' || t === 'media' || t === 'stylesheet') req.abort();
    else req.continue();
  });

  let consecutiveFail = 0;
  for (const item of remaining) {
    if (consecutiveFail >= 3) {
      const cool = 90 + Math.floor(Math.random() * 60);
      console.log(`cooling down ${cool}s after ${consecutiveFail} fails`);
      await sleep(cool * 1000);
      consecutiveFail = 0;
    }
    await sleep(jitter());
    let asin = null;
    for (let attempt = 0; attempt < 2 && !asin; attempt++) {
      try {
        await page.goto('https://www.amazon.com/s?k=' + item.q, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('div.s-result-item[data-asin]', { timeout: 12000 }).catch(() => null);
        asin = await page.evaluate(() => {
          const items = document.querySelectorAll('div.s-result-item[data-asin]');
          for (const el of items) {
            const a = el.getAttribute('data-asin');
            if (a && /^[A-Z0-9]{10}$/.test(a)) {
              if (el.querySelector('[data-component-type=\"sp-sponsored-result\"]')) continue;
              return a;
            }
          }
          return null;
        });
        if (!asin) await sleep(5000);
      } catch (e) {
        await sleep(5000);
      }
    }
    results[item.key] = asin;
    fs.writeFileSync('/tmp/asin-results.json', JSON.stringify(results, null, 2));
    consecutiveFail = asin ? 0 : consecutiveFail + 1;
    console.log(`[${Object.keys(results).length}/${queries.length}] ${item.name.slice(0,55)}: ${asin || 'NOT_FOUND'}`);
  }
  await browser.close();
  console.log('done');
  process.exit(0);
})().catch(err => { console.error('FATAL:', err.message); process.exit(2); });
