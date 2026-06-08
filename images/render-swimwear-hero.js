#!/usr/bin/env node
const puppeteer = require('puppeteer');
const path = require('path');

const jobs = [
  { file: 'plastic-free-swimwear-article-hero', sel: '.pin' },
  { file: 'plastic-free-swimwear-social', sel: '.card' },
];

(async () => {
  const dir = __dirname;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1500, deviceScaleFactor: 2 });
  for (const j of jobs) {
    await page.goto('file://' + path.join(dir, `${j.file}.html`), { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));
    const el = await page.$(j.sel);
    await el.screenshot({ path: path.join(dir, `${j.file}.png`) });
    console.log('Saved:', `${j.file}.png`);
  }
  await browser.close();
})();
