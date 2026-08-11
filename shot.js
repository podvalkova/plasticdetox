const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();
  await page.setViewport({width: 1080, height: 1350, deviceScaleFactor: 2});
  const dir = process.cwd() + '/images';
  await page.goto('file://' + dir + '/pfas-in-fast-food-packaging-article-hero.html', {waitUntil: 'networkidle0'});
  await page.evaluateHandle('document.fonts.ready');
  const el = await page.$('.pin');
  await el.screenshot({path: dir + '/pfas-in-fast-food-packaging-article-hero.png'});
  await browser.close();
  console.log('done');
})();
