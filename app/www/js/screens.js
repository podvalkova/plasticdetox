// The screens. Each one is a pure render into a container, given already
// resolved data, so nothing here waits on a network call or knows about the
// camera. Navigation is handled by main.js.

import { FRONTS, STANCE_LABEL, verdictFor, alternativesFor, ratedProducts } from "./match.js";
import { packagingHeadline } from "./upc.js";
import { el, frag, icon, ICONS, splitNote } from "./ui.js";
import { buyLink, productImage } from "./data.js";
import { stepContent, roomName, stage } from "./detox-content.js";

const SITE = "https://plasticdetox.org";
const STATUS_GLYPH = { pass: "✓", caution: "!", fail: "✕", unknown: "?" };

// ------------------------------------------------------------------- home

export function home(root, {
  onScan, onSearch, onPick, onStarter, onAllCategories, onSafari, onDismissSafari,
  onCheck, onProduct, recents, starters, canScan, scanReason, showSafari,
  categoryCount, draft,
}) {
  const hero = el("div", "hero");
  hero.appendChild(el("h1", null, "Check it before you buy it"));
  hero.appendChild(el("p", null,
    "Four checks on every product: what is in it, what it is made of, what it has "
    + "been recalled or sued over, and what independent labs found. Nothing earns a "
    + "recommendation until all four are done."));
  root.appendChild(hero);

  // Brand and product are separate fields, as they are on the site. A single
  // box invited a brand name on its own, and a brand verdict is the least
  // useful answer we hold: half our product verdicts disagree with it.
  const form = el("form", "check-form");
  form.setAttribute("novalidate", "");

  const brand = field("Brand, for example Pampers", (draft && draft.brand) || "");
  const product = field("Product, for example Sensitive Wipes", (draft && draft.product) || "");
  form.appendChild(brand.wrap);

  // Type ahead on the brand only. A brand we already hold should never need
  // the second field filled in to be found.
  //
  // Tapping a suggestion used to jump straight to a verdict, which skipped the
  // product field entirely: you could name the brand and never get asked what
  // you were holding. A brand suggestion now fills the field and moves you on.
  // A suggestion that names a product still goes, because at that point you
  // have said which one.
  //
  // Five, not twenty. The list sits between the two fields, so a long one
  // pushed the product field off the screen, which is the other half of why
  // there appeared to be nowhere to type it.
  const results = el("div", "results");
  brand.input.oninput = () => onSearch(brand.input.value, results, () => ({
    brand: brand.input.value, product: product.input.value,
  }), (hit) => {
    if (hit.product || hit.scan) return false;
    brand.input.value = hit.brand.brand;
    results.replaceChildren();
    showProducts(hit.brand);
    return true;
  }, 5);
  form.appendChild(results);

  // Which one of theirs is it?
  //
  // Typing the product was a guessing game against our own match rules. A+D
  // has one product, "Original diaper rash ointment", and typing "ointment"
  // matched nothing, because a matchAll group needs every word in it. The
  // person then got "no verdict" on a product we hold a full scorecard for.
  //
  // So stop asking them to guess. Once the brand is known, list what we have
  // and let them point at it, with a way out for anything we do not list.
  const picker = el("div", "picker");
  form.appendChild(picker);

  function showProducts(b) {
    picker.replaceChildren();
    const rows = ratedProducts(b);
    if (!rows.length) {
      product.wrap.hidden = false;
      product.input.focus();
      product.wrap.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    product.wrap.hidden = true;
    picker.appendChild(el("div", "section-title", `Which ${b.brand}?`));
    for (const { row: pr, stance } of rows) {
      const line = el("button", "row");
      line.type = "button";
      line.appendChild(el("span", `dot ${stance || "neutral"}`));
      const body = el("div", "row-body");
      body.appendChild(el("div", "row-name", pr.name));
      const hint1 = scopeHint(pr);
      if (hint1 || pr.cat) body.appendChild(el("div", "row-sub", hint1 || pr.cat));
      line.appendChild(body);
      line.appendChild(el("span", "row-chev", "\u203a"));
      line.onclick = () => onProduct(b, pr);
      picker.appendChild(line);
    }
    const other = el("button", "row");
    other.type = "button";
    other.appendChild(el("span", "dot neutral"));
    const ob = el("div", "row-body");
    ob.appendChild(el("div", "row-name", "Something else"));
    ob.appendChild(el("div", "row-sub", "Type the product name"));
    other.appendChild(ob);
    other.appendChild(el("span", "row-chev", "\u203a"));
    other.onclick = () => {
      picker.replaceChildren();
      product.wrap.hidden = false;
      product.input.focus();
      product.wrap.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    picker.appendChild(other);
    picker.scrollIntoView({ block: "center", behavior: "smooth" });
  }

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

  // The Browse list used to live here. It is what the Shop tab is, and having
  // both meant the home screen answered a question the bar already answers.
  // Check is for something in your hand; Shop is for everything else.

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


/**
 * The tab bar. Two jobs, so two tabs, and no more.
 */
export function tabs(current, onTab) {
  const bar = el("div", "tabs");
  for (const [key, label, path] of [
    ["check", "Check", ICONS.check],
    ["shop", "Shop", ICONS.shop],
    ["detox", "Detox", ICONS.detox],
    ["saved", "Saved", ICONS.saved],
    ["learn", "Learn", ICONS.learn],
  ]) {
    const b = el("button", `tab${current === key ? " on" : ""}`);
    b.appendChild(icon(path));
    b.appendChild(el("span", null, label));
    b.onclick = () => onTab(key);
    bar.appendChild(b);
  }
  return bar;
}

// ------------------------------------------------------------------ detox

/**
 * Your home, item by item.
 *
 * The same 23 swaps the plan publishes, but the screen is a picture rather
 * than a list: sources you have cleared are tiles with a check, one tile
 * glows next, and everything further ahead hides behind quiet tiles until
 * you get there. One bar tracks the whole journey and shifts color as you
 * move through it. Counts, never percentages: "3 gone, 20 to go" is language
 * anyone feels.
 */
/**
 * What a picker row covers, when the name alone does not say.
 *
 * A row scoped to a line and carrying no ASIN is not a product you can hold.
 * Pampers offers "Baby Dry Diapers", "Swaddlers" and plain "Diapers", and the
 * third is the answer for every Pampers diaper the first two do not cover.
 * Sitting unlabelled between two specific packs it just reads as a third pack.
 * The scope is recorded on every row; the picker was not reading it.
 */
function scopeHint(row) {
  const scope = (row.ext || {}).scope;
  if (scope === "line" && !((row.asins || []).length)) return "the rest of this range";
  if (scope === "brand") return "the brand as a whole";
  return "";
}

export function detox(root, { phases, done, room, onRoom, onStep, onOpen }) {
  const all = phases.reduce((n, p) => n + p.steps.length, 0);
  const ticked = phases.reduce(
    (n, p) => n + p.steps.filter((s) => done.has(s.id)).length, 0);

  // Which room you are looking at. With no choice made, the one holding the
  // next undone swap, so the screen always opens where the action is.
  let at = Number(room);
  if (!Number.isInteger(at) || at < 0 || at >= phases.length) {
    at = Math.max(0, phases.findIndex((p) => p.steps.some((s) => !done.has(s.id))));
  }
  const phase = phases[at];

  root.appendChild(el("h1", "dx-big",
    ticked ? `${ticked} plastic source${ticked === 1 ? "" : "s"} gone`
      : "Your home, source by source"));

  const st = stage(ticked, all);
  const bar = el("div", "dx-bar");
  const fill = el("div", `dx-fill ${st.key}`);
  fill.style.width = `${all ? Math.max(2, Math.round((ticked / all) * 100)) : 0}%`;
  bar.appendChild(fill);
  root.appendChild(bar);
  const meta = el("div", "dx-meta");
  meta.appendChild(el("span", `dx-stage ${st.key}`, st.label));
  meta.appendChild(el("span", "dx-togo",
    ticked >= all ? `All ${all} cleared` : `${all - ticked} to go`));
  root.appendChild(meta);

  const rooms = el("div", "dx-rooms");
  phases.forEach((p, i) => {
    const dn = p.steps.filter((s) => done.has(s.id)).length;
    const pill = el("button", `dx-room${i === at ? " on" : ""}`,
      i === at ? `${roomName(p)} \u00b7 ${dn}/${p.steps.length}` : roomName(p));
    pill.type = "button";
    pill.onclick = () => onRoom(String(i));
    rooms.appendChild(pill);
  });
  root.appendChild(rooms);

  // Done tiles and the next one are named. Beyond that, at most two quiet
  // tiles stand in for what is coming, and one line carries the rest: there
  // is always a next step on screen, and never a to do list.
  const grid = el("div", "dx-grid");
  let revealed = false;
  let hidden = 0;
  for (const step of phase.steps) {
    const isDone = done.has(step.id);
    if (!isDone && revealed) { hidden += 1; continue; }
    const c = stepContent(step);
    const tile = el("button", `dxt${isDone ? " done" : " next"}`);
    tile.type = "button";
    tile.appendChild(icon(c.icon, 25));
    const label = el("span");
    c.short.split("\n").forEach((line, i) => {
      if (i) label.appendChild(document.createElement("br"));
      label.appendChild(document.createTextNode(line));
    });
    tile.appendChild(label);
    tile.onclick = () => onStep(step.id);
    grid.appendChild(tile);
    if (!isDone) revealed = true;
  }
  for (let i = 0; i < Math.min(hidden, 2); i++) {
    const mys = el("span", "dxt mys");
    if (i === 1) mys.style.opacity = ".55";
    mys.appendChild(el("b", null, "?"));
    grid.appendChild(mys);
  }
  root.appendChild(grid);
  if (hidden > 2) {
    root.appendChild(el("div", "dx-more", `${hidden - 2} more reveal as you go`));
  } else if (!phase.steps.some((s) => !done.has(s.id))) {
    root.appendChild(el("div", "dx-more clear", `${roomName(phase)} clear \u2713`));
  }

  const more = el("div", "card know");
  more.appendChild(el("h2", null, "Expecting, or a baby at home?"));
  more.appendChild(el("p", null,
    "This is the free plan, the same one the site sends out. The Baby Package covers "
    + "the nursery, bottles and feeding, wipes and creams, in the order that matters "
    + "for someone that small."));
  const go = el("button", "cta ghost", "See the Baby Package");
  go.onclick = () => onOpen("https://plasticdetox.org/custom-plan.html?app=1");
  more.appendChild(go);
  root.appendChild(more);
}

/**
 * One source, one screen of value.
 *
 * Why it matters in the plan's own words, the picks the plan names with their
 * notes and links, and the free version where one exists, because the cheapest
 * swap is usually a habit and it counts the same. One button marks it done.
 */
export function detoxStep(root, { phase, step, isDone, onDone, onUndo, onLater, onOpen }) {
  const c = stepContent(step);

  root.appendChild(el("div", "dx-k",
    `${roomName(phase)} \u00b7 ${isDone ? "done \u2713" : "next up"}`));

  const row = el("div", "dx-titrow");
  const medal = el("span", "dx-medal");
  medal.appendChild(icon(c.icon, 26));
  row.appendChild(medal);
  const tw = el("div");
  tw.appendChild(el("div", "dx-title", step.swap));
  if (step.heat) tw.appendChild(el("span", "dx-heat", "Heat driven"));
  row.appendChild(tw);
  root.appendChild(row);

  if (step.why) {
    root.appendChild(el("div", "dx-k", "Why it matters"));
    root.appendChild(el("p", "dx-why", step.why));
  }

  if ((step.picks || []).length) {
    root.appendChild(el("div", "dx-k", "Our picks \u00b7 vetted"));
    for (const pick of step.picks) {
      const p = el("button", "prow dx-pick");
      p.type = "button";
      const body = el("div", "row-body");
      body.appendChild(el("div", "prow-name", pick.name));
      if (pick.note) body.appendChild(el("div", "prow-note", pick.note));
      p.appendChild(body);
      const right = el("div", "dx-pick-right");
      if (pick.label) right.appendChild(el("span", "prow-label", pick.label));
      right.appendChild(el("span", "prow-view", "View \u2192"));
      p.appendChild(right);
      p.onclick = () => onOpen(pick.url);
      root.appendChild(p);
    }
  }

  if (c.free) {
    root.appendChild(el("div", "dx-k free", "Costs nothing \u00b7 counts the same"));
    root.appendChild(el("div", "step-free", c.free));
  }

  const foot = el("div", "dx-foot");
  if (!isDone) {
    const cta = el("button", "cta", "Done, next source");
    cta.onclick = onDone;
    foot.appendChild(cta);
    const later = el("button", "dx-ghost", "Maybe later");
    later.onclick = onLater;
    foot.appendChild(later);
  } else {
    const undo = el("button", "cta ghost", "Mark as not done");
    undo.onclick = onUndo;
    foot.appendChild(undo);
  }
  root.appendChild(foot);
}

// ------------------------------------------------------------------ saved

export function saved(root, { items, index, onProduct, onOpen, onShop }) {
  const hero = el("div", "hero shop-hero");
  hero.appendChild(el("h1", null, "Saved"));
  hero.appendChild(el("p", null, items.length
    ? `${items.length} kept for later.`
    : "Nothing kept yet."));
  root.appendChild(hero);

  if (!items.length) {
    const empty = el("div", "empty");
    empty.appendChild(el("h2", null, "Your list is empty"));
    empty.appendChild(el("p", null,
      "Tap Save on any product and it waits here, so a shop trip is a list rather than a memory test."));
    const go = el("button", "cta", "Browse what we would buy");
    go.onclick = onShop;
    empty.appendChild(go);
    root.appendChild(empty);
    return;
  }

  const grid = el("div", "pgrid");
  for (const s of items) {
    // Resolve back to the live row, so a saved item shows today's verdict
    // rather than the one it had when it was saved.
    const b = index.brands.find((x) => x.id === s.brandId || x.brand === s.brand);
    const row = b && (b.products || []).find((p) => p.name === s.name);
    if (b && row) {
      grid.appendChild(shopCard({ brand: b, row }, { onOpen, onProduct, eager: true }));
      continue;
    }
    const card = el("div", "pcard");
    const body = el("div", "pcard-body");
    body.appendChild(el("div", "pcard-brand", s.brand));
    body.appendChild(el("div", "pcard-name", s.name));
    card.appendChild(body);
    grid.appendChild(card);
  }
  root.appendChild(grid);
}

// ------------------------------------------------------------------ learn

export function learn(root, { articles, onOpen, query, onQuery }) {
  const hero = el("div", "hero shop-hero");
  hero.appendChild(el("h1", null, "Learn"));
  hero.appendChild(el("p", null,
    `${articles.length} guides on what the research actually says.`));
  root.appendChild(hero);

  const box = el("div", "search shop-search");
  const input = el("input");
  input.type = "search";
  input.placeholder = "Search the guides";
  input.value = query || "";
  input.autocomplete = "off";
  input.oninput = () => onQuery(input.value);
  box.appendChild(icon(ICONS.search, 18));
  box.appendChild(input);
  root.appendChild(box);

  const q = (query || "").trim().toLowerCase();
  const list = q.length >= 2
    ? articles.filter((a) => `${a.title} ${a.blurb}`.toLowerCase().includes(q))
    : articles;

  if (!list.length) {
    root.appendChild(el("p", "note", "No guide matches that yet."));
    return;
  }

  list.forEach((a, i) => {
    const card = el("button", "acard");
    card.type = "button";
    if (a.image) {
      const im = el("img");
      im.src = a.image; im.alt = "";
      if (i >= 6) im.loading = "lazy";
      im.onerror = () => im.remove();
      card.appendChild(im);
    }
    const body = el("div", "acard-body");
    body.appendChild(el("div", "acard-title", a.title));
    if (a.blurb) body.appendChild(el("div", "acard-blurb", a.blurb));
    card.appendChild(body);
    // app=1 tells the article the app already has a nav, so it drops the
    // site's own header, footer and newsletter block and reads as one screen
    // rather than as a website we sent you to.
    card.onclick = () => onOpen(`https://plasticdetox.org/articles/${a.slug}?app=1`);
    root.appendChild(card);
  });
}

// ------------------------------------------------------------------- shop

/**
 * Everything we would actually buy, by category.
 *
 * Checking a brand answers a question somebody already has. This answers the
 * one they have before they have a brand in mind, which is most of the time
 * and was the half of the app that did not exist. Only rows we rate good and
 * that have somewhere to buy them: a shelf you cannot buy from is a list.
 */
/** Everything we would buy, gathered once. */
/**
 * Which room you would be standing in.
 *
 * The shop groups by category, which is right once you know what you want and
 * useless when you are working through a house. 39 categories is a wall; five
 * rooms is a decision. Kid specific things go to Kids even when they belong to
 * another room, because a crib mattress is what a parent is shopping for, not
 * bedding, and baby bottles are not really kitchenware.
 *
 * Anything unmapped lands in Other rather than disappearing, so adding a
 * category to the database can never quietly empty it out of the shop.
 */
const ROOM_OF = {
  // Kitchen
  "Food storage": "Kitchen", "Tableware": "Kitchen", "Cutting boards": "Kitchen",
  "Water filters": "Kitchen", "Cookware": "Kitchen", "Sea salt": "Kitchen",
  "Pantry": "Kitchen", "Kitchen appliances": "Kitchen", "Air fryers": "Kitchen",
  "Water bottles": "Kitchen", "Chewing gum": "Kitchen",
  // Bedroom
  "Bedding": "Bedroom", "Air purifiers": "Bedroom",
  // Bathroom
  "Skincare": "Bathroom", "Dental floss": "Bathroom", "Makeup": "Bathroom",
  "Toothbrushes": "Bathroom", "Tampons": "Bathroom", "Menstrual cups": "Bathroom",
  "Reusable cloth pads": "Bathroom", "Period pads": "Bathroom", "Razors": "Bathroom",
  "Conditioner": "Bathroom", "Prenatal vitamins": "Bathroom",
  // Kids
  "Toys": "Kids", "Baby bottles": "Kids", "Baby sleep": "Kids",
  "Pacifiers": "Kids", "Cribs & nursery": "Kids", "Crib mattresses": "Kids",
  "Strollers": "Kids", "Teethers": "Kids", "Diapers": "Kids",
  "Breast milk storage": "Kids", "Diaper cream": "Kids",
  // Other: worn or used everywhere rather than in one room
  "Clothing": "Other", "Vacuums": "Other", "Laundry detergent": "Other",
  "Yoga mats": "Other",
};

export const ROOMS = ["Kitchen", "Bedroom", "Bathroom", "Kids", "Other"];

export function roomFor(cat) {
  return ROOM_OF[cat] || "Other";
}

function shelf(index) {
  const out = [];
  for (const b of index.brands) {
    for (const row of (b.products || [])) {
      if (((row.ext || {}).verdict) !== "good") continue;
      if (!(row.asins || []).length) continue;
      out.push({ brand: b, row, cat: row.cat || b.category || "Other" });
    }
  }
  return out;
}

/** One product, as something you can look at rather than read. */
function shopCard({ brand: b, row }, { onOpen, onProduct, eager = false }) {
  const card = el("button", "pcard");
  card.type = "button";

  const shot = el("div", "pcard-img");
  const src = productImage(row.asins[0], 300);
  if (src) {
    const img = el("img");
    img.src = src;
    img.alt = row.name;
    if (!eager) img.loading = "lazy";
    // A missing photo should look deliberate, not broken.
    img.onerror = () => { shot.replaceChildren(el("span", "pcard-fallback", b.brand)); };
    shot.appendChild(img);
  } else {
    shot.appendChild(el("span", "pcard-fallback", b.brand));
  }
  card.appendChild(shot);

  const body = el("div", "pcard-body");
  body.appendChild(el("div", "pcard-brand", b.brand));
  const label = row.name.toLowerCase().startsWith(b.brand.toLowerCase())
    ? row.name.slice(b.brand.length).trim() || row.name : row.name;
  body.appendChild(el("div", "pcard-name", label));

  const fr = (row.ext || {}).fronts || {};
  const done = FRONTS.filter(([k]) => ["pass", "none"].includes(fr[k])).length;
  const marks = el("div", "pcard-checks");
  for (const [k] of FRONTS) {
    const dot = el("i");
    dot.className = ["pass", "none"].includes(fr[k]) ? "on" : "";
    marks.appendChild(dot);
  }
  marks.appendChild(el("em", null, `${done}/4`));
  body.appendChild(marks);
  card.appendChild(body);

  const buy = el("span", "pcard-buy", "View");
  buy.onclick = (e) => { e.stopPropagation(); onOpen(buyLink(row.asins[0])); };
  card.appendChild(buy);

  card.onclick = () => onProduct(b, row);
  return card;
}

export function shopIndex(root, {
  index, onCategory, onOpen, onProduct, query, onQuery, room, onRoom,
}) {
  const shelfAll = shelf(index);
  // The room narrows the shelf itself, so the count, the categories and the
  // search below all describe the same set of things.
  const all = room ? shelfAll.filter((i) => roomFor(i.cat) === room) : shelfAll;
  const groups = new Map();
  for (const item of all) {
    if (!groups.has(item.cat)) groups.set(item.cat, []);
    groups.get(item.cat).push(item);
  }

  const hero = el("div", "hero shop-hero");
  hero.appendChild(el("h1", null, room || "What we would buy"));
  hero.appendChild(el("p", null,
    `${all.length} product${all.length === 1 ? "" : "s"} that cleared our checks, `
    + `across ${groups.size} categor${groups.size === 1 ? "y" : "ies"}.`));
  root.appendChild(hero);

  // Rooms first. Counted from the shelf rather than hardcoded, so a room that
  // holds nothing says so instead of opening an empty grid.
  const strip = el("div", "strip rooms");
  const roomBtn = (label, value, n) => {
    const b = el("button", "chip" + (room === value ? " on" : ""));
    b.type = "button";
    b.appendChild(el("span", "chip-name", label));
    if (n != null) b.appendChild(el("span", "chip-n", String(n)));
    b.onclick = () => onRoom(room === value ? "" : value);
    return b;
  };
  strip.appendChild(roomBtn("All", "", shelfAll.length));
  for (const r of ROOMS) {
    const n = shelfAll.filter((i) => roomFor(i.cat) === r).length;
    if (n) strip.appendChild(roomBtn(r, r, n));
  }
  root.appendChild(strip);

  // Search across the shelf, not the whole database. Everything here is
  // something we would actually buy, so a hit is always an answer.
  const box = el("div", "search shop-search");
  const input = el("input");
  input.type = "search";
  input.placeholder = "Search these picks";
  input.value = query || "";
  input.autocomplete = "off";
  input.oninput = () => onQuery(input.value);
  box.appendChild(icon(ICONS.search, 18));
  box.appendChild(input);
  root.appendChild(box);

  const q = (query || "").trim().toLowerCase();
  if (q.length >= 2) {
    const hits = all.filter(({ brand: b, row, cat }) =>
      `${b.brand} ${row.name} ${cat}`.toLowerCase().includes(q));
    root.appendChild(el("div", "section-title",
      `${hits.length} match${hits.length === 1 ? "" : "es"}`));
    const grid = el("div", "pgrid");
    hits.forEach((item, i) => grid.appendChild(
      shopCard(item, { onOpen, onProduct, eager: i < 8 })));
    root.appendChild(grid);
    if (!hits.length) {
      root.appendChild(el("p", "note", room
        ? `Nothing in ${room.toLowerCase()} matches that yet.`
        : "Nothing on the shelf matches that yet."));
    }
    return;
  }

  root.appendChild(el("div", "section-title", "By category"));
  const cats = el("div", "cgrid");
  for (const [cat, items] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const tile = el("button", "ctile");
    tile.type = "button";
    const strip = el("div", "ctile-shots");
    for (const it of items.slice(0, 3)) {
      const src = productImage(it.row.asins[0], 150);
      if (!src) continue;
      const im = el("img");
      im.src = src; im.alt = "";
      // Tile thumbnails are 150px and there are three per tile. The whole
      // grid weighs less than one product photo, so none of it is deferred.
      im.onerror = () => im.remove();
      strip.appendChild(im);
    }
    if (strip.childNodes.length) tile.appendChild(strip);
    tile.appendChild(el("div", "ctile-name", cat));
    tile.appendChild(el("div", "ctile-count", `${items.length} pick${items.length === 1 ? "" : "s"}`));
    tile.onclick = () => onCategory(cat);
    cats.appendChild(tile);
  }
  root.appendChild(cats);
}

export function shopCategory(root, { index, category, onProduct, onOpen }) {
  const items = shelf(index).filter((i) => i.cat === category);

  const hero = el("div", "hero shop-hero");
  hero.appendChild(el("h1", null, category));
  hero.appendChild(el("p", null,
    `${items.length} that cleared all the checks we could run.`));
  root.appendChild(hero);

  const grid = el("div", "pgrid");
  items.forEach((item, i) => grid.appendChild(
    shopCard(item, { onOpen, onProduct, eager: i < 8 })));
  root.appendChild(grid);
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
function worthKnowing(ext, fronts, shown = []) {
  if (!ext) return null;
  const k = ext.classEvidence;
  const legal = ((fronts && fronts.legal) || {}).status;
  const legalNote = ext.legalNote || "";
  let body = null;
  if (k && k.detail) body = k.detail + (k.source ? ` (${k.source})` : "");
  else if (["caution", "fail"].includes(legal) && legalNote.length > 90) body = legalNote;
  if (!body) return null;

  // The scorecard above shows the first sentence of a long note. Repeating it
  // verbatim here made the card read as a rendering bug rather than as detail,
  // so this picks up where the row left off. If nothing is left, there was no
  // detail to add and the card does not appear at all.
  for (const seen of shown) {
    const t = String(seen || "").trim();
    if (t.length > 40 && body.startsWith(t)) body = body.slice(t.length).trim();
  }
  if (body.length < 60) return null;
  const box = el("div", "card know");
  box.appendChild(el("h2", null, "Worth knowing"));
  box.appendChild(el("p", null, body));
  return box;
}

export function result(root, { index, match, scan, product, query, productNamed,
  onOpen, onPick, onProduct, onSave, isSaved, onRequest }) {
  const v = verdictFor(match, { title: (scan && scan.title) || query || "", product, productNamed });

  const stanceClass = v.asserted && ["good", "careful", "skip"].includes(v.stance)
    ? ` v-${v.stance}` : "";
  const card = el("div", "verdict" + stanceClass);
  root.classList.add("tinted");
  const head = el("div", "verdict-head");

  if (onSave) {
    const keepName = (v.product && v.product.name) || v.brand.category || v.brand.brand;
    const on = isSaved && isSaved(v.brand.brand, keepName);
    const heart = el("button", `heart${on ? " on" : ""}`);
    heart.type = "button";
    heart.setAttribute("aria-label", on ? "Saved" : "Save");
    heart.appendChild(icon(ICONS.heart, 20));
    heart.onclick = () => onSave(v.brand, v.product || { name: keepName, cat: v.brand.category });
    head.appendChild(heart);
  }

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
  // A front that does not apply is not a check anybody wants to read. A kettle
  // has no ingredient list, and a row saying so is a line of furniture between
  // the reader and the findings that do apply.
  const applies = ([k]) => !(k === "formula" && statusOf(k) === "none");
  const flagged = FRONTS.filter((f) => applies(f) && ["caution", "fail"].includes(statusOf(f[0])));
  const populated = FRONTS.filter((f) => applies(f) && statusOf(f[0]) !== "unknown");
  const positive = v.asserted && v.stance === "good";
  const shown = positive ? populated : (flagged.length ? flagged : populated);
  const unassessed = FRONTS.filter((f) => applies(f) && statusOf(f[0]) === "unknown");

  const printed = [];
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
    const shortNote = full.length > 200 ? full.split(/(?<=\.)\s+/)[0] : full;
    printed.push(shortNote);
    body.appendChild(el("div", "front-note", shortNote));
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
  // Reasons the four fronts have no place for. A brand can be cautioned for
  // going out of business, or for an efficacy claim, and none of formula,
  // materials, legal or testing is where that lives. The site has rendered
  // these as "Worth a caution" since launch, from brand.cautions. The app
  // never read the field, so Andy Pandy showed a CAREFUL badge over an empty
  // "why we flag it" while the website explained itself perfectly.
  // The measurements themselves. A card that says "independent testing found
  // lead" is weaker than one that says 913 ppb arsenic, and we hold 108 of
  // these figures. Nothing rendered them until now.
  const results = ((v.ext || {}).testingResults || []).filter(Boolean);
  if (results.length) {
    const rw = el("div", "lab");
    rw.appendChild(el("div", "fronts-label", "What the lab measured"));
    for (const r of results) {
      const line = el("div", "lab-row");
      const val = r.outcome === "non-detect"
        ? "non detect"
        : (r.value != null ? `${r.value}${r.unit ? " " + r.unit : ""}` : String(r.outcome || ""));
      line.appendChild(el("span", `lab-val ${r.outcome === "non-detect" ? "clean" : "hit"}`, val));
      const b2 = el("div", "row-body");
      b2.appendChild(el("div", "lab-analyte", String(r.analyte || "")));
      const bits = [r.lab, r.year, r.lod ? `LOD ${r.lod}` : ""].filter(Boolean);
      if (bits.length) b2.appendChild(el("div", "lab-src", bits.join(" · ")));
      line.appendChild(b2);
      rw.appendChild(line);
    }
    fronts.appendChild(rw);
  }

  const cautions = ((v.brand || {}).cautions || []).filter(Boolean);
  if (cautions.length) {
    const cw = el("div", "cautions");
    cw.appendChild(el("div", "fronts-label", "Worth a caution"));
    for (const t of cautions) cw.appendChild(el("p", "caution-line", String(t)));
    fronts.appendChild(cw);
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
        const hint2 = scopeHint(row);
        body.appendChild(el("div", "row-sub", hint2
          ? `${STANCE_LABEL[stance] || "Context"} · ${hint2}`
          : (STANCE_LABEL[stance] || "Context")));
        line.appendChild(body);
        line.appendChild(el("span", "row-chev", "›"));
        line.onclick = () => onProduct(row);
        box.appendChild(line);
      }
      root.appendChild(box);
    }
  }

  // Knowing the brand is not knowing the product, and somebody standing in a
  // shop with the thing in their hand is the best possible moment to ask. The
  // unknown screen already offered this; a card that says "no verdict on this
  // product" and then offers nothing was the dead end.
  if (onRequest && !v.asserted) {
    const ask = el("div", "card");
    ask.appendChild(el("h2", null, "Want us to check this one?"));
    ask.appendChild(el("p", null,
      `Leave your email and we will research ${v.brand.brand}`
      + `${v.product && v.product.name ? " " + v.product.name : ""} by hand `
      + "and send you the verdict, usually within 2 business days."));
    const input = el("input");
    input.type = "email";
    input.placeholder = "you@email.com";
    input.autocapitalize = "none";
    input.autocomplete = "email";
    ask.appendChild(input);
    const btn = el("button", "cta ghost", "Request a free check");
    btn.onclick = () => onRequest(
      v.brand.brand, (v.product && v.product.name) || query || "", input.value, btn);
    ask.appendChild(btn);
    root.appendChild(ask);
  }

  const ing = ingredientsCard(v.ext && v.ext.formulaAnswers);
  if (ing) root.appendChild(ing);

  const know = worthKnowing(v.ext, v.fronts, printed);
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

export function about(root, { meta, bundle, onOpen, onSafari }) {
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
  // Which build is actually running.
  //
  // Neither of us could see this, so an update that never landed and an update
  // that landed and reverted looked identical from the outside, and the only
  // evidence was somebody saying the app looked old. Now it says so itself.
  const line = el("p", "pkg-why");
  line.id = "bundle-line";
  line.textContent = "App build: checking…";
  data.appendChild(line);
  Promise.resolve(bundle && bundle()).then((info) => {
    line.textContent = info
      ? `App build ${info.version}${info.builtin ? " (shipped with the app)" : ""}.`
      : "App build: bundled version.";
  }).catch(() => { line.textContent = "App build: bundled version."; });
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
