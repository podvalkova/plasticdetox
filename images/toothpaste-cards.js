#!/usr/bin/env node
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const products = [
  {
    slug: 'nobs',
    num: 1,
    name: 'NOBS Tablets',
    tag: 'Contender',
    img: '_tmp-nobs.jpg',
    good: 'Only product with peer reviewed efficacy research. Comparable to fluoride toothpaste.',
    bad: 'Kids version tested positive for lead, cadmium, and arsenic. Adult version untested.',
    winner: false,
  },
  {
    slug: 'davids',
    num: 2,
    name: 'Davids Hydroxi',
    tag: 'Contender',
    img: '_tmp-davids.webp',
    good: 'Recyclable aluminum tube. Brand commissioned third party lab testing on dentin occlusion.',
    bad: 'Tested positive for lead and arsenic in independent heavy metal testing.',
    winner: false,
  },
  {
    slug: 'risewell',
    num: 3,
    name: 'RiseWell Mineral',
    tag: 'Contender',
    img: '_tmp-risewell.png',
    good: 'Established brand sold in 500+ dental offices. Popular kids flavors.',
    bad: 'No published efficacy research. No independent heavy metal testing. Concentration not disclosed.',
    winner: false,
  },
  {
    slug: 'bite',
    num: 4,
    name: 'Bite Toothpaste Bits',
    tag: 'Contender',
    img: '_tmp-bite.jpg',
    good: 'Glass jar with compostable refill pouches. Gentler flavor. Refillable subscription model.',
    bad: 'No published efficacy research. No independent heavy metal testing.',
    winner: false,
  },
  {
    slug: 'drbronners',
    num: 5,
    name: 'Dr. Bronners All One',
    tag: 'Contender',
    img: '_tmp-drbronners.jpg',
    good: 'Cleanest minimalist formula in the category. Eight ingredients, no surfactants, Fair Trade organic.',
    bad: 'Tested positive for lead, arsenic, and mercury in independent testing.',
    winner: false,
  },
  {
    slug: 'essentialoxygen',
    num: 6,
    name: 'Essential Oxygen BR',
    tag: 'Contender',
    img: '_tmp-essentialoxygen.jpg',
    good: 'Non detect for heavy metals in independent testing. USDA Certified Organic.',
    bad: 'Hydrogen peroxide base linked to microbiome disruption and brown tongue with daily use.',
    winner: false,
  },
  {
    slug: 'weleda',
    num: 7,
    name: 'Weleda Salt Toothpaste',
    tag: 'Winner',
    img: '_tmp-weleda.jpg',
    good: 'Non detect for heavy metals. Aluminum tube. 50+ years on the market. Sodium bicarbonate has research backing for plaque reduction.',
    bad: 'No hydroxyapatite, so no active remineralization. Salty taste is not for everyone.',
    winner: true,
  },
];

