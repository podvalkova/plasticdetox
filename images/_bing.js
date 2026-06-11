const puppeteer = require('puppeteer');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const queries = [
  ['Crest+Advanced+Kids+Bubblegum+toothpaste+single+tube+color+changing', 'crest_kids_color'],
  ['Sensodyne+Extra+Whitening+toothpaste+single+tube+4+oz', 'sensodyne_extra_whitening'],
  ['Redmond+Earthpaste+lemon+twist+single+tube+toothpaste', 'earthpaste_lemon'],
  ['Cali+White+activated+charcoal+coconut+oil+toothpaste+single+tube', 'cali_white_charcoal'],
];
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  for (const [q, label] of queries) {
    try {
      await page.goto('https://www.bing.com/images/search?q=' + q, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3500);
      const imgs = await page.evaluate(() => {
        const out = [];
        const items = document.querySelectorAll('a.iusc');
        for (const a of items) {
          try {
            const mm = a.getAttribute('m');
            if (mm) {
              const obj = JSON.parse(mm);
              if (obj.murl) out.push({ url: obj.murl, title: (obj.t || '').slice(0, 100) });
            }
          } catch(e) {}
          if (out.length >= 8) break;
        }
        return out;
      });
      console.log(label + ':');
      imgs.forEach((i, idx) => console.log('  ' + idx + ': ' + i.title.slice(0,55) + ' | ' + i.url.slice(0, 200)));
    } catch(e) { console.log(label + ' err: ' + e.message); }
    await sleep(2500);
  }
  await browser.close();
})();
