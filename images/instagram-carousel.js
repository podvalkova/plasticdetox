#!/usr/bin/env node
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const A = 'carousel-assets';

const slides = [
  {
    n: 1,
    type: 'cover',
    tag: 'Toothpaste truth',
    h1: 'Why we only<br>recommend <span class="accent">1</span><br>toothpaste',
    sub: "24 brands reviewed. 1 we'd use.",
    footStat: 'Swipe for the full list',
  },
  {
    n: 2,
    type: 'category',
    tag: 'Avoid',
    h1: 'Fluoride toothpastes',
    risk: 'Heavy metals + neurodevelopmental concerns',
    summary: 'Major US fluoride brands have tested positive for heavy metals. Fluoride is also under fresh scrutiny for neurodevelopmental effects in children.',
    products: [
      { img: 'crest_regular.jpg', cap: 'Crest Regular' },
      { img: 'crest_kids_color.jpg', cap: 'Crest Kids Color Changing' },
      { img: 'colgate_total_whitening.jpg', cap: 'Colgate Total Whitening' },
      { img: 'sensodyne_extra_whitening.jpg', cap: 'Sensodyne Extra Whitening' },
      { img: 'armhammer_enamel.jpg', cap: 'Arm & Hammer Enamel Defense' },
    ],
    footStat: 'Documented contamination',
  },
  {
    n: 3,
    type: 'category',
    tag: 'Avoid',
    h1: 'Hydroxyapatite "mineral" toothpastes',
    risk: 'Heavy metals detected',
    summary: 'Hydroxyapatite is sourced from mined or animal minerals. Independent testing has consistently found heavy metals in this category.',
    products: [
      { img: 'risewell_kids_cake.jpg', cap: 'RiseWell Kids Cake Batter' },
      { img: 'boka_ela_mint.jpg', cap: 'Boka Ela Mint' },
      { img: 'boka_kids_orange.jpg', cap: 'Boka Kids Orange Cream' },
      { img: 'davids_premium_peppermint.jpg', cap: 'Davids Premium Peppermint' },
      { img: 'davids_hydroxi.webp', cap: 'Davids Hydroxi' },
      { img: 'nobs_jr_bubblegum.jpg', cap: 'NOBS Jr Bubblegum Berry' },
    ],
    footStat: 'Documented contamination',
  },
  {
    n: 4,
    type: 'category',
    tag: 'Avoid',
    h1: 'Charcoal toothpastes',
    risk: 'Abrasive · Enamel risk',
    summary: "Charcoal is highly abrasive. Enamel doesn't regenerate.",
    products: [
      { img: 'hello_charcoal.jpg', cap: 'Hello Activated Charcoal' },
      { img: 'burts_bees_charcoal.jpg', cap: "Burt's Bees Charcoal" },
      { img: 'crest_3d_charcoal.jpg', cap: 'Crest 3D White Charcoal' },
      { img: 'cali_white_charcoal.jpg', cap: 'Cali White Activated Charcoal' },
      { img: 'my_magic_mud.jpg', cap: 'My Magic Mud Charcoal' },
    ],
    footStat: 'Popular brands to skip',
  },
  {
    n: 5,
    type: 'category',
    tag: 'Avoid',
    h1: 'Clay tooth powders',
    risk: 'Heaviest contamination',
    summary: 'Marketed as the cleanest option. Independent testing found the highest lead levels in this category.',
    products: [
      { img: 'earthpaste_lemon.jpg', cap: 'Earthpaste Lemon Twist' },
      { img: 'primal_life.jpg', cap: 'Primal Life Dirty Mouth' },
      { img: 'just_ingredients.jpg', cap: 'Just Ingredients Tooth Powder' },
      { img: 'vanmans.jpg', cap: "VanMan's Miracle Tooth Powder" },
    ],
    footStat: 'Documented contamination',
  },
  {
    n: 6,
    type: 'pick',
    tag: 'Our pick',
    h1: 'No heavy metals.<br><span class="accent">100+ years</span> on the market.',
    pickImg: 'weleda.jpg',
    pickName: 'Weleda Salt Toothpaste',
    pickWhy: 'Sodium bicarbonate based, fluoride free, aluminum tube. Non-detect for lead, mercury, cadmium, arsenic in lab testing.',
    caveat: 'Honest caveat: no active remineralization. Best for adults with low cavity risk and solid oral hygiene.',
    alts: [
      { img: 'aquafresh_fresh_minty.jpg', label: 'Cavity-prone adults', name: 'Aquafresh Fresh & Minty', sub: 'Tested non-detect for heavy metals. Fluoride protection when cavity risk is high.' },
      { img: 'spry_kids.jpg', label: 'For kids', name: 'Spry Kids Tooth Gel', sub: 'Ask your pediatric dentist about fluoride.' },
      { img: 'dr_browns_baby.jpg', label: 'For babies', name: "Dr. Brown's Baby Toothpaste", sub: 'Fluoride free, safe if swallowed.' },
    ],
    footStat: 'Read the full review',
  },
  {
    n: 7,
    type: 'cover',
    tag: 'Your turn',
    h1: 'What toothpaste<br>are <span class="accent">you</span><br>using?',
    sub: "Drop it in the comments. We'll screen it.",
    footStat: 'Free brand check',
  },
];

