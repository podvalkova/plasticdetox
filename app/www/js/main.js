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
import { verdictFor, suggestNames, collapse, parseProductLink } from "./match.js";
import { track, setBundle, flush, setContext } from "./track.js";
import * as kids from "./kids.js";
import * as rate from "./rate.js";
import * as share from "./share.js";
import { STANCE_LABEL } from "./match.js";

const WORKER = "https://plasticdetox-quiz-email.plasticdetox.workers.dev";
const RECENTS_KEY = "pd.recents.v1";
const CHECKS_KEY = "pd.checks.v1";

/** Every instant check this phone has paid for, by brand and product. */
function checkKey(brand, product) {
  return `${brand}::${product}`.toLowerCase().replace(/\s+/g, " ").trim();
}

function readChecks() {
  try { return JSON.parse(localStorage.getItem(CHECKS_KEY) || "{}"); } catch { return {}; }
}

// The oldest set of rules whose answers we will still show.
//
// A check is saved on the phone that paid for it, and it used to be saved with
// no idea which rules produced it. So when a rule was fixed, the person who had
// paid for the answer it broke was the one person who kept seeing the broken
// one: Modera's changing pads still read "could not complete" on a phone long
// after the fault was fixed and the server's copy deleted. Raise this whenever
// a worker rule change invalidates answers, and stale ones quietly disappear.
const CHECK_ENGINE_MIN = 6;

function readCheck(brand, product) {
  if (!brand) return null;
  const all = readChecks();
  const hit = all[checkKey(brand, product || "")];
  if (!hit) return null;
  if ((hit.engine || 0) < CHECK_ENGINE_MIN) return null;
  return hit;
}

function saveCheck(brand, product, event) {
  try {
    const all = readChecks();
    all[checkKey(brand, product || "")] = { ...event, at: new Date().toISOString(), brand, product };
    // Twenty is plenty to keep, and keeps the store small.
    const keys = Object.keys(all);
    if (keys.length > 20) {
      keys.sort((a, b) => String(all[a].at || "").localeCompare(String(all[b].at || "")));
      for (const k of keys.slice(0, keys.length - 20)) delete all[k];
    }
    localStorage.setItem(CHECKS_KEY, JSON.stringify(all));
  } catch {
    // A result we cannot store still shows on this screen.
  }
}

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
  // Leaving the screen releases the hold a check result had on re-rendering.
  resultOnScreen = false;
  if (replace) stack.pop();
  stack.push(state);
  // So a crash report says which screen was on screen when it happened.
  setContext({ screen: (state && state.screen) || "" });
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

// How many of the swaps on the board are done.
//
// Not the size of the stored set. A swap's id is its phase title plus its own
// title, so editing either one leaves the old id in storage pointing at a swap
// that no longer exists. Splitting the Groceries room into single decisions
// orphaned two ids that way, and the reward screen, which was reading the raw
// set size, then claimed 6 of 37 while the list behind it showed 4. Count the
// steps that actually exist, which is what every room counter already does.
//
// Orphans are counted out rather than deleted: a step missing because data
// failed to load would otherwise erase real progress permanently.
function countDone(phases, set) {
  return phases.reduce(
    (n, p) => n + p.steps.filter((s) => set.has(s.id)).length, 0);
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
      slug: s.slug || null,
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
    if (step.screen === "article" && step.slug) {
      rebuilt.push({ screen: "article", slug: step.slug });
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

/** The daily tip control, wherever it is shown. */
/** The rooms, plus the paid one when it has been bought. */
function allPhases() {
  const open = data.planPhases();
  const paid = kids.OFFERED ? kids.phaseIfAny() : null;
  return paid ? open.concat([paid]) : open;
}

let kidsPrice = null;
let kidsWeb = null;
// How many paid checks are left. null means we have not asked yet, which is a
// different thing from nought and must not be drawn as one.
let checkBalance = null;

function notifyProps() {
  return {
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
      if (r === "denied") toast("Turn notifications on in Settings");
      else if (r === "unavailable") toast("Not available on this device");
      else toast("Back on, one each morning");
      render();
    },
  };
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
    again.onclick = () => { stack = [{ screen: "detox" }]; render(); };
    box.appendChild(again);
    view.appendChild(box);
  }
}

