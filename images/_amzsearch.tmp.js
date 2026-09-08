const puppeteer = require('puppeteer');
const searches = [
  ['stainless+steel+muffin+pan', 'MUFFIN'],
  ['stainless+steel+loaf+pan', 'LOAF'],
  ['Simax+glass+loaf+pan+borosilicate', 'SIMAX'],
  ['stainless+steel+round+cake+pan', 'CAKE'],
  ['stainless+steel+mixing+bowls+set', 'BOWLS'],
  ['stainless+steel+measuring+cups+and+spoons+set', 'MEASURE'],
  ['If+You+Care+parchment+baking+paper', 'PARCHMENT'],
  ['If+You+Care+baking+cups+unbleached', 'CUPS'],
  ['Lodge+cast+iron+loaf+pan+bread', 'LODGELOAF'],
  ['Wildone+stainless+steel+baking+sheet+set', 'WILDONE']
];
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
          const countEl = it.querySelector('span.a-size-base.s-underline-text');
          const priceEl = it.querySelector('.a-price .a-offscreen');
          let imgId = null;
          if (img) { const m = img.src.match(/images\/I\/([A-Za-z0-9+_%-]+)\./); imgId = m ? m[1] : null; }
          if (!asin || sponsored) continue;
          out.push({ asin, title: t ? t.textContent.slice(0, 90) : '', rating: ratingEl ? ratingEl.textContent.slice(0, 3) : '', count: countEl ? countEl.textContent : '', price: priceEl ? priceEl.textContent : '', imgId });
        }
        return out;
      });
      console.log('== ' + label);
      rows.forEach(r => console.log([r.asin, r.rating, r.count, r.price, r.imgId, r.title].join(' | ')));
    } catch (e) { console.log('== ' + label + ' ERROR ' + e.message.slice(0, 80)); }
  }
  await browser.close();
})();