const COMMON_CSS = `
  @font-face {
    font-family: 'Inter';
    font-style: normal;
    font-weight: 100 900;
    src: url(inter-latin.woff2) format('woff2');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #d6d3d1;
    display: flex;
    justify-content: center;
    padding: 2rem;
    font-family: 'Inter', -apple-system, sans-serif;
  }
  .pin {
    width: 1080px;
    height: 1350px;
    background: #fafaf9;
    position: relative;
    overflow: hidden;
  }
  .footer-url-color { color: #7c3aed; }
`;

function renderCover(s) {
  return `
  <style>${COMMON_CSS}
    .pin {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 60px 30px;
      background: #fafaf9;
    }
    .pin::before {
      content: "";
      position: absolute;
      top: -180px; right: -180px;
      width: 600px; height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(196,181,253,0.5) 0%, rgba(250,250,249,0) 70%);
      pointer-events: none;
    }
    .pin::after {
      content: "";
      position: absolute;
      bottom: -200px; left: -180px;
      width: 700px; height: 700px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(196,181,253,0.4) 0%, rgba(250,250,249,0) 70%);
      pointer-events: none;
    }
    .header {
      text-align: center;
      position: relative;
      z-index: 2;
    }
    .headline-tag {
      display: inline-block;
      font-size: 32px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.24em;
      color: #fff;
      background: #7c3aed;
      padding: 16px 36px;
      border-radius: 100px;
      margin-bottom: 36px;
    }
    h1 {
      font-size: 110px;
      font-weight: 900;
      color: #1c1917;
      line-height: 0.95;
      letter-spacing: -0.04em;
    }
    h1 .accent { color: #7c3aed; font-style: italic; }
    .sub {
      margin-top: 36px;
      font-size: 36px;
      font-weight: 700;
      color: #44403c;
      letter-spacing: -0.01em;
    }
    .footer {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 32px 48px;
      z-index: 2;
    }
    .footer-stat { font-size: 32px; font-weight: 700; color: #57534e; }
    .footer-url { font-size: 32px; font-weight: 900; color: #7c3aed; }
  </style>
  <div class="pin">
    <div class="header">
      <div class="headline-tag">${s.tag}</div>
      <h1>${s.h1}</h1>
      <div class="sub">${s.sub}</div>
    </div>
    <div class="footer">
      <span class="footer-stat">${s.footStat}</span>
      <span class="footer-url">plasticdetox.org</span>
    </div>
  </div>`;
}

