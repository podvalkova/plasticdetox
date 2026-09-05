// The controller: boot, navigation, and the three things a person can do.
//
// Scan a barcode, search the database, or read a verdict. Everything else is
// in service of one of those.

import * as data from "./data.js";
import * as scanner from "./scan.js";
import * as screens from "./screens.js";
import * as check from "./check.js";
import { lookup, cleanCode } from "./upc.js";
import { el, toast } from "./ui.js";
import { roomName } from "./detox-content.js";
import * as notify from "./notify.js";

const WORKER = "https://plasticdetox-quiz-email.plasticdetox.workers.dev";
const RECENTS_KEY = "pd.recents.v1";

// The categories people arrive asking about. Kept short on purpose: this is a
// way in for someone who has nothing to scan yet, not a directory.
const STARTERS = [
  { label: "Water filters", sub: "What actually removes PFAS and microplastics", category: "Water filter" },
  { label: "Cookware", sub: "The PFAS question, brand by brand", category: "Cookware" },
  { label: "Food storage", sub: "Glass, lids, and what leaches", category: "Food storage" },
  { label: "Baby bottles", sub: "What goes in a bottle warmer", category: "Baby bottles" },
];

const view = document.getElementById("screen");
const backBtn = document.getElementById("back");
const infoBtn = document.getElementById("info");
const boot = document.getElementById("boot");

let index = null;
let stack = [];
let canScan = false;

/**
 * The categories we hold, with how much is in each.
 *
 * Computed once and cached, because it walks every brand and the home screen
 * asks for the count on every render.
 */
let groupCache = null;
function categoryGroups() {
  if (groupCache) return groupCache;
  const map = new Map();
  for (const b of index.brands) {
    if (!b.category || b.reviewed === false) continue;
    const g = map.get(b.category) || { category: b.category, count: 0, good: 0 };
    g.count += 1;
    if (b.stance === "good") g.good += 1;
    map.set(b.category, g);
  }
  groupCache = [...map.values()].sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return groupCache;
}

function isNative() {
  const cap = window.Capacitor;
  return !!(cap && cap.isNativePlatform && cap.isNativePlatform());
}

// ------------------------------------------------------------- navigation

/** The room the Detox screen is showing, which lives on its own stack entry. */
function setRootRoom(room) {
  const root = stack.find((st) => st.screen === "detox");
  if (root) root.room = room;
}

function go(state, { replace = false } = {}) {
  if (replace) stack.pop();
  stack.push(state);
  render();
  rememberPlace();
}

function back() {
  if (stack.length <= 1) return;
  stack.pop();
  render();
  rememberPlace();
}

/**
 * Where you were, so a reload does not send you home.
 *
 * The webview restarts for reasons that have nothing to do with you: iOS
 * reclaims memory from a backgrounded app, and the updater reloads when it
 * swaps a bundle in. Either way the stack lives in memory and you land back on
 * the home screen, which reads as the app forgetting what you were doing.
 *
 * Only enough to find the place again: a screen, a brand id, a product name.
 * Nothing here is a copy of the data, so a restored screen is rebuilt from
 * today's verdicts rather than from whatever was true when you left.
 *
 * localStorage, not sessionStorage. iOS discards session storage along with
 * the webview it belonged to, which is the exact event this exists to survive:
 * the first version of this looked right in a browser reload and did nothing
 * at all on a phone. The half hour expiry below is what scopes it to a visit.
 */
const PLACE_KEY = "pd.place.v1";
const DONE_KEY = "pd.plan.v1";

// One time reset when a redesign first runs.
//
// This has now happened twice for the same reason: ticks left over from
// testing survive into a new design, which then opens on "4 of 23" for someone
// who cleared nothing. The ring makes it louder than the old tiles did, since
// the number is the first thing on the screen. Bumped per redesign, so each
// one starts at zero once and never again.
const RESET_KEY = "pd.plan.reset.v2";
try {
  if (!localStorage.getItem(RESET_KEY)) {
    localStorage.removeItem(DONE_KEY);
    localStorage.setItem(RESET_KEY, "1");
  }
} catch {
  // Unreadable storage is not worth a crash.
}

