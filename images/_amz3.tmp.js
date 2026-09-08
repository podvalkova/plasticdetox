const puppeteer = require('puppeteer');
const searches = [
  ['Simax+glass+baking+dish+9x13+borosilicate', 'SIMAX913'],
  ['wooden+spoons+for+cooking+beechwood+set', 'SPOONS'],
  ['stainless+steel+whisk+all+metal+one+piece', 'WHISK'],
  ['stainless+steel+cooling+rack+baking', 'RACK']
];
const dps = ['B09X9P8YYZ', 'B08C2H24TF', 'B07ZCVMCLT', 'B01HTYH8YA', 'B091JXDLDX'];
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  for (const [q, label] of searches) {
    try {
      await page.goto('https://www.amazon.com/s?k=' + q, { waitUntil: 'networkidle2', timeout: 25000 });
      const rows = await page.evaluate(() => {
        const out = [];
        const items = document.querySelectorAll('div[data-asin][data-component-type="s-search-result"]');
        for (const it of items) {
          if (out.length >= 4) break;
          const asin = it.getAttribute('data-asin');
          const sponsored = !!it.querySelector('.puis-sponsored-label-text, [data-component-type="sp-sponsored-result"]');
          const t = it.querySelector('h2 span');
          const img = it.querySelector('.s-image');
          const ratingEl = it.querySelector('.a-icon-alt');
          const priceEl = it.querySelector('.a-price .a-offscreen');
          let imgId = null;
          if (img) { const m = img.src.match(/images\/I\/([A-Za-z0-9+_%-]+)\./); imgId = m ? m[1] : null; }
          if (!asin || sponsored) continue;
          out.push([asin, ratingEl ? ratingEl.textContent.slice(0, 3) : '', priceEl ? priceEl.textContent : '', imgId, t ? t.textContent.slice(0, 90) : ''].join(' | '));
        }
        return out;
      });
      console.log('== ' + label);
      rows.forEach(r => console.log(r));
    } catch (e) { console.log('== ' + label + ' ERROR ' + e.message.slice(0, 60)); }
  }
  for (const asin of dps) {
    try {
      await page.goto('https://www.amazon.com/dp/' + asin, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await new Promise(r => setTimeout(r, 1200));
      const info = await page.evaluate(() => {
        let bullets = '';
        document.querySelectorAll('#feature-bullets li').forEach(li => { bullets += ' • ' + li.textContent.replace(/\s+/g, ' ').trim(); });
        const grade = (bullets.match(/18\/8|18\/0|18\/10|304|430|grade/gi) || []).join(',');
        const plastic = /plastic|silicone|nonstick|non-stick|coating/i.test(bullets);
        return { grade, plastic, bullets: bullets.slice(0, 420) };
      });
      console.log('== DP ' + asin + ' grades:[' + info.grade + '] mentionsPlasticOrCoating:' + info.plastic);
      console.log('   ' + info.bullets);
    } catch (e) { console.log('== DP ' + asin + ' ERROR ' + e.message.slice(0, 60)); }
  }
  await browser.close();
})();
