import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 393, height: 852, isMobile: true });
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('http://localhost:4321/?code=3017620422003', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 5000));
console.log(await p.$eval('#screen', el => el.innerHTML.replace(/></g,'>\n<').slice(0, 2500)));
await b.close();