function readDone() {
  try {
    const raw = JSON.parse(localStorage.getItem(DONE_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

// Swaps someone opened and set aside with "Maybe later". They stay on the
// board in grey rather than blocking the path: skipping a step reveals the
// next one, and a grey tile can be finished any time.
const SEEN_KEY = "pd.plan.seen.v1";
function readSeen() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}
function markSeen(id) {
  const set = readSeen();
  if (set.has(id)) return;
  set.add(id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
  } catch {
    // A full store is not worth a crash.
  }
}

function toggleDone(id) {
  const set = readDone();
  if (set.has(id)) set.delete(id);
  else set.add(id);
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...set]));
  } catch {
    // A full store is not worth a crash.
  }
  render();
}

function rememberPlace() {
  try {
    const trail = stack.map((s) => ({
      screen: s.screen,
      brandId: (s.match && s.match.brand && s.match.brand.id) || null,
      product: (s.product && s.product.name) || null,
      category: s.category || null,
      label: s.label || null,
      query: s.query || null,
      q: s.q || null,
      room: s.room || null,
    })).slice(-4);
    localStorage.setItem(PLACE_KEY, JSON.stringify({ trail, at: Date.now() }));
  } catch {
    // A full or unavailable store is not worth a crash.
  }
}

function restorePlace() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PLACE_KEY) || "null");
  } catch {
    return false;
  }
  if (!saved || !Array.isArray(saved.trail) || !saved.trail.length) return false;
  // Half an hour later this is a new visit, not the same one interrupted.
  if (Date.now() - (saved.at || 0) > 30 * 60 * 1000) return false;

  const rebuilt = [];
  for (const step of saved.trail) {
    if (["home", "shop", "detox", "saved", "learn", "categories"].includes(step.screen)) {
      rebuilt.push({ screen: step.screen, q: step.q || "", room: step.room || "" });
      continue;
    }
    if (step.screen === "shopCategory" && step.category) {
      rebuilt.push({ screen: "shopCategory", category: step.category });
      continue;
    }
    if (step.screen === "result" && step.brandId) {
      const brand = index.brands.find((b) => b.id === step.brandId);
      if (!brand) return rebuilt.length ? (stack = rebuilt, true) : false;
      const row = step.product
        && (brand.products || []).find((x) => x.name === step.product);
      rebuilt.push({
        screen: "result",
        match: { brand, via: "restored" },
        scan: null,
        product: row || null,
        productNamed: !!row,
        query: step.query || "",
      });
      continue;
    }
    // Anything else, a scan or a paid check in flight, is not worth restoring.
    break;
  }
  if (!rebuilt.length) return false;
  stack = rebuilt;
  return true;
}

// A phone spends most of its life with the app in the background, so the day
// can turn over while nothing is drawing. Without this the tip stays on
// yesterday's until you happen to navigate, which looks like a tip that never
// changes rather than one that changes at midnight.
let drawnOn = data.dayOfYear();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const today = data.dayOfYear();
  // Top the schedule up on every return, so the window never runs dry and a
  // day that turned over while the app was closed still has its tip queued.
  notify.reschedule();
  if (today === drawnOn) return;
  drawnOn = today;
  render();
});

function render() {
  try {
    draw();
  } catch (err) {
    // A screen that throws used to disappear into the boot handler and leave a
    // blank page with no clue why. Now it says so, on the screen, every time.
    console.error("render failed", err);
    view.replaceChildren();
    const box = el("div", "empty");
    box.appendChild(el("div", "empty-mark", "⚠️"));
    box.appendChild(el("h2", null, "That screen did not load"));
    box.appendChild(el("p", null, String((err && err.message) || err)));
    const again = el("button", "cta ghost", "Back to the start");
    again.onclick = () => { stack = [{ screen: "detox" }]; render(); };
    box.appendChild(again);
    view.appendChild(box);
  }
}

