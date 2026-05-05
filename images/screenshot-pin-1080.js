#!/usr/bin/env node
// Renders a .pin element at native 1080x1620 (or whatever its CSS size is) at 1x.
// Usage: node screenshot-pin-1080.js <input.html> <output.png>

const puppeteer = require('puppeteer');
const path = require('path');

const input = process.argv[2];
const output = process.argv[3] || input.replace('.html', '.png');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1750, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(input), { waitUntil: 'networkidle0' });
  const pin = await page.$('.pin');
  if (!pin) { console.error('No .pin element found'); process.exit(1); }
  await pin.screenshot({ path: path.resolve(output) });
  console.log('Saved:', output);
  await browser.close();
})();
