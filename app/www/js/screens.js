// The screens. Each one is a pure render into a container, given already
// resolved data, so nothing here waits on a network call or knows about the
// camera. Navigation is handled by main.js.

import { FRONTS, STANCE_LABEL, verdictFor, alternativesFor, ratedProducts } from "./match.js";
import { packagingHeadline } from "./upc.js";
import { el, frag, icon, ICONS, splitNote } from "./ui.js";

const SITE = "https://plasticdetox.org";
const STATUS_GLYPH = { pass: "✓", caution: "!", fail: "✕", unknown: "?" };

// ------------------------------------------------------------------- home

export function home(root, {
  onScan, onSearch, onPick, onStarter, onAllCategories, onSafari, onDismissSafari,
  onCheck, recents, starters, canScan, scanReason, showSafari, categoryCount, draft,
}) {
  const hero = el("div", "hero");
  hero.appendChild(el("h1", null, "Check it before you buy it"));
  hero.appendChild(el("p", null,
    "In a shop or in a basket. Name the brand and the product, and see all four checks."));
  root.appendChild(hero);

  // Brand and product are separate fields, as they are on the site. A single
  // box invited a brand name on its own, and a brand verdict is the least
  // useful answer we hold: half our product verdicts disagree with it.
  const form = el("form", "check-form");
  form.setAttribute("novalidate", "");

  const brand = field("Brand, for example Graza", (draft && draft.brand) || "");
  const product = field("Product, for example Sizzle extra virgin olive oil", (draft && draft.product) || "");
  form.appendChild(brand.wrap);

  // Type ahead on the brand only. A brand we already hold should never need
  // the second field filled in to be found.
  const results = el("div", "results");
  brand.input.oninput = () => onSearch(brand.input.value, results, () => ({
    brand: brand.input.value, product: product.input.value,
  }));
  form.appendChild(results);

  form.appendChild(product.wrap);

  const go = el("button", "cta", "Check it");
  go.type = "submit";
  form.appendChild(go);
  form.onsubmit = (e) => {
    e.preventDefault();
    onCheck({ brand: brand.input.value.trim(), product: product.input.value.trim() });
  };
  root.appendChild(form);

  const scan = el("button", `cta ghost${canScan ? "" : " off"}`);
  scan.type = "button";
  scan.appendChild(icon(ICONS.scan, 18));
  scan.appendChild(el("span", null, "Or scan the barcode"));
  scan.onclick = canScan ? onScan : null;
  scan.disabled = !canScan;
  root.appendChild(scan);
  if (!canScan) root.appendChild(el("p", "scan-why", noCameraReason(scanReason)));

  if (showSafari) root.appendChild(safariPrompt(onSafari, onDismissSafari));

  // History as a strip, not a list. Stacked down the screen it pushed browsing
  // off the bottom, so after a shop's worth of checking the first thing the app
  // showed was a list of things already looked at.
  if (recents && recents.length) {
    root.appendChild(el("div", "section-title", "Recently checked"));
    const strip = el("div", "strip");
    for (const r of recents) strip.appendChild(recentChip(r, onPick));
    root.appendChild(strip);
  }

  if (starters && starters.length) {
    root.appendChild(el("div", "section-title", "Browse"));
    for (const s of starters) {
      const row = el("button", "row");
      row.type = "button";
      row.appendChild(el("span", "dot brand"));
      const body = el("div", "row-body");
      body.appendChild(el("div", "row-name", s.label));
      body.appendChild(el("div", "row-sub", s.sub));
      row.appendChild(body);
      row.appendChild(el("span", "row-chev", "\u203a"));
      row.onclick = () => onStarter(s);
      root.appendChild(row);
    }
    const all = el("button", "row row-quiet");
    all.type = "button";
    const body = el("div", "row-body");
    body.appendChild(el("div", "row-name", "All categories"));
    body.appendChild(el("div", "row-sub", `${categoryCount} categories researched`));
    all.appendChild(body);
    all.appendChild(el("span", "row-chev", "\u203a"));
    all.onclick = onAllCategories;
    root.appendChild(all);
  }

  root.appendChild(el("p", "note",
    "A verdict here is the same one the site publishes. We rate a product only when we have researched that exact product."));
}

