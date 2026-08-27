// Keeps the local copy of the brand database fresh, and holds the DOM selector
// config.
//
// Everything here runs on the "storage" permission alone. The data files are
// served with Access-Control-Allow-Origin: *, so fetching them needs no host
// permission, and refresh is driven by staleness rather than a chrome.alarms
// timer so that permission is not needed either. Amazon reshuffles its markup often and a Chrome Web Store review takes
// days, so selectors are fetched from the site rather than frozen into the build:
// a layout change is a file edit on our side, live within the hour.

const SITE = "https://plasticdetox.org";
// All three come from extension/data/ rather than the site root. The copy the
// extension reads then versions with the extension and is not tied to the cache
// lifetime of the file brand-check.html fetches on every page view.
const REMOTE = {
  // Point at the site's own brand-data.json, not the copy under extension/data.
  // The copy exists only as the offline seed inside the package; if the remote
  // read it too, editing the root file without running build-extension.py would
  // leave the extension silently serving stale verdicts with nothing to show
  // that anything was wrong.
  brands: `${SITE}/brand-data.json`,
  asins: `${SITE}/extension/data/asin-map.json`,
  selectors: `${SITE}/extension/data/selectors.json`,
};
const BUNDLED = {
  brands: "data/brand-data.json",
  asins: "data/asin-map.json",
  selectors: "data/selectors.json",
};
export const REFRESH_HOURS = 12;

async function readBundled(key) {
  const res = await fetch(chrome.runtime.getURL(BUNDLED[key]));
  return res.json();
}

// A remote payload only replaces what we hold if it is at least as complete.
// Without this, publishing brand-data.json before the scorecard backfill has
// landed would silently grey out every front on every card.
function reject(key, data, current) {
  const size = Array.isArray(data) ? data.length : Object.keys(data || {}).length;
  if (!size) return "empty payload";
  if (key === "brands") {
    if (!Array.isArray(data)) return "not an array";
    const incoming = data.filter((b) => b && b.fronts).length;
    const held = Array.isArray(current) ? current.filter((b) => b && b.fronts).length : 0;
    if (incoming < held * 0.9) {
      return `scorecard regression, ${incoming} incoming vs ${held} held`;
    }
  }
  if (key === "asins" && current && size < Object.keys(current).length * 0.5) {
    return `asin map shrank, ${size} incoming`;
  }
  return null;
}

async function refresh(key) {
  try {
    const res = await fetch(REMOTE[key], { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const held = (await chrome.storage.local.get(key))[key];
    const bad = reject(key, data, held);
    if (bad) throw new Error(bad);
    await chrome.storage.local.set({ [key]: data, [`${key}_at`]: Date.now() });
    return true;
  } catch (err) {
    console.warn(`[PD] could not refresh ${key}:`, err.message);
    const have = await chrome.storage.local.get(key);
    if (!have[key]) {
      await chrome.storage.local.set({ [key]: await readBundled(key) });
    }
    return false;
  }
}

async function refreshAll() {
  await Promise.all(Object.keys(REMOTE).map(refresh));
}

chrome.runtime.onInstalled.addListener(async () => {
  // Seed instantly from the bundled snapshot so the first Amazon page already
  // works, then pull the current data in the background.
  const seed = {};
  for (const key of Object.keys(BUNDLED)) {
    try { seed[key] = await readBundled(key); } catch (e) { /* keep going */ }
  }
  await chrome.storage.local.set(seed);
  // Off by default. Sending a brand name is not strictly necessary to showing
  // a verdict, so under the August 2026 Chrome Web Store data rules it has to
  // be something the user turns on, not something they turn off.
  await chrome.storage.local.set({ logMisses: false });
  refreshAll();
});

chrome.runtime.onStartup.addListener(refreshAll);

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.type === "refresh") {
    refreshAll().then(() => respond({ ok: true }));
    return true;
  }
  // The content script tells us when its copy has gone stale. Doing it this way
  // rather than on a chrome.alarms timer means no "alarms" permission, and it
  // loses nothing: a refresh only matters just before we render a verdict.
  if (msg?.type === "refreshIfStale") {
    chrome.storage.local.get("brands_at").then(({ brands_at }) => {
      if (!brands_at || Date.now() - brands_at > REFRESH_HOURS * 3600e3) refreshAll();
    });
  }
});
