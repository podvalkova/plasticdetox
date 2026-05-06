const puppeteer = require('puppeteer');
const fs = require('fs');

const queries = [
  { key: 'clothing::9',  name: 'Branch Basics Concentrate',           q: 'Branch+Basics+concentrate+laundry' },
  { key: 'clothing::10', name: "Molly's Suds Laundry Powder",          q: 'Molly%27s+Suds+laundry+powder' },
  { key: 'play::6',      name: 'Manhattan Toy Skwish',                  q: 'Manhattan+Toy+Skwish' },
  { key: 'play::7',      name: "Grimm's Rainbow Stacker",               q: 'Grimms+rainbow+stacker' },
  { key: 'play::8',      name: 'Hevea Natural Rubber Rattle',           q: 'Hevea+natural+rubber+rattle' },
  { key: 'play::11',     name: 'Gathre Vegan Leather Mat',              q: 'Gathre+mat' },
  { key: 'play::12',     name: 'Lovevery Play Gym',                     q: 'Lovevery+Play+Gym' },
  { key: 'play::13',     name: 'Estella Organic Cloth Books',           q: 'Estella+organic+cotton+cloth+book' },
  { key: 'play::14',     name: 'Senger Naturwelt Wool Stuffies',        q: 'Senger+Naturwelt+wool+stuffed+animal' },
  { key: 'health::6',    name: 'Earth Mama Baby Mineral Sunscreen SPF 40', q: 'Earth+Mama+Baby+Mineral+Sunscreen+SPF+40' },
  { key: 'misc::1',      name: 'Nanit Pro Smart Baby Monitor',          q: 'Nanit+Pro+smart+baby+monitor' },
  { key: 'misc::6',      name: 'Storksak Organic Cotton Diaper Bag',    q: 'Storksak+organic+cotton+diaper+bag' },
  { key: 'misc::7',      name: 'Freshly Picked Vegan Leather Diaper Bag', q: 'Freshly+Picked+diaper+bag' },
  { key: 'misc::9',      name: 'Pearhead Organic Cotton Milestone Blanket', q: 'Pearhead+organic+cotton+milestone+blanket' }
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const results = {};
  let consecutiveFail = 0;
  for (const item of queries) {
    if (consecutiveFail >= 3) {
      console.log('cooling down 90s');
      await sleep(90000);
      consecutiveFail = 0;
    }
    await sleep(7000 + Math.floor(Math.random() * 5000));
    let imgId = null;
    for (let attempt = 0; attempt < 2 && !imgId; attempt++) {
      try {
        await page.goto('https://www.amazon.com/s?k=' + item.q, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('.s-image', { timeout: 12000 }).catch(() => null);
        imgId = await page.evaluate(() => {
          const img = document.querySelector('.s-image');
          if (!img) return null;
          const m = img.src.match(/images\/I\/([A-Za-z0-9+_%-]+)\./);
          return m ? m[1] : null;
        });
        if (!imgId) await sleep(5000);
      } catch (e) { await sleep(5000); }
    }
    results[item.key] = imgId;
    fs.writeFileSync('/tmp/missing-images.json', JSON.stringify(results, null, 2));
    consecutiveFail = imgId ? 0 : consecutiveFail + 1;
    console.log(`${item.name.slice(0,50)}: ${imgId || 'NOT_FOUND'}`);
  }
  await browser.close();
  console.log('done');
})();
