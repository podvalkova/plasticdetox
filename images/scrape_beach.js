const puppeteer = require('puppeteer');
const searches = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (const arg of searches) {
    const [q, label] = arg.split('|');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-blink-features=AutomationControlled'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    try {
      await page.goto('https://www.amazon.com/s?k=' + q, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(1500);
      const imgId = await page.evaluate(() => {
        const img = document.querySelector('.s-image');
        if (img) {
          const m = img.src.match(/images\/I\/([A-Za-z0-9+_%-]+)\./);
          return m ? m[1] : null;
        }
        return null;
      });
      console.log(label + ': ' + (imgId || 'NOT_FOUND'));
    } catch(e) { console.log(label + ': ERROR ' + e.message.slice(0,40)); }
    await browser.close();
    await sleep(3000);
  }
})();