function draw() {
  const state = stack[stack.length - 1];
  view.replaceChildren();
  // replaceChildren empties the children and leaves the classes, so a screen
  // that tints itself or pins a footer was handing that on to the next one.
  view.className = "screen";
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  backBtn.hidden = stack.length <= 1;

  if (state.screen === "home") {
    screens.home(view, {
      canScan,
      scanReason: scanner.unavailableReason(),
      recents: readRecents(),
      starters: STARTERS,
      categoryCount: categoryGroups().length,
      // Only offered on a real device: the extension cannot be enabled on a
      // simulator, and on the web there is no extension to enable.
      onScan: startScan,
      onSearch: runSearch,
      onPick: openRecent,
      draft: state.draft,
      onCheck: runCheck,
      // A row chosen from the brand's own list needs no matching at all: the
      // person pointed at it. This is the path that used to depend on typing
      // words our matchAll happened to agree with.
      onProduct: (b, row) => go({
        screen: "result",
        match: { brand: b, via: "picked" },
        scan: null,
        product: row,
        productNamed: true,
        query: `${b.brand} ${row.name}`,
      }),
      onStarter: (s) => go({ screen: "category", category: s.category, label: s.label }),
      onAllCategories: () => go({ screen: "categories" }),
    });
  } else if (state.screen === "result") {
    const v = screens.result(view, {
      index,
      match: state.match,
      scan: state.scan,
      product: state.product,
      query: state.query,
      productNamed: !!(state.scan || state.productNamed),
      onOpen: openExternal,
      onPick: openHit,
      onSave: toggleSaved,
      isSaved,
      onRequest: (brand, product, email, btn) =>
        requestResearch({ brand, product }, email, btn),
      onProduct: (row) => go({ screen: "result", match: state.match, scan: state.scan, query: state.query, product: row }),
    });
    remember(state, v);
  } else if (state.screen === "unknown") {
    screens.unknown(view, {
      scan: state.scan,
      brand: state.brand || state.query || "",
      product: state.product || "",
      hasPass: !!check.getPass(),
      onCheck: (btn, log) => runInstantCheck(state, btn, log),
      onRequest: (email, btn) => requestResearch(state, email, btn),
      onBuy: () => openExternal(check.buyUrl(state.brand || state.query, state.product)),
      onPaste: promptForPass,
      onOpen: openExternal,
      onSearch: runSearch,
    });
  } else if (state.screen === "category") {
    screens.category(view, {
      label: state.label,
      brands: index.brands.filter((b) => b.category === state.category && b.reviewed !== false),
      onPick: openHit,
    });
  } else if (state.screen === "categories") {
    screens.categoryIndex(view, {
      groups: categoryGroups(),
      onPick: (g) => go({ screen: "category", category: g.category, label: g.category }),
    });
  } else if (state.screen === "about") {
    screens.about(view, {
      meta: data.status(),
      bundle: currentBundle,
      onOpen: openExternal,
    });
  } else if (state.screen === "shop") {
    screens.shopIndex(view, {
      index,
      query: state.q || "",
      room: state.room || "",
      // Typing filters in place rather than pushing a screen, so the back
      // arrow still means "leave the shop" and not "undo a keystroke".
      onQuery: (q) => {
        state.q = q; render(); rememberPlace();
        view.querySelector(".shop-search input")?.focus();
      },
      // Same for the room: it narrows this screen rather than becoming one, so
      // back leaves the shop instead of stepping through filters.
      onRoom: (r) => { state.room = r; render(); rememberPlace(); },
      onCategory: (category) => go({ screen: "shopCategory", category }),
      onOpen: openExternal,
      onProduct: (b, row) => go({
        screen: "result", match: { brand: b, via: "picked" }, scan: null,
        product: row, productNamed: true, query: `${b.brand} ${row.name}`,
      }),
    });
  } else if (state.screen === "saved") {
    screens.saved(view, {
      items: readSaved(),
      index,
      onOpen: openExternal,
      onShop: () => { stack = [{ screen: "shop" }]; render(); },
      onProduct: (b, row) => go({
        screen: "result", match: { brand: b, via: "picked" }, scan: null,
        product: row, productNamed: true, query: `${b.brand} ${row.name}`,
      }),
    });
  } else if (state.screen === "detox") {
    screens.detox(view, {
      phases: data.planPhases(),
      done: readDone(),
      seen: readSeen(),
      room: state.room || "",
      onRoom: (r) => { state.room = r; render(); rememberPlace(); },
      onStep: (stepId) => go({ screen: "detoxStep", stepId }),
      onKids: () => go({ screen: "detoxKids" }),
      onCleared: () => go({ screen: "detoxCleared" }),
      notify: {
        available: notify.available(),
        on: notify.isOn(),
        onToggle: async () => {
          if (notify.isOn()) {
            await notify.turnOff();
            toast("Daily tip off");
            render();
            return;
          }
          const r = await notify.turnOn();
          if (r === "on") {
            const n = await notify.reschedule();
            await notify.sendSample();
            toast(n ? `On. ${n} days scheduled` : "On");
          } else if (r === "denied") {
            toast("Notifications are off in Settings");
          } else {
            toast("Not available on this device");
          }
          render();
        },
      },
    });
  } else if (state.screen === "detoxReward") {
    const phases = data.planPhases();
    const set = readDone();
    const all = phases.reduce((n, p) => n + p.steps.length, 0);
    let cleared = "That source", roomLabel = "", at = -1;
    phases.forEach((ph, i) => {
      const hit = ph.steps.find((s) => s.id === state.stepId);
      if (!hit) return;
      at = i;
      cleared = hit.swap;
      const dn = ph.steps.filter((s) => set.has(s.id)).length;
      roomLabel = `${roomName(ph)} · ${dn} of ${ph.steps.length}`;
    });
    // Next means next in this room. Scanning from the first phase sent someone
    // working through Air and laundry back to the kitchen on every swap, which
    // reads as the app losing your place. Only when a room is clear does the
    // next one open, and the room you land in is the one the screen names.
    const undoneIn = (ph) => ph.steps.find((s) => !set.has(s.id));
    let next = at >= 0 ? undoneIn(phases[at]) : null;
    let nextRoom = at;
    if (!next) {
      for (let i = 0; i < phases.length; i++) {
        const hit = undoneIn(phases[i]);
        if (hit) { next = hit; nextRoom = i; break; }
      }
    }
    screens.detoxReward(view, {
      ticked: set.size, all, cleared, roomLabel, nextStep: next,
      onNext: () => {
        if (!next) return;
        // The Detox screen reads its room from its own entry at the bottom of
        // the stack, not from this one, so crossing into a new room has to
        // update that entry. Without it, backing out of the step lands on the
        // room you were in before rather than the one you are now working.
        if (nextRoom >= 0) setRootRoom(String(nextRoom));
        go({ screen: "detoxStep", stepId: next.id }, { replace: true });
      },
      onClose: () => {
        if (at >= 0) setRootRoom(String(at));
        go({ screen: "detox" }, { replace: true });
      },
    });
  } else if (state.screen === "detoxLater") {
    // Everything you tapped "Maybe later" on, and a way straight back into it.
    // Setting a swap aside used to hide it until the rest of the room was done,
    // which is not the same as choosing to come back to it.
    const phases = data.planPhases();
    const set = readDone();
    const seen = readSeen();
    const rows = [];
    for (const ph of phases) {
      for (const st of ph.steps) {
        if (!set.has(st.id) && seen.has(st.id)) {
          rows.push({ id: st.id, title: st.swap, meta: roomName(ph) });
        }
      }
    }
    screens.detoxCleared(view, {
      rows,
      title: "Set aside for now",
      empty: "Nothing set aside. Anything you tap \u201cMaybe later\u201d on waits here.",
      action: "Open",
      onUndo: (id) => go({ screen: "detoxStep", stepId: id }),
      onClose: back,
    });
  } else if (state.screen === "detoxCleared") {
    const phases = data.planPhases();
    const set = readDone();
    const rows = [];
    for (const ph of phases) {
      for (const st of ph.steps) {
        if (set.has(st.id)) rows.push({ id: st.id, title: st.swap, meta: roomName(ph) });
      }
    }
    screens.detoxCleared(view, {
      rows,
      onUndo: (id) => { toggleDone(id); render(); },
      onClose: back,
    });
  } else if (state.screen === "detoxKids") {
    screens.detoxKids(view, { onOpen: openExternal, onLater: back });
  } else if (state.screen === "detoxStep") {
    // Resolve the step fresh each render, so ticking it re-renders this same
    // screen in its done state rather than a stale copy.
    const phases = data.planPhases();
    const phase = phases.find((p) => p.steps.some((s) => s.id === state.stepId));
    const step = phase && phase.steps.find((s) => s.id === state.stepId);
    if (!step) { back(); return; }
    const set = readDone();
    screens.detoxStep(view, {
      phase,
      step,
      isDone: set.has(step.id),
      isSeen: readSeen().has(step.id),
      onDone: () => {
        toggleDone(step.id);
        go({ screen: "detoxReward", stepId: step.id }, { replace: true });
      },
      onUndo: () => toggleDone(step.id),
      onLater: () => { markSeen(step.id); back(); },
      onOpen: openExternal,
      // A pick can be kept without buying it now. Plan picks are not database
      // rows, so they save under the pick's own name with the ASIN off its
      // link, which is what the Saved tab needs to draw the row.
      onSavePick: (pick) => {
        // Resolve the pick to the row we actually hold, so the Saved card shows
        // the real brand, its image and today's verdict. Saving the pick's own
        // name as its brand produced a card with the name twice and no View.
        const asin = (pick.url.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || "";
        const hit = asin && findByAsin(asin);
        if (hit) { toggleSaved(hit.brand, hit.row); return; }
        toggleSaved(
          { brand: pick.name, id: `pick:${asin || pick.name}`, category: roomName(phase) },
          { name: pick.name, cat: roomName(phase), asins: asin ? [asin] : [],
            url: pick.url, ext: {} });
      },
      isPickSaved: (pick) => {
        const asin = (pick.url.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || "";
        const hit = asin && findByAsin(asin);
        return hit ? isSaved(hit.brand.brand, hit.row.name) : isSaved(pick.name, pick.name);
      },
    });
  } else if (state.screen === "learn") {
    screens.learn(view, {
      articles: data.allArticles(),
      query: state.q || "",
      onQuery: (q) => { state.q = q; render(); view.querySelector(".shop-search input")?.focus(); },
      onOpen: openExternal,
    });
  } else if (state.screen === "shopCategory") {
    screens.shopCategory(view, {
      index,
      category: state.category,
      onOpen: openExternal,
      onProduct: (b, row) => go({
        screen: "result",
        match: { brand: b, via: "picked" },
        scan: null,
        product: row,
        productNamed: true,
        query: `${b.brand} ${row.name}`,
      }),
    });
  }

  // The bar belongs to the two roots, not to a screen you drilled into: it is
  // how you switch jobs, and a back arrow is how you come back up.
  const ROOTS = { home: "check", shop: "shop", detox: "detox", saved: "saved", learn: "learn" };
  const onRoot = stack.length === 1 && state.screen in ROOTS;
  document.querySelector(".tabs")?.remove();
  document.body.classList.toggle("has-tabs", onRoot);
  if (onRoot) {
    document.body.appendChild(screens.tabs(ROOTS[state.screen], (tab) => {
      stack = [{ screen: tab === "check" ? "home" : tab }];
      render();
      rememberPlace();
    }));
  }
}

backBtn.onclick = back;
infoBtn.onclick = () => go({ screen: "about" });

// ------------------------------------------------------------------ saved

/**
 * Products someone deliberately kept.
 *
 * Distinct from recents, which is a history and fills itself. This is a list
 * you build, which is what turns a lookup tool into a shopping list. Stored on
 * the device: there are no accounts, and a saved list is not worth inventing
 * one for.
 */
const SAVED_KEY = "pd.saved.v1";

function readSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function savedKey(brandName, name) {
  return `${brandName}\u0000${name}`;
}

function isSaved(brandName, name) {
  return readSaved().some((s) => savedKey(s.brand, s.name) === savedKey(brandName, name));
}

/** The brand and product row holding an ASIN, when we hold one. */
function findByAsin(asin) {
  if (!index) return null;
  for (const b of index.brands) {
    for (const row of (b.products || [])) {
      if ((row.asins || []).includes(asin)) return { brand: b, row };
    }
  }
  return null;
}

function toggleSaved(b, row) {
  const list = readSaved();
  const key = savedKey(b.brand, row.name);
  const at = list.findIndex((s) => savedKey(s.brand, s.name) === key);
  if (at >= 0) {
    list.splice(at, 1);
    toast("Removed");
  } else {
    list.unshift({
      brand: b.brand, brandId: b.id, name: row.name,
      cat: row.cat || b.category || "", asin: (row.asins || [])[0] || "",
      url: row.url || "",
      stance: (row.ext || {}).verdict || "unrated", at: Date.now(),
    });
    toast("Saved");
  }
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    // A full quota is not worth a crash.
  }
  render();
}

// ----------------------------------------------------------------- search

let searchTimer = null;
function runSearch(query, container, getDraft, onHit, limit = 20) {
  clearTimeout(searchTimer);
  // Debounced because a search over 960 brands with their product rows is
  // cheap but not free, and a fast typist would otherwise run it per keystroke.
  searchTimer = setTimeout(() => {
    const hits = index.search(query, limit);
    screens.renderResults(container, hits, (hit) => {
      // The caller may want a suggestion to fill a field rather than answer
      // the question. On the two field form, picking a brand is not the same
      // as saying which product you are holding.
      if (onHit && onHit(hit)) return;
      const d = getDraft ? getDraft() : null;
      openHit(hit, d ? [d.brand, d.product].filter(Boolean).join(" ") : query);
    });
    // Only a query that found nothing is worth logging: that is the research
    // queue. A query that matched tells us nothing we do not already hold.
    if (query.trim().length >= 3 && !hits.length) logSearch(query, false);
  }, 120);
}

function openHit(hit, query) {
  const match = hit.brand ? { brand: hit.brand, via: "search" } : hit.match;
  if (!match) return;
  go({
    screen: "result",
    match,
    scan: hit.scan || null,
    // What they typed is the title. It is the same signal the extension reads
    // off an Amazon listing, and it is what names the product rather than the
    // company, so "Brita Elite" answers about the Elite filter.
    //
    // A row picked from search carries the brand too. Product rows are matched
    // the way a listing reads, brand first, so "Elite and Longlast+ filters"
    // on its own fails the very row it names.
    query: hit.product ? `${match.brand.brand} ${hit.product.name}` : (query || ""),
  });
}

/**
 * The check, run against what we already hold.
 *
 * The brand names the entry and the product names the row inside it, which is
 * the distinction that matters: Brita is a skip and its Elite filter is a
 * careful. Anything we cannot answer falls through to the screen that offers
 * an automated check or a person.
 */
function runCheck({ brand, product }) {
  if (!brand) {
    toast("Name the brand first.");
    return;
  }
  const title = [brand, product].filter(Boolean).join(" ").trim();
  const match = index.resolve({ brandName: brand, title });
  if (match) {
    go({ screen: "result", match, scan: null, query: title, productNamed: !!product });
    logSearch(title, true, match.brand.stance);
  } else {
    go({ screen: "unknown", scan: null, brand, product });
    logSearch(title, false);
  }
}

/**
 * The automated check, streamed.
 *
 * Each front is rendered as it lands rather than after all four, because the
 * whole thing takes about a minute and watching it work is most of what makes
 * that minute bearable.
 */
async function runInstantCheck(state, button, log) {
  const brand = state.brand || state.query || "";
  const product = state.product || "";
  button.disabled = true;
  button.textContent = "Checking";
  log.replaceChildren();

  await check.run({
    brand,
    product,
    onFront: (step, front) => {
      log.appendChild(screens.checkRow(step, front, check.STEP_LABEL[step] || "Database"));
    },
    onDone: (event) => {
      button.disabled = false;
      button.textContent = "Run the check";
      if (event.needsCredits) {
        log.appendChild(el("p", "pkg-why", event.error || "No checks left on this pass."));
        button.remove();
        const buy = el("button", "cta", "Get more checks");
        buy.onclick = () => openExternal(check.buyUrl(brand, product));
        log.parentNode.appendChild(buy);
        return;
      }
      if (event.error) {
        log.appendChild(el("p", "pkg-why", event.error));
        return;
      }
      log.appendChild(screens.checkVerdict(event));
      button.remove();
    },
  });
}

/** A pass bought on the website, brought back by hand. */
function promptForPass() {
  const token = window.prompt("Paste your pass link or token");
  if (!token) return;
  // The email sends a link, so accept either the link or the bare token.
  const value = (token.match(/[?&]pass=([^&\s]+)/) || [])[1] || token;
  check.setPass(decodeURIComponent(value.trim()));
  toast("Pass saved.");
  render();
}

// ------------------------------------------------------------------- scan

async function startScan() {
  let code;
  try {
    if (!(await scanner.permit())) {
      toast("Camera access is off. Turn it on in Settings.");
      return;
    }
    code = await scanner.scan();
  } catch (err) {
    toast("The camera could not start.");
    return;
  }
  if (!code) return;
  await resolveCode(code);
}

/**
 * A barcode, end to end.
 *
 * Our own mappings answer first and instantly. Failing that we ask the open
 * databases for a brand name, then run the same matcher the extension runs on
 * an Amazon listing. A code nothing recognises is still worth a screen.
 */
async function resolveCode(rawCode) {
  const code = cleanCode(rawCode);
  if (!code) {
    toast("That is not a product barcode.");
    return;
  }

  const mapped = index.fromBarcode(code);
  if (mapped) {
    go({ screen: "result", match: mapped, scan: null });
    return;
  }

  showBusy("Looking it up");
  const hit = await lookup(code);
  hideBusy();

  if (!hit) {
    go({ screen: "unknown", scan: { code, packaging: [] }, brand: "", product: "" });
    logSearch(`barcode ${code}`, false);
    return;
  }

  const match = index.resolve({ brandName: hit.brandName, title: hit.title });
  if (match) {
    go({ screen: "result", match, scan: hit });
    logSearch(hit.brandName || hit.title, true, match.brand.stance);
  } else {
    // The barcode database splits these the same way we ask people to.
    go({ screen: "unknown", scan: hit, brand: hit.brandName || "", product: hit.title || "" });
    logSearch(hit.brandName || hit.title, false);
  }
}

// ---------------------------------------------------------------- requests

async function requestResearch(state, email, button) {
  const clean = (email || "").trim();
  if (!clean.includes("@")) {
    toast("An email address, so we can tell you when it is done.");
    return;
  }
  const brand = state.brand || state.query || "";
  const product = state.product || "";
  button.disabled = true;
  button.textContent = "Sending";
  try {
    const ok = await check.requestReview({ brand, product, email: clean });
    if (ok) {
      button.textContent = "Requested";
      toast("In the queue. We will email you within 2 business days.");
    } else {
      button.disabled = false;
      button.textContent = "Request free review";
      toast("That did not send. Try again in a moment.");
    }
  } catch {
    button.disabled = false;
    button.textContent = "Request free review";
    toast("No connection.");
  }
}

/** Fire and forget. A failed log must never be visible to anyone scanning. */
function logSearch(brand, matched, verdict = "") {
  if (!brand) return;
  fetch(`${WORKER}/brand-search-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brand, matched, verdict }),
    keepalive: true,
  }).catch(() => {});
}

// ----------------------------------------------------------------- recents

function readRecents() {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]").slice(0, 20);
  } catch {
    return [];
  }
}

function remember(state, verdict) {
  if (!verdict || !verdict.brand) return;
  const entry = {
    id: verdict.brand.id,
    name: verdict.brand.brand,
    sub: verdict.level === "product" && verdict.product
      ? verdict.product.name
      : verdict.brand.category,
    stance: verdict.reviewed ? verdict.stance : "neutral",
  };
  const list = readRecents().filter((r) => r.id !== entry.id);
  list.unshift(entry);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // Not worth failing a lookup over.
  }
}

/** A recent row carries an id, so it reopens from the live index. */
function openRecent(entry) {
  const brand = index.brands.find((b) => b.id === entry.id);
  if (brand) go({ screen: "result", match: { brand, via: "recent" }, scan: null });
}

// -------------------------------------------------------------- externals

/**
 * Links open in the system browser, not in the app.
 *
 * An in app webview of our own site would be signed out of everything and,
 * where a link is an affiliate link, would attribute the visit to nobody.
 * Safari already has the person's session.
 */
async function openExternal(url) {
  // A mail link is a hand-off to the mail app, not a page to render. The
  // in-app browser shows a blank sheet for one, so it goes to the system.
  if (String(url || "").startsWith("mailto:")) {
    window.location.href = url;
    return;
  }
  const cap = window.Capacitor;
  const browser = cap && cap.Plugins && cap.Plugins.Browser;
  if (browser) {
    try {
      await browser.open({ url, presentationStyle: "popover" });
      return;
    } catch {
      // Falls through to a plain open.
    }
  }
  window.open(url, "_blank", "noopener");
}

// ------------------------------------------------------------- deep links

/**
 * Open straight onto a verdict.
 *
 * `?b=` names a brand and `?code=` names a barcode. This is how every other
 * surface hands a product to the app: the share sheet, a link in an email, and
 * the Safari extension when it wants the full screen answer rather than its
 * own inline one. Home is always underneath, so back goes somewhere sensible.
 */
export async function openDeepLink(search) {
  const params = new URLSearchParams(search || "");

  // plasticdetox://pass?pass=... is how a pass bought on the website reaches
  // the app without anyone copying a token by hand.
  const pass = params.get("pass") || params.get("token");
  if (pass) {
    check.setPass(pass);
    toast("Pass saved.");
    render();
    return;
  }

  const code = params.get("code");
  if (code) return resolveCode(code);

  const brandName = params.get("b");
  if (!brandName) return;
  const match = index.resolve({ brandName, title: brandName });
  if (match) go({ screen: "result", match, scan: null });
  else go({ screen: "unknown", scan: null, query: brandName });
}

// -------------------------------------------------------------------- boot

let busy = null;
function showBusy(text) {
  busy = el("div", "toast", text);
  document.body.appendChild(busy);
}
function hideBusy() {
  if (busy) busy.remove();
  busy = null;
}

async function start() {
  // Started first and not awaited: the ready call must not wait on the data
  // load, and the first paint must not wait on the native bridge.
  //
  // This used to run at the end of start(), after a three megabyte parse and a
  // full first render. Capgo rolls a bundle back when this call does not
  // arrive in time, so a slow cold start looked exactly like a broken bundle
  // and the update kept reverting. Worse, anything throwing above it meant the
  // call never happened at all and the rollback was guaranteed.
  //
  // The bundle has demonstrably booted by the time this line runs: the module
  // loaded and executed. That is what the call is for. Whether the data then
  // loads is a different failure with its own handling below.
  liveUpdates();

  index = await data.load();
  canScan = await scanner.available();
  boot.classList.add("gone");
  setTimeout(() => boot.remove(), 300);
  // Open on Detox, not Check. Check answers a question you already have, which
  // means you arrive at it deliberately; Detox is the thing with something to
  // show someone who opened the app without one. Resuming still wins, so
  // anyone who was mid task lands back where they were.
  if (restorePlace()) render();
  else go({ screen: "detox" });
  openDeepLink(location.search).catch((err) => console.error("deep link failed", err));

  // Refreshed after the first screen is up, never before it. A scan in a shop
  // with one bar of signal must not wait on a two megabyte download.
  // Hand the refresh the running build, so a release always brings its
  // verdicts with it rather than waiting for the clock.
  currentBundle().then((info) => data.refresh({ build: (info && info.version) || "" }))
    .then((r) => {
    if (r && r.updated) {
      index = data.getIndex();
      groupCache = null;
      if (stack.length === 1) render();
    }
  });

  const cap = window.Capacitor;
  const appPlugin = cap && cap.Plugins && cap.Plugins.App;
  if (appPlugin && appPlugin.addListener) {
    appPlugin.addListener("appUrlOpen", ({ url }) => {
      try {
        openDeepLink(new URL(url).search);
      } catch {
        // A URL we cannot parse is not worth a crash.
      }
    });
  }
}

/**
 * Over the air updates for the app itself.
 *
 * The plugin checks a manifest on our own site and swaps the web bundle on the
 * next cold start. Native code cannot change this way, and does not need to:
 * the parts that change are the verdicts, the copy, and the screens.
 */
/** Which web bundle is running, as the updater sees it. */
async function currentBundle() {
  const updater = window.Capacitor
    && window.Capacitor.Plugins
    && window.Capacitor.Plugins.CapacitorUpdater;
  if (!updater || !updater.current) return null;
  try {
    const r = await updater.current();
    const b = (r && r.bundle) || {};
    return { version: b.version || "unknown", builtin: b.id === "builtin" };
  } catch {
    return null;
  }
}

async function liveUpdates() {
  // Tells the plugin this bundle booted. Without it the next launch rolls back
  // to the last known good one, which is the safety net that makes shipping
  // without review acceptable, and which had been firing on good bundles.
  //
  // The plugin is injected by the native bridge, which is not necessarily up
  // when this module runs. Reading it once and giving up when it is absent
  // meant a bundle that booted perfectly could still be reverted, purely
  // because we asked a moment too early. Moving the call earlier in boot,
  // which was the previous fix, made that MORE likely rather than less.
  //
  // So wait for the bridge rather than assume it. Ten seconds of polling
  // covers a cold start on a slow device and costs nothing on the web, where
  // Capacitor never appears and there is nothing to notify.
  // The shell in index.html already does this before any module loads, which
  // is the call that matters. This is the belt to that pair of braces: it
  // costs nothing, and notifying twice is harmless.
  if (window.__pdReady) return;
  for (let i = 0; i < 100; i += 1) {
    const cap = window.Capacitor;
    const updater = cap && cap.Plugins && cap.Plugins.CapacitorUpdater;
    if (updater) {
      try {
        await updater.notifyAppReady();
      } catch {
        // A plugin that refuses is not worth a crash.
      }
      return;
    }
    // Not a native shell at all: nothing will ever inject the plugin.
    if (!cap) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

start().catch((err) => {
  console.error("boot failed", err);
  if (document.body.contains(boot)) {
    boot.classList.remove("gone");
    boot.replaceChildren(el("p", null, "The database did not load. Close the app and open it again."));
  }
});
