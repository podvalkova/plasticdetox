// Data loading, with the verdicts kept fresh without an App Store release.
//
// The bundle ships a full snapshot so a first launch on aeroplane mode still
// works, and every launch after that asks the site whether there is anything
// newer. Verdicts change for reasons that cannot wait for review: a recall
// lands, a lab result comes back, a brand reformulates. So brand data updates
// over the air on its own clock, separate from the app binary.
//
// Order of preference, best first:
//   1. what we fetched from the site last time, held in local storage
//   2. the snapshot compiled into the bundle
//
// A failed refresh is never an error the user sees. Yesterday's verdicts are
// a good answer; a spinner in a supermarket aisle is not.

import { Index } from "./match.js";

const SITE = "https://plasticdetox.org";
const CACHE_KEY = "pd.data.v1";
const STAMP_KEY = "pd.data.stamp.v1";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;   // refresh at most four times a day

let index = null;
let meta = { source: "bundle", version: null, brands: 0 };

async function readBundled(name) {
  const res = await fetch(`./data/${name}.json`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`bundled ${name} missing`);
  return res.json();
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.brands) || !parsed.brands.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    localStorage.setItem(STAMP_KEY, String(Date.now()));
  } catch {
    // A full quota is not worth failing a lookup over. We simply refetch next
    // launch and keep serving the bundled snapshot in the meantime.
  }
}

function build(payload, source) {
  index = new Index(payload.brands, payload.asins || {}, payload.barcodes || {});
  meta = {
    source,
    version: payload.version || null,
    brands: payload.brands.length,
    fetched: payload.fetched || null,
  };
  return index;
}

/** Load the best data we have, without touching the network. */
export async function load() {
  if (index) return index;
  const cached = readCache();
  if (cached) return build(cached, "cache");
  const [brands, asins, barcodes] = await Promise.all([
    readBundled("brand-data"),
    readBundled("asin-map"),
    readBundled("barcodes").catch(() => ({})),
  ]);
  return build({ brands, asins, barcodes }, "bundle");
}

/**
 * Ask the site for newer verdicts. Safe to call on every launch: it returns
 * early unless the cache is stale, and it never throws.
 */
export async function refresh({ force = false } = {}) {
  const stamp = Number(localStorage.getItem(STAMP_KEY) || 0);
  if (!force && Date.now() - stamp < MAX_AGE_MS) return { skipped: true };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    const [brands, asins, barcodes] = await Promise.all([
      fetch(`${SITE}/brand-data.json`, { signal: ctl.signal }).then((r) => r.json()),
      fetch(`${SITE}/app/data/asin-map.json`, { signal: ctl.signal }).then((r) => r.json()).catch(() => null),
      fetch(`${SITE}/app/data/barcodes.json`, { signal: ctl.signal }).then((r) => r.json()).catch(() => null),
    ]);
    clearTimeout(timer);
    if (!Array.isArray(brands) || brands.length < 100) return { skipped: true };

    const current = readCache() || {};
    const payload = {
      brands,
      asins: asins || current.asins || (await readBundled("asin-map")),
      barcodes: barcodes || current.barcodes || {},
      fetched: new Date().toISOString(),
    };
    writeCache(payload);
    build(payload, "fresh");
    return { updated: true, brands: brands.length };
  } catch {
    return { skipped: true };
  }
}

export function status() {
  return meta;
}

export function getIndex() {
  return index;
}