function draw() {
  const state = stack[stack.length - 1];
  // A guide being read survives a render nothing on it asked for. The data
  // refresh after boot and the kids room loading both redraw the screen, and
  // redrawing a frame throws away the reader's place in it.
  if (state.screen === "article" && state.guide && view.dataset.article === state.slug) {
    backBtn.hidden = stack.length <= 1;
    return;
  }
  delete view.dataset.article;
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
      // A pass is a token with no account behind it, so this is the only place
      // someone who bought checks can see that they have them.
      checks: { hasPass: !!check.getPass(), balance: checkBalance },
      onChecks: () => go({ screen: "about" }),
      // Only offered on a real device: the extension cannot be enabled on a
      // simulator, and on the web there is no extension to enable.
      onScan: startScan,
      onPick: openRecent,
      onLink: resolveLink,
      // Nothing to type on this screen any more, so the fallback for a product
      // with no link and no barcode is the screen that was always the honest
      // answer for one: tell us what it is, free, or spend a check on it now.
      onManual: () => go({ screen: "unknown", scan: null, brand: "", product: "" }),
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
      onArticle: openArticle,
      onShare: share.available() ? shareVerdict : null,
      onPick: openHit,
      onSave: toggleSaved,
      isSaved,
      onRequest: (brand, product, email, btn) =>
        requestResearch({ brand, product }, email, btn),
      // The same two ways out the unknown screen offers. A card that says it
      // has no verdict on this product and offers only a two day wait sends
      // somebody standing in a shop away with nothing.
      hasPass: !!check.getPass(),
      balance: checkBalance,
      checkResult: state.checkResult
        || readCheck((state.match && state.match.brand && state.match.brand.brand) || state.query || "",
                     (state.product && state.product.name) || "")
        || null,
      onCheck: (btn, log, brandName, productName) =>
        runInstantCheck(state, btn, log, brandName, productName),
      onBuy: () => openExternal(check.buyUrl(state.query || "", "")),
      onPaste: promptForPass,
      onProduct: (row) => go({ screen: "result", match: state.match, scan: state.scan, query: state.query, product: row }),
    });
    remember(state, v);
  } else if (state.screen === "unknown") {
    screens.unknown(view, {
      scan: state.scan,
      brand: state.brand || state.query || "",
      product: state.product || "",
      checkResult: state.checkResult
        || readCheck(state.brand || state.query || "", typeof state.product === "string" ? state.product : ""),
      hasPass: !!check.getPass(),
      balance: checkBalance,
      onCheck: (btn, log) => runInstantCheck(state, btn, log),
      // The screen now supplies a name when we could not read one off the
      // barcode, because a request to research "0812154030013" is not a
      // request anybody can action. The code still travels with it so the
      // reviewer can see what was actually scanned.
      // The screen supplies both halves now. The barcode travels with the
      // product name rather than instead of it, so the reviewer can see what
      // was actually scanned without it standing in for a description.
      onRequest: (typedBrand, typedProduct, email, btn) => requestResearch({
        brand: typedBrand || state.brand || state.query || "",
        product: [typedProduct || state.product,
                  state.scan && state.scan.code ? `(scanned ${state.scan.code})` : ""]
                 .filter(Boolean).join(" "),
      }, email, btn),
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
      notify: notifyProps(),
      purchases: {
        available: kids.OFFERED && kids.canBuyInApp(),
        accountName: kids.accountName(),
        onRestore: restorePurchases,
      },
      onFeedback: sendFeedback,
      onRefresh: async (btn) => {
        btn.disabled = true;
        btn.textContent = "Updating";
        const r = await data.refresh({ force: true }).catch(() => null);
        index = data.getIndex();
        groupCache = null;
        toast(r && r.updated ? `Updated: ${r.brands} brands.` : "Could not reach the database just now.");
        render();
      },
      onRate: () => { track("rate_link_opened", {}); openExternal(rate.storeUrl()); },
      checks: {
        hasPass: !!check.getPass(),
        balance: checkBalance,
        onPaste: promptForPass,
        onBuy: () => openExternal(check.buyUrl("", "")),
      },
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
      onRoom: (r, opts) => {
        state.room = r;
        // The screen has already updated itself; this only has to be remembered.
        if (!opts || !opts.quiet) render();
        rememberPlace();
      },
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
      phases: allPhases(),
      done: readDone(),
      seen: readSeen(),
      room: state.room || "",
      onRoom: (r, opts) => {
        state.room = r;
        // The screen has already updated itself; this only has to be remembered.
        if (!opts || !opts.quiet) render();
        rememberPlace();
      },
      onStep: (stepId) => { track("swap_opened", { step: stepId }); go({ screen: "detoxStep", stepId }); },
      onKids: kids.OFFERED ? () => go({ screen: "detoxKids" }) : null,
      onCleared: () => go({ screen: "detoxCleared" }),
      notify: notifyProps(),
    });
  } else if (state.screen === "detoxReward") {
    const phases = allPhases();
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
      ticked: countDone(phases, set), all, cleared, roomLabel, nextStep: next,
      onNext: () => {
        if (!next) return;
        // The Detox screen reads its room from its own entry at the bottom of
        // the stack, not from this one, so crossing into a new room has to
        // update that entry. Without it, backing out of the step lands on the
        // room you were in before rather than the one you are now working.
        track("reward_next", { crossed_room: nextRoom !== at });
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
    const phases = allPhases();
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
    const phases = allPhases();
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
    // Ask StoreKit what it costs here, then redraw with it. Drawn without a
    // price first so the screen is never blank waiting on the App Store.
    if (kidsPrice === null) {
      kidsPrice = "";
      kids.price().then((p) => { if (p && p !== kidsPrice) { kidsPrice = p; render(); } });
    }
    // Asked once per screen, like the price: the answer needs a round trip to
    // StoreKit and the screen must not wait on it.
    if (kidsWeb === null) {
      kidsWeb = "";
      kids.webBuyUrl().then((u) => { if (u && u !== kidsWeb) { kidsWeb = u; render(); } });
    }
    screens.detoxKids(view, {
      price: kidsPrice,
      webBuy: kidsWeb,
      onWebBuy: () => {
        track("kids_buy_web", {});
        openExternal(kidsWeb);
      },
      unlocked: kids.unlocked(),
      canBuyInApp: kids.canBuyInApp(),
      accountName: kids.accountName(),
      onLater: back,
      onBuyApp: async () => {
        track("kids_buy_app", {});
        showBusy(`Talking to ${kids.storeName()}`);
        const r = await kids.buyInApp();
        hideBusy();
        if (r.state === "ok") { track("kids_unlocked", { via: "iap" }); toast("Opened. The room is on your list"); render(); }
        else if (r.state === "cancelled") { /* their choice, say nothing */ }
        else if (r.state === "unavailable") toast("Not available on this device");
        else {
          // Log the store's own words. Without them a failed purchase is
          // unreadable from here: the tap was tracked and the reason was not.
          track("kids_buy_failed", { state: r.state, why: String(r.why || "").slice(0, 120) });
          // Having paid and not received it is a different problem from not
          // having paid, and it has a different fix.
          if (r.state === "store-refused") toast("The App Store would not take that");
          else toast("Paid, but it did not open. Tap Restore purchases");
        }
      },
      onRestore: restorePurchases,
    });
  } else if (state.screen === "detoxStep") {
    // Resolve the step fresh each render, so ticking it re-renders this same
    // screen in its done state rather than a stale copy.
    const phases = allPhases();
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
        track("swap_done", { step: step.id, room: roomName(phase) });
        toggleDone(step.id);
        go({ screen: "detoxReward", stepId: step.id }, { replace: true });
        // A few swaps in is the first moment the app has actually done
        // something for somebody, so it is the moment worth asking on. After
        // the screen has drawn, never over it, and rate.js decides whether
        // this one counts.
        setTimeout(() => {
          rate.maybeAsk(readDone().size)
            .then((asked) => { if (asked) track("rate_prompted", { done: readDone().size }); })
            .catch(() => {});
        }, 1400);
      },
      onUndo: () => toggleDone(step.id),
      onLater: () => { track("swap_later", { step: step.id }); markSeen(step.id); back(); },
      onOpen: openExternal,
      onArticle: openArticle,
      // A pick can be kept without buying it now. Plan picks are not database
      // rows, so they save under the pick's own name with the ASIN off its
      // link, which is what the Saved tab needs to draw the row.
      onSavePick: (pick) => {
        track("pick_saved", { name: pick.name });
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
      onArticle: openArticle,
    });
  } else if (state.screen === "article") {
    const meta = data.allArticles().find((a) => a.slug === state.slug) || { slug: state.slug, title: "" };
    if (!state.guide) {
      loadGuide(state.slug).then((guide) => {
        // Only if this is still the screen on top. Otherwise the reader would
        // draw over whatever replaced it.
        if (stack[stack.length - 1] !== state) return;
        state.guide = guide;
        render();
      }).catch((err) => {
        // A bundle without the guide, or a broken file: the site still has it.
        console.error("guide failed", err);
        if (stack[stack.length - 1] !== state) return;
        back();
        openExternal(`https://plasticdetox.org/articles/${state.slug}?app=1`);
      });
    }
    screens.article(view, {
      meta,
      body: state.guide && state.guide.body,
      css: state.guide && state.guide.css,
      onArticle: openArticle,
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
function runSearch(query, container, getDraft, onHit, limit = 20, suggest = false) {
  clearTimeout(searchTimer);
  // Debounced because a search over 960 brands with their product rows is
  // cheap but not free, and a fast typist would otherwise run it per keystroke.
  searchTimer = setTimeout(() => {
    const hits = index.search(query, limit);
    // A product somebody paid to research belongs in their own search results,
    // whether or not we hold a row for its brand. Salt & Stone was checked,
    // paid for, and then invisible to the field that had just researched it.
    const q = String(query || "").trim().toLowerCase();
    if (q.length >= 2) {
      const seen = new Set(hits.map((h) => (h.brand.brand || "").toLowerCase()));
      for (const c of Object.values(readChecks())) {
        if ((c.engine || 0) < CHECK_ENGINE_MIN) continue;
        const name = String(c.brand || "");
        if (!name || seen.has(name.toLowerCase())) continue;
        if (!`${name} ${c.product || ""}`.toLowerCase().includes(q)) continue;
        // Shaped like any other brand, with the products this phone has
        // checked under it, so the picker renders it without knowing.
        const mine = Object.values(readChecks())
          .filter((x) => (x.engine || 0) >= CHECK_ENGINE_MIN)
          .filter((x) => String(x.brand || "").toLowerCase() === name.toLowerCase());
        hits.push({
          checked: c,
          brand: {
            brand: name, category: "Checked by you",
            products: mine.map((x) => ({
              name: x.product || name, cat: "Checked by you",
              checked: x, ext: { verdict: x.verdict },
            })),
          },
          product: null, score: 950,
        });
        seen.add(name.toLowerCase());
      }
      hits.sort((a, b) => b.score - a.score);
    }
    // What the database answered, before the dictionary is appended. A name we
    // merely know how to spell is not a match, and must not stop a miss being
    // logged: the misses are the research queue.
    const found = hits.length;
    if (suggest && found < limit) {
      const taken = new Set(hits.map((h) => collapse(h.brand.brand)));
      for (const b of index.brands) taken.add(collapse(b.brand));
      for (const name of suggestNames(data.brandDictionary(), query, taken, limit - found)) {
        hits.push({ suggest: name, brand: { brand: name }, score: -1 });
      }
    }
    screens.renderResults(container, hits, (hit) => {
      // The caller may want a suggestion to fill a field rather than answer
      // the question. On the two field form, picking a brand is not the same
      // as saying which product you are holding.
      // The screen gets first refusal, the same as any other suggestion: on the
      // two field form a brand suggestion fills the brand and leaves the
      // product to the person holding it. Jumping straight to the answer here
      // skipped the product field entirely.
      if (onHit && onHit(hit)) return;
      // A dictionary name is not an answer, so there is nowhere to go with it.
      // Only the screen that asked for suggestions knows what to do with one.
      if (hit.suggest) return;
      if (hit.checked) {
        go({ screen: "unknown", brand: hit.checked.brand, product: hit.checked.product || "",
             scan: null, checkResult: hit.checked });
        return;
      }
      const d = getDraft ? getDraft() : null;
      openHit(hit, d ? [d.brand, d.product].filter(Boolean).join(" ") : query);
    });
    // Only a query that found nothing is worth logging: that is the research
    // queue. A query that matched tells us nothing we do not already hold.
    if (query.trim().length >= 3 && !found) logSearch(query, false);
  }, 120);
}

/**
 * A pasted product link, resolved without asking anyone to type.
 *
 * Typing is where the check goes wrong. Somebody types "ointment", A+D's only
 * product is "Original diaper rash ointment", and a full scorecard comes back
 * as no verdict. A link names one thing exactly, and most of what we need is
 * in the address itself, so this costs no request and works with no signal.
 *
 * Where the address carries an ASIN we already hold, this is also the cheapest
 * answer in the app: the verdict comes off the phone, free, with no pass spent
 * and no research run. That is the same key the Chrome extension has always
 * read off an Amazon page; the Check screen simply never offered it.
 */
function resolveLink(raw) {
  const p = parseProductLink(raw);
  if (!p) {
    return { error: "That does not look like a product link. Paste the whole address "
                  + "from the shop, or from the brand's own page." };
  }
  if (p.shortened) {
    return { error: "A short link hides the product. Open it, then paste the address "
                  + "the page actually lands on." };
  }
  // An ASIN we have researched answers straight away, for nothing.
  if (p.asin) {
    const hit = index.fromAsin(p.asin);
    if (hit) {
      const row = (hit.brand.products || []).find((x) => (x.asins || []).includes(p.asin));
      go({ screen: "result", match: { brand: hit.brand, via: "link" },
           product: row || null, productNamed: true,
           query: [hit.brand.brand, (row && row.name) || p.product].filter(Boolean).join(" ") });
      return { navigated: true };
    }
  }
  // The domain names the maker on a brand's own shop, but it spells it the way
  // a domain has to: "ifyoucare.com". Where we know that brand, use our
  // spelling of it, so the field reads "If You Care" and the picker opens.
  let brand = p.brand;
  if (brand) {
    const known = index.fromBrandName(brand);
    if (known) {
      brand = known.brand.brand;
    } else {
      const same = collapse(brand);
      const dict = (data.brandDictionary() || []).find((n) => collapse(n) === same);
      if (dict) brand = dict;
    }
  }
  // A marketplace address names the shop, never the maker, so the brand has to
  // come out of the product line: "Ziploc Storage Bags Quart" opens on Ziploc.
  if (!brand && p.product) {
    const guess = index.fromTitle(p.product);
    if (guess) brand = guess.brand.brand;
  }
  if (!brand && !p.product) {
    return { error: "We could not read a product out of that address. Type the brand "
                  + "and product below instead." };
  }
  // A marketplace slug repeats the maker: "Ziploc Storage Bags Quart" under a
  // brand field that already says Ziploc. The product field asks which one of
  // theirs it is, so the answer is "Storage Bags Quart".
  let product = p.product || "";
  if (brand && product) {
    const lead = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
    const cut = product.replace(lead, "").trim();
    if (cut) product = cut.charAt(0).toUpperCase() + cut.slice(1);
  }
  // Straight on, with nothing to confirm. Reading the address costs nothing and
  // spends no check, so a wrong read shows up on the next screen, before anybody
  // has paid for anything.
  runCheck({ brand: brand || "", product });
  return { navigated: true };
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
  // Half our product verdicts disagree with their own brand, so a brand on its
  // own answers a different question from the one somebody holding a bottle is
  // asking. Both fields, every time.
  if (!product) {
    toast("Which product? A brand on its own is not enough to check.");
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
async function runInstantCheck(state, button, log, brandName, productName) {
  // The unknown screen passes its own two fields in state; the verdict card
  // passes them as arguments, because its state.product is a product row.
  const brand = (brandName || state.brand || state.query || "").toString().trim();
  const product = (productName || (typeof state.product === "string" ? state.product : "")).toString().trim();
  // Both halves, or it is not a request anybody can action. A brand on its own
  // is the weakest thing we hold: our own product verdicts disagree with the
  // brand verdict often enough that "Native" could mean a good stick or a
  // cautioned one. Asking is better than queueing work that cannot be done.
  if (!brand) {
    toast("Which brand? We need that to look it up.");
    return;
  }
  if (!product) {
    toast("Which product? A brand on its own is not enough to research.");
    return;
  }
  button.disabled = true;
  button.textContent = "Checking";
  log.replaceChildren();
  resultOnScreen = true;

  // Four legs run at once and the first can take half a minute, so without
  // this the screen sat still with a disabled button and no sign of work.
  const working = el("div", "check-working");
  working.appendChild(el("span", "check-spinner"));
  const workingText = el("span", null, "Reading the label, the recall record and the lab results");
  working.appendChild(workingText);
  log.appendChild(working);
  const started = Date.now();
  const tick = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    workingText.textContent = s < 12
      ? "Reading the label, the recall record and the lab results"
      : `Still researching, ${s} seconds in. A full check takes about a minute.`;
  }, 1000);

  // A check costs one off the pass, so the number on screen is wrong the moment
  // this finishes unless we ask again.
  const spend = () => { refreshBalance(); };

  await check.run({
    brand,
    product,
    onFront: (step, front) => {
      log.insertBefore(screens.checkRow(step, front, check.STEP_LABEL[step] || "Database"), working);
    },
    onDone: (event) => {
      clearInterval(tick);
      working.remove();
      button.disabled = false;
      button.textContent = "Run the check";
      // Keep the answer where a re-render cannot reach it, so leaving the
      // screen and coming back shows what was paid for rather than a blank.
      if (event.verdict) {
        state.checkResult = event;
        saveCheck(brand, product, event);
        // And into Recently checked, which only ever knew about brands we hold
        // a row for, so a product somebody paid to research left no trace.
        rememberCheck(brand, product, event.verdict);
      }
      spend();
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
      log.appendChild(screens.checkVerdict({ ...event, brand, product }, openExternal));
      button.remove();
    },
  });
}

/** A pass bought on the website, brought back by hand. */
/**
 * How many checks the pass has left.
 *
 * The app could always ask and never did, so somebody who had paid for a
 * hundred checks had no way to know they had used ninety of them, and no way
 * to know the pass had arrived at all beyond it not complaining. Asked on
 * boot, after a pass arrives, and after every check, since every check spends
 * one.
 */
// A check result lives in the screen it was appended to, so anything that
// re-renders mid flow throws it away. The balance refresh did exactly that at
// the moment the verdict landed: the pass was spent, the card rebuilt, and the
// answer was gone. While a result is on screen the balance updates quietly.
let resultOnScreen = false;

async function refreshBalance() {
  if (!check.getPass()) { checkBalance = null; return; }
  const n = await check.balance().catch(() => null);
  if (n !== checkBalance) { checkBalance = n; if (!resultOnScreen) render(); }
}

function promptForPass() {
  const token = window.prompt("Paste your pass link or token");
  if (!token) return;
  // The email sends a link, so accept either the link or the bare token.
  const value = (token.match(/[?&]pass=([^&\s]+)/) || [])[1] || token;
  check.setPass(decodeURIComponent(value.trim()));
  toast("Pass saved.");
  render();
  refreshBalance();
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
    // What a scan actually produced. Nothing recorded this: the success path
    // returned early with no event and the only barcode logging sat on the
    // failure branch, so thirty days of data showed 1634 app opens and not one
    // scan, and "should we drop the scanner" had no evidence either way.
    // `via` separates our own binding from a manufacturer prefix guess, and
    // `level` says whether it reached the exact product or only the brand.
    const v = verdictFor(mapped, {
      title: (mapped.hint && mapped.hint.name) || "",
      asin: (mapped.hint && mapped.hint.asin) || "",
      productNamed: true,
    });
    track("scan_resolved", {
      via: mapped.via,
      level: v.asserted ? v.level : "none",
      stance: v.asserted ? v.stance : "",
    });
    go({ screen: "result", match: mapped, scan: null });
    return;
  }

  showBusy("Looking it up");
  const hit = await lookup(code);
  hideBusy();

  if (!hit) {
    go({ screen: "unknown", scan: { code, packaging: [] }, brand: "", product: "" });
    logSearch(`barcode ${code}`, false);
    track("scan_resolved", { via: "none", level: "none", stance: "" });
    return;
  }

  const match = index.resolve({ brandName: hit.brandName, title: hit.title });
  if (match) {
    const v = verdictFor(match, { title: hit.title || "", productNamed: true });
    track("scan_resolved", {
      via: "lookup",
      level: v.asserted ? v.level : "none",
      stance: v.asserted ? v.stance : "",
    });
    go({ screen: "result", match, scan: hit });
    logSearch(hit.brandName || hit.title, true, match.brand.stance);
  } else {
    // The barcode database splits these the same way we ask people to.
    go({ screen: "unknown", scan: hit, brand: hit.brandName || "", product: hit.title || "" });
    logSearch(hit.brandName || hit.title, false);
    track("scan_resolved", { via: "lookup", level: "none", stance: "" });
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
  // A checked product reopens onto the answer that was paid for, even where we
  // hold no brand row at all, which is the usual case for one of these.
  if (entry && String(entry.id || "").startsWith("check:")) {
    const saved = readCheck(entry.name, entry.sub);
    const brand = index.brands.find((b) => b.brand.toLowerCase() === String(entry.name).toLowerCase());
    if (brand) {
      go({ screen: "result", match: { brand, via: "recent" }, scan: null,
           query: `${entry.name} ${entry.sub || ""}`.trim(), checkResult: saved });
      return;
    }
    go({ screen: "unknown", brand: entry.name, product: entry.sub || "", scan: null, checkResult: saved });
    return;
  }
  const brand = index.brands.find((b) => b.id === entry.id);
  if (brand) go({ screen: "result", match: { brand, via: "recent" }, scan: null });
}

/** A checked product in the recents strip, with the verdict it came back with. */
function rememberCheck(brand, product, verdict) {
  const entry = { id: "check:" + checkKey(brand, product), name: brand, sub: product,
                  stance: verdict === "unrated" ? "neutral" : verdict };
  const list = readRecents().filter((r) => r.id !== entry.id);
  list.unshift(entry);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 20))); } catch {}
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