/** One labelled input in the check form. */
function field(placeholder, value) {
  const wrap = el("div", "field");
  const input = el("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = value || "";
  input.autocapitalize = "words";
  input.autocomplete = "off";
  input.spellcheck = false;
  wrap.appendChild(input);
  return { wrap, input };
}

/** One thing you already checked, small enough that twenty of them fit. */
function recentChip(r, onPick) {
  const chip = el("button", "chip");
  chip.type = "button";
  chip.appendChild(el("span", `dot ${r.stance || "neutral"}`));
  chip.appendChild(el("span", "chip-name", r.name));
  chip.onclick = () => onPick(r);
  return chip;
}

/**
 * Why the camera is not available, told apart rather than lumped together.
 *
 * "No scanner in this build" and "no camera on this device" look identical to
 * someone holding a phone, and only the first is a bug.
 */
function noCameraReason(reason) {
  if (reason === "missing-plugin") {
    return "The scanner is missing from this build. That is a bug, not your phone. Please report it.";
  }
  if (reason === "no-camera") {
    return "No camera on this device. On a real iPhone this opens the scanner.";
  }
  return "Scanning in a browser needs Chrome. Everything else here works, and on the iPhone the scanner opens the camera.";
}

export function renderResults(container, hits, onPick) {
  container.replaceChildren();
  if (!hits.length) return;
  container.appendChild(el("div", "section-title", `${hits.length} match${hits.length === 1 ? "" : "es"}`));
  for (const hit of hits) {
    const row = el("button", "row");
    row.appendChild(el("span", `dot ${hit.brand.stance || "neutral"}`));
    const body = el("div", "row-body");
    body.appendChild(el("div", "row-name", hit.brand.brand));
    body.appendChild(el("div", "row-sub",
      hit.product ? `${hit.product.name} · ${hit.brand.category}` : hit.brand.category));
    row.appendChild(body);
    row.appendChild(el("span", "row-chev", "›"));
    row.onclick = () => onPick(hit);
    container.appendChild(row);
  }
}

// ----------------------------------------------------------------- result

/**
 * The verdict screen.
 *
 * `scan` is the barcode database record when we got here from the camera, and
 * carries the packaging read. It is rendered even when we know the brand,
 * because "good brand, PET bottle" is a real and common answer.
 */

/**
 * The exposure line, said the way a person would say it.
 *
 * The model already decides this once per product type, so every row has one.
 * It belongs beside the verdict rather than three cards down, because it is
 * the reason three small findings add up to an answer on a diaper cream and
 * would not on a hand cream.
 */
const CONTACT = {
  "leave-on": "left on skin", swallowed: "swallowed", spat: "spat out",
  rinsed: "rinsed off", transfer: "passed into what you eat or drink",
  prolonged: "in contact for hours", breathed: "breathed in",
};
const HOW_OFTEN = {
  "several daily": "several times a day", daily: "every day",
  weekly: "most weeks", rare: "now and then",
};

function exposureBlock(ex) {
  if (!ex || !ex.level) return null;
  const box = el("div", `expo ${ex.level}`);
  box.appendChild(el("span", `pkg-chip ${ex.level}`, String(ex.level).toUpperCase()));
  const why = el("div", "expo-why");
  const bits = [
    ex.baby ? "On a baby" : null,
    CONTACT[ex.retained] || null,
    HOW_OFTEN[ex.frequency] || null,
  ].filter(Boolean);
  if (bits.length) {
    const line = bits.join(", ") + ".";
    why.appendChild(el("b", null, line.charAt(0).toUpperCase() + line.slice(1)));
  }
  if (ex.why) why.appendChild(document.createTextNode(ex.why));
  box.appendChild(why);
  return box;
}

/**
 * The label we read, with the words we objected to marked inside it.
 *
 * Every scanner app hands out a score. Almost none show the list they read it
 * from. This is the part that makes a verdict checkable rather than another
 * opinion, which is why the terms are stored rather than parsed back out of
 * our own sentence.
 */
function ingredientsCard(fa) {
  if (!fa || !fa.ingredients) return null;
  const box = el("div", "card ing-card");
  box.appendChild(el("h2", null, "What is in it"));
  const p = el("p", "ing-list");
  const terms = (fa.flagged || []).filter(Boolean);
  const rx = terms.length
    ? new RegExp("(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")s?", "ig")
    : null;
  const text = fa.ingredients;
  if (!rx) {
    p.textContent = text;
  } else {
    let last = 0, m;
    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) p.appendChild(document.createTextNode(text.slice(last, m.index)));
      p.appendChild(el("mark", null, m[0]));
      last = m.index + m[0].length;
      if (rx.lastIndex === m.index) rx.lastIndex++;
    }
    if (last < text.length) p.appendChild(document.createTextNode(text.slice(last)));
  }
  box.appendChild(p);
  if (fa.checked) box.appendChild(el("div", "ing-src", `Read from the label, ${fa.checked}.`));
  return box;
}

