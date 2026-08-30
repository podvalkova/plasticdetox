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
  function productFor(match, asin, title) {
    const rows = match.brand.products || [];
    if (asin) {
      const exact = rows.find((p) => Array.isArray(p.asins) && p.asins.includes(asin));
      if (exact) return exact;
    }
    // Then the product line, matched on the listing title. A line sits between a
    // brand verdict, too broad because Colgate sells around forty pastes, and an
    // ASIN verdict, too narrow because every size and multipack is its own ASIN.
    // "Colgate Total" covers every listing of that line and claims nothing about
    // Optic White. Longest phrase wins so a specific line beats a general one.
    if (!title) return null;
    const low = " " + norm(title) + " ";
    // Tolerate the singular/plural split between an editorial name and a real
    // listing title: we write "Aveeno Sunscreens", Amazon writes "Sunscreen".
    const hasWord = (w) => {
      const n = norm(w);
      if (!n) return false;
      if (low.includes(" " + n + " ")) return true;
      if (n.endsWith("s") && low.includes(" " + n.slice(0, -1) + " ")) return true;
      return low.includes(" " + n + "s ");
    };
    let best = null, bestLen = 0, bestDirect = false, bestEvidence = -1;

    // A researched row always beats an inherited one, however long the inherited
    // match is. Coterie carries three researched product rows and one generated
    // whole-range row, and on title alone the generated row won on length, so a
    // brand we researched three times over answered "no status".
    const isDirect = (p) => p.origin !== "brand-line";
    // Where two researched rows describe the same product, the better evidenced
    // one answers. Weleda Salt Toothpaste has a store spec sheet and an article
    // row carrying the lab non-detect; the spec sheet won on match length and
    // threw away the only lab result we hold on it.
    const evidenceOf = (p) => {
      const f = (p.ext && p.ext.fronts) || {};
      return Object.values(f).filter((v) => v && v !== "unassessed" && v !== "unknown").length;
    };
    // Direct beats inherited, then evidence, then the longer match.
    const better = (p, len, d) => {
      if (d !== bestDirect) return d;
      const e = evidenceOf(p);
      if (e !== bestEvidence) return e > bestEvidence;
      return len > bestLen;
    };

    for (const p of rows) {
      // An exclusion list. Our editorial names describe a class of models
      // ("Brita standard pitcher filter") while a listing names one SKU
      // ("Brita Small 6-Cup Water Filter Pitcher"), so the only way to say
      // "Brita pitchers, but not the Elite or Longlast" is to name what must
      // NOT appear. Without this the row either misses every listing or claims
      // the certified filters along with the uncertified ones.
      if ((p.matchNot || []).some(hasWord)) continue;
      // `match` is an adjacent phrase: "colgate total" names one line.
      for (const phrase of (p.match || [])) {
        const needle = norm(phrase);
        if (!needle || !low.includes(needle)) continue;
        const d = isDirect(p);
        if (better(p, needle.length, d)) {
          best = p; bestLen = needle.length; bestDirect = d; bestEvidence = evidenceOf(p);
        }
      }
      // `matchAll` is a set of words that must all appear, in any order and
      // anywhere. A whole-line verdict needs this: real titles read "Pampers
      // Swaddlers Diapers", so requiring "pampers diaper" adjacent misses them.
      for (const group of (p.matchAll || [])) {
        if (!group.length || !group.every(hasWord)) continue;
        const weight = group.join("").length;
        const d = isDirect(p);
        if (better(p, weight, d)) {
          best = p; bestLen = weight; bestDirect = d; bestEvidence = evidenceOf(p);
        }
      }
    }
    return best;
  }

  /**
   * The verdict the extension is allowed to assert, which is not always the one
   * the site shows.
   *
   * Brand Check can carry a hedge and a paragraph of context around a verdict.
   * Here we get one line, on a listing page, at the moment someone is deciding
   * whether to buy. So the extension holds the stricter line set out in
   * docs/rating-rules.md: favourable evidence never propagates, so a
   * recommendation needs direct evidence about this exact product. Where that
   * is missing the honest answer is no status at all, and "unrated" is how the
   * data says so. `ext` is stamped by tools/apply-product-rules.py.
   */
  function extVerdictOf(row) {
    if (!row) return null;
    const v = row.ext ? row.ext.verdict : row.verdict;
    return v && v !== "unrated" && v !== "neutral" ? v : null;
  }

  function resolveStance(match, asin, title) {
    return extVerdictOf(productFor(match, asin, title));
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
  /**
   * A verdict is only ever about a product we researched.
   *
   * Knowing the brand is not knowing the product. Cuisinart is a skip for its
   * appliance line and that says nothing about a bare stainless skillet;
   * Sensarte discloses no intentionally added PFAS and that says nothing about
   * whether this pan is coated. Rather than hedge a brand verdict with caveats,
   * we show no status at all and offer to research it.
   */
  function hasVerdict(match, asin, title) {
    return !!extVerdictOf(productFor(match, asin, title));
  }

  // ------------------------------------------------------------ rendering

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /**
   * Split a front note into the finding and its scope.
   *
   * Eighty eight of our notes end with an aside naming what the finding is
   * actually about ("(Recorded for Tampax as a whole rather than this product
   * specifically.)"). Glued to the end of a sentence, sometimes after an
   * ellipsis where the finding was truncated, it reads as a fragment. It is
   * worth keeping and worth setting apart, so it goes on its own quieter line.
   */
  function splitNote(text) {
    const raw = (text || "").trim();
    if (!raw) return null;
    const m = raw.match(/^([\s\S]*?)\s*\(([A-Z][^)]*)\)$/);
    const main = (m ? m[1] : raw).trim();
    const scope = m ? m[2].trim() : "";
    // Notes are written as sentence fragments about half the time. On a card
    // they read as sentences, so they start like one.
    const shown = main ? main[0].toUpperCase() + main.slice(1) : "";
    return { main: shown, scope };
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
    const label = STANCE_LABEL[stance] || "Context";
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
    const head = el("div", `pd-head ${reviewed ? stance : "neutral"}`);
    head.appendChild(reviewed
      ? el("span", `pd-badge ${stance}`, STANCE_LABEL[stance] || "Context")
      : el("span", "pd-badge pd-unreviewed", "Research, not yet reviewed"));
    head.appendChild(el("div", "pd-brand", b.brand));
    // Name the specific product when our verdict is about the product rather
    // than the brand, so a "good" badge on a careful brand does not look wrong.
    head.appendChild(el("div", "pd-cat", row ? `${row.name} · ${b.category}` : b.category));
    const productNote = (row && row.note) || "";
    const brandNote = b.reason || "";
    head.appendChild(el("p", "pd-reason", productNote || brandNote));
    // "About the brand" is only worth the space when it says something the
    // product note did not. A hundred and twenty seven of our product rows
    // carry the brand's own sentence verbatim, and printing it twice under a
    // heading promising more read as a bug, because it was one.
    if (productNote && brandNote && norm(productNote) !== norm(brandNote)) {
      const bl = el("div", "pd-brandline");
      bl.appendChild(el("b", null, "About the brand: "));
      bl.appendChild(document.createTextNode(brandNote));
      head.appendChild(bl);
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
    // The rules corrected scorecard travels as a flat map of statuses. The card
    // renders {status} objects, so normalise rather than teaching both shapes.
    //
    // The note matters as much as the status. A card that flags Formula and
    // says nothing else asks the reader to take a warning on trust at the exact
    // moment they are deciding whether to buy. `frontNotes` holds the reason we
    // recorded; where the front was inherited from the brand, the brand's note
    // and origin are the ones that apply, because it is the brand's finding.
    const extFronts = row && row.ext && row.ext.fronts
      ? Object.fromEntries(Object.entries(row.ext.fronts).map(([k, v]) => {
          const inherited = (row.ext.inheritedFronts || []).includes(k);
          const brandFront = (b.fronts || {})[k] || {};
          const note = (row.ext.frontNotes || {})[k] || (inherited ? brandFront.note : "");
          return [k, {
            status: v === "unassessed" ? "unknown" : v,
            note: note || "",
            origin: inherited ? brandFront.origin : undefined,
          }];
        }))
      : null;
    const productFronts = extFronts || (row && row.fronts ? row.fronts : null);
    // When a product's verdict departs from its brand's and it has no fronts of
    // its own, the brand's fronts are describing other products in the range and
    // must not be shown. Aquasana's packaging failure is about the Claryum line;
    // rendering a red cross under a "Good choice" badge on the shower filter is
    // simply false.
    const borrowedAndWrong =
      !productFronts && row && row.verdict && row.verdict !== b.stance;
    // Rule 1.2. A warning resting on evidence about the brand's other products
    // has to say so, so the shopper can judge the inference themselves rather
    // than reading it as a finding about the thing in their basket.
    // A row whose only note is the brand's own sentence has not been researched
    // as a product, whatever the row's name implies. All 127 of ours said so
    // nowhere, so a category level finding read as a finding about the exact
    // thing in the basket. It is the same claim `disclose` exists to qualify,
    // so it is qualified the same way.
    const impliedScope = productNote && brandNote && norm(productNote) === norm(brandNote);
    const scopeShown = !!(row && ((row.ext && row.ext.disclose) || impliedScope));
    if (scopeShown) {
      const d = el("div", "pd-scope");
      d.textContent = "This is our finding on " + b.brand
        + (b.category ? " " + String(b.category).toLowerCase() : "")
        + " generally. We have not researched this exact product.";
      head.appendChild(d);
    }
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
        const note = splitNote(f.note);
        if (note && note.main) body.appendChild(el("div", "pd-front-note", note.main));
        // The card already said this finding is about the brand generally. A
        // second aside under the front says it again in different words.
        if (note && note.scope && !scopeShown) {
          body.appendChild(el("div", "pd-front-scope", note.scope));
        }
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

  function buildUnmatchedPanel(brandName, knownBrand) {
    const root = el("div", "pd-panel");
    const head = el("div", "pd-head");
    head.appendChild(el("span", "pd-badge", "Not reviewed"));
    head.appendChild(el("div", "pd-brand", brandName));
    root.appendChild(head);
    root.appendChild(el("div", "pd-unmatched", knownBrand
      ? "We have researched " + brandName + " but not this particular product, "
        + "and a brand is not a product. Ask for a review and we will vet this "
        + "one on all four fronts, then email you the verdict."
      : "We have not researched this brand yet. Ask for a review and we will "
        + "vet it on all four fronts, then email you the verdict."));

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
    if (knownBrand) {
      const a = el("a", "pd-link", "See our verdict on " + brandName + " \u2192");
      a.href = `${SITE}/brand-check.html?b=${encodeURIComponent(brandName)}`;
      a.target = "_blank"; a.rel = "noopener";
      foot.appendChild(a);
    }
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
  function showPopover(anchor, match, stance, product) {
    if (openPop) openPop.remove();
    const pop = buildCard(match, stance, { popover: true, product });
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

  /**
   * The full title of a search result.
   *
   * Amazon now splits it across two spans inside the h2, the brand and then the
   * rest, so taking the first match returned "Colgate" for every Colgate
   * listing and nothing matched a product line. Join the spans with a space
   * rather than reading textContent, which would run them together.
   */
  function titleOf(card) {
    // Amazon's newer result layout splits the heading into two h2 elements, the
    // brand in one and the product in the other, so reading the first returned
    // "Colgate" for every Colgate listing and no product line could ever match.
    // Older layouts keep the whole title in a single heading. Join whatever is
    // there, de-duplicated, and the same code covers both.
    const parts = [];
    for (const h of card.querySelectorAll(SEL.search.title)) {
      const t = h.textContent.replace(/\s+/g, " ").trim();
      if (t && !parts.includes(t)) parts.push(t);
    }
    return parts.join(" ");
  }

  // -------------------------------------------------------------- search

  function decorateSearch() {
    const cards = document.querySelectorAll(SEL.search.card);
    for (const card of cards) {
      if (card.dataset.pdDone) continue;
      card.dataset.pdDone = "1";

      const asin = card.getAttribute("data-asin");
      const title = titleOf(card);
      const match = fromAsin(asin) || fromTitle(title);
      if (!match) continue;

      // No researched product, no chip. A grey "we do not know" on every
      // listing is noise, and a coloured one would be a claim we cannot make.
      if (!hasVerdict(match, asin, title)) continue;
      const stance = resolveStance(match, asin, title);
      const prow = productFor(match, asin, title);
      const chip = buildChip(match, stance);
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showPopover(chip, match, stance, prow);
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
    if (match && hasVerdict(match, detailAsin, title)) {
      panel = buildCard(match, resolveStance(match, detailAsin, title),
                        { product: productFor(match, detailAsin, title) });
    } else if (match) {
      // We know the brand but not this product, which is not the same thing.
      // Offer to research it rather than lending the brand's verdict to it.
      panel = buildUnmatchedPanel(match.brand.brand, match.brand);
      recordMiss(match.brand.brand);
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
