// The screens. Each one is a pure render into a container, given already
// resolved data, so nothing here waits on a network call or knows about the
// camera. Navigation is handled by main.js.

import { FRONTS, STANCE_LABEL, verdictFor, alternativesFor, ratedProducts } from "./match.js";
import { packagingHeadline } from "./upc.js";
import { el, frag, icon, ICONS, splitNote } from "./ui.js";

const SITE = "https://plasticdetox.org";
const STATUS_GLYPH = { pass: "✓", caution: "!", fail: "✕", unknown: "?" };

// ------------------------------------------------------------------- home

export function home(root, { onScan, onSearch, onPick, onStarter, onAllCategories, onSafari, onDismissSafari, recents, starters, canScan, scanReason, showSafari, categoryCount }) {
  const hero = el("div", "hero");
  hero.appendChild(el("h1", null, "What is in your hand?"));
  hero.appendChild(el("p", null,
    "Scan the barcode, or search a brand. Every verdict is checked on four fronts."));
  root.appendChild(hero);

  // The button is always here, even where it cannot run. Hiding the app's main
  // feature on a simulator or a desktop browser made it look as though there
  // was no scanner at all, which is a worse answer than saying why.
  const btn = el("button", `scan-btn${canScan ? "" : " off"}`);
  btn.appendChild(icon(ICONS.scan, 22));
  btn.appendChild(el("span", null, "Scan a barcode"));
  btn.onclick = canScan ? onScan : null;
  btn.disabled = !canScan;
  root.appendChild(btn);
  if (!canScan) {
    root.appendChild(el("p", "scan-why", noCameraReason(scanReason)));
  }

  const box = el("div", "search");
  box.appendChild(icon(ICONS.search, 18));
  const input = el("input");
  input.type = "search";
  input.placeholder = "Search a brand or product";
  input.autocapitalize = "none";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.oninput = () => onSearch(input.value, results);
  box.appendChild(input);
  root.appendChild(box);

  const results = el("div", "results");
  root.appendChild(results);

  if (showSafari) root.appendChild(safariPrompt(onSafari, onDismissSafari));

  // History as a strip, not a list.
  //
  // Recents used to stack down the screen and push everything else off it, so
  // after a shop's worth of scanning the home screen was a scrollback of things
  // you had already looked at. It scrolls sideways now, one row however many
  // there are, which is what a glance back at the last few actually needs.
  if (recents && recents.length) {
    root.appendChild(el("div", "section-title", "Recently checked"));
    const strip = el("div", "strip");
    for (const r of recents) strip.appendChild(recentChip(r, onPick));
    root.appendChild(strip);
  }

  // Browsing is always offered, not only on a first launch. Someone with a
  // history still needs a way into the parts of the database they have not
  // touched, and that was the thing recents pushed off the screen.
  if (starters && starters.length) {
    root.appendChild(el("div", "section-title", "Browse"));
    for (const s of starters) {
      const row = el("button", "row");
      row.appendChild(el("span", "dot brand"));
      const body = el("div", "row-body");
      body.appendChild(el("div", "row-name", s.label));
      body.appendChild(el("div", "row-sub", s.sub));
      row.appendChild(body);
      row.appendChild(el("span", "row-chev", "›"));
      row.onclick = () => onStarter(s);
      root.appendChild(row);
    }
    const all = el("button", "row row-quiet");
    const body = el("div", "row-body");
    body.appendChild(el("div", "row-name", "All categories"));
    body.appendChild(el("div", "row-sub", `${categoryCount} categories researched`));
    all.appendChild(body);
    all.appendChild(el("span", "row-chev", "›"));
    all.onclick = onAllCategories;
    root.appendChild(all);
  }

  root.appendChild(el("p", "note",
    "A verdict here is the same one the site publishes. We rate a product only when we have researched that exact product."));
}