/**
 * The one story worth telling about this product, where there is one.
 *
 * Deliberately conditional. A card that always appears and is sometimes filler
 * is worth less than one that appears only when we have something.
 */
function worthKnowing(ext, fronts) {
  if (!ext) return null;
  const k = ext.classEvidence;
  const legal = ((fronts && fronts.legal) || {}).status;
  const legalNote = ext.legalNote || "";
  let body = null;
  if (k && k.detail) body = k.detail + (k.source ? ` (${k.source})` : "");
  else if (["caution", "fail"].includes(legal) && legalNote.length > 90) body = legalNote;
  if (!body) return null;
  const box = el("div", "card know");
  box.appendChild(el("h2", null, "Worth knowing"));
  box.appendChild(el("p", null, body));
  return box;
}

export function result(root, { index, match, scan, product, query, productNamed, onOpen, onPick, onProduct }) {
  const v = verdictFor(match, { title: (scan && scan.title) || query || "", product, productNamed });

  const stanceClass = v.asserted && ["good", "careful", "skip"].includes(v.stance)
    ? ` v-${v.stance}` : "";
  const card = el("div", "verdict" + stanceClass);
  root.classList.add("tinted");
  const head = el("div", "verdict-head");

  // A stance badge asserts that a person stood behind this verdict. Anything
  // we have not reviewed says so instead of wearing a colour it has not earned.
  // A badge asserts a verdict. Where the gate did not let one through, the
  // badge says so rather than borrowing the brand's.
  head.appendChild(!v.reviewed
    ? el("span", "badge neutral", "Research, not yet reviewed")
    : v.asserted
      ? el("span", `badge ${v.stance}`, STANCE_LABEL[v.stance] || "Context")
      : el("span", "badge neutral", "No verdict on this product"));

  head.appendChild(el("div", "verdict-brand", v.brand.brand));
  head.appendChild(el("div", "verdict-cat",
    v.level === "product" && v.product ? `${v.product.name} · ${v.brand.category}` : v.brand.category));
  if (v.reason) head.appendChild(el("p", "verdict-reason", v.reason));

  const expo = exposureBlock(v.ext && v.ext.exposure);
  if (expo) head.appendChild(expo);

  if (v.brandReason) {
    const bl = el("div", "verdict-scope");
    bl.appendChild(el("b", null, "About the brand: "));
    bl.appendChild(document.createTextNode(v.brandReason));
    head.appendChild(bl);
  } else if (!v.asserted) {
    // Say what is missing, in the data's own words where it has them.
    const box = el("div", "verdict-scope");
    box.appendChild(document.createTextNode(
      v.why || `We have researched ${v.brand.brand}, but not this exact product, so we are not putting a verdict on it.`));
    head.appendChild(box);
  } else if (v.scoped) {
    head.appendChild(el("div", "verdict-scope",
      `This is our finding on ${v.brand.brand} ${String(v.brand.category || "").toLowerCase()} generally. We have not researched this exact product.`));
  } else if (v.level === "brand") {
    // Knowing the brand is not knowing the product. Say so rather than let a
    // brand judgement pass itself off as a verdict on the thing being held.
    head.appendChild(el("div", "verdict-scope",
      "This is our read on the brand. We have not researched this exact product, so treat it as context rather than a verdict on what you are holding."));
  }
  card.appendChild(head);

  // Show what was checked, and name what was not, rather than printing four
  // rows where three of them say "not yet checked".
  //
  // The four-front data lives on product rows. Brand entries barely carry it:
  // 455 of the 457 brands we rate good have at least one unassessed front, and
  // 86 have none at all. A full scorecard drawn from a brand therefore reads as
  // a half-finished verdict, which is how this looked on a Caboo scan. Same
  // rule the extension has always used.
  const statusOf = (k) => ((v.fronts && v.fronts[k]) || {}).status || "unknown";
  const flagged = FRONTS.filter(([k]) => ["caution", "fail"].includes(statusOf(k)));
  const populated = FRONTS.filter(([k]) => statusOf(k) !== "unknown");
  const positive = v.asserted && v.stance === "good";
  const shown = positive ? populated : (flagged.length ? flagged : populated);
  const unassessed = FRONTS.filter(([k]) => statusOf(k) === "unknown");

  const fronts = el("div", "fronts");
  if (shown.length) {
    fronts.appendChild(el("div", "fronts-label", positive
      ? (v.level === "product" ? "How we checked this product" : "How we checked the brand")
      : (flagged.length ? "Why we flag it" : "What we checked")));
  }
  for (const [key, label] of shown) {
    const f = (v.fronts && v.fronts[key]) || { status: "unknown" };
    const st = f.status || "unknown";
    const line = el("div", `front ${st}`);
    line.appendChild(el("span", `front-mark ${st}`, STATUS_GLYPH[st]));
    const body = el("div", "row-body");
    body.appendChild(el("div", "front-name", label));
    const note = splitNote(f.note);
    const full = (note && note.main) || describeFront(st);
    body.appendChild(el("div", "front-note",
      full.length > 200 ? full.split(/(?<=\.)\s+/)[0] : full));
    // The card already said this finding is about the brand generally. A second
    // aside under the front says it again in different words.
    if (note && note.scope && !v.scoped) body.appendChild(el("div", "front-scope", note.scope));
    line.appendChild(body);
    fronts.appendChild(line);
  }
  // Only a recommendation owes the reader a list of what we have not looked at.
  if (positive && unassessed.length) {
    fronts.appendChild(el("div", "fronts-unassessed",
      "Not yet assessed: " + unassessed.map(([, l]) => l.toLowerCase()).join(", ")));
  }
  if (fronts.childNodes.length) card.appendChild(fronts);
  root.appendChild(card);

  if (v.heldBack && v.heldBack.length) {
    const held = el("div", "card");
    held.appendChild(el("h2", null, "Why there is no recommendation"));
    held.appendChild(el("p", null, v.why ||
      `A recommendation needs all four checks. Still to do: ${v.heldBack.join(", ")}.`));
    root.appendChild(held);
  }

  if (v.level === "brand") {
    const rows = ratedProducts(v.brand);
    if (rows.length) {
      const box = el("div", "card");
      box.appendChild(el("h2", null, "Which one do you have?"));
      box.appendChild(el("p", "pkg-why",
        "We rate these separately, because they do not all behave the same way."));
      for (const { row, stance } of rows) {
        const line = el("button", "row");
        line.appendChild(el("span", `dot ${stance}`));
        const body = el("div", "row-body");
        body.appendChild(el("div", "row-name", row.name));
        body.appendChild(el("div", "row-sub", STANCE_LABEL[stance] || "Context"));
        line.appendChild(body);
        line.appendChild(el("span", "row-chev", "›"));
        line.onclick = () => onProduct(row);
        box.appendChild(line);
      }
      root.appendChild(box);
    }
  }

  const ing = ingredientsCard(v.ext && v.ext.formulaAnswers);
  if (ing) root.appendChild(ing);

  const know = worthKnowing(v.ext, v.fronts);
  if (know) root.appendChild(know);

  if (scan) root.appendChild(materialsCard(scan, onOpen));

  const alts = v.stance === "good"
    ? []
    : alternativesFor(index, v.brand, 3, (v.product && v.product.cat) || "");
  if (alts.length) {
    const box = el("div", "card alt-card");
    box.appendChild(el("h2", null, "What we would buy instead"));
    for (const { brand: b, row: pr } of alts) {
      const row = el("button", "row");
      row.appendChild(el("span", "dot good"));
      const body = el("div", "row-body");
      // Many rows already carry the brand in their name, so prefixing it gave
      // "Forlife Forlife Stainless Steel Tea Infuser".
      const label = pr.name.toLowerCase().startsWith(b.brand.toLowerCase())
        ? pr.name : `${b.brand} ${pr.name}`;
      body.appendChild(el("div", "row-name", label));
      // The row's own sentence, not the brand's. A brand blurb here is how a
      // good brand's bad product ends up recommended.
      body.appendChild(el("div", "row-sub", (pr.note || "").split(". ")[0] || b.category));
      row.appendChild(body);
      row.appendChild(el("span", "row-chev", "›"));
      row.onclick = () => onPick({ brand: b });
      box.appendChild(row);
    }
    root.appendChild(box);
  }

  if (v.article) {
    const a = el("a", "cta", "Read the research");
    a.href = `${SITE}/articles/${v.article}`;
    a.onclick = (e) => { e.preventDefault(); onOpen(a.href); };
    root.appendChild(a);
  }
  const check = el("a", "cta ghost", "Open in Brand Check");
  check.href = `${SITE}/brand-check.html?b=${encodeURIComponent(v.brand.brand)}`;
  check.onclick = (e) => { e.preventDefault(); onOpen(check.href); };
  root.appendChild(check);

  return v;
}

