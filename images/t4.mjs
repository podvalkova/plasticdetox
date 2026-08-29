import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('console', m => console.log('[console]', m.type(), m.text().slice(0,200)));
p.on('requestfailed', r => console.log('[failed]', r.url().slice(0,90), r.failure()?.errorText));
await p.goto('http://localhost:4321/', { waitUntil: 'networkidle0' });
const out = await p.evaluate(async () => {
  const m = await import('./js/upc.js');
  try {
    const r = await m.lookup('3017620422003');
    return r ? { brand: r.brandName, pkg: r.packaging.map(x=>x.label), raw: r.title } : 'null';
  } catch (e) { return 'THREW: ' + e.message; }
});
console.log('lookup ->', JSON.stringify(out));
await b.close();