// ----------------------------------------------------------------- guides

// The guides ship in the bundle, one file each, and load on first open. Held
// once loaded so going back and forth costs nothing, and the site's stylesheet
// is fetched once for all of them.
const guides = new Map();
let guideCss = null;

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
}

function loadGuide(slug) {
  if (!guides.has(slug)) {
    const p = Promise.all([
      guideCss ? Promise.resolve(guideCss) : fetchText("./data/article.css"),
      fetchText(`./data/articles/${encodeURIComponent(slug)}`),
    ]).then(([css, body]) => { guideCss = css; return { css, body }; });
    p.catch(() => guides.delete(slug));
    guides.set(slug, p);
  }
  return guides.get(slug);
}

/** A guide as a screen, or on the site when this bundle does not hold it. */
function openArticle(slug) {
  const clean = String(slug || "").replace(/^.*\//, "");
  if (!data.allArticles().some((a) => a.slug === clean)) {
    openExternal(`https://plasticdetox.org/articles/${clean}?app=1`);
    return;
  }
  track("guide_opened", { slug: clean });
  go({ screen: "article", slug: clean });
}

// ---------------------------------------------------------------- share

/**
 * Pass a verdict on, with the link to the same verdict on the site so the
 * person receiving it can read the reasoning without installing anything.
 */
async function shareVerdict(v) {
  const name = v.product ? `${v.brand.brand} ${v.product.name}` : v.brand.brand;
  const label = STANCE_LABEL[v.stance] || "Checked";
  const line = `${name}: ${label}. Checked on the formula, the materials, recalls and independent lab tests.`;
  track("share_opened", { stance: v.stance });
  const how = await share.verdict({ name, line, url: share.brandUrl(v.brand.brand), card: v });
  if (how === "failed") toast("Could not open the share sheet");
}

// ------------------------------------------------------------- feedback

/**
 * Whatever they want to say, with the two facts we would otherwise have to ask
 * for: which build it happened on and which phone. A mail draft rather than a
 * form, the same as the correction card on a verdict, so it cannot fail
 * silently and they keep a copy of what they sent.
 */
async function sendFeedback() {
  const cap = window.Capacitor;
  const platform = (cap && cap.getPlatform && cap.getPlatform()) || "web";
  const info = await currentBundle().catch(() => null);
  const build = info ? `${info.version}${info.builtin ? " (shipped with the app)" : ""}` : "unknown";
  track("feedback_opened", { platform });
  const body = ["", "", "---", `App build ${build}`, `Platform ${platform}`].join("\n");
  openExternal("mailto:hello@plasticdetox.org"
    + `?subject=${encodeURIComponent("App feedback")}`
    + `&body=${encodeURIComponent(body)}`);
}

// -------------------------------------------------------------- restore

/**
 * Restore the kids room from the store account. Offered in two places, the
 * Kids room while it is locked and the About screen always, so one routine.
 */
async function restorePurchases() {
  showBusy(`Checking with ${kids.storeName()}`);
  const r = await kids.restore();
  hideBusy();
  if (r === "ok") { track("kids_unlocked", { via: "restore" }); toast("Restored"); render(); }
  else if (r === "none") toast(`No purchase found on this ${kids.accountName()}`);
  else toast("Could not check right now");
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
  // plasticdetox://reset?kids=1 puts this phone back to not having bought it.
  //
  // For testing, and deliberately not a button: a purchase is held here as a
  // token, so the only way to see the buy screen again was to delete the app,
  // which also throws away the detox progress. It refunds nothing and takes
  // nothing away permanently, since Restore reads the purchase back from the
  // store account.
  if (params.get("reset")) {
    if (params.get("kids")) { kids.setPass(""); try { localStorage.removeItem("pd.kids.plan.v1"); } catch {} }
    if (params.get("checks")) check.setPass("");
    checkBalance = null;
    toast("Cleared on this phone. Restore brings a purchase back.");
    go({ screen: "detox" });
    return;
  }

  // plasticdetox://kids?kids=... is the kids room bought on the website coming
  // home. Checked before the check pass, since both arrive the same way.
  const kidsPass = params.get("kids");
  if (kidsPass) {
    await kids.claimWeb(kidsPass).catch(() => false);
    track("kids_unlocked", { via: "web" });
    toast("The kids room is open");
    render();
    return;
  }

  const pass = params.get("pass") || params.get("token");
  if (pass) {
    check.setPass(pass);
    toast("Pass saved.");
    render();
    refreshBalance();
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

  // Nothing to tap. Provisional authorisation is already granted by the time
  // this runs, so the schedule simply gets laid down.
  notify.autoStart().catch(() => {});
  if (kids.unlocked()) kids.load().then(() => render()).catch(() => {});
  refreshBalance();

  // Refreshed after the first screen is up, never before it. A scan in a shop
  // with one bar of signal must not wait on a two megabyte download.
  // Hand the refresh the running build, so a release always brings its
  // verdicts with it rather than waiting for the clock.
  currentBundle().then((info) => {
    setBundle((info && info.version) || "");
    track("app_open", { notify_on: notify.isOn() });
    return data.refresh({ build: (info && info.version) || "" });
  })
    .then((r) => {
    if (r && r.updated) {
      index = data.getIndex();
      groupCache = null;
      if (stack.length === 1) render();
    }
  })
    // Without this, a plugin that cannot answer which bundle is running took
    // the refresh down with it, and the app kept whatever verdicts the cache
    // held, forever.
    .catch(() => data.refresh({ force: true }).then((r) => {
      if (r && r.updated) { index = data.getIndex(); groupCache = null; render(); }
    }).catch(() => {}));

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
