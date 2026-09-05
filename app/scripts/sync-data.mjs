// Copy the site's live data into the app bundle.
//
// brand-data.json has exactly one home, at the repo root, where the research
// tools write it. The app ships a snapshot of it rather than a second copy
// anyone could edit, so the two can never disagree about a verdict.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const APP = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(APP, "..");
const OUT = path.join(APP, "www", "data");

const SOURCES = [
  { from: path.join(REPO, "brand-data.json"), to: "brand-data.json" },
  { from: path.join(REPO, "extension", "data", "asin-map.json"), to: "asin-map.json" },
];

fs.mkdirSync(OUT, { recursive: true });

// Creator Connections links are not ours to rebuild.
//
// A campaign link carries its own campaignId and the littleplayapp-20 tag, and
// only that exact URL credits the campaign. Constructing our own
// /dp/ASIN?tag=plasticdetox-20 for those products would quietly break them, so
// the app ships a map of ASIN to campaign URL, harvested from the site's own
// pages rather than typed here where it could drift out of date.
const CAMPAIGN = /https:\/\/www\.amazon\.com\/dp\/([A-Z0-9]{10})\?[^"'\s<>]*campaignId=[^"'\s<>]*/g;
const campaigns = {};
const walk = (dir, depth = 0) => {
  if (depth > 3) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full, depth + 1); continue; }
    if (!/\.(html|js)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const m of text.matchAll(CAMPAIGN)) {
      const url = m[0].replace(/&amp;/g, "&");
      if (!campaigns[m[1]]) campaigns[m[1]] = url;
    }
  }
};
walk(REPO);
fs.writeFileSync(path.join(OUT, "campaign-links.json"),
  JSON.stringify(campaigns, null, 1) + "\n");
console.log(`campaign-links.json  ${Object.keys(campaigns).length} products`);

// Product images, harvested the same way and for the same reason: the store
// already holds an Amazon image id for most of what we recommend, and a shop
// that is a wall of text is a list rather than a shelf.
const store = fs.readFileSync(path.join(REPO, "data", "store-products.js"), "utf8");
const images = {};
for (const m of store.matchAll(/\{[^{}]*?img:\s*"([^"]+)"[^{}]*?asin:\s*"([A-Z0-9]{10})"[^{}]*?\}/g)) {
  if (!images[m[2]]) images[m[2]] = m[1];
}
fs.writeFileSync(path.join(OUT, "product-images.json"),
  JSON.stringify(images, null, 1) + "\n");
console.log(`product-images.json  ${Object.keys(images).length} products`);

// The articles, so the app has something to read between shopping trips.
// Seventy four of them exist and the app surfaced none, which made it a
// lookup tool rather than somewhere you would keep going back to.
const ARTICLES = path.join(REPO, "articles");
const grab = (text, re) => (text.match(re) || [])[1] || "";
const articles = [];
for (const name of fs.readdirSync(ARTICLES)) {
  if (!name.endsWith(".html")) continue;
  const head = fs.readFileSync(path.join(ARTICLES, name), "utf8").slice(0, 6000);
  const title = grab(head, /<title>([\s\S]*?)<\/title>/)
    .replace(/\s*\|\s*Plastic Detox\s*$/, "").trim();
  if (!title) continue;
  articles.push({
    slug: name,
    title,
    blurb: grab(head, /name="description" content="([^"]*)"/).trim(),
    image: grab(head, /property="og:image" content="([^"]*)"/).trim(),
    date: grab(head, /"datePublished":\s*"([^"]+)"/).trim(),
  });
}
articles.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
fs.writeFileSync(path.join(OUT, "articles.json"), JSON.stringify(articles, null, 1) + "\n");
console.log(`articles.json        ${articles.length} articles`);

// The 365 daily tips. Authored once and kept at the repo root like every other
// source of truth, because www/data is generated and gitignored: a file that
// lives only there is one `npm run sync-data` away from being lost.
const tips = JSON.parse(fs.readFileSync(path.join(REPO, "data", "tips.json"), "utf8"));
fs.writeFileSync(path.join(OUT, "tips.json"), JSON.stringify(tips, null, 1) + "\n");
console.log(`tips.json            ${tips.length} daily tips`);

// The 90 day plan, read from the page that publishes it.
//
// This used to assemble the plan from data/plan-rules.js, which drives the
// personalised engine, and attach picks by matching a cat|sub key against the
// store. That produced three laundry detergents under "catch microfibers in
// the wash", a step whose whole point is a wash bag, because detergents are
// what sits under that key in the store.
//
// plan.html is the free plan. It carries three phases, 23 swaps, and 23 hand
// picked product lists with the right links, including the ones that are not
// on Amazon at all: the Guppyfriend bag has its own affiliate URL and no ASIN
// to look up. Reading the published page means the app cannot drift from what
// somebody gets for their email address, and cannot invent a pick.
const planSrc = fs.readFileSync(path.join(REPO, "plan.html"), "utf8");

