#!/usr/bin/env node
// Batch generator for 1200x630 article social cards (Twitter, OG)
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Each entry: slug = article filename without .html
// bg = clean base illustration (in /images/)
// tag = small purple pill above headline
// title = headline HTML (use <br>, <span class="accent">italic purple</span>)
// foot = short tagline bottom-left
const cards = [
  { slug: 'baby-kids-101',
    bg: 'kids.png', tag: 'Baby & Kids 101',
    title: 'Protect babies<br>from <span class="accent">microplastics</span>',
    foot: 'Hub guide' },
  { slug: 'bamboo-toothbrush-plastic-bristles',
    bg: 'bamboo brush.png', tag: 'Bathroom Guide',
    title: 'Your bamboo brush<br>still has <span class="accent">plastic</span>',
    foot: 'Bristle truth' },
  { slug: 'bedroom-air-101',
    bg: 'bedroom.png', tag: 'Bedroom 101',
    title: 'Stop breathing<br><span class="accent">plastic</span> in bed',
    foot: 'Hub guide' },
  { slug: 'best-mineral-sunscreen-guide',
    bg: 'sunscreen.png', tag: 'Sun Protection',
    title: 'Best mineral<br><span class="accent">sunscreens</span> (2026)',
    foot: 'Tested and ranked' },
  { slug: 'best-non-toxic-cutting-boards',
    bg: 'cuttingboard.png', tag: 'Kitchen Guide',
    title: 'Best non toxic<br><span class="accent">cutting boards</span>',
    foot: 'Wood, bamboo, plastic free' },
  { slug: 'best-plastic-free-food-storage-containers',
    bg: 'storage.png', tag: 'Food Storage',
    title: 'Best plastic free<br><span class="accent">storage</span>',
    foot: 'Glass, steel, silicone' },
  { slug: 'bpa-free-is-not-safe',
    bg: 'bpa-free.png', tag: 'Chemical Safety',
    title: 'BPA free is<br><span class="accent">not safe</span>',
    foot: 'What replaces BPA' },
  { slug: 'can-nanoplastics-be-filtered-out-of-water',
    bg: 'nanoplastics.png', tag: 'Water Filtration',
    title: 'Can nanoplastics<br>be <span class="accent">filtered out?</span>',
    foot: 'The 240,000 particle question' },
  { slug: 'cast-iron-vs-stainless-steel-vs-ceramic-cookware',
    bg: 'cookware.png', tag: 'Cookware Guide',
    title: 'Cast iron, steel,<br>or <span class="accent">ceramic?</span>',
    foot: 'The 2026 comparison' },
  { slug: 'clean-products-that-arent',
    bg: 'clean-lie-article-hero.png', bgPos: 'center 100%', tag: 'Investigative',
    title: '10 "clean"<br>products that <span class="accent">aren\'t</span>',
    foot: 'Tests, recalls, lawsuits' },
  { slug: 'glyphosate-detox-guide',
    bg: 'glyphosate.png', tag: 'Food & Pesticides',
    title: 'Glyphosate detox<br><span class="accent">guide</span> (2026)',
    foot: 'Where it hides' },
  { slug: 'how-to-avoid-bpa-and-phthalates',
    bg: 'bpa-avoid.png', tag: 'Chemical Guide',
    title: 'How to avoid BPA<br>and <span class="accent">phthalates</span>',
    foot: 'Room by room' },
  { slug: 'how-to-avoid-microplastics-in-tea',
    bg: 'tea.png', tag: 'Tea Guide',
    title: 'How to avoid<br><span class="accent">plastic</span> in tea',
    foot: 'Safer brewing' },
  { slug: 'how-to-filter-pfas-and-microplastics-from-water',
    bg: 'Drinking Water.png', tag: 'Water Filtration',
    title: 'Filter PFAS and<br><span class="accent">microplastics</span>',
    foot: 'From drinking water' },
  { slug: 'how-to-remove-microplastics-from-bottled-water',
    bg: 'Drinking Water.png', tag: 'Drinking Water',
    title: 'Microplastics in<br><span class="accent">bottled</span> water',
    foot: 'And how to fix it' },
  { slug: 'how-to-remove-microplastics-from-drinking-water',
    bg: 'Drinking Water.png', tag: 'Water Filtration',
    title: 'Remove plastic<br>from <span class="accent">tap water</span>',
    foot: 'The methods that work' },
  { slug: 'how-to-start-reducing-plastic-exposure',
    bg: 'gettingstarted.png', tag: 'Beginner Guide',
    title: 'Start reducing<br><span class="accent">plastic</span> exposure',
    foot: 'In priority order' },
  { slug: 'kitchen-detox-101',
    bg: 'kitchen appliences.png', tag: 'Kitchen 101',
    title: 'Plastic free<br><span class="accent">kitchen</span> guide',
    foot: 'Hub guide' },
  { slug: 'low-tox-mistakes-that-backfire',
    bg: 'lox-tox.png', tag: 'Research Guide',
    title: 'Low tox mistakes<br>that <span class="accent">backfire</span>',
    foot: 'What the data says' },
  { slug: 'low-tox-myths-debunked',
    bg: 'myth.png', tag: 'Myth Busting',
    title: 'Low tox myths,<br><span class="accent">debunked</span>',
    foot: 'What actually matters' },
  { slug: 'microplastics-in-baby-food',
    bg: 'babyfood.png', tag: 'Baby Feeding',
    title: 'Microplastics in<br><span class="accent">baby food</span>',
    foot: 'And safer alternatives' },
  { slug: 'microplastics-in-bedroom-air',
    bg: 'bedroom.png', tag: 'Bedroom Guide',
    title: '6 swaps for<br>cleaner <span class="accent">bedroom</span> air',
    foot: 'Stop inhaling plastic' },
  { slug: 'microplastics-in-clothing-and-laundry',
    bg: 'laundry.png', tag: 'Laundry Guide',
    title: 'Microplastics in<br><span class="accent">laundry</span>',
    foot: 'Reduce fiber shedding' },
  { slug: 'microplastics-in-cosmetics-and-personal-care',
    bg: 'personalcare.png', tag: 'Personal Care',
    title: 'Microplastics in<br><span class="accent">personal care</span>',
    foot: 'What to avoid' },
  { slug: 'microplastics-in-indoor-air',
    bg: 'indoorair.png', tag: 'Indoor Air',
    title: 'Microplastics in<br><span class="accent">indoor air</span>',
    foot: 'How to reduce exposure' },
  { slug: 'non-toxic-baby-toddler-products-guide',
    bg: 'kids.png', tag: 'Baby & Toddler',
    title: 'Non toxic baby<br>and <span class="accent">toddler</span> picks',
    foot: 'The complete guide' },
  { slug: 'personal-care-101',
    bg: 'personalcare.png', tag: 'Personal Care 101',
    title: 'Cleaner<br><span class="accent">personal care</span>',
    foot: 'Hub guide' },
  { slug: 'plastic-free-beach-day-essentials',
    bg: 'beach-day.png', tag: 'Outdoor Guide',
    title: 'Plastic free<br><span class="accent">beach day</span>',
    foot: 'Essentials guide' },
  { slug: 'plastic-in-groceries-what-really-matters',
    bg: 'groceries2.png', tag: 'Grocery Guide',
    title: 'Plastic in groceries<br>(what <span class="accent">matters</span>)',
    foot: 'And what to skip' },
  { slug: 'reduce-microplastics-in-cleaning-products',
    bg: 'cleaning.png', tag: 'Cleaning Guide',
    title: 'Microplastics in<br><span class="accent">cleaning</span> products',
    foot: 'How to reduce them' },
  { slug: 'supplements-and-microplastics',
    bg: 'supplements.png', tag: 'Supplements',
    title: 'Microplastics in<br>your <span class="accent">supplements</span>',
    foot: 'Cleanest forms and brands' },
  { slug: 'toxic-kitchen-appliances-ranked',
    bg: 'kitchen appliences.png', tag: 'Kitchen & Appliances',
    title: 'Toxic kitchen<br><span class="accent">appliances</span>, ranked',
    foot: 'What leaches most' },
  { slug: 'water-detox-101',
    bg: 'Drinking Water.png', tag: 'Water 101',
    title: 'Plastic free<br><span class="accent">water</span> guide',
    foot: 'Hub guide' },
];