/**
 * Why the camera is not available, in the words that fit the reason.
 *
 * A simulator has no camera at all. A desktop browser has one but no barcode
 * decoder unless it is Chrome. Those are different problems and a single
 * "scanning unavailable" would send someone looking in the wrong place.
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

/** One thing you already checked, small enough that twenty of them fit. */
function recentChip(r, onPick) {
  const chip = el("button", "chip");
  chip.appendChild(el("span", `dot ${r.stance || "neutral"}`));
  chip.appendChild(el("span", "chip-name", r.name));
  chip.onclick = () => onPick(r);
  return chip;
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
export function result(root, { index, match, scan, product, onOpen, onPick, onProduct }) {
  const v = verdictFor(match, { title: scan ? scan.title : "", product });

  const card = el("div", "verdict");
  const head = el("div", "verdict-head");

  // A stance badge asserts that a person stood behind this verdict. Anything
  // we have not reviewed says so instead of wearing a colour it has not earned.
  head.appendChild(v.reviewed
    ? el("span", `badge ${v.stance}`, STANCE_LABEL[v.stance] || "Context")
    : el("span", "badge neutral", "Research, not yet reviewed"));

  head.appendChild(el("div", "verdict-brand", v.brand.brand));
  head.appendChild(el("div", "verdict-cat",
    v.level === "product" && v.product ? `${v.product.name} · ${v.brand.category}` : v.brand.category));
  if (v.reason) head.appendChild(el("p", "verdict-reason", v.reason));

  if (v.brandReason) {
    const bl = el("div", "verdict-scope");
    bl.appendChild(el("b", null, "About the brand: "));
    bl.appendChild(document.createTextNode(v.brandReason));
    head.appendChild(bl);
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

  const fronts = el("div", "fronts");
  for (const [key, label] of FRONTS) {
    const f = (v.fronts && v.fronts[key]) || { status: "unknown" };
    const st = f.status || "unknown";
    const line = el("div", `front ${st}`);
    line.appendChild(el("span", `front-mark ${st}`, STATUS_GLYPH[st]));
    const body = el("div", "row-body");
    body.appendChild(el("div", "front-name", label));
    const note = splitNote(f.note);
    body.appendChild(el("div", "front-note", (note && note.main) || describeFront(st)));
    // The card already said this finding is about the brand generally. A second
    // aside under the front says it again in different words.
    if (note && note.scope && !v.scoped) body.appendChild(el("div", "front-scope", note.scope));
    line.appendChild(body);
    fronts.appendChild(line);
  }
  card.appendChild(fronts);
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

  if (scan) root.appendChild(packagingCard(scan, onOpen));

  const alts = v.stance === "good" ? [] : alternativesFor(index, v.brand, 3);
  if (alts.length) {
    const box = el("div", "card");
    box.appendChild(el("h2", null, "What we would buy instead"));
    for (const b of alts) {
      const row = el("button", "row");
      row.appendChild(el("span", "dot good"));
      const body = el("div", "row-body");
      body.appendChild(el("div", "row-name", b.brand));
      body.appendChild(el("div", "row-sub", b.evidence || b.category));
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
function packagingCard(scan, onOpen) {
  const box = el("div", "card");
  box.appendChild(el("h2", null, "The packaging"));

  const headline = packagingHeadline(scan.packaging);
  if (!headline) {
    box.appendChild(el("p", "pkg-why",
      "The barcode databases do not record what this one is packaged in. If it is a bottle or a pouch, assume plastic."));
    return box;
  }

  box.appendChild(el("p", null, headline.text));
  for (const m of scan.packaging) {
    const row = el("div", "pkg");
    row.appendChild(el("span", `pkg-chip ${m.concern}`, m.label));
    row.appendChild(el("span", "pkg-why", m.why));
    box.appendChild(row);
  }

  const withArticle = scan.packaging.find((m) => m.article);
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
export function unknown(root, { scan, query, onRequest, onOpen, onSearch }) {
  const name = (scan && (scan.brandName || scan.title)) || query || "";

  const empty = el("div", "empty");
  empty.appendChild(el("div", "empty-mark", "🔍"));
  empty.appendChild(el("h2", null, name ? `We have not researched ${name}` : "No match yet"));
  empty.appendChild(el("p", null, scan
    ? "It is not in our database. Here is what the barcode still tells us."
    : "Nothing in our database matches that. Try the brand name on its own."));
  root.appendChild(empty);

  if (scan) root.appendChild(packagingCard(scan, onOpen));

  if (name) {
    const box = el("div", "card");
    box.appendChild(el("h2", null, "Put it in the queue"));
    box.appendChild(el("p", null,
      `We research brands people ask for. Add your email and we will tell you when ${name} is done.`));
    const input = el("input");
    input.type = "email";
    input.placeholder = "you@example.com";
    input.className = "req-email";
    input.autocapitalize = "none";
    input.autocomplete = "email";
    box.appendChild(input);
    const btn = el("button", "cta", `Research ${name}`);
    btn.onclick = () => onRequest(name, input.value, btn);
    box.appendChild(btn);
    root.appendChild(box);
  }

  const box = el("div", "search");
  box.appendChild(icon(ICONS.search, 18));
  const input = el("input");
  input.type = "search";
  input.placeholder = "Search our database instead";
  input.value = name || "";
  input.autocapitalize = "none";
  input.oninput = () => onSearch(input.value, results);
  box.appendChild(input);
  root.appendChild(box);
  const results = el("div", "results");
  root.appendChild(results);
  if (name) onSearch(name, results);
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
