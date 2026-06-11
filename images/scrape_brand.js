const puppeteer = require('puppeteer');
const urls = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  for (const arg of urls) {
    const [url, label] = arg.split('|');
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(1500);
      const result = await page.evaluate(() => {
        const og = document.querySelector('meta[property="og:image"]');
        if (og && og.content) return og.content;
        const tw = document.querySelector('meta[name="twitter:image"]');
        if (tw && tw.content) return tw.content;
        const productImg = document.querySelector('img[src*="cdn"], .product img, .product-card img, img.product, [class*="product"] img');
        if (productImg && productImg.src) return productImg.src;
        return null;
      });
      console.log(label + '|' + (result || 'NOT_FOUND'));
    } catch(e) { console.log(label + '|ERROR ' + e.message.slice(0,40)); }
    await page.close();
    await sleep(800);
  }
  await browser.close();
})();
