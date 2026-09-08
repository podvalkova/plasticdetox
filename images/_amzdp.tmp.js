const puppeteer = require('puppeteer');
const asins = ['B07NNS56P1', 'B09X9P8YYZ', 'B09SG51JMD', 'B08C2H24TF', 'B08KT5GCS1', 'B07PDN1Q1X', 'B07ZCVMCLT', 'B01HTYH8YA', 'B004YZEO9K', 'B091JXDLDX', 'B01E2HU4A2', 'B001T6JTMY', 'B00KQ17X6C', 'B0971NWGPM'];
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  for (const asin of asins) {
    try {
      await page.goto('https://www.amazon.com/dp/' + asin, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await new Promise(r => setTimeout(r, 1500));
      const info = await page.evaluate(() => {
        const q = s => document.querySelector(s);
        const title = document.title.slice(0, 80);
        const pt = q('#productTitle') ? q('#productTitle').textContent.trim().slice(0, 110) : '';
        const buy = !!(q('#add-to-cart-button') || q('#buy-now-button'));
        const count = q('#acrCustomerReviewText') ? q('#acrCustomerReviewText').textContent : '';
        const rating = q('#acrPopover') ? (q('#acrPopover').getAttribute('title') || '') : '';
        const avail = q('#availability') ? q('#availability').textContent.trim().slice(0, 60) : '';
        let material = '';
        document.querySelectorAll('#productOverview_feature_div tr, #prodDetails tr, #detailBullets_feature_div li').forEach(r => {
          const t = r.textContent.replace(/\s+/g, ' ').trim();
          if (/material|steel|glass/i.test(t) && material.length < 200) material += ' || ' + t.slice(0, 90);
        });
        return { title, pt, buy, count, rating, avail, material };
      });
      console.log('== ' + asin + ' | buyable:' + info.buy + ' | ' + info.rating + ' | ' + info.count + ' | ' + info.avail);
      console.log('   ' + info.pt);
      if (info.material) console.log('   MAT:' + info.material.slice(0, 260));
    } catch (e) { console.log('== ' + asin + ' ERROR ' + e.message.slice(0, 60)); }
  }
  await browser.close();
})();