const renderHTML = (c) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex,nofollow">
  <title>${c.slug} social card</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #d6d3d1;
      display: flex;
      justify-content: center;
      padding: 2rem;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .card {
      width: 1200px;
      height: 630px;
      position: relative;
      overflow: hidden;
      background: #fafaf9;
    }
    .bg {
      position: absolute;
      top: 0; right: 0;
      width: 60%;
      height: 100%;
      background-image: url('${c.bg.replace(/'/g, "\\'")}');
      background-size: cover;
      background-position: ${c.bgPos || 'center'};
    }
    .veil {
      position: absolute;
      top: 0; left: 0; bottom: 0; right: 0;
      background: linear-gradient(to right,
        rgba(250,250,249,1) 0%,
        rgba(250,250,249,1) 42%,
        rgba(250,250,249,0.85) 55%,
        rgba(250,250,249,0.35) 75%,
        rgba(250,250,249,0.10) 100%);
    }
    .content {
      position: absolute;
      top: 0; left: 0; bottom: 0;
      width: 720px;
      padding: 56px 56px 40px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      z-index: 2;
    }
    .tag {
      display: inline-block;
      align-self: flex-start;
      font-size: 22px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.22em;
      color: #fff;
      background: #7c3aed;
      padding: 10px 22px;
      border-radius: 100px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 78px;
      font-weight: 900;
      color: #1c1917;
      line-height: 0.98;
      letter-spacing: -0.035em;
    }
    h1 .accent { color: #7c3aed; font-style: italic; }
    .footer {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 22px 40px;
      z-index: 3;
    }
    .footer-stat { font-size: 22px; font-weight: 700; color: #44403c; }
    .footer-url { font-size: 22px; font-weight: 900; color: #7c3aed; }
  </style>
</head>
<body>
  <div class="card">
    <div class="bg"></div>
    <div class="veil"></div>
    <div class="content">
      <div class="tag">${c.tag}</div>
      <h1>${c.title}</h1>
    </div>
    <div class="footer">
      <span class="footer-stat">${c.foot}</span>
      <span class="footer-url">plasticdetox.org</span>
    </div>
  </div>
</body>
</html>`;

(async () => {
  const outDir = __dirname;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1264, height: 700, deviceScaleFactor: 1 });
  for (const c of cards) {
    const filename = `${c.slug}-social`;
    const htmlPath = path.join(outDir, `${filename}.html`);
    fs.writeFileSync(htmlPath, renderHTML(c));
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
    const card = await page.$('.card');
    await card.screenshot({ path: path.join(outDir, `${filename}.png`) });
    console.log('Saved:', `${filename}.png`);
  }
  await browser.close();
})();