function describeFront(status) {
  return {
    pass: "Checked and clear.",
    caution: "Checked, with something worth knowing.",
    fail: "Checked, and it failed.",
    unknown: "Not yet checked.",
  }[status] || "Not yet checked.";
}

/**
 * What the package is made of.
 *
 * Shown on every scan, brand known or not, because it is the one answer we can
 * give about a product nobody has researched.
 */
function materialsCard(scan, onOpen) {
  const box = el("div", "card");
  box.appendChild(el("h2", null, "The materials"));

  const headline = packagingHeadline(scan.materials);
  if (!headline) {
    box.appendChild(el("p", "pkg-why",
      "The barcode databases do not record what this one is packaged in. If it is a bottle or a pouch, assume plastic."));
    return box;
  }

  box.appendChild(el("p", null, headline.text));
  for (const m of scan.materials) {
    const row = el("div", "pkg");
    row.appendChild(el("span", `pkg-chip ${m.concern}`, m.label));
    row.appendChild(el("span", "pkg-why", m.why));
    box.appendChild(row);
  }

  const withArticle = scan.materials.find((m) => m.article);
  if (withArticle) {
    const a = el("a", "cta ghost", "Why this plastic matters");
    a.href = `${SITE}/${withArticle.article}`;
    a.onclick = (e) => { e.preventDefault(); onOpen(a.href); };
    box.appendChild(a);
  }
  return box;
}

