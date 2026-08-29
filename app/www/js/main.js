// The controller: boot, navigation, and the three things a person can do.
//
// Scan a barcode, search the database, or read a verdict. Everything else is
// in service of one of those.

import * as data from "./data.js";
import * as scanner from "./scan.js";
import * as screens from "./screens.js";
import { lookup, cleanCode } from "./upc.js";
import { el, toast } from "./ui.js";

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

// ------------------------------------------------------------- navigation

function go(state, { replace = false } = {}) {
  if (replace) stack.pop();
  stack.push(state);
  render();
}

function back() {
  if (stack.length <= 1) return;
  stack.pop();
  render();
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
      recents: readRecents(),
      starters: STARTERS,
      onScan: startScan,
      onSearch: runSearch,
      onPick: openRecent,
      onStarter: (s) => go({ screen: "category", category: s.category, label: s.label }),
    });
  } else if (state.screen === "result") {
    const v = screens.result(view, {
      index,
      match: state.match,
      scan: state.scan,
      product: state.product,
      onOpen: openExternal,
      onPick: openHit,
      onProduct: (row) => go({ screen: "result", match: state.match, scan: state.scan, product: row }),
    });
    remember(state, v);
  } else if (state.screen === "unknown") {
    screens.unknown(view, {
      scan: state.scan,
      query: state.query,
      onRequest: requestResearch,
      onOpen: openExternal,
      onSearch: runSearch,
    });
  } else if (state.screen === "category") {
    screens.category(view, {
      label: state.label,
      brands: index.brands.filter((b) => b.category === state.category && b.reviewed !== false),
      onPick: openHit,
    });
  } else if (state.screen === "about") {
    screens.about(view, { meta: data.status(), onOpen: openExternal });
  }
}

backBtn.onclick = back;
infoBtn.onclick = () => go({ screen: "about" });

// ----------------------------------------------------------------- search

let searchTimer = null;
function runSearch(query, container) {
  clearTimeout(searchTimer);
  // Debounced because a search over 960 brands with their product rows is
  // cheap but not free, and a fast typist would otherwise run it per keystroke.
  searchTimer = setTimeout(() => {
    const hits = index.search(query, 20);
    screens.renderResults(container, hits, openHit);
    // Only a query that found nothing is worth logging: that is the research
    // queue. A query that matched tells us nothing we do not already hold.
    if (query.trim().length >= 3 && !hits.length) logSearch(query, false);
  }, 120);
}

function openHit(hit) {
  const match = hit.brand ? { brand: hit.brand, via: "search" } : hit.match;
  if (!match) return;
  go({
    screen: "result",
    match,
    scan: hit.scan || null,
    title: hit.product ? hit.product.name : "",
  });
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
    go({ screen: "unknown", scan: { code, packaging: [] }, query: "" });
    logSearch(`barcode ${code}`, false);
    return;
  }

  const match = index.resolve({ brandName: hit.brandName, title: hit.title });
  if (match) {
    go({ screen: "result", match, scan: hit });
    logSearch(hit.brandName || hit.title, true, match.brand.stance);
  } else {
    go({ screen: "unknown", scan: hit, query: hit.brandName || hit.title });
    logSearch(hit.brandName || hit.title, false);
  }
}

// ---------------------------------------------------------------- requests

async function requestResearch(brand, email, button) {
  const clean = (email || "").trim();
  if (!clean.includes("@")) {
    toast("An email address, so we can tell you when it is done.");
    return;
  }
  button.disabled = true;
  button.textContent = "Sending";
  try {
    const res = await fetch(`${WORKER}/brand-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, email: clean }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.ok) {
      button.textContent = "On the list";
      toast(`${brand} is in the queue.`);
    } else {
      button.disabled = false;
      button.textContent = `Research ${brand}`;
      toast("That did not send. Try again in a moment.");
    }
  } catch {
    button.disabled = false;
    button.textContent = `Research ${brand}`;
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
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]").slice(0, 8);
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
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 8)));
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
  index = await data.load();
  canScan = await scanner.available();
  boot.classList.add("gone");
  setTimeout(() => boot.remove(), 300);
  go({ screen: "home" });
  openDeepLink(location.search).catch((err) => console.error("deep link failed", err));

  // Refreshed after the first screen is up, never before it. A scan in a shop
  // with one bar of signal must not wait on a two megabyte download.
  data.refresh().then((r) => {
    if (r && r.updated) {
      index = data.getIndex();
      if (stack.length === 1) render();
    }
  });

  await liveUpdates();

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
async function liveUpdates() {
  const cap = window.Capacitor;
  const updater = cap && cap.Plugins && cap.Plugins.CapacitorUpdater;
  if (!updater) return;
  try {
    // Tells the plugin this bundle booted without crashing. Without it the
    // next launch rolls back to the last known good one, which is the whole
    // safety net that makes shipping without review acceptable.
    await updater.notifyAppReady();
  } catch {
    // Without the plugin the bundled version simply keeps running.
  }
}

start().catch((err) => {
  console.error("boot failed", err);
  if (document.body.contains(boot)) {
    boot.classList.remove("gone");
    boot.replaceChildren(el("p", null, "The database did not load. Close the app and open it again."));
  }
});
