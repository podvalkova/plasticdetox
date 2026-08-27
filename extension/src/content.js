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

  // Terms in a listing title that a brand-level verdict does not cover. A brand
  // rated good for disclosing no intentionally added PFAS has said nothing about
  // whether this particular pan is coated, so we must not stamp it "good choice".
  const CONTRADICTS_GOOD = [
    "nonstick", "non-stick", "non stick", "ptfe", "teflon", "ceramic coated",
    "coated aluminum", "coated aluminium",
  ];

  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const collapse = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

  let BRANDS = [];
  let byCollapsed = new Map();
  let ASINS = {};
  let SEL = null;
  let logMisses = false;
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
    logMisses = store.logMisses === true;   // opt in, never opt out

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

  /**
   * Find the per-product verdict for a specific ASIN.
   *
   * Matched on the ASIN, not the product name. Name matching resolved zero of
   * 63 candidates, because the listing title carries the brand and the size
   * ("Aquasana AQ-4100 Shower Filter") while the entry is editorial ("AQ-4100
   * shower filter"). This matters more than it sounds: nearly half our product
   * verdicts disagree with their own brand, so a brand-level answer on a
   * product page is wrong about as often as it is right.
   */
  function productFor(match, asin) {
    if (!asin) return null;
    return (match.brand.products || []).find(
      (p) => Array.isArray(p.asins) && p.asins.includes(asin)
    ) || null;
  }

  function resolveStance(match, asin) {
    const row = productFor(match, asin);
    if (row && row.verdict) return row.verdict;
    return match.brand.stance;
  }

  /**
   * Is this verdict about the product in front of us, or only about its brand?
   *
   * A brand verdict is scoped to what we researched. Cuisinart is a skip for its
   * appliance line, which says nothing about a plain stainless skillet, and a
   * cookware brand rated good for its PFAS disclosure has said nothing about
   * whether this pan is coated. Asserting either as a product verdict is wrong,
   * so anything we have not researched at the product level is labelled as the
   * brand-level judgement it actually is.
   */
  function scopeOf(match, asin, title) {
    if (productFor(match, asin)) return { level: "product" };
    const low = norm(title);
    if (match.brand.stance === "good") {
      const hit = CONTRADICTS_GOOD.find((t) => low.includes(norm(t)));
      if (hit) return { level: "contradicted", term: hit };
    }
    return { level: "brand" };
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

  function buildChip(match, stance, scope) {
    const chip = el("div", `pd-chip ${stance}`);
    chip.appendChild(el("span", "pd-dot"));
    const label = (scope && scope.level === "contradicted")
      ? "Check this one"
      : (STANCE_LABEL[stance] || "Context");
    chip.appendChild(el("span", null, label));
    chip.appendChild(frontsRow(match.brand.fronts));
    chip.setAttribute("role", "button");
    chip.setAttribute("tabindex", "0");
    chip.title = "Plastic Detox verdict. Click for the full breakdown.";
    return chip;
  }

  /** The shared card body used by both the detail panel and the chip popover. */
  function buildCard(match, stance, opts = {}) {
    const b = match.brand;
    const row = opts.product || null;   // per-product verdict, when this ASIN has one
    const root = el("div", opts.popover ? "pd-pop" : "pd-panel");

    // A stance badge asserts that a person stood behind this verdict. Live AI
    // research does not get one: it presents findings and lets the reader judge.
    // Publishing an unreviewed machine verdict against a named brand, at the
    // moment of purchase, is the one claim we cannot afford to get wrong.
    const reviewed = b.reviewed !== false;
    const scope = opts.scope || { level: "product" };
    const contradicted = scope.level === "contradicted";
    const shownStance = contradicted ? "neutral" : stance;

    const head = el("div", `pd-head ${reviewed ? shownStance : "neutral"}`);
    if (!reviewed) {
      head.appendChild(el("span", "pd-badge pd-unreviewed", "Research, not yet reviewed"));
    } else if (contradicted) {
      head.appendChild(el("span", "pd-badge pd-unreviewed", "Check this one"));
    } else {
      const label = STANCE_LABEL[stance] || "Context";
      head.appendChild(el("span", `pd-badge ${stance}`,
        scope.level === "brand" ? `Brand: ${label}` : label));
    }
    head.appendChild(el("div", "pd-brand", b.brand));
    // Name the specific product when our verdict is about the product rather
    // than the brand, so a "good" badge on a careful brand does not look wrong.
    head.appendChild(el("div", "pd-cat", row ? `${row.name} · ${b.category}` : b.category));
    if (row && row.note) head.appendChild(el("p", "pd-reason", row.note));
    else if (b.reason) head.appendChild(el("p", "pd-reason", b.reason));
    if (row && row.note && b.reason) {
      const bl = el("div", "pd-brandline");
      bl.appendChild(el("b", null, "About the brand: "));
      bl.appendChild(document.createTextNode(b.reason));
      head.appendChild(bl);
    }

    if (scope.level === "contradicted") {
      const w = el("div", "pd-caveat");
      w.appendChild(el("b", null, "This listing says " + scope.term + ". "));
      w.appendChild(document.createTextNode(
        "Our verdict on " + b.brand + " does not cover that, and we have not "
        + "reviewed this specific product."));
      head.appendChild(w);
    } else if (scope.level === "brand") {
      head.appendChild(el("div", "pd-caveat",
        "This is our verdict on " + b.brand + ", not on this specific product, "
        + "which we have not reviewed."));
    }

    if (b.alternative) {
      const alt = el("div", "pd-alt");
      alt.appendChild(el("b", null, "Better: "));
      // Send them to the guide that covers this category rather than leaving the
      // alternative as dead text. They get the full comparison, and the click
      // lands on our own site, which is also the only place affiliate links may
      // live: Amazon's Associates terms forbid them inside a browser extension.
      if (b.article) {
        const a = el("a", "pd-alt-link", b.alternative);
        a.href = `${SITE}/articles/${b.article}`;
        a.target = "_blank";
        a.rel = "noopener";
        a.appendChild(el("span", "pd-alt-arrow", " \u2192"));
        alt.appendChild(a);
      } else {
        alt.appendChild(document.createTextNode(b.alternative));
      }
      head.appendChild(alt);
    }
    root.appendChild(head);

    // What the scorecard shows depends on what we are claiming.
    //
    // A recommendation is the stronger claim, so a "good" verdict has to show
    // all four fronts and name whatever is still unassessed. A caution or a
    // skip only has to justify itself, so it shows the fronts that are actually
    // wrong and stays quiet about the rest. Rows of empty greys next to a
    // verdict read as carelessness rather than honesty.
    const productFronts = row && row.fronts ? row.fronts : null;
    // When a product's verdict departs from its brand's and it has no fronts of
    // its own, the brand's fronts are describing other products in the range and
    // must not be shown. Aquasana's packaging failure is about the Claryum line;
    // rendering a red cross under a "Good choice" badge on the shower filter is
    // simply false.
    const borrowedAndWrong =
      !productFronts && row && row.verdict && row.verdict !== b.stance;
    const fronts = productFronts || (borrowedAndWrong ? {} : (b.fronts || {}));
    const statusOf = (k) => (fronts[k] || {}).status || "unknown";

    const positive = stance === "good";
    const flagged = FRONTS.filter(([k]) => ["caution", "fail"].includes(statusOf(k)));
    const populated = FRONTS.filter(([k]) => statusOf(k) !== "unknown");
    // A warning has to name what is wrong with it. Where no front is flagged
    // yet, fall back to what we did check rather than rendering an empty card,
    // which reads as a verdict with nothing behind it.
    const shown = positive ? populated : (flagged.length ? flagged : populated);
    const heading = positive
      ? (productFronts ? "How we checked this product" : "How we checked the brand")
      : (flagged.length ? "Why we flag it" : "What we checked");
    const unassessed = FRONTS.filter(([k]) => statusOf(k) === "unknown");

    const block = el("div", "pd-fronts-block");
    if (shown.length) {
      block.appendChild(el("div", "pd-fronts-label", heading));
      for (const [key, label] of shown) {
        const f = fronts[key];
        const st = f.status;
        const line = el("div", `pd-front ${st}`);
        line.appendChild(el("span", `pd-icon ${st}`, STATUS_GLYPH[st]));
        const body = el("div", "pd-front-body");
        const nameLine = el("div", "pd-front-name", label);
        if (f.origin === "ai") {
          nameLine.appendChild(el("span", "pd-origin", "AI"));
        }
        body.appendChild(nameLine);
        if (f.note) body.appendChild(el("div", "pd-front-note", f.note));
        line.appendChild(body);
        block.appendChild(line);
      }
      // Only a recommendation owes the reader a list of what we have not looked at.
      if (positive && unassessed.length) {
        block.appendChild(el("div", "pd-unassessed",
          "Not yet assessed: " + unassessed.map(([, l]) => l.toLowerCase()).join(", ")));
      }
    }
    if (block.childNodes.length) root.appendChild(block);

    const foot = el("div", "pd-foot");
    const link = el("a", "pd-link", "Read the full verdict →");
    link.href = `${SITE}/brand-check.html?b=${encodeURIComponent(b.brand)}`;
    link.target = "_blank";
    link.rel = "noopener";
    foot.appendChild(link);

    // A verdict shown at the moment of purchase should be correctable at the
    // moment of purchase too, without sending the reader off to another page.
    const report = el("button", "pd-report-link", "Report an error");
    report.addEventListener("click", () => {
      if (root.querySelector(".pd-report")) return;
      const form = buildReportForm(b.brand, () => form.remove());
      root.insertBefore(form, foot);
      form.scrollIntoView({ block: "nearest" });
    });
    foot.appendChild(report);
    root.appendChild(foot);

    if (opts.popover) {
      const close = el("button", "pd-close", "×");
      close.setAttribute("aria-label", "Close");
      close.addEventListener("click", () => root.remove());
      root.appendChild(close);
    }
    return root;
  }

  /** POST to the worker. It allows this extension's origin by CORS, so no host
   *  permission is involved and nothing is sent without an explicit click. */
  async function postWorker(path, payload) {
    const res = await fetch(`${WORKER}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(data.error || "Could not send");
    return data;
  }

  function buildUnmatchedPanel(brandName) {
    const root = el("div", "pd-panel");
    const head = el("div", "pd-head");
    head.appendChild(el("span", "pd-badge", "Not reviewed"));
    head.appendChild(el("div", "pd-brand", brandName));
    root.appendChild(head);
    root.appendChild(
      el("div", "pd-unmatched",
        "We have not researched this brand yet. Ask for a review and we will vet it on all four fronts, then email you the verdict.")
    );

    // Requesting happens right here rather than bouncing the reader to the site,
    // which is the whole point of doing this on the listing.
    const form = el("div", "pd-form");
    const input = el("input", "pd-input");
    input.type = "email";
    input.placeholder = "you@email.com";
    input.setAttribute("aria-label", "Your email");
    const btn = el("button", "pd-btn", "Request review");
    const note = el("div", "pd-note", "");
    form.appendChild(input);
    form.appendChild(btn);

    btn.addEventListener("click", async () => {
      const email = input.value.trim();
      if (!email || !email.includes("@")) {
        note.textContent = "Please enter a valid email.";
        note.className = "pd-note bad";
        return;
      }
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        await postWorker("/brand-request", { brand: brandName, email });
        form.remove();
        note.className = "pd-note good";
        note.textContent = `Thanks. We will research ${brandName} and email you the verdict.`;
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Request review";
        note.className = "pd-note bad";
        note.textContent = "Could not send just now. Please try again.";
      }
    });

    const wrap = el("div", "pd-form-wrap");
    wrap.appendChild(form);
    wrap.appendChild(note);
    root.appendChild(wrap);

    const foot = el("div", "pd-foot");
    foot.appendChild(el("span", "pd-mark", "Plastic Detox"));
    root.appendChild(foot);
    return root;
  }

  /** Inline "this is wrong" form, opened from the footer of any verdict card. */
  function buildReportForm(brandName, onClose) {
    const wrap = el("div", "pd-report");
    wrap.appendChild(el("div", "pd-report-title", `What is wrong about ${brandName}?`));

    const ISSUES = [
      ["wrong-verdict", "Wrong verdict"],
      ["out-of-date", "Out of date"],
      ["wrong-brand", "Not this brand"],
      ["missing-info", "Missing information"],
    ];
    let chosen = null;
    const chips = el("div", "pd-chips");
    for (const [key, label] of ISSUES) {
      const c = el("button", "pd-issue", label);
      c.addEventListener("click", () => {
        chosen = key;
        [...chips.children].forEach((x) => x.classList.remove("on"));
        c.classList.add("on");
        note.textContent = "";
      });
      chips.appendChild(c);
    }
    wrap.appendChild(chips);

    const detail = el("textarea", "pd-textarea");
    detail.placeholder = "What should it say instead? A link to a source helps most.";
    detail.rows = 3;
    wrap.appendChild(detail);

    const email = el("input", "pd-input");
    email.type = "email";
    email.placeholder = "Email (optional, if you want a reply)";
    wrap.appendChild(email);

    const note = el("div", "pd-note", "");
    const row = el("div", "pd-form");
    const send = el("button", "pd-btn", "Send report");
    const cancel = el("button", "pd-btn ghost", "Cancel");
    row.appendChild(send);
    row.appendChild(cancel);
    wrap.appendChild(row);
    wrap.appendChild(note);

    cancel.addEventListener("click", onClose);
    send.addEventListener("click", async () => {
      if (!chosen) {
        note.className = "pd-note bad";
        note.textContent = "Pick what is wrong first.";
        return;
      }
      send.disabled = true;
      send.textContent = "Sending…";
      try {
        await postWorker("/brand-report", {
          brand: brandName,
          issue: chosen,
          detail: detail.value.trim(),
          email: email.value.trim(),
        });
        wrap.textContent = "";
        wrap.appendChild(el("div", "pd-note good",
          "Thanks. Every report is read by a person, and we correct what we get wrong."));
      } catch (err) {
        send.disabled = false;
        send.textContent = "Send report";
        note.className = "pd-note bad";
        note.textContent = "Could not send just now. Please try again.";
      }
    });
    return wrap;
  }

  // ------------------------------------------------------------- popover

  let openPop = null;
  function showPopover(anchor, match, stance, product, scope) {
    if (openPop) openPop.remove();
    const pop = buildCard(match, stance, { popover: true, product, scope });
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

      const stance = resolveStance(match, asin);
      const prow = productFor(match, asin);
      const scope = scopeOf(match, asin, title);
      const chip = buildChip(match,
        scope.level === "contradicted" ? "neutral" : stance,
        scope);
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showPopover(chip, match, stance, prow, scope);
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

    // Anchor to the title's own block so the panel lands inside the centre
    // column's normal flow. Anchoring to #centerCol itself would drop the panel
    // beside the column, full page width and underneath Amazon's image overlay.
    const anchor =
      titleEl.closest("#titleSection, #title_feature_div") || titleEl.parentElement;
    if (!anchor || !anchor.parentNode) return;

    const detailAsin = asinFromUrl();
    let panel;
    if (match) {
      panel = buildCard(match, resolveStance(match, detailAsin),
                        { product: productFor(match, detailAsin),
                          scope: scopeOf(match, detailAsin, title) });
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
    // Fire and forget: the service worker decides if the copy is actually stale.
    try { chrome.runtime.sendMessage({ type: "refreshIfStale" }); } catch (e) {}
    // Amazon paginates and lazy-loads in place, so re-run on mutation, throttled.
    let pending = null;
    const obs = new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => { pending = null; run(); }, 350);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }).catch((err) => console.warn("[PD] could not load brand data:", err));
})();
