#!/usr/bin/env node
/**
 * Builds a local review page from x-candidates.json + x-replies.json.
 *
 *   node tools/social/x-drafts.mjs          write and open the page
 *   node tools/social/x-drafts.mjs --no-open
 *
 * Each card shows the original post and an editable draft. "Reply on X" opens
 * X's compose intent with whatever is currently in the box, already threaded as
 * a reply, so sending is one click. Sent state is remembered in localStorage.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const OUT = join(HERE, 'x-replies.html');

// x-candidates.json is overwritten on every find, so keep an archive. Otherwise a
// drafted post you have not sent yet vanishes from the page on the next run.
const ARCHIVE = join(HERE, 'x-candidates-archive.json');
const cands = JSON.parse(readFileSync(join(HERE, 'x-candidates.json'), 'utf8')).posts;
const archive = existsSync(ARCHIVE) ? JSON.parse(readFileSync(ARCHIVE, 'utf8')) : {};
for (const p of cands) archive[p.link.split('/').pop()] = p;
writeFileSync(ARCHIVE, JSON.stringify(archive, null, 2) + '\n');

const drafts = JSON.parse(readFileSync(join(HERE, 'x-replies.json'), 'utf8')).replies;
const byId = new Map(Object.entries(archive));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Same story from several accounts: flag so only one gets a reply.
const norm = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 4);
const rows = Object.keys(drafts).map(id => byId.get(id)).filter(Boolean);
const dupe = new Map();
rows.forEach((a, i) => rows.forEach((b, j) => {
  if (j <= i) return;
  const A = new Set(norm(a.text)), B = norm(b.text);
  const overlap = B.filter(w => A.has(w)).length / Math.max(B.length, 1);
  if (overlap > 0.45) {
    dupe.set(a.link.split('/').pop(), true);
    dupe.set(b.link.split('/').pop(), true);
  }
}));

const cards = rows.map(p => {
  const id = p.link.split('/').pop();
  return `
  <article class="card" data-id="${id}">
    <header>
      <div>
        <a class="handle" href="${esc(p.link)}" target="_blank" rel="noopener">@${esc(p.handle)}</a>
        <span class="meta">${p.engagement.likes.toLocaleString()} likes · ${p.engagement.replies.toLocaleString()} replies · ${esc(p.topics[0])}</span>
        ${dupe.get(id) ? '<span class="warn">same story as another card, reply to one</span>' : ''}
      </div>
      <button class="skip" type="button">skip</button>
    </header>
    <blockquote>${esc(p.text)}</blockquote>
    <textarea rows="4" spellcheck="true">${esc(drafts[id])}</textarea>
    <footer>
      <span class="count"></span>
      ${p.article ? `<a class="ref" href="${esc(p.article)}" target="_blank" rel="noopener">related article</a>` : '<span></span>'}
      <button class="send" type="button" data-reply="${id}">Reply on X →</button>
    </footer>
  </article>`;
}).join('\n');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>X replies · ${rows.length} drafted</title>
<style>
  :root { --bg:#fafaf9; --card:#fff; --ink:#1c1917; --mut:#57534e; --accent:#7c3aed; --line:#e7e5e4; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#1c1917; --card:#292524; --ink:#fafaf9; --mut:#a8a29e; --line:#44403c; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.5 -apple-system,BlinkMacSystemFont,'Inter',sans-serif; padding:32px 20px 80px; }
  .wrap { max-width:720px; margin:0 auto; }
  h1 { font-size:24px; margin:0 0 4px; }
  .lede { color:var(--mut); margin:0 0 28px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; margin-bottom:18px; }
  .card.done { opacity:.4; }
  header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:10px; }
  .handle { font-weight:700; color:var(--accent); text-decoration:none; }
  .meta { display:block; color:var(--mut); font-size:13px; margin-top:2px; }
  .warn { display:inline-block; margin-top:6px; font-size:12px; font-weight:700; color:#b45309; background:#fef3c7; padding:2px 8px; border-radius:99px; }
  @media (prefers-color-scheme: dark) { .warn { background:#78350f; color:#fde68a; } }
  blockquote { margin:0 0 12px; padding:10px 14px; border-left:3px solid var(--line); color:var(--mut); font-size:15px; white-space:pre-wrap; }
  textarea { width:100%; padding:12px; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--ink); font:inherit; font-size:15px; resize:vertical; }
  textarea:focus { outline:2px solid var(--accent); border-color:transparent; }
  footer { display:flex; align-items:center; gap:12px; margin-top:10px; }
  .count { font-variant-numeric:tabular-nums; color:var(--mut); font-size:13px; min-width:66px; }
  .count.over { color:#dc2626; font-weight:700; }
  .ref { color:var(--mut); font-size:13px; margin-left:auto; }
  button { font:inherit; cursor:pointer; border-radius:99px; border:1px solid var(--line); background:transparent; color:var(--mut); padding:4px 12px; font-size:13px; }
  .send { margin-left:auto; background:var(--accent); color:#fff; border:none; font-weight:700; padding:9px 18px; font-size:14px; }
  .ref + .send { margin-left:12px; }
  .send:disabled { background:var(--line); color:var(--mut); cursor:not-allowed; }
</style></head><body><div class="wrap">
<h1>${rows.length} replies drafted</h1>
<p class="lede">Edit anything in the box, then hit Reply on X. It opens the composer already threaded and pre-filled, so you just press Post. Cards you have sent stay dimmed.</p>
${cards}
</div>
<script>
  const KEY = 'pd-x-sent';
  const sent = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  const save = () => localStorage.setItem(KEY, JSON.stringify([...sent]));

  document.querySelectorAll('.card').forEach(card => {
    const id = card.dataset.id;
    const ta = card.querySelector('textarea');
    const count = card.querySelector('.count');
    const send = card.querySelector('.send');

    // X counts every link as 23 characters regardless of length.
    const weigh = t => t.replace(/https?:\\/\\/\\S+/g, 'x'.repeat(23)).length;
    const tick = () => {
      const n = weigh(ta.value);
      count.textContent = n + '/280';
      count.classList.toggle('over', n > 280);
      send.disabled = n > 280 || !ta.value.trim();
    };
    ta.addEventListener('input', tick); tick();

    if (sent.has(id)) card.classList.add('done');
    card.querySelector('.skip').addEventListener('click', () => {
      card.classList.toggle('done');
      card.classList.contains('done') ? sent.add(id) : sent.delete(id);
      save();
    });
    send.addEventListener('click', () => {
      const url = 'https://x.com/intent/post?text=' + encodeURIComponent(ta.value.trim()) + '&in_reply_to=' + id;
      window.open(url, '_blank', 'noopener');
      card.classList.add('done'); sent.add(id); save();
    });
  });
</script></body></html>`;

// Record everything drafted so the finder stops resurfacing it next run.
const SEEN = join(HERE, 'x-seen.json');
const seen = existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')) : {};
let added = 0;
for (const p of rows) {
  if (!seen[p.link]) { seen[p.link] = { handle: p.handle, draftedAt: new Date().toISOString() }; added++; }
}
writeFileSync(SEEN, JSON.stringify(seen, null, 2) + '\n');

writeFileSync(OUT, html);
if (added) console.log(`${added} newly drafted post(s) marked seen (${Object.keys(seen).length} total).`);
console.log(`${rows.length} drafts written to ${OUT.replace(REPO + '/', '')}`);
if (!process.argv.includes('--no-open')) {
  try { execFileSync('open', [OUT]); console.log('Opened in your browser.'); } catch {}
}