// The page resolves a few links through helpers, so resolve them the same way.
const consts = {};
for (const m of planSrc.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"/g)) {
  consts[m[1]] = m[2];
}
const AZ_TAG = (planSrc.match(/az\s*=\s*[^\n]*tag=([a-z0-9-]+)/) || [])[1] || "plasticdetox-20";
const resolveUrl = (raw) => {
  const t = raw.trim();
  const az = t.match(/^az\("([A-Z0-9]{10})"\)$/);
  if (az) return `https://www.amazon.com/dp/${az[1]}?tag=${AZ_TAG}`;
  if (consts[t]) return consts[t];
  const lit = t.match(/^"(.*)"$/);
  if (!lit) return "";
  const url = lit[1];
  return /^https?:/.test(url) ? url : `https://plasticdetox.org/${url.replace(/^\//, "")}`;
};

const PHASES = [];
// A phase object opens with days:, not title:, so anchor on that.
for (const block of planSrc.split(/\n\s*\{\s*(?=days:\s*")/).slice(1)) {
  const title = (block.match(/title:\s*"(Phase [^"]+)"/) || [])[1] || "";
  const days = (block.match(/days:\s*"([^"]+)"/) || [])[1] || "";
  const focus = (block.match(/focus:\s*"((?:[^"\\]|\\.)*)"/) || [])[1] || "";
  const steps = [];
  for (const sw of block.split(/\n\s*\{\s*(?=title:\s*"(?!Phase ))/).slice(1)) {
    const swap = (sw.match(/title:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
    if (!swap) continue;
    const why = (sw.match(/why:\s*"((?:[^"\\]|\\.)*)"/) || [])[1] || "";
    const picks = [];
    const list = (sw.match(/picks:\s*\[([\s\S]*?)\]\s*\}/) || [])[1] || "";
    // A pick may carry a trailing note ("cheapest way in, great for renters").
    // The url capture must stop at the comma before it: the first version of
    // this regex ate the note into the url, which shipped two dead links.
    for (const one of list.matchAll(
        /\{\s*label:\s*"([^"]*)",\s*name:\s*"((?:[^"\\]|\\.)*)",\s*url:\s*([^,}]+?)\s*(?:,\s*note:\s*"((?:[^"\\]|\\.)*)"\s*)?\}/g)) {
      const url = resolveUrl(one[3]);
      if (url) {
        const pick = { label: one[1], name: one[2].replace(/\\"/g, '"'), url };
        if (one[4]) pick.note = one[4].replace(/\\"/g, '"');
        picks.push(pick);
      }
    }
    steps.push({
      id: `${title}::${swap}`.slice(0, 120),
      swap: swap.replace(/\\"/g, '"'),
      why: why.replace(/\\"/g, '"'),
      // The page tags the swaps where heat multiplies leaching, and leans on
      // that tag in its own hero copy. The app finally renders it.
      heat: /heat:\s*true/.test(sw),
      picks,
    });
  }
  if (steps.length) PHASES.push({ title: days || title, sub: title.replace(/^Phase \d+:\s*/, ""), focus, steps });
}
fs.writeFileSync(path.join(OUT, "plan.json"), JSON.stringify(PHASES, null, 1) + "\n");
const stepCount = PHASES.reduce((n, p) => n + p.steps.length, 0);
const pickCount = PHASES.reduce((n, p) => n + p.steps.reduce((m, s) => m + s.picks.length, 0), 0);
console.log(`plan.json            ${PHASES.length} phases, ${stepCount} swaps, ${pickCount} picks`);

let brands = 0;
for (const { from, to } of SOURCES) {
  if (!fs.existsSync(from)) {
    console.error(`missing source: ${from}`);
    process.exit(1);
  }
  const body = fs.readFileSync(from);
  const parsed = JSON.parse(body);
  if (to === "brand-data.json") {
    if (!Array.isArray(parsed) || parsed.length < 100) {
      console.error(`brand-data.json looks wrong: ${Array.isArray(parsed) ? parsed.length : typeof parsed}`);
      process.exit(1);
    }
    brands = parsed.length;
  }
  fs.writeFileSync(path.join(OUT, to), body);
  console.log(`${to.padEnd(18)} ${(body.length / 1024).toFixed(0)} KB`);
}

// Barcodes we have mapped ourselves. Empty until we start collecting them from
// scans, and kept as its own file so the app can refresh it on its own clock.
const barcodes = path.join(OUT, "barcodes.json");
if (!fs.existsSync(barcodes)) fs.writeFileSync(barcodes, "{}\n");

const stamp = {
  brands,
  built: new Date().toISOString(),
  hash: crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(OUT, "brand-data.json")))
    .digest("hex").slice(0, 12),
};
fs.writeFileSync(path.join(OUT, "version.json"), JSON.stringify(stamp, null, 2) + "\n");
console.log(`synced ${brands} brands, hash ${stamp.hash}`);
