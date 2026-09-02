import puppeteer from 'puppeteer';
const ASINS = process.argv.slice(2);
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36');
for (const asin of ASINS) {
  try {
    await p.goto(`https://www.amazon.com/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await new Promise(r => setTimeout(r, 1800));
    const o = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#productOverview_feature_div tr, #detailBullets_feature_div li, #productDetails_techSpec_section_1 tr, .a-normal.a-spacing-micro tr')];
      const grab = (re) => {
        for (const r of rows) {
          const t = r.textContent.replace(/\s+/g,' ').trim();
          if (re.test(t)) return t.slice(0, 70);
        }
        return null;
      };
      return {
        title: document.querySelector('#productTitle')?.textContent.trim().slice(0,48),
        material: grab(/^material|material type|outer material/i),
        pkg: grab(/package information|container type/i),
      };
    });
    console.log(`${asin}  ${o.title || 'NOT FOUND'}`);
    console.log(`   material: ${o.material || '(none stated)'}`);
    if (o.pkg) console.log(`   package : ${o.pkg}`);
  } catch (e) { console.log(`${asin}  failed: ${e.message.slice(0,40)}`); }
}
await b.close();
