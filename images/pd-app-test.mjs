import puppeteer from 'puppeteer';

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true });
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await p.goto('http://localhost:4321/', { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));

console.log('boot gone:', await p.$eval('#boot', el => el.classList.contains('gone')).catch(() => 'boot removed'));
console.log('h1:', await p.$eval('.hero h1', el => el.textContent).catch(() => 'none'));
console.log('scan button:', await p.$('.scan-btn') ? 'present' : 'absent (no BarcodeDetector)');
await p.screenshot({ path: '/tmp/pd-home.png' });

// search
await p.type('.search input', 'brita');
await new Promise(r => setTimeout(r, 500));
const rows = await p.$$eval('.results .row .row-name', ns => ns.map(n => n.textContent));
console.log('search "brita":', rows.slice(0, 4).join(' | '));
await p.screenshot({ path: '/tmp/pd-search.png' });

// open first result
await p.click('.results .row');
await new Promise(r => setTimeout(r, 400));
console.log('verdict brand:', await p.$eval('.verdict-brand', el => el.textContent).catch(() => 'none'));
console.log('badge:', await p.$eval('.badge', el => el.textContent).catch(() => 'none'));
console.log('fronts:', await p.$$eval('.front-name', ns => ns.map(n => n.textContent).join(',')));
console.log('alts:', await p.$$eval('.card .row-name', ns => ns.map(n => n.textContent).join(' | ')).catch(() => 'none'));
await p.screenshot({ path: '/tmp/pd-result.png', fullPage: true });

console.log('ERRORS:', errors.length ? errors.join('\n  ') : 'none');
await b.close();
