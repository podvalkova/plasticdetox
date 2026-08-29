import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('console', async m => {
  const args = await Promise.all(m.args().map(a => a.evaluate(x => (x && x.stack) ? x.stack : String(x)).catch(()=>'?')));
  console.log('[' + m.type() + ']', args.join(' ').slice(0, 600));
});
await p.goto('http://localhost:4321/?code=3017620422003', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 5000));
await b.close();
