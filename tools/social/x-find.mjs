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
const BATCH = Number(flag('--batch', 10));      // queries per run; X rate limits above ~10
const ONLY = String(flag('--only', '') || '');  // comma separated labels, overrides rotation
const MAX_AGE_H = Number(flag('--max-age', 24)); // only reply to posts still in circulation

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
  // X's Top tab is not time bounded and happily returns four year old posts, so
  // constrain the query itself rather than filtering afterwards.
  const since = Math.floor((Date.now() - MAX_AGE_H * 3600e3) / 1000);
  // min_faves fights a short window: a post from two hours ago has not accumulated
  // likes yet even if it is about to. Inside a recency window, drop the floor from
  // the query and let the post-hoc --min threshold do the filtering instead.
  let q = MAX_AGE_H <= 48 ? query.replace(/\bmin_faves:\d+\s*/g, '') : query;
  q = /since_time:/.test(q) ? q : `${q.trim()} since_time:${since}`;
  const url = `https://x.com/search?q=${encodeURIComponent(q)}&f=${mode}`;
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

// Linked accounts (a brand and its clips account) count as one voice.
const groupOf = new Map();
for (const g of queries.handleGroups ?? []) for (const h of g) groupOf.set(h.toLowerCase(), g[0].toLowerCase());
const voice = h => groupOf.get(String(h).toLowerCase()) ?? String(h).toLowerCase();
const seen = FRESH ? {} : (existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')) : {});

// Handles drafted for recently are rested, so the roster rotates.
const coolDays = queries.recentHandleDays ?? 14;
const cutoff = Date.now() - coolDays * 864e5;
const resting = new Set();
if (!FRESH) {
  for (const v of Object.values(seen)) {
    if (v?.handle && v?.draftedAt && Date.parse(v.draftedAt) > cutoff) resting.add(voice(v.handle));
  }
}

console.log('Reading X session from Chrome...');
let cookies;
try {
  cookies = xCookies();
} catch (e) {
  console.error('\nCannot read your X session.\n' + e.message);
  process.exit(1);
}
console.log(`Session found. Running ${queries.queries.length} queries, engagement floor ${MIN_ENGAGEMENT}.`);
if (resting.size) console.log(`${resting.size} account(s) rested from the last ${coolDays} days.\n`);
else console.log('');

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');
await browser.setCookie(...cookies);

// X rate limits search, so run a rotating subset and remember where we got to.
const ROTATE = join(HERE, 'x-rotation.json');
const lastRun = existsSync(ROTATE) ? JSON.parse(readFileSync(ROTATE, 'utf8')) : {};
let plan = queries.queries;
if (ONLY) {
  const want = new Set(ONLY.split(',').map(x => x.trim().toLowerCase()));
  plan = plan.filter(q => want.has(q.label.toLowerCase()));
} else {
  plan = [...plan].sort((a, b) => (lastRun[a.label] ?? 0) - (lastRun[b.label] ?? 0)).slice(0, BATCH);
}
console.log(`Running ${plan.length} of ${queries.queries.length} queries, posts from the last ${MAX_AGE_H}h.\n`);

let emptyStreak = 0, rateLimited = false, tooOld = 0;
const found = new Map();
for (const q of plan) {
  const rows = [];
  for (const mode of (q.modes || ['top'])) {
    try { rows.push(...await searchOnce(page, q.query, mode)); }
    catch (e) { console.log(`  ${q.label} (${mode}): failed, ${e.message}`); }
    await new Promise(r => setTimeout(r, 3500)); // pace ourselves; X rate limits search
  }
  // Several empty queries in a row after successful ones means X has cut us off.
  // Rate limiting looks exactly like "no matches", so treat a run of empties as a
  // cut-off rather than a finding. This also has to fire when nothing has been
  // found yet, which is the case when X cuts us off from the very first query.
  if (!rows.length) {
    if (++emptyStreak >= 3) {
      rateLimited = true;
      console.log(`  (${emptyStreak} empty results in a row, stopping early)`);
      break;
    }
  } else emptyStreak = 0;
  if (rows.length) lastRun[q.label] = Date.now();

  let kept = 0;
  for (const r of rows) {
    if (!r.link || !r.text || r.isReply) continue;
    if (!r.at) continue;
    const ageH = (Date.now() - Date.parse(r.at)) / 3600e3;
    if (!(ageH >= 0) || ageH > MAX_AGE_H) { tooOld++; continue; }
    if (queries.excludeHandles?.some(h => h.toLowerCase() === r.handle.toLowerCase())) continue;
    if (resting.has(voice(r.handle))) continue;
    if (seen[r.link]) continue;
    const eng = parseEngagement(r.engLabel);
    const score = eng.likes + eng.reposts * 2 + eng.replies;
    // Questions from ordinary people carry almost no engagement, and they are the
    // most repliable posts there are, so they get their own floor.
    const floor = q.asking ? (queries.askingFloor ?? 1) : MIN_ENGAGEMENT;
    if (score < floor) continue;

    if (q.asking) {
      const low = r.text.toLowerCase();
      // X's search matches loosely, so confirm the product is actually the subject.
      if (q.terms && !q.terms.some(t => low.includes(t.toLowerCase()))) continue;
      // Someone genuinely seeking, not a news post, a joke or an ad. Needs a question
      // mark and explicit seeking language, and real questions are short.
      const seeking = /\b(any (recs|recommendations|suggestions)|recommendations\?|suggestions\?|looking for a|looking for any|can anyone recommend|does anyone (know|use|have)|has anyone (tried|used)|what (brand|kind|type|do you use|are you using|should i (use|buy|get))|which (brand|one should)|where do (you|i) (buy|get)|i need a|help me find)\b/i.test(r.text);
      if (!seeking || !r.text.includes('?')) continue;
      if (r.text.length > 320) continue;                 // long posts are statements, not questions
      if (/https?:\/\/|#\w+\s+#\w+/.test(r.text)) continue; // links and hashtag stacks read as ads
      // Genuine questions rarely go viral. Above the cap it is a different kind of post.
      if (score > (queries.askingMaxScore ?? 6000)) continue;
    }
    if (found.has(r.link)) {
      const hit = found.get(r.link);
      hit.topics.push(q.label);
      hit.tier = Math.min(hit.tier, q.tier ?? 1);
      continue;
    }
    found.set(r.link, {
      ...r, engagement: eng, score, topics: [q.label], tier: q.tier ?? 1, asking: !!q.asking,
      article: q.article || null, engLabel: undefined, isReply: undefined,
    });
    kept++;
  }
  console.log(`  ${q.label.padEnd(22)} ${rows.length} scraped, ${kept} new`);
}

await browser.close();
writeFileSync(ROTATE, JSON.stringify(lastRun, null, 2) + '\n');
if (rateLimited) {
  console.log('\nX appears to have rate limited this run, so results are NOT a complete picture.');
  console.log('Queries that did not run keep their place at the front of the rotation.');
  console.log('Wait 15 to 30 minutes before running again; hammering it risks the account.');
}

let list = [...found.values()].sort((a, b) => {
  if (a.asking !== b.asking) return a.asking ? -1 : 1;      // questions first
  if (a.asking) return String(b.at).localeCompare(String(a.at)); // then newest
  return a.tier - b.tier || b.score - a.score;
});

// One prolific account can otherwise take over a whole run.
const maxPerHandle = queries.maxPerHandle ?? 2;
const perHandle = new Map();
const capped = [];
let dropped = 0;
for (const p of list) {
  const h = voice(p.handle);
  const n = perHandle.get(h) ?? 0;
  if (n >= maxPerHandle) { dropped++; continue; }
  perHandle.set(h, n + 1);
  capped.push(p);
}
if (dropped) console.log(`\n  ${dropped} dropped by the ${maxPerHandle}-per-account cap`);
list = capped;
writeFileSync(OUT, JSON.stringify({ generatedFor: MIN_ENGAGEMENT, count: list.length, posts: list }, null, 2) + '\n');
if (tooOld) console.log(`\n  ${tooOld} dropped as older than ${MAX_AGE_H}h`);
console.log(`\n${list.length} candidates written to ${OUT.replace(REPO + '/', '')}`);
if (list.length) {
  const asks = list.filter(p => p.asking);
  console.log(`\n${asks.length} are people asking for recommendations:`);
  for (const p of asks.slice(0, 10)) {
    console.log(`  @${p.handle.padEnd(18)} ${String(p.topics[0]).padEnd(20)} ${p.text.slice(0, 74)}`);
  }
  const t1 = list.filter(p => p.tier === 1).length;
  console.log(`\n${t1} in the plastic core, ${list.length - t1} adjacent. Top by engagement:`);
  for (const p of list.slice(0, 8)) {
    console.log(`  T${p.tier} ${String(p.score).padStart(6)}  @${p.handle.padEnd(18)} ${p.topics[0]}`);
    console.log(`          ${p.text.slice(0, 95)}`);
  }
}
