const puppeteer = require('puppeteer');
const dps = ['B0H4WDTZ7Z', 'B008H2JLP8', 'B08SWBRTRK', 'B0D9W787CJ'];
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  for (const asin of dps) {
    try {
      await page.goto('https://www.amazon.com/dp/' + asin, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await new Promise(r => setTimeout(r, 1500));
      const info = await page.evaluate(() => {
        const q = s => document.querySelector(s);
        const pt = q('#productTitle') ? q('#productTitle').textContent.trim().slice(0, 130) : '';
        const buy = !!(q('#add-to-cart-button') || q('#buy-now-button'));
        const count = q('#acrCustomerReviewText') ? q('#acrCustomerReviewText').textContent : '';
        const rating = q('#acrPopover') ? (q('#acrPopover').getAttribute('title') || '') : '';
        const avail = q('#availability') ? q('#availability').textContent.trim().slice(0, 50) : '';
        const brandRow = q('#bylineInfo') ? q('#bylineInfo').textContent.trim().slice(0, 60) : '';
        let bullets = '';
        document.querySelectorAll('#feature-bullets li').forEach(li => { bullets += ' • ' + li.textContent.replace(/\s+/g, ' ').trim(); });
        return { pt, buy, count, rating, avail, brandRow, bullets: bullets.slice(0, 500) };
      });
      console.log('== ' + asin + ' | buyable:' + info.buy + ' | ' + info.rating + ' | ' + info.count + ' | ' + info.avail + ' | ' + info.brandRow);
      console.log('   ' + info.pt);
      console.log('   ' + info.bullets);
    } catch (e) { console.log('== ' + asin + ' ERROR ' + e.message.slice(0, 60)); }
  }
  await browser.close();
})();
