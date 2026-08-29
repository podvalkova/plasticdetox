import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

// 1. home with starters
await p.goto('http://localhost:4321/', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 900));
console.log('starters:', await p.$$eval('.row-name', ns => ns.map(n=>n.textContent).join(' | ')));
await p.screenshot({ path: '/tmp/pd-home2.png' });

// 2. category screen
await p.evaluate(() => [...document.querySelectorAll('.row')].find(r => r.textContent.includes('Water filters')).click());
await new Promise(r => setTimeout(r, 300));
console.log('category h1:', await p.$eval('.hero h1', e => e.textContent), '/', await p.$eval('.hero p', e => e.textContent));
console.log('sections:', await p.$$eval('.section-title', ns => ns.map(n=>n.textContent).join(', ')));
console.log('first three:', await p.$$eval('.row-name', ns => ns.slice(0,3).map(n=>n.textContent).join(' | ')));
await p.screenshot({ path: '/tmp/pd-category.png' });

// 3. deep link by brand
await p.goto('http://localhost:4321/?b=Stanley', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 900));
console.log('deeplink brand:', await p.$eval('.verdict-brand', e => e.textContent), '/', await p.$eval('.badge', e => e.textContent));

// 4. deep link by real barcode (Nutella -> Ferrero?)
await p.goto('http://localhost:4321/?code=3017620422003', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 4000));
const brandEl = await p.$('.verdict-brand');
console.log('barcode screen:', brandEl ? 'result ' + await p.$eval('.verdict-brand', e=>e.textContent) : 'unknown ' + await p.$eval('.empty h2', e=>e.textContent).catch(()=>'?'));
console.log('packaging card:', await p.$$eval('.pkg-chip', ns => ns.map(n=>n.textContent).join(', ')).catch(()=>'none'));
await p.screenshot({ path: '/tmp/pd-scan.png', fullPage: true });

console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
await b.close();