// ---------------------------------------------------------------- unknown

/**
 * The screen for a product we have never researched.
 *
 * This is the common case in a supermarket and it has to feel like an answer,
 * not a dead end. So it leads with whatever the packaging tells us, which is
 * often the thing the person actually wanted to know, and offers to put the
 * brand in the queue.
 */
export function unknown(root, { scan, brand, product, hasPass, onCheck, onRequest, onBuy, onOpen, onSearch, onPaste }) {
  const named = [brand, product].filter(Boolean).join(" ").trim()
    || (scan && (scan.brandName || scan.title)) || "";

  // No verdict here, so no verdict colour on the edge. The wash still applies:
  // it is the brand, not a judgement.
  const card = el("div", "verdict");
  root.classList.add("tinted");
  const head = el("div", "verdict-head");
  head.appendChild(el("span", "badge neutral", "Not reviewed yet"));
  head.appendChild(el("div", "verdict-brand",
    named ? `We have not checked ${named} yet.` : "We have not checked that yet."));
  card.appendChild(head);
  root.appendChild(card);

  // Same two ways forward as the site: pay for the automated check now, or ask
  // a person to do it for free and wait two business days.
  const now = el("div", "card");
  now.appendChild(el("h2", null, "Get it checked now"));
  now.appendChild(el("p", null,
    "Our research system runs the same four checks we use for every verdict: formula, materials, recalls and lawsuits, independent tests. It answers in about a minute and shows its sources."));

  const log = el("div", "checklog");
  now.appendChild(log);

  if (hasPass) {
    const go = el("button", "cta", "Run the check");
    go.onclick = () => onCheck(go, log);
    now.appendChild(go);
  } else {
    now.appendChild(el("p", "pkg-why", "Checks come in packs, starting at $5 for 20."));
    const buy = el("button", "cta", "Get checks");
    buy.onclick = onBuy;
    now.appendChild(buy);
    const paste = el("button", "cta ghost", "I already have a pass");
    paste.onclick = onPaste;
    now.appendChild(paste);
  }
  root.appendChild(now);

  if (named) {
    const free = el("div", "card");
    free.appendChild(el("h2", null, "Or request a free review"));
    free.appendChild(el("p", null,
      `Leave your email and our team will research ${named} by hand and email you the verdict, usually within 2 business days.`));
    const input = el("input");
    input.type = "email";
    input.placeholder = "you@email.com";
    input.autocapitalize = "none";
    input.autocomplete = "email";
    free.appendChild(input);
    const btn = el("button", "cta ghost", "Request free review");
    btn.onclick = () => onRequest(input.value, btn);
    free.appendChild(btn);
    root.appendChild(free);
  }

  if (scan) root.appendChild(materialsCard(scan, onOpen));

  const box = el("div", "search");
  box.appendChild(icon(ICONS.search, 18));
  const input = el("input");
  input.type = "search";
  input.placeholder = "Search our database instead";
  input.value = brand || "";
  input.autocapitalize = "none";
  input.oninput = () => onSearch(input.value, results);
  box.appendChild(input);
  root.appendChild(box);
  const results = el("div", "results");
  root.appendChild(results);
  if (brand) onSearch(brand, results);
}

