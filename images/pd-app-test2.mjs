import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true });
const errors = [];
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await p.goto('http://localhost:4321/', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 900));
await p.type('.search input', 'brita');
await new Promise(r => setTimeout(r, 400));
await p.click('.results .row');
await new Promise(r => setTimeout(r, 300));

// click the second rated product (Elite and Longlast+)
const picked = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  const which = cards.find(c => c.querySelector('h2')?.textContent.includes('Which one'));
  const rows = [...which.querySelectorAll('.row')];
  rows[1].click();
  return rows[1].querySelector('.row-name').textContent;
});
await new Promise(r => setTimeout(r, 350));
console.log('picked:', picked);
console.log('badge:', await p.$eval('.badge', e => e.textContent));
console.log('cat line:', await p.$eval('.verdict-cat', e => e.textContent));
console.log('fronts:', await p.$$eval('.front', ns => ns.map(n => n.querySelector('.front-mark').className.replace('front-mark ','') + '=' + n.querySelector('.front-name').textContent).join(', ')));
console.log('heldback card:', await p.$$eval('.card h2', ns => ns.map(n=>n.textContent).join(' | ')));
await p.screenshot({ path: '/tmp/pd-product.png', fullPage: true });

// back navigation
await p.click('#back');
await new Promise(r => setTimeout(r, 250));
console.log('after back:', await p.$eval('.verdict-cat', e => e.textContent));

// simulate a scan result path via the unknown screen
await p.evaluate(() => history.length);
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await b.close();
