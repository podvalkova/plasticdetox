#!/usr/bin/env node
/**
 * Review page for Reddit comment drafts.
 *
 *   node tools/social/reddit-drafts.mjs [--no-open]
 *
 * Reddit has no prefilled-comment URL, so each card gives you a Copy button and
 * a link to the thread. Edit in the box first; Copy takes whatever is there.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const OUT = join(HERE, 'reddit-replies.html');

const cands = JSON.parse(readFileSync(join(HERE, 'reddit-candidates.json'), 'utf8')).posts;
const drafts = JSON.parse(readFileSync(join(HERE, 'reddit-replies.json'), 'utf8')).replies;
const byLink = new Map(cands.map(p => [p.link, p]));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const rows = Object.entries(drafts)
  .map(([link, d]) => ({ link, ...d, post: byLink.get(link) }))
  .filter(r => r.post);

const linked = rows.filter(r => r.link === true).length;
const ratio = rows.length ? Math.round((linked / rows.length) * 100) : 0;

const cards = rows.map(r => {
  const p = r.post;
  return `
  <article class="card">
    <header>
      <div>
        <a class="sub" href="${esc(p.link)}" target="_blank" rel="noopener">r/${esc(p.sub)}</a>
        <span class="meta">${p.score} points · ${p.comments} comments · ${p.ageH}h old</span>
      </div>
      ${r.link ? '<span class="warn">contains a link, count it against your ratio</span>' : ''}
    </header>
    <h2>${esc(p.title)}</h2>
    ${p.body ? `<blockquote>${esc(p.body.slice(0, 700))}${p.body.length > 700 ? '…' : ''}</blockquote>` : ''}
    <textarea rows="12" spellcheck="true">${esc(r.text)}</textarea>
    <footer>
      <span class="count"></span>
      <a class="ref" href="${esc(p.link)}" target="_blank" rel="noopener">open thread →</a>
      <button class="copy" type="button">Copy comment</button>
    </footer>
  </article>`;
}).join('\n');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reddit comments · ${rows.length} drafted</title>
<style>
  :root { --bg:#fafaf9; --card:#fff; --ink:#1c1917; --mut:#57534e; --accent:#7c3aed; --line:#e7e5e4; }
  @media (prefers-color-scheme: dark) { :root { --bg:#1c1917; --card:#292524; --ink:#fafaf9; --mut:#a8a29e; --line:#44403c; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 -apple-system,BlinkMacSystemFont,'Inter',sans-serif; padding:32px 20px 80px; }
  .wrap { max-width:760px; margin:0 auto; }
  h1 { font-size:24px; margin:0 0 4px; }
  .lede { color:var(--mut); margin:0 0 28px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; margin-bottom:18px; }
  .card.done { opacity:.4; }
  header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
  .sub { font-weight:700; color:var(--accent); text-decoration:none; }
  .meta { display:block; color:var(--mut); font-size:13px; margin-top:2px; }
  .warn { font-size:12px; font-weight:700; color:#b45309; background:#fef3c7; padding:2px 8px; border-radius:99px; }
  @media (prefers-color-scheme: dark) { .warn { background:#78350f; color:#fde68a; } }
  h2 { font-size:17px; margin:12px 0 10px; }
  blockquote { margin:0 0 12px; padding:10px 14px; border-left:3px solid var(--line); color:var(--mut); font-size:14px; white-space:pre-wrap; }
  textarea { width:100%; padding:12px; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--ink); font:inherit; font-size:15px; resize:vertical; }
  textarea:focus { outline:2px solid var(--accent); border-color:transparent; }
  footer { display:flex; align-items:center; gap:12px; margin-top:10px; }
  .count { color:var(--mut); font-size:13px; font-variant-numeric:tabular-nums; }
  .ref { color:var(--mut); font-size:13px; margin-left:auto; }
  button { font:inherit; cursor:pointer; border-radius:99px; border:none; background:var(--accent); color:#fff; font-weight:700; padding:9px 18px; font-size:14px; }
</style></head><body><div class="wrap">
<h1>${rows.length} Reddit comments drafted</h1>
<p class="lede">Edit in the box, hit Copy, then paste into the thread. ${linked} of ${rows.length} contain a link (${ratio}%). Reddit communities expect that under about 10%, and most relevant subs strip affiliate links automatically, so these carry none.</p>
${cards}
</div>
<script>
  document.querySelectorAll('.card').forEach(card => {
    const ta = card.querySelector('textarea');
    const count = card.querySelector('.count');
    const btn = card.querySelector('.copy');
    const tick = () => { count.textContent = ta.value.trim().length + ' chars'; };
    ta.addEventListener('input', tick); tick();
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(ta.value.trim()); } catch {}
      btn.textContent = 'Copied'; card.classList.add('done');
      setTimeout(() => { btn.textContent = 'Copy comment'; }, 1800);
    });
  });
</script></body></html>`;

writeFileSync(OUT, html);
console.log(`${rows.length} drafts written to ${OUT.replace(REPO + '/', '')} (${linked} with links, ${ratio}%)`);
if (!process.argv.includes('--no-open')) { try { execFileSync('open', [OUT]); console.log('Opened in your browser.'); } catch {} }