/** One front as it arrives from the check stream. */
export function checkRow(step, front, label) {
  const row = el("div", `front ${front.status === "none" ? "unknown" : front.status}`);
  const glyph = { pass: "\u2713", caution: "!", fail: "\u2715" }[front.status] || "?";
  row.appendChild(el("span", `front-mark ${front.status === "none" ? "unknown" : front.status}`, glyph));
  const body = el("div", "row-body");
  body.appendChild(el("div", "front-name", label));
  if (front.note) body.appendChild(el("div", "front-note", front.note));
  if (front.source) {
    const a = el("a", "front-source", "source");
    a.href = front.source;
    a.target = "_blank";
    a.rel = "noopener";
    body.appendChild(a);
  }
  row.appendChild(body);
  return row;
}

/** The verdict the check settled on, in the same words the site uses. */
export function checkVerdict(event) {
  const names = { good: "Good choice", careful: "Careful", skip: "Skip", unrated: "Not enough found" };
  const box = el("div", "check-result");
  box.appendChild(el("span", `badge ${event.verdict === "unrated" ? "neutral" : event.verdict}`,
    names[event.verdict] || event.verdict));
  if (event.label) box.appendChild(el("div", "check-label", event.label));
  if (event.capNote) box.appendChild(el("p", "pkg-why", event.capNote));
  if (event.consumed) {
    box.appendChild(el("p", "pkg-why",
      "1 check used. This research will join our public database after review, free for everyone."));
  }
  return box;
}

