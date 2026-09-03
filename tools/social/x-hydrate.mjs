#!/usr/bin/env node
/**
 * Search results truncate long posts, so anything drafted from them can miss what
 * the post already says. This opens each candidate's permalink, expands "Show more",
 * and stores the complete text back into the archive.
 *
 *   node tools/social/x-hydrate.mjs           hydrate every drafted candidate
 *   node tools/social/x-hydrate.mjs --all     hydrate everything in the archive
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { xCookies, UA } from './x-session.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const puppeteer = createRequire(join(REPO, 'images', 'package.json'))('puppeteer');

const ARCHIVE = join(HERE, 'x-candidates-archive.json');
const archive = existsSync(ARCHIVE) ? JSON.parse(readFileSync(ARCHIVE, 'utf8')) : {};
const drafted = new Set(Object.keys(JSON.parse(readFileSync(join(HERE, 'x-replies.json'), 'utf8')).replies));

// Default to the CURRENT candidate set, not the drafted set. Drafting happens after
// this runs, so keying off drafts meant new candidates were never hydrated and got
// written up from a truncated preview.
const CANDS = join(HERE, 'x-candidates.json');
const current = existsSync(CANDS)
  ? new Set(JSON.parse(readFileSync(CANDS, 'utf8')).posts.map(p => p.link.split('/').pop()))
  : new Set();

const ids = Object.keys(archive)
  .filter(id => (process.argv.includes('--all') || current.has(id) || drafted.has(id)) && !archive[id].fullText);
if (!ids.length) { console.log('Nothing to hydrate.'); process.exit(0); }
console.log(`Hydrating ${ids.length} post(s)...`);

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
page.setDefaultNavigationTimeout(45000);
await page.setUserAgent(UA);
await browser.setCookie(...xCookies());

let grew = 0, ok = 0;
for (const id of ids) {
  const p = archive[id];
  try {
    await page.goto(p.link, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 4000));
    // Expand the "Show more" collapse if the post is long.
    await page.evaluate(() => {
      const a = document.querySelector('article[data-testid="tweet"]');
      const more = a?.querySelector('[data-testid="tweet-text-show-more-link"]');
      if (more) more.click();
    });
    await new Promise(r => setTimeout(r, 1200));
    const text = await page.evaluate(() => {
      const a = document.querySelector('article[data-testid="tweet"]');
      return (a?.querySelector('[data-testid="tweetText"]')?.innerText || '').replace(/\s+/g, ' ').trim();
    });
    if (!text) { console.log(`  no text: ${id}`); continue; }
    if (text.length > (p.text || '').length + 20) {
      console.log(`  @${p.handle}: ${p.text.length} -> ${text.length} chars`);
      grew++;
    }
    p.text = text.length >= (p.text || '').length ? text : p.text;
    p.fullText = true;
    ok++;
  } catch (e) { console.log(`  failed ${id}: ${e.message}`); }
}
writeFileSync(ARCHIVE, JSON.stringify(archive, null, 2) + '\n');
console.log(`\nhydrated ${ok}/${ids.length}; ${grew} were truncated in the search results.`);
await browser.close();
process.exit(0);
