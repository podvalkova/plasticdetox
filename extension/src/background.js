// Keeps the local copy of the brand database fresh, and holds the DOM selector
// config. Amazon reshuffles its markup often and a Chrome Web Store review takes
// days, so selectors are fetched from the site rather than frozen into the build:
// a layout change is a file edit on our side, live within the hour.

const SITE = "https://plasticdetox.org";
const REMOTE = {
  brands: `${SITE}/brand-data.json`,
  asins: `${SITE}/extension/data/asin-map.json`,
  selectors: `${SITE}/extension/data/selectors.json`,
};
const BUNDLED = {
  brands: "data/brand-data.json",
  asins: "data/asin-map.json",
  selectors: "data/selectors.json",
};
const REFRESH_HOURS = 12;

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
  await chrome.storage.local.set({ logMisses: true });
  chrome.alarms.create("refresh", { periodInMinutes: REFRESH_HOURS * 60 });
  refreshAll();
});

chrome.runtime.onStartup.addListener(refreshAll);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "refresh") refreshAll(); });

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.type === "refresh") {
    refreshAll().then(() => respond({ ok: true }));
    return true;
  }
});
