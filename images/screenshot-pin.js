#!/usr/bin/env node
// Usage: node screenshot-pin.js <input.html> <output.png>
// Takes a screenshot of just the .pin element at 2x, outputs 1872x3000 PNG

const puppeteer = require('puppeteer');
const path = require('path');

const input = process.argv[2];
const output = process.argv[3] || input.replace('.html', '.png');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1064, height: 1564, deviceScaleFactor: 2 });
  await page.goto('file://' + path.resolve(input), { waitUntil: 'networkidle0' });

  const pin = await page.$('.pin');
  if (!pin) {
    console.error('No .pin element found');
    process.exit(1);
  }

  await pin.screenshot({ path: path.resolve(output) });
  console.log('Saved:', output);

  await browser.close();
})();