// ------------------------------------------------------------------ about

export function about(root, { meta, onOpen, onSafari }) {
  root.appendChild(el("div", "hero")).appendChild(el("h1", null, "How this works"));

  const how = el("div", "card");
  how.appendChild(el("h2", null, "The four fronts"));
  how.appendChild(el("p", null,
    "Every product we recommend has to pass all four: what it is made of, what it is packaged in, whether it has been recalled or sued over, and what independent lab testing found. A product missing any of the four gets no recommendation, which is why you will see honest blanks."));
  root.appendChild(how);

  const data = el("div", "card");
  data.appendChild(el("h2", null, "The database"));
  data.appendChild(el("p", null,
    `${meta.brands} brands, researched and reviewed by hand. Verdicts refresh in the background, so a recall lands here without waiting for an app update.`));
  data.appendChild(el("p", "pkg-why", meta.fetched
    ? `Last updated ${new Date(meta.fetched).toLocaleDateString()}.`
    : "Using the version that shipped with the app."));
  root.appendChild(data);

  const safariCard = el("div", "card");
  safariCard.appendChild(el("h2", null, "In Safari too"));
  safariCard.appendChild(el("p", null,
    "Brand Check can show the same verdict on Amazon listings while you browse in Safari. It ships with this app and takes three taps in Settings to turn on."));
  const setup = el("button", "cta ghost", "How to turn it on");
  setup.onclick = onSafari;
  safariCard.appendChild(setup);
  root.appendChild(safariCard);

  const links = el("div", "card");
  links.appendChild(el("h2", null, "More"));
  for (const [label, path] of [
    ["Brand Check on the web", "brand-check.html"],
    ["The store", "store.html"],
    ["Privacy", "privacy.html"],
  ]) {
    const a = el("a", "cta ghost", label);
    a.href = `${SITE}/${path}`;
    a.onclick = (e) => { e.preventDefault(); onOpen(a.href); };
    links.appendChild(a);
  }
  root.appendChild(links);

  root.appendChild(el("p", "note",
    "Some links on plasticdetox.org are affiliate links. They never change a verdict."));
}

// --------------------------------------------------------------- category

/**
 * Everything we hold in one category, best first.
 *
 * Ordered good, then careful, then skip, because someone browsing a category
 * is shopping rather than checking, and the answer they want is at the top.
 */
export function category(root, { label, brands, onPick }) {
  const hero = el("div", "hero");
  hero.appendChild(el("h1", null, label));
  hero.appendChild(el("p", null, `${brands.length} brand${brands.length === 1 ? "" : "s"} researched`));
  root.appendChild(hero);

  const order = { good: 0, careful: 1, neutral: 2, skip: 3 };
  const sorted = [...brands].sort((a, b) =>
    (order[a.stance] ?? 9) - (order[b.stance] ?? 9) || a.brand.localeCompare(b.brand));

  let heading = null;
  for (const b of sorted) {
    if (b.stance !== heading) {
      heading = b.stance;
      root.appendChild(el("div", "section-title", STANCE_LABEL[heading] || "Context"));
    }
    const row = el("button", "row");
    row.appendChild(el("span", `dot ${b.stance || "neutral"}`));
    const body = el("div", "row-body");
    body.appendChild(el("div", "row-name", b.brand));
    body.appendChild(el("div", "row-sub", b.evidence || b.category));
    row.appendChild(body);
    row.appendChild(el("span", "row-chev", "›"));
    row.onclick = () => onPick({ brand: b });
    root.appendChild(row);
  }
}

