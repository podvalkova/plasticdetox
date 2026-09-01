#!/usr/bin/env node
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const dir = __dirname;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1400, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(dir, 'best-vacuum-cleaners-for-microplastics-article-hero.html'), { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));
  const el = await page.$('.pin');
  await el.screenshot({ path: path.join(dir, 'best-vacuum-cleaners-for-microplastics-article-hero.png') });
  await browser.close();
  console.log('rendered');
})();
