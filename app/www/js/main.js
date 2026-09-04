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

const WORKER = "https://plasticdetox-quiz-email.plasticdetox.workers.dev";
const RECENTS_KEY = "pd.recents.v1";
const SAFARI_KEY = "pd.safari.dismissed.v1";

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

function readDone() {
  try {
    const raw = JSON.parse(localStorage.getItem(DONE_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
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
      rebuilt.push({ screen: step.screen, q: step.q || "" });
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
    again.onclick = () => { stack = [{ screen: "home" }]; render(); };
    box.appendChild(again);
    view.appendChild(box);
  }
}

function draw() {
  const state = stack[stack.length - 1];
  view.replaceChildren();
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
      showSafari: isNative() && localStorage.getItem(SAFARI_KEY) !== "1",
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
      onSafari: () => go({ screen: "safari" }),
      onDismissSafari: () => { localStorage.setItem(SAFARI_KEY, "1"); render(); },
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
  } else if (state.screen === "safari") {
    screens.safari(view, {
      onOpen: openExternal,
      onDone: () => { localStorage.setItem(SAFARI_KEY, "1"); back(); },
    });
  } else if (state.screen === "about") {
    screens.about(view, {
      meta: data.status(),
      bundle: currentBundle,
      onOpen: openExternal,
      onSafari: () => go({ screen: "safari" }),
    });
  } else if (state.screen === "shop") {
    screens.shopIndex(view, {
      index,
      query: state.q || "",
      // Typing filters in place rather than pushing a screen, so the back
      // arrow still means "leave the shop" and not "undo a keystroke".
      onQuery: (q) => { state.q = q; render(); view.querySelector(".shop-search input")?.focus(); },
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
      onToggle: toggleDone,
      onOpen: openExternal,
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
  if (restorePlace()) render();
  else go({ screen: "home" });
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
