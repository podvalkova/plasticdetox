// Plastic Detox Brand Check, Amazon content script.
//
// Two surfaces: a compact chip on every search result, and a full scorecard
// panel on product detail pages. Both render the same four fronts we vet every
// recommendation on, and both link back to the full verdict on the site.
//
// Matching order, most reliable first:
//   1. ASIN against products we have already researched and linked
//   2. the brand byline Amazon puts on the detail page
//   3. a longest-prefix match of the listing title against known brand names
//
// Nothing is injected into the page from a string: every node is built with
// createElement and textContent, so an Amazon listing title can never become
// markup here.

(() => {
  "use strict";

  const WORKER = "https://plasticdetox-quiz-email.plasticdetox.workers.dev";
  const SITE = "https://plasticdetox.org";
  const FRONTS = [
    ["formula", "Formula"],
    ["packaging", "Packaging"],
    ["legal", "Recalls & lawsuits"],
    ["testing", "Independent tests"],
  ];
  const STANCE_LABEL = {
    good: "Good choice",
    careful: "Careful",
    skip: "Skip",
    neutral: "Context",
  };
  const STATUS_GLYPH = { pass: "✓", caution: "!", fail: "✕", unknown: "?" };
  // Brand names that are ordinary English words. Matched only as the whole
  // leading token, never as part of a longer prefix, to keep "Pure Leaf" from
  // colliding with a brand called "Pure".
  const GENERIC = new Set(["pure", "native", "one", "blu", "core", "well", "life", "basics", "all"]);

  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const collapse = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

  let BRANDS = [];
  let byCollapsed = new Map();
  let ASINS = {};
  let SEL = null;
  let logMisses = true;
  const loggedThisPage = new Set();

  // ---------------------------------------------------------------- data

  async function bundled(name) {
    const res = await fetch(chrome.runtime.getURL(`data/${name}.json`));
    return res.json();
  }

  async function load() {
    const store = await chrome.storage.local.get([
      "brands", "asins", "selectors", "logMisses",
    ]);
    BRANDS = store.brands || (await bundled("brand-data"));
    ASINS = store.asins || (await bundled("asin-map"));
    SEL = store.selectors || (await bundled("selectors"));
    logMisses = store.logMisses !== false;

    for (const b of BRANDS) {
      const labels = [b.brand, ...(b.aliases || [])];
      for (const label of labels) {
        const key = collapse(label);
        // First writer wins so the canonical brand beats an alias collision.
        if (key.length >= 3 && !byCollapsed.has(key)) byCollapsed.set(key, b);
      }
    }
  }

  // ------------------------------------------------------------ matching

  function byId(id) {
    return BRANDS.find((b) => b.id === id) || null;
  }

  function fromAsin(asin) {
    const hit = asin && ASINS[asin];
    if (!hit) return null;
    const brand = byId(hit.brandId);
    return brand ? { brand, product: hit, via: "asin" } : null;
  }

  function fromBrandName(name) {
    const brand = byCollapsed.get(collapse(name));
    return brand ? { brand, via: "byline" } : null;
  }

  function fromTitle(title) {
    const words = norm(title).split(" ").filter(Boolean);
    if (!words.length) return null;
    for (let n = Math.min(4, words.length); n >= 1; n--) {
      const key = words.slice(0, n).join("");
      if (key.length < 3) continue;
      const brand = byCollapsed.get(key);
      if (!brand) continue;
      // A generic word only counts when it stands alone as the first token.
      if (GENERIC.has(key) && n !== 1) continue;
      return { brand, via: "title" };
    }
    return null;
  }

  /** The product-level verdict wins over the brand-level one when we have it. */
  function resolveStance(match) {
    const { brand, product } = match;
    if (product && product.asin) {
      const row = (brand.products || []).find(
        (p) => collapse(p.name) === collapse(product.name)
      );
      if (row && row.verdict) return row.verdict;
    }
    return brand.stance;
  }

  // ------------------------------------------------------------ rendering

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function frontsRow(fronts) {
    const wrap = el("span", "pd-fronts");
    for (const [key] of FRONTS) {
      const st = (fronts && fronts[key] && fronts[key].status) || "unknown";
      const tick = el("span", "pd-tick");
      tick.style.background = {
        pass: "#16a34a", caution: "#b45309", fail: "#dc2626", unknown: "#d6d3d1",
      }[st];
      tick.title = st;
      wrap.appendChild(tick);
    }
    return wrap;
  }

  function buildChip(match, stance) {
    const chip = el("div", `pd-chip ${stance}`);
    chip.appendChild(el("span", "pd-dot"));
    chip.appendChild(el("span", null, STANCE_LABEL[stance] || "Context"));
    chip.appendChild(frontsRow(match.brand.fronts));
    chip.setAttribute("role", "button");
    chip.setAttribute("tabindex", "0");
    chip.title = "Plastic Detox verdict. Click for the full breakdown.";
    return chip;
  }

  /** The shared card body used by both the detail panel and the chip popover. */
  function buildCard(match, stance, opts = {}) {
    const b = match.brand;
    const root = el("div", opts.popover ? "pd-pop" : "pd-panel");

    const head = el("div", `pd-head ${stance}`);
    head.appendChild(el("span", `pd-badge ${stance}`, STANCE_LABEL[stance] || "Context"));
    head.appendChild(el("div", "pd-brand", b.brand));
    head.appendChild(el("div", "pd-cat", b.category));
    if (b.reason) head.appendChild(el("p", "pd-reason", b.reason));

    if (b.alternative) {
      const alt = el("div", "pd-alt");
      alt.appendChild(el("b", null, "Better: "));
      alt.appendChild(document.createTextNode(b.alternative));
      head.appendChild(alt);
    }
    root.appendChild(head);

    const block = el("div", "pd-fronts-block");
    block.appendChild(el("div", "pd-fronts-label", "How we checked it"));
    const fronts = b.fronts || {};
    let unknowns = 0;
    for (const [key, label] of FRONTS) {
      const f = fronts[key] || { status: "unknown", note: "" };
      const st = f.status || "unknown";
      if (st === "unknown") unknowns++;
      const row = el("div", `pd-front ${st}`);
      row.appendChild(el("span", `pd-icon ${st}`, STATUS_GLYPH[st]));
      const body = el("div", "pd-front-body");
      body.appendChild(el("div", "pd-front-name", label));
      body.appendChild(
        el("div", "pd-front-note", st === "unknown" ? "Not assessed yet" : f.note || "")
      );
      row.appendChild(body);
      block.appendChild(row);
    }
    root.appendChild(block);

    const foot = el("div", "pd-foot");
    const link = el("a", "pd-link", "Read the full verdict →");
    link.href = `${SITE}/brand-check.html?b=${encodeURIComponent(b.brand)}`;
    link.target = "_blank";
    link.rel = "noopener";
    foot.appendChild(link);
    foot.appendChild(
      el("span", "pd-mark", unknowns === FRONTS.length ? "Verdict only" : "Plastic Detox")
    );
    root.appendChild(foot);

    if (opts.popover) {
      const close = el("button", "pd-close", "×");
      close.setAttribute("aria-label", "Close");
      close.addEventListener("click", () => root.remove());
      root.appendChild(close);
    }
    return root;
  }

  function buildUnmatchedPanel(brandName) {
    const root = el("div", "pd-panel");
    const head = el("div", "pd-head");
    head.appendChild(el("span", "pd-badge", "Not reviewed"));
    head.appendChild(el("div", "pd-brand", brandName));
    root.appendChild(head);
    root.appendChild(
      el("div", "pd-unmatched",
        "We have not researched this brand yet. Request a review and we will vet it on all four fronts and publish the verdict.")
    );
    const foot = el("div", "pd-foot");
    const link = el("a", "pd-link", "Request a review →");
    link.href = `${SITE}/brand-check.html?b=${encodeURIComponent(brandName)}`;
    link.target = "_blank";
    link.rel = "noopener";
    foot.appendChild(link);
    foot.appendChild(el("span", "pd-mark", "Plastic Detox"));
    root.appendChild(foot);
    return root;
  }

  // ------------------------------------------------------------- popover

  let openPop = null;
  function showPopover(anchor, match, stance) {
    if (openPop) openPop.remove();
    const pop = buildCard(match, stance, { popover: true });
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    const top = r.bottom + window.scrollY + 6;
    const left = Math.min(
      r.left + window.scrollX,
      window.scrollX + document.documentElement.clientWidth - 356
    );
    pop.style.top = `${top}px`;
    pop.style.left = `${Math.max(8, left)}px`;
    openPop = pop;
  }

  document.addEventListener("click", (e) => {
    if (openPop && !openPop.contains(e.target) && !e.target.closest(".pd-chip")) {
      openPop.remove();
      openPop = null;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openPop) { openPop.remove(); openPop = null; }
  });

  // -------------------------------------------------------------- search

  function decorateSearch() {
    const cards = document.querySelectorAll(SEL.search.card);
    for (const card of cards) {
      if (card.dataset.pdDone) continue;
      card.dataset.pdDone = "1";

      const asin = card.getAttribute("data-asin");
      const titleEl = card.querySelector(SEL.search.title);
      const title = titleEl ? titleEl.textContent.trim() : "";
      const match = fromAsin(asin) || fromTitle(title);
      if (!match) continue;

      const stance = resolveStance(match);
      const chip = buildChip(match, stance);
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showPopover(chip, match, stance);
      });
      chip.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chip.click(); }
      });

      const anchor = card.querySelector(SEL.search.insertAfter);
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(chip, anchor.nextSibling);
      } else {
        card.appendChild(chip);
      }
    }
  }

  // -------------------------------------------------------------- detail

  function bylineBrand() {
    const node = document.querySelector(SEL.detail.byline);
    if (!node) return "";
    const t = node.textContent.trim();
    const m = t.match(/visit the (.+?) store/i) || t.match(/^brand:\s*(.+)$/i);
    return (m ? m[1] : t).trim();
  }

  function asinFromUrl() {
    const m = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    return m ? m[1] : "";
  }

  function decorateDetail() {
    if (document.querySelector(".pd-panel")) return;
    const titleEl = document.querySelector(SEL.detail.title);
    if (!titleEl) return;

    const title = titleEl.textContent.trim();
    const byline = bylineBrand();
    const match =
      fromAsin(asinFromUrl()) ||
      (byline && fromBrandName(byline)) ||
      fromTitle(title);

    const anchor = document.querySelector(SEL.detail.anchor);
    if (!anchor) return;

    let panel;
    if (match) {
      panel = buildCard(match, resolveStance(match));
    } else if (byline) {
      panel = buildUnmatchedPanel(byline);
      recordMiss(byline);
    } else {
      return;
    }
    anchor.parentNode.insertBefore(panel, anchor.nextSibling);
  }

  // ---------------------------------------------------------- miss log

  // Only detail pages, and only the brand name Amazon itself publishes in the
  // byline. No URLs, no ASINs, no identifiers. Each miss is a brand a real
  // shopper wanted a verdict on, which is what ranks the research backlog.
  function recordMiss(brandName) {
    if (!logMisses) return;
    const key = collapse(brandName);
    if (!key || loggedThisPage.has(key)) return;
    loggedThisPage.add(key);
    try {
      fetch(`${WORKER}/brand-search-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brandName, matched: false, verdict: "", src: "ext" }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) { /* never let logging break the page */ }
  }

  // ----------------------------------------------------------------- run

  function run() {
    try {
      if (document.querySelector(SEL.detail.isDetailPage)) decorateDetail();
      if (document.querySelector(SEL.search.card)) decorateSearch();
    } catch (err) {
      console.warn("[PD] render failed:", err);
    }
  }

  load().then(() => {
    run();
    // Amazon paginates and lazy-loads in place, so re-run on mutation, throttled.
    let pending = null;
    const obs = new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => { pending = null; run(); }, 350);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }).catch((err) => console.warn("[PD] could not load brand data:", err));
})();
