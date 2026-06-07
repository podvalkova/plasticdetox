const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');

const cards = [
  { slug: '2026-year-in-review', bg: '2026-year-in-review.png',
    tag: 'Cornerstone Review', l1: 'The 2026 Low Tox', l2: 'Year in Review', stat: 'What actually changed' },
  { slug: 'free-ways-to-reduce-plastic-exposure', bg: 'free-ways-to-reduce-plastic-exposure.png',
    tag: 'Free Habits Guide', l1: 'Cut Your Plastic', l2: 'Exposure for Free', stat: 'No spending required' },
  { slug: 'getting-started-checklist', bg: 'homepage-gettingstarted.png',
    tag: 'Getting Started', l1: '10 First Plastic', l2: 'Swaps That Matter', stat: 'The getting started checklist' },
  { slug: 'not-all-plastic-is-the-same', bg: 'not-all-plastic-is-the-same-raw.png',
    tag: 'Cornerstone Explainer', l1: 'Not All Plastic', l2: 'Is the Same', stat: "What's worth worrying about" },
  { slug: 'closet-101', bg: 'homepage-closet.png',
    tag: 'Closet 101', l1: 'Plastic Free', l2: 'Clothing & Laundry', stat: 'The complete guide' },
  { slug: 'food-pesticides-101', bg: 'homepage-food.png',
    tag: 'Food & Pesticides', l1: 'The Cleaner', l2: 'Eating Guide', stat: 'What to buy and skip' },
  { slug: 'news-and-research', bg: 'homepage-myths.png',
    tag: 'News & Research', l1: 'What the Studies', l2: 'Actually Say', stat: 'The latest microplastic science' },
  { slug: 'top-100-baby-kids-products-amazon', bg: 'registry.png',
    tag: 'Baby & Kids', l1: 'Top 100 Baby &', l2: 'Kids Products', stat: 'Ranked and reviewed' },
];

const html = (c) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="robots" content="noindex,nofollow"><title>${c.slug} social card</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#d6d3d1;display:flex;justify-content:center;padding:2rem;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;}
.card{width:1200px;height:630px;position:relative;overflow:hidden;background:#fafaf9;}
.bg{position:absolute;top:0;right:0;width:58%;height:100%;background-image:url('${c.bg}');background-size:cover;background-position:center;}
.veil{position:absolute;inset:0;background:linear-gradient(to right,rgba(250,250,249,1) 0%,rgba(250,250,249,1) 42%,rgba(250,250,249,0.85) 55%,rgba(250,250,249,0.35) 75%,rgba(250,250,249,0.10) 100%);}
.content{position:absolute;top:0;left:0;bottom:0;width:720px;padding:56px 56px 40px;display:flex;flex-direction:column;justify-content:center;z-index:2;}
.tag{display:inline-block;align-self:flex-start;font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:0.22em;color:#fff;background:#7c3aed;padding:10px 22px;border-radius:100px;margin-bottom:24px;white-space:nowrap;}
h1{font-size:62px;font-weight:900;color:#1c1917;line-height:1.0;letter-spacing:-0.035em;}
h1 .accent{color:#7c3aed;font-style:italic;}
.footer{position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:22px 40px;z-index:3;}
.footer-stat{font-size:22px;font-weight:700;color:#44403c;}
.footer-url{font-size:22px;font-weight:900;color:#7c3aed;}
</style></head><body>
<div class="card">
<div class="bg"></div><div class="veil"></div>
<div class="content"><div class="tag">${c.tag}</div><h1>${c.l1}<br><span class="accent">${c.l2}</span></h1></div>
<div class="footer"><span class="footer-stat">${c.stat}</span><span class="footer-url">plasticdetox.org</span></div>
</div></body></html>`;

(async () => {
  const browser = await puppeteer.launch();
  for (const c of cards) {
    const htmlPath = `${c.slug}-social.html`;
    fs.writeFileSync(htmlPath, html(c));
    const page = await browser.newPage();
    await page.setViewport({ width: 1264, height: 694, deviceScaleFactor: 2 });
    await page.goto('file://' + process.cwd() + '/' + htmlPath, { waitUntil: 'networkidle0' });
    const card = await page.$('.card');
    await card.screenshot({ path: `${c.slug}-social.png` });
    await page.close();
    execSync(`cwebp -q 88 -resize 1200 630 ${c.slug}-social.png -o ${c.slug}-social.webp`);
    console.log('built', c.slug);
  }
  await browser.close();
})();