function renderCategory(s) {
  const cols = s.products.length === 6 ? 3 : (s.products.length === 4 ? 2 : 3);
  const rows = Math.ceil(s.products.length / cols);
  return `
  <style>${COMMON_CSS}
    .pin {
      display: flex;
      flex-direction: column;
      padding: 44px 50px 28px;
    }
    .header { text-align: center; }
    .pin-tag {
      display: inline-block;
      font-size: 32px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.24em;
      color: #fff;
      background: #1c1917;
      padding: 12px 28px;
      border-radius: 100px;
      margin-bottom: 18px;
    }
    h1 {
      font-size: 64px;
      font-weight: 900;
      color: #1c1917;
      line-height: 0.98;
      letter-spacing: -0.035em;
      margin-bottom: 18px;
    }
    .risk {
      display: inline-block;
      font-size: 32px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #fff;
      background: #dc2626;
      padding: 12px 26px;
      border-radius: 100px;
      margin-bottom: 18px;
    }
    .summary {
      font-size: 32px;
      font-weight: 500;
      color: #44403c;
      line-height: 1.3;
      letter-spacing: -0.005em;
      max-width: 920px;
      margin: 0 auto;
    }
    .grid {
      margin-top: 24px;
      display: grid;
      grid-template-columns: repeat(${cols}, 1fr);
      gap: 16px;
      flex: 1;
      min-height: 0;
    }
    .tile {
      background: #fff;
      border: 2px solid #e7e5e4;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      min-height: 0;
      overflow: hidden;
    }
    .tile-img-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
    .tile-img-wrap img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 20px;
      border-top: 2px solid rgba(124,58,237,0.18);
      margin-top: 20px;
    }
    .footer-stat { font-size: 32px; font-weight: 700; color: #57534e; }
    .footer-url { font-size: 32px; font-weight: 900; color: #7c3aed; }
    .grid.rows-${rows} .tile-img-wrap { ${rows >= 3 ? 'min-height: 200px;' : ''} }
  </style>
  <div class="pin">
    <div class="header">
      <div class="pin-tag">${s.tag} · ${String(s.avoidNum || s.n).padStart(2,'0')}</div>
      <h1>${s.h1}</h1>
      <div class="risk">${s.risk}</div>
      <div class="summary">${s.summary}</div>
    </div>
    <div class="grid rows-${rows}">
      ${s.products.map(p => `
        <div class="tile">
          <div class="tile-img-wrap"><img src="${A}/${p.img}" alt=""></div>
        </div>`).join('')}
    </div>
    <div class="footer">
      <span class="footer-stat">${s.footStat}</span>
      <span class="footer-url">plasticdetox.org</span>
    </div>
  </div>`;
}

