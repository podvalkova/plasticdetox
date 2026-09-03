#!/usr/bin/env node
/**
 * Finds Reddit threads worth commenting on for plasticdetox.org.
 *
 *   node tools/social/reddit-find.mjs                 watch every sub
 *   node tools/social/reddit-find.mjs --max-age 48
 *   node tools/social/reddit-find.mjs --only ZeroWaste,tea
 *   node tools/social/reddit-find.mjs --fresh         ignore the seen ledger
 *
 * Reads public subreddit feeds through a real browser. Reddit blocks plain HTTP
 * clients and the Anthropic crawler, but renders normally for Chrome.
 * Writes candidates to reddit-candidates.json, and the bodies are fetched too,
 * because a title alone is not enough to write a useful comment from.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const puppeteer = createRequire(join(REPO, 'images', 'package.json'))('puppeteer');

const CFG = JSON.parse(readFileSync(join(HERE, 'reddit-subs.json'), 'utf8'));
const SEEN = join(HERE, 'reddit-seen.json');
const OUT = join(HERE, 'reddit-candidates.json');

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : (argv[i + 1] ?? true); };
const MAX_AGE_H = Number(flag('--max-age', CFG.maxAgeHours ?? 72));
const MIN_SCORE = Number(flag('--min', CFG.minScore ?? 3));
const FRESH = argv.includes('--fresh');
const ONLY = String(flag('--only', '') || '');

const seen = FRESH ? {} : (existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')) : {});
const kw = CFG.keywords.map(k => k.toLowerCase());
const matches = t => { const s = String(t).toLowerCase(); return kw.filter(k => s.includes(k)); };

let subs = CFG.subs;
if (ONLY) {
  const want = new Set(ONLY.split(',').map(s => s.trim().toLowerCase()));
  subs = subs.filter(s => want.has(s.name.toLowerCase()));
}

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
page.setDefaultNavigationTimeout(45000);
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');

console.log(`Watching ${subs.length} subreddit(s), threads from the last ${MAX_AGE_H}h.\n`);
const found = [];
let blocked = 0;

for (const sub of subs) {
  try {
    await page.goto(`https://www.reddit.com/r/${sub.name}/new/`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 4000));
    for (let i = 0; i < 3; i++) { // the feed lazy loads
      await page.evaluate(() => window.scrollBy(0, 4000));
      await new Promise(r => setTimeout(r, 1800));
    }
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('shreddit-post')].map(p => ({
        title: p.getAttribute('post-title') || '',
        score: Number(p.getAttribute('score') || 0),
        comments: Number(p.getAttribute('comment-count') || 0),
        at: p.getAttribute('created-timestamp') || '',
        author: p.getAttribute('author') || '',
        link: 'https://www.reddit.com' + (p.getAttribute('permalink') || ''),
      })));
    if (!rows.length) { blocked++; console.log(`  r/${sub.name.padEnd(22)} no posts returned`); continue; }

    let kept = 0;
    for (const r of rows) {
      if (!r.link || seen[r.link]) continue;
      const ageH = r.at ? (Date.now() - Date.parse(r.at)) / 3600e3 : null;
      if (ageH === null || ageH > MAX_AGE_H || ageH < 0) continue;
      const hits = matches(r.title);
      if (!hits.length) continue;
      if (r.score + r.comments < MIN_SCORE) continue;
      found.push({ ...r, sub: sub.name, article: sub.article, ageH: Math.round(ageH), keywords: hits });
      kept++;
    }
    console.log(`  r/${sub.name.padEnd(22)} ${rows.length} recent, ${kept} on topic`);
  } catch (e) {
    console.log(`  r/${sub.name.padEnd(22)} failed: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 2500)); // be a polite guest
}

// A title is not enough to write a comment from, so pull the body of each hit.
found.sort((a, b) => (b.score + b.comments * 2) - (a.score + a.comments * 2));
const top = found.slice(0, Number(flag('--limit', 25)));
if (top.length) console.log(`\nReading ${top.length} thread(s) for their body text...`);
for (const t of top) {
  try {
    await page.goto(t.link, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3200));
    const body = await page.evaluate(() => {
      const el = document.querySelector('shreddit-post [slot="text-body"], shreddit-post [property="schema:articleBody"]');
      return el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
    });
    t.body = body.slice(0, 2500);
    const extra = matches(t.title + ' ' + body);
    t.keywords = [...new Set([...t.keywords, ...extra])];
  } catch { t.body = ''; }
  await new Promise(r => setTimeout(r, 1800));
}

await browser.close();
writeFileSync(OUT, JSON.stringify({ count: top.length, posts: top }, null, 2) + '\n');
console.log(`\n${top.length} candidates written to ${OUT.replace(REPO + '/', '')}`);
if (blocked) console.log(`${blocked} sub(s) returned nothing, which usually means Reddit throttled us.`);
for (const t of top.slice(0, 12)) {
  console.log(`\n  r/${t.sub} · ${t.score}pts · ${t.comments}c · ${t.ageH}h`);
  console.log(`    ${t.title.slice(0, 100)}`);
}
