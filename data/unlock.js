/* ============================================================================
   BABY & EXPECTING PACKAGE — shared unlock
   One $9.99 purchase opens the registry, the full Top 100 table, and the
   personalised swaps. Every gated page loads this and asks it two questions:
   am I paid, and give me a paywall to render.

   NOTE ON THE GATE: this is client side. The data sits in the page, so anyone
   who opens devtools can read it. That is a deliberate trade at $9.99. Move
   the check to the worker if the dataset ever justifies it.
   ============================================================================ */
(function (root) {
  "use strict";

  /* Paste the Stripe Payment Link here to go live. Point its success URL at
     the page the buyer came from plus ?addon=1 (NOT ?unlocked=1, which the
     worker emails to every free subscriber to open the plan email gate). */
  var CHECKOUT_URL = "https://buy.stripe.com/00w9AMfSv90F6VZbT6fEk03";
  var PRICE        = "$9.99";
  var STORE_KEY    = "pd_add_paid";

  var qs = new URLSearchParams(root.location ? root.location.search : "");

  function testMode(){ return qs.get('test') === '1'; }

  function isPaid() {
    if (qs.get('addon') === '1') { markPaid(); return true; }
    try { return localStorage.getItem(STORE_KEY) === '1'; } catch (e) { return false; }
  }
  function markPaid() { try { localStorage.setItem(STORE_KEY, '1'); } catch (e) {} }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* opts = {
       heading:  what is behind the wall, e.g. "101 more registry picks"
       sub:      one line of context
       rows:     [{label, count}] the shape of what is held back
       bullets:  [string] what the purchase includes
       cta:      button text
     } */
  function paywallHTML(opts) {
    opts = opts || {};
    var rows = (opts.rows || []).map(function (r) {
      return '<div class="pdw-row"><span>' + esc(r.label) + '</span><b>' + r.count + '</b></div>';
    }).join('');

    var bullets = (opts.bullets || [
      'The full non toxic registry, 123 picks across 12 categories',
      'All 100 popular Amazon baby products rated, with the reasoning',
      'Your own swaps, ranked by how much exposure each one cuts',
      'The $0 way to do it wherever one exists',
      'A share of every sale funds our independent lab testing'
    ]).map(function (b) {
      return '<div><span class="pdw-tick">✓</span><span>' + esc(b) + '</span></div>';
    }).join('');

    return '<div class="pdw" id="pdw">'
      + '<div class="pdw-kicker">Baby &amp; Expecting Package</div>'
      + '<h3 class="pdw-h">' + esc(opts.heading || 'Unlock the full package') + '</h3>'
      + (opts.sub ? '<p class="pdw-sub">' + esc(opts.sub) + '</p>' : '')
      + (rows ? '<div class="pdw-rows">' + rows + '</div>' : '')
      + '<div class="pdw-price">' + PRICE + '</div>'
      + '<div class="pdw-note">One payment, opens all three. Less than a single glass bottle.</div>'
      + '<div class="pdw-list">' + bullets + '</div>'
      + '<button class="pdw-buy" id="pdwBuy">' + esc(opts.cta || ('Unlock everything · ' + PRICE)) + '</button>'
      + '<p class="pdw-fine" id="pdwFine">' + (CHECKOUT_URL
          ? 'Secure checkout. Instant access on every page.'
          : (testMode() ? 'TEST MODE: unlocks without payment.' : 'Checkout is not live yet.')) + '</p>'
      + '</div>';
  }

  /* Call after injecting a paywall. onUnlock runs when the buyer is through. */
  function wire(onUnlock) {
    var btn = document.getElementById('pdwBuy');
    if (!btn) return;
    btn.addEventListener('click', function () {
      /* ?test=1 wins over the live link so the paid view stays previewable
         without putting a real charge through. */
      if (testMode()) { markPaid(); if (onUnlock) onUnlock(); return; }
      if (root.gtag) root.gtag('event', 'begin_checkout', { value: 9.99, currency: 'USD', items: [{ item_name: 'Baby & Expecting Package' }] });
      if (CHECKOUT_URL) { root.location.href = CHECKOUT_URL; return; }
      var f = document.getElementById('pdwFine');
      if (f) {
        f.textContent = 'Checkout is not live yet. Add a payment link to turn this on.';
        f.style.color = '#b91c1c'; f.style.fontWeight = '600';
      }
    });
  }

  /* Injected once per gated page so the three pages cannot drift apart. */
  var CSS = ''
    + '.pdw{background:#fff;border:2px solid #a78bfa;border-radius:16px;padding:2rem 1.6rem;margin:2rem auto;max-width:640px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.08);font-family:inherit}'
    + '.pdw-kicker{font-size:.68rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#7c3aed;background:#ede9fe;display:inline-block;padding:.3rem .75rem;border-radius:999px;margin-bottom:.9rem}'
    + '.pdw-h{font-size:1.4rem;font-weight:800;letter-spacing:-.025em;margin:0 0 .4rem;line-height:1.2;color:#1c1917}'
    + '.pdw-sub{color:#78716c;font-size:.94rem;max-width:44ch;margin:0 auto 1.3rem;line-height:1.55}'
    + '.pdw-rows{display:flex;flex-direction:column;gap:.4rem;max-width:400px;margin:0 auto 1.4rem}'
    + '.pdw-row{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;background:#fafaf9;border-radius:10px;padding:.6rem .85rem;font-size:.92rem;color:#1c1917}'
    + '.pdw-row b{color:#7c3aed;font-variant-numeric:tabular-nums}'
    + '.pdw-price{font-size:2.5rem;font-weight:800;letter-spacing:-.04em;line-height:1;color:#1c1917}'
    + '.pdw-note{font-size:.82rem;color:#78716c;margin-bottom:1.2rem}'
    + '.pdw-list{text-align:left;max-width:420px;margin:0 auto 1.4rem;display:flex;flex-direction:column;gap:.5rem}'
    + '.pdw-list div{font-size:.91rem;display:flex;gap:.6rem;align-items:flex-start;color:#1c1917;line-height:1.5}'
    + '.pdw-tick{color:#16a34a;font-weight:800;flex:0 0 auto}'
    + '.pdw-buy{background:#7c3aed;color:#fff;border:none;border-radius:60px;padding:1rem 2.2rem;font-family:inherit;font-size:1.04rem;font-weight:700;cursor:pointer;width:100%;max-width:340px;transition:all .18s}'
    + '.pdw-buy:hover{background:#6d28d9;transform:translateY(-1px)}'
    + '.pdw-fine{font-size:.77rem;color:#78716c;margin-top:.85rem}'
    + '.pdw-locked-note{text-align:center;color:#78716c;font-size:.9rem;margin:1rem 0}'
    + '@media print{.pdw{display:none!important}}';

  function injectCSS() {
    if (document.getElementById('pdw-css')) return;
    var st = document.createElement('style');
    st.id = 'pdw-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  root.PDUnlock = {
    isPaid: isPaid,
    markPaid: markPaid,
    testMode: testMode,
    paywallHTML: paywallHTML,
    wire: wire,
    injectCSS: injectCSS,
    PRICE: PRICE,
    CHECKOUT_URL: CHECKOUT_URL
  };

})(typeof window !== 'undefined' ? window : globalThis);