const html = (p) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex, nofollow">
  <title>${p.name}</title>
  <style>
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
      height: 1920px;
      background: ${p.winner ? '#1c1917' : '#ede9fe'};
      display: flex;
      flex-direction: column;
      padding: 80px 70px 70px;
      position: relative;
      overflow: hidden;
    }
    .pin::before {
      content: "";
      position: absolute;
      top: -200px;
      right: -200px;
      width: 700px;
      height: 700px;
      border-radius: 50%;
      background: radial-gradient(circle, ${p.winner ? 'rgba(196, 181, 253, 0.25)' : 'rgba(196, 181, 253, 0.6)'} 0%, ${p.winner ? 'rgba(28, 25, 23, 0)' : 'rgba(237, 233, 254, 0)'} 70%);
      pointer-events: none;
    }
    .pin::after {
      content: "";
      position: absolute;
      bottom: -250px;
      left: -250px;
      width: 800px;
      height: 800px;
      border-radius: 50%;
      background: radial-gradient(circle, ${p.winner ? 'rgba(196, 181, 253, 0.20)' : 'rgba(196, 181, 253, 0.5)'} 0%, ${p.winner ? 'rgba(28, 25, 23, 0)' : 'rgba(237, 233, 254, 0)'} 70%);
      pointer-events: none;
    }
    .frame-label {
      text-align: center;
      font-size: 34px;
      font-weight: 800;
      letter-spacing: 0.32em;
      color: ${p.winner ? '#c4b5fd' : '#7c3aed'};
      text-transform: uppercase;
      z-index: 5;
      margin-bottom: 32px;
      position: relative;
    }
    .header {
      text-align: center;
      position: relative;
      z-index: 2;
      margin-bottom: 44px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .tag {
      display: inline-block;
      font-size: 36px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: #ffffff;
      background: ${p.winner ? '#facc15' : '#7c3aed'};
      ${p.winner ? 'color: #1c1917;' : ''}
      padding: 16px 44px;
      border-radius: 100px;
      margin-bottom: 28px;
      box-shadow: 0 8px 24px rgba(${p.winner ? '250, 204, 21' : '124, 58, 237'}, 0.45);
    }
    .product-img {
      width: 480px;
      height: 480px;
      background: ${p.winner ? '#fafaf9' : '#ffffff'};
      border-radius: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      margin-bottom: 28px;
      box-shadow: 0 16px 40px rgba(76, 29, 149, 0.18);
      ${p.winner ? 'border: 6px solid #facc15;' : ''}
    }
    .product-img img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 24px;
    }
    h1 {
      font-size: 78px;
      font-weight: 900;
      color: ${p.winner ? '#fafaf9' : '#1c1917'};
      line-height: 0.96;
      letter-spacing: -0.04em;
    }
    h1 .accent {
      color: ${p.winner ? '#facc15' : '#7c3aed'};
      font-style: italic;
    }
    .verdict-rows {
      display: flex;
      flex-direction: column;
      gap: 24px;
      position: relative;
      z-index: 2;
    }
    .row {
      background: ${p.winner ? 'rgba(255,255,255,0.06)' : '#ffffff'};
      border-radius: 26px;
      padding: 28px 36px;
      box-shadow: 0 10px 32px rgba(76, 29, 149, 0.12);
      border-left: 16px solid;
      ${p.winner ? 'border: 2px solid rgba(255,255,255,0.1); border-left: 16px solid;' : ''}
    }
    .row.good { border-left-color: #16a34a; }
    .row.bad { border-left-color: #dc2626; }
    .row-label {
      font-size: 34px;
      font-weight: 900;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .row.good .row-label { color: #16a34a; }
    .row.bad .row-label { color: #dc2626; }
    .row-text {
      font-size: 34px;
      font-weight: 600;
      color: ${p.winner ? '#fafaf9' : '#1c1917'};
      line-height: 1.3;
      letter-spacing: -0.005em;
    }
    .winner-banner {
      margin-top: 32px;
      background: linear-gradient(135deg, #facc15 0%, #f59e0b 100%);
      color: #1c1917;
      border-radius: 26px;
      padding: 32px 40px;
      text-align: center;
      position: relative;
      z-index: 2;
      box-shadow: 0 16px 40px rgba(250, 204, 21, 0.35);
    }
    .winner-label {
      font-size: 32px;
      font-weight: 900;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .winner-text {
      font-size: 44px;
      font-weight: 900;
      letter-spacing: -0.025em;
      line-height: 1.1;
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      margin-top: auto;
      padding-top: 32px;
      border-top: 2px solid ${p.winner ? 'rgba(255,255,255,0.18)' : 'rgba(124, 58, 237, 0.25)'};
      position: relative;
      z-index: 2;
    }
    .footer-stat {
      font-size: 32px;
      font-weight: 700;
      color: ${p.winner ? '#c4b5fd' : '#57534e'};
    }
    .footer-url {
      font-size: 36px;
      font-weight: 900;
      color: ${p.winner ? '#facc15' : '#7c3aed'};
      letter-spacing: -0.01em;
    }
  </style>
</head>
<body>
  <div class="pin">
    <div class="frame-label">${p.num} of 7</div>

    <div class="header">
      <div class="tag">${p.tag}</div>
      <div class="product-img"><img src="${p.img}" alt="${p.name}"></div>
      <h1>${p.name}</h1>
    </div>

    <div class="verdict-rows">
      <div class="row good">
        <div class="row-label">Good</div>
        <div class="row-text">${p.good}</div>
      </div>
      <div class="row bad">
        <div class="row-label">Bad</div>
        <div class="row-text">${p.bad}</div>
      </div>
    </div>

    ${p.winner ? `<div class="winner-banner">
      <div class="winner-label">Why it won</div>
      <div class="winner-text">Cleanest test results.<br>Proven ingredient.</div>
    </div>` : ''}

    <div class="footer">
      <span class="footer-stat">${p.winner ? 'Read the full review' : 'Toothpaste showdown'}</span>
      <span class="footer-url">plasticdetox.org</span>
    </div>
  </div>
</body>
</html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1144, height: 2000, deviceScaleFactor: 1 });
  for (const p of products) {
    const filename = `toothpaste-${String(p.num).padStart(2, '0')}-${p.slug}`;
    const htmlPath = path.resolve(`${filename}.html`);
    fs.writeFileSync(htmlPath, html(p));
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
    const pin = await page.$('.pin');
    await pin.screenshot({ path: path.resolve(`${filename}.png`) });
    console.log('Saved:', `${filename}.png`);
  }
  await browser.close();
})();
