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

let campaignLinks = {};
let productImages = {};
let articles = [];

/**
 * The buy link for an ASIN.
 *
 * A Creator Connections link carries its own campaignId and the campaign's own
 * tag, and only that exact URL credits it. Rebuilding one as
 * /dp/ASIN?tag=plasticdetox-20 looks identical and silently loses the credit,
 * so a campaign URL always wins where we hold one.
 */
export function buyLink(asin) {
  if (!asin) return "";
  return campaignLinks[asin] || `https://www.amazon.com/dp/${asin}?tag=plasticdetox-20`;
}

/**
 * A product photo, where the store holds one.
 *
 * Amazon serves any size off the same id, so the app asks for a small one:
 * a shelf of 150 products should not pull 150 full resolution photographs.
 */
export function productImage(asin, px = 300) {
  const id = asin && productImages[asin];
  return id ? `https://m.media-amazon.com/images/I/${id}._AC_SL${px}_.jpg` : "";
}

/** The articles, newest first. */
export function allArticles() { return articles; }

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
/**
 * The three small files that are not the verdict payload.
 *
 * These have to load on every launch, not only on the one where the cache is
 * cold. They used to sit after the `if (cached) return` below, which meant
 * that from the second launch onwards the app had no product images, no
 * articles and no campaign links: the shop was a wall of fallback text, the
 * Learn tab was empty, and Creator Connections links quietly reverted to a
 * plain tag. Small, independent of the brand payload, and cheap to read.
 */
let sidecarsLoaded = false;
async function sidecars() {
  if (sidecarsLoaded) return;
  sidecarsLoaded = true;
  [campaignLinks, productImages, articles] = await Promise.all([
    readBundled("campaign-links").catch(() => ({})),
    readBundled("product-images").catch(() => ({})),
    readBundled("articles").catch(() => []),
  ]);
}

export async function load() {
  await sidecars();
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