// ----------------------------------------------------------- safari extension

/**
 * How to turn the Safari extension on.
 *
 * iOS gives an app no way to ask whether its own Safari extension is enabled,
 * so this cannot be a status screen. It is instructions, and the honest thing
 * is to let someone say they are done rather than pretend to detect it.
 */
export function safari(root, { onDone, onOpen }) {
  const hero = el("div", "hero");
  hero.appendChild(el("h1", null, "Check Amazon in Safari"));
  hero.appendChild(el("p", null,
    "The same four front verdict, on every Amazon listing you open, without leaving the page."));
  root.appendChild(hero);

  const steps = el("div", "card");
  steps.appendChild(el("h2", null, "Three taps, once"));
  const list = el("ol", "steps");
  for (const [strong, rest] of [
    ["Open Settings", " and go to Apps, then Safari."],
    ["Tap Extensions", ", then Brand Check, and turn it on."],
    ["Allow amazon.com", " so it can read the listing you are looking at."],
  ]) {
    const li = el("li");
    li.appendChild(el("b", null, strong));
    li.appendChild(document.createTextNode(rest));
    list.appendChild(li);
  }
  steps.appendChild(list);
  root.appendChild(steps);

  const what = el("div", "card");
  what.appendChild(el("h2", null, "What it does"));
  what.appendChild(el("p", null,
    "A coloured chip on every search result, and the full scorecard on a product page. It reads the listing to work out which brand and product you are looking at, and shows the verdict we published. It sends nothing about you anywhere."));
  root.appendChild(what);

  const done = el("button", "cta", "I have turned it on");
  done.onclick = onDone;
  root.appendChild(done);

  const more = el("a", "cta ghost", "See what a verdict looks like");
  more.href = "https://plasticdetox.org/brand-check.html";
  more.onclick = (e) => { e.preventDefault(); onOpen(more.href); };
  root.appendChild(more);
}

/** The prompt on the home screen, until it is dismissed. */
export function safariPrompt(onOpen, onDismiss) {
  const box = el("div", "promo");
  const body = el("div", "row-body");
  body.appendChild(el("div", "row-name", "Shopping on Amazon?"));
  body.appendChild(el("div", "row-sub", "Turn on Brand Check in Safari"));
  box.appendChild(body);
  const go = el("button", "promo-go", "Set up");
  go.onclick = onOpen;
  box.appendChild(go);
  const x = el("button", "promo-x", "✕");
  x.setAttribute("aria-label", "Dismiss");
  x.onclick = onDismiss;
  box.appendChild(x);
  return box;
}


// ------------------------------------------------------- category index

/**
 * Every category we hold, commonest first.
 *
 * Sorted by how much we have researched rather than alphabetically, because
 * the useful answer to "what do you cover" is the areas we cover deeply, and
 * an A to Z buries 144 cookware brands under Activewear.
 */
export function categoryIndex(root, { groups, onPick }) {
  const hero = el("div", "hero");
  hero.appendChild(el("h1", null, "All categories"));
  hero.appendChild(el("p", null, `${groups.length} categories, ${groups.reduce((n, g) => n + g.count, 0)} brands researched`));
  root.appendChild(hero);

  for (const g of groups) {
    const row = el("button", "row");
    row.appendChild(el("span", "dot brand"));
    const body = el("div", "row-body");
    body.appendChild(el("div", "row-name", g.category));
    body.appendChild(el("div", "row-sub",
      `${g.count} brand${g.count === 1 ? "" : "s"}` + (g.good ? ` · ${g.good} we would buy` : "")));
    row.appendChild(body);
    row.appendChild(el("span", "row-chev", "›"));
    row.onclick = () => onPick(g);
    root.appendChild(row);
  }
}