function renderPick(s) {
  return `
  <style>${COMMON_CSS}
    .pin {
      background: #fafaf9;
      padding: 44px 50px 24px;
      display: flex;
      flex-direction: column;
      color: #1c1917;
    }
    .pin::before {
      content: "";
      position: absolute;
      top: -180px; right: -180px;
      width: 600px; height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(196,181,253,0.5) 0%, rgba(250,250,249,0) 70%);
      pointer-events: none;
    }
    .pin::after {
      content: "";
      position: absolute;
      bottom: -200px; left: -180px;
      width: 700px; height: 700px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(196,181,253,0.3) 0%, rgba(250,250,249,0) 70%);
      pointer-events: none;
    }
    .header { text-align: center; position: relative; z-index: 2; }
    .pin-tag {
      display: inline-block;
      font-size: 32px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.24em;
      color: #fff;
      background: #7c3aed;
      padding: 14px 32px;
      border-radius: 100px;
      margin-bottom: 22px;
    }
    h1 {
      font-size: 64px;
      font-weight: 900;
      color: #1c1917;
      line-height: 0.98;
      letter-spacing: -0.04em;
      margin-bottom: 26px;
    }
    h1 .accent { color: #7c3aed; font-style: italic; }
    .pick-card {
      background: #fff;
      border-radius: 24px;
      padding: 22px;
      display: flex;
      gap: 22px;
      align-items: center;
      position: relative;
      z-index: 2;
      box-shadow: 0 16px 40px rgba(124,58,237,0.18);
      border: 4px solid #7c3aed;
    }
    .pick-img {
      width: 220px;
      height: 220px;
      flex-shrink: 0;
      background: #fafaf9;
      border-radius: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .pick-img img { max-width: 100%; max-height: 100%; object-fit: contain; padding: 14px; }
    .caveat {
      margin-top: 16px;
      background: #f5f3ff;
      border-left: 8px solid #7c3aed;
      border-radius: 14px;
      padding: 18px 24px;
      font-size: 32px;
      font-weight: 500;
      color: #44403c;
      line-height: 1.25;
      letter-spacing: -0.005em;
      position: relative;
      z-index: 2;
    }
    .pick-text { flex: 1; }
    .pick-name {
      font-size: 36px;
      font-weight: 900;
      color: #1c1917;
      letter-spacing: -0.025em;
      margin-bottom: 12px;
      line-height: 1.05;
    }
    .pick-why {
      font-size: 32px;
      font-weight: 500;
      color: #44403c;
      line-height: 1.25;
      letter-spacing: -0.005em;
    }
    .alts {
      margin-top: 22px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      position: relative;
      z-index: 2;
    }
    .alt-card {
      background: #fff;
      border: 2px solid #e7e5e4;
      border-radius: 20px;
      padding: 16px 24px;
      display: flex;
      gap: 22px;
      align-items: center;
    }
    .alt-img {
      width: 110px;
      height: 110px;
      flex-shrink: 0;
      background: #fafaf9;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .alt-img img { max-width: 100%; max-height: 100%; object-fit: contain; padding: 8px; }
    .alt-text { flex: 1; min-width: 0; }
    .alt-label {
      font-size: 32px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #7c3aed;
      line-height: 1.05;
      margin-bottom: 6px;
    }
    .alt-name {
      font-size: 32px;
      font-weight: 800;
      color: #1c1917;
      line-height: 1.05;
      letter-spacing: -0.015em;
      margin-bottom: 6px;
    }
    .alt-sub {
      font-size: 32px;
      font-weight: 500;
      color: #57534e;
      line-height: 1.18;
      letter-spacing: -0.005em;
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 22px;
      margin-top: auto;
      border-top: 2px solid rgba(124,58,237,0.18);
      position: relative;
      z-index: 2;
    }
    .footer-stat { font-size: 32px; font-weight: 700; color: #57534e; }
    .footer-url { font-size: 32px; font-weight: 900; color: #7c3aed; }
  </style>
  <div class="pin">
    <div class="header">
      <div class="pin-tag">${s.tag}</div>
      <h1>${s.h1}</h1>
    </div>
    <div class="pick-card">
      <div class="pick-img"><img src="${A}/${s.pickImg}" alt=""></div>
      <div class="pick-text">
        <div class="pick-name">${s.pickName}</div>
        <div class="pick-why">${s.pickWhy}</div>
      </div>
    </div>
    <div class="caveat">${s.caveat}</div>
    <div class="alts">
      ${s.alts.map(a => `
        <div class="alt-card">
          <div class="alt-img"><img src="${A}/${a.img}" alt=""></div>
          <div class="alt-text">
            <div class="alt-label">${a.label}</div>
            <div class="alt-name">${a.name}</div>
            <div class="alt-sub">${a.sub}</div>
          </div>
        </div>`).join('')}
    </div>
    <div class="footer">
      <span class="footer-stat">${s.footStat}</span>
      <span class="footer-url">plasticdetox.org</span>
    </div>
  </div>`;
}

const renderHTML = (s) => {
  const body =
    s.type === 'cover' ? renderCover(s) :
    s.type === 'pick' ? renderPick(s) :
    renderCategory(s);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>Slide ${s.n}</title></head>
<body>${body}</body></html>`;
};

// number AVOID slides in order
let avoidCounter = 0;
for (const s of slides) {
  if (s.type === 'category') s.avoidNum = ++avoidCounter;
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1144, height: 1430, deviceScaleFactor: 1 });
  for (const s of slides) {
    const filename = `ig-toothpaste-${String(s.n).padStart(2,'0')}`;
    const htmlPath = path.resolve(`${filename}.html`);
    fs.writeFileSync(htmlPath, renderHTML(s));
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
    const pin = await page.$('.pin');
    await pin.screenshot({ path: path.resolve(`${filename}.png`) });
    console.log('Saved:', `${filename}.png`);
  }
  await browser.close();
})();
