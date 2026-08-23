#!/usr/bin/env node
/**
 * Finds X posts worth replying to for plasticdetox.org.
 *
 * Reuses the X session already in Chrome by decrypting ONLY x.com cookies.
 * No other site's cookies are read, and nothing is written to disk.
 *
 *   node tools/social/x-find.mjs              run every query
 *   node tools/social/x-find.mjs --min 100    raise the engagement floor
 *   node tools/social/x-find.mjs --fresh      ignore the seen ledger
 *
 * Writes candidates to tools/social/x-candidates.json for drafting replies.
 */

import crypto from 'node:crypto';
import sqlite3 from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const require = createRequire(join(REPO, 'images', 'package.json'));
const puppeteer = require('puppeteer');

const QUERIES = join(HERE, 'x-queries.json');
const SEEN = join(HERE, 'x-seen.json');
const OUT = join(HERE, 'x-candidates.json');
const CHROME_COOKIES = join(homedir(), 'Library/Application Support/Google/Chrome/Default/Cookies');

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(name);
  return i === -1 ? def : (argv[i + 1] ?? true);
};
const MIN_ENGAGEMENT = Number(flag('--min', 25));
const FRESH = argv.includes('--fresh');

/* ------------------------------------------------------------- cookies -- */

/** Decrypt only x.com / twitter.com cookies out of Chrome's store. */
function xCookies() {
  if (!existsSync(CHROME_COOKIES)) {
    throw new Error('Chrome cookie store not found. Is Chrome installed under the default profile?');
  }
  const tmp = join(tmpdir(), `_xck_${process.pid}.db`);
  copyFileSync(CHROME_COOKIES, tmp); // snapshot, so a running Chrome does not block us
  try {
    const db = new sqlite3.DatabaseSync(tmp, { readOnly: true });
    const rows = db.prepare(
      `select host_key, name, hex(encrypted_value) as enc, value, path, is_secure, is_httponly
         from cookies where host_key like '%x.com' or host_key like '%twitter.com'`
    ).all();

    let pw;
    try {
      pw = execFileSync('security',
        ['find-generic-password', '-w', '-s', 'Chrome Safe Storage'],
        { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch (e) {
      // status 152 = macOS put up a keychain dialog that was not approved.
      throw new Error(
        'macOS would not release the Chrome cookie key.\n' +
        '  A dialog saying "wants to use your confidential information stored in\n' +
        '  Chrome Safe Storage" should appear. Click Always Allow, then rerun.\n' +
        '  If no dialog appeared, run this once in a terminal and approve it:\n' +
        '    security find-generic-password -w -s "Chrome Safe Storage" > /dev/null'
      );
    }
    const key = crypto.pbkdf2Sync(pw, 'saltysalt', 1003, 16, 'sha1');
    const iv = Buffer.alloc(16, ' ');

    const decrypt = hex => {
      const buf = Buffer.from(hex, 'hex');
      const tag = buf.subarray(0, 3).toString();
      if (tag !== 'v10' && tag !== 'v11') return null;
      const d = crypto.createDecipheriv('aes-128-cbc', key, iv);
      d.setAutoPadding(false);
      let out = Buffer.concat([d.update(buf.subarray(3)), d.final()]);
      const pad = out[out.length - 1];
      if (pad >= 1 && pad <= 16) out = out.subarray(0, out.length - pad);
      // Chrome M127+ prefixes a 32-byte SHA256 domain hash.
      for (const cand of [out, out.subarray(32)]) {
        const s = cand.toString('utf8');
        if (s && /^[\x20-\x7E]*$/.test(s)) return s;
      }
      return null;
    };

    const cookies = [];
    for (const r of rows) {
      const value = r.value || decrypt(r.enc);
      if (value) {
        cookies.push({
          name: r.name, value, domain: r.host_key, path: r.path,
          secure: !!r.is_secure, httpOnly: !!r.is_httponly, url: 'https://x.com',
        });
      }
    }
    db.close();
    if (!cookies.some(c => c.name === 'auth_token')) {
      throw new Error('no X auth_token found. Log into X in Chrome, then rerun.');
    }
    return cookies;
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

/* -------------------------------------------------------------- scrape -- */

const num = s => {
  if (!s) return 0;
  const m = /([\d.,]+)\s*([KMk m]?)/.exec(s.replace(/,/g, ''));
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const suf = (m[2] || '').trim().toUpperCase();
  return Math.round(n * (suf === 'K' ? 1e3 : suf === 'M' ? 1e6 : 1));
};

function parseEngagement(label) {
  const g = k => {
    const m = new RegExp(`([\\d.,KM]+)\\s+${k}`, 'i').exec(label || '');
    return m ? num(m[1]) : 0;
  };
  return { replies: g('repl'), reposts: g('repost'), likes: g('like'), bookmarks: g('bookmark'), views: g('view') };
}

async function searchOnce(page, query, mode) {
  const url = `https://x.com/search?q=${encodeURIComponent(query)}&f=${mode}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise(r => setTimeout(r, 5000));
  for (let i = 0; i < 2; i++) { // a little scroll for more results
    await page.evaluate(() => window.scrollBy(0, 2500));
    await new Promise(r => setTimeout(r, 2500));
  }
  return page.evaluate(() =>
    [...document.querySelectorAll('article[data-testid="tweet"]')].map(a => {
      const link = a.querySelector('a[href*="/status/"]')?.href || '';
      const timeEl = a.querySelector('time');
      return {
        name: a.querySelector('[data-testid="User-Name"]')?.innerText.split('\n')[0] || '',
        handle: (link.match(/x\.com\/([^/]+)\/status/) || [])[1] || '',
        text: (a.querySelector('[data-testid="tweetText"]')?.innerText || '').replace(/\s+/g, ' ').trim(),
        link: link.split('?')[0],
        at: timeEl?.getAttribute('datetime') || '',
        engLabel: a.querySelector('[role="group"]')?.getAttribute('aria-label') || '',
        isReply: /Replying to/i.test(a.innerText.slice(0, 200)),
      };
    })
  );
}

/* ---------------------------------------------------------------- main -- */

const queries = JSON.parse(readFileSync(QUERIES, 'utf8'));
const seen = FRESH ? {} : (existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')) : {});

console.log('Reading X session from Chrome...');
let cookies;
try {
  cookies = xCookies();
} catch (e) {
  console.error('\nCannot read your X session.\n' + e.message);
  process.exit(1);
}
console.log(`Session found. Running ${queries.queries.length} queries, engagement floor ${MIN_ENGAGEMENT}.\n`);

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');
await browser.setCookie(...cookies);

const found = new Map();
for (const q of queries.queries) {
  const rows = [];
  for (const mode of (q.modes || ['top'])) {
    try { rows.push(...await searchOnce(page, q.query, mode)); }
    catch (e) { console.log(`  ${q.label} (${mode}): failed, ${e.message}`); }
  }
  let kept = 0;
  for (const r of rows) {
    if (!r.link || !r.text || r.isReply) continue;
    if (queries.excludeHandles?.some(h => h.toLowerCase() === r.handle.toLowerCase())) continue;
    if (seen[r.link]) continue;
    const eng = parseEngagement(r.engLabel);
    const score = eng.likes + eng.reposts * 2 + eng.replies;
    if (score < MIN_ENGAGEMENT) continue;
    if (found.has(r.link)) {
      const hit = found.get(r.link);
      hit.topics.push(q.label);
      hit.tier = Math.min(hit.tier, q.tier ?? 1);
      continue;
    }
    found.set(r.link, {
      ...r, engagement: eng, score, topics: [q.label], tier: q.tier ?? 1,
      article: q.article || null, engLabel: undefined, isReply: undefined,
    });
    kept++;
  }
  console.log(`  ${q.label.padEnd(22)} ${rows.length} scraped, ${kept} new`);
}

await browser.close();

let list = [...found.values()].sort((a, b) => a.tier - b.tier || b.score - a.score);

// One prolific account can otherwise take over a whole run.
const maxPerHandle = queries.maxPerHandle ?? 2;
const perHandle = new Map();
const capped = [];
let dropped = 0;
for (const p of list) {
  const h = p.handle.toLowerCase();
  const n = perHandle.get(h) ?? 0;
  if (n >= maxPerHandle) { dropped++; continue; }
  perHandle.set(h, n + 1);
  capped.push(p);
}
if (dropped) console.log(`\n  ${dropped} dropped by the ${maxPerHandle}-per-account cap`);
list = capped;
writeFileSync(OUT, JSON.stringify({ generatedFor: MIN_ENGAGEMENT, count: list.length, posts: list }, null, 2) + '\n');
console.log(`\n${list.length} candidates written to ${OUT.replace(REPO + '/', '')}`);
if (list.length) {
  const t1 = list.filter(p => p.tier === 1).length;
  console.log(`\n${t1} in the plastic core, ${list.length - t1} adjacent. Top:`);
  for (const p of list.slice(0, 8)) {
    console.log(`  T${p.tier} ${String(p.score).padStart(6)}  @${p.handle.padEnd(18)} ${p.topics[0]}`);
    console.log(`          ${p.text.slice(0, 95)}`);
  }
}
