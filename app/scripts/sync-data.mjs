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

// The 90 day plan, as a checklist.
//
// data/plan-rules.js already holds the whole thing: what to change, why, the
// free version of each, the article behind it, and a rank that is exposure
// priority. The site turns that into a personalised plan; the app wants the
// same list as something you tick off. Read from the same file so the two
// cannot drift, and phased by rank because rank is already "do this first".
const rulesSrc = fs.readFileSync(path.join(REPO, "data", "plan-rules.js"), "utf8");
const field = (block, name, quoted = true) => {
  const re = quoted
    ? new RegExp(name + ':\\s*"((?:[^"\\\\]|\\\\.)*)"')
    : new RegExp(name + ":\\s*([0-9]+)");
  const m = block.match(re);
  return m ? m[1].replace(/\\"/g, '"') : "";
};
const steps = [];
// Split on the rule opener rather than trying to match a balanced block: the
// closing brace shares a line with the last field, so an anchored regex found
// nothing and a lazy one found twice as many blocks as there are rules.
for (const block of rulesSrc.split(/\n\s*\{\s*(?=key:)/).slice(1)) {
  const swap = field(block, "swap");
  if (!swap) continue;
  steps.push({
    id: field(block, "key"),
    swap,
    why: field(block, "why"),
    free: field(block, "free"),
    room: field(block, "room"),
    article: field(block, "article"),
    rank: Number(field(block, "rank", false) || 0),
    est: Number(field(block, "est", false) || 0),
  });
}
steps.sort((a, b) => b.rank - a.rank);
const per = Math.ceil(steps.length / 3);
const PHASES = [
  { title: "Days 1 to 30", sub: "Kitchen and water", steps: steps.slice(0, per) },
  { title: "Days 31 to 60", sub: "Air and textiles", steps: steps.slice(per, per * 2) },
  { title: "Days 61 to 90", sub: "Reduce the chemicals", steps: steps.slice(per * 2) },
];
fs.writeFileSync(path.join(OUT, "plan.json"), JSON.stringify(PHASES, null, 1) + "\n");
// Each swap, with the products we would actually buy for it.
//
// The rule key is cat|sub and matches store-products.js exactly, which is how
// the site attaches picks to a plan. Harvesting the plan without them left a
// checklist that told you to move your bottles to glass and then did not say
// which glass bottle, which is the one question it provokes.
const storeSrc = fs.readFileSync(path.join(REPO, "data", "store-products.js"), "utf8");
const byKey = {};
for (const block of storeSrc.split(/\n\s*\{\s*(?=cat:)/).slice(1)) {
  const g = (name) => {
    const m = block.match(new RegExp(name + ':\\s*"((?:[^"\\\\]|\\\\.)*)"'));
    return m ? m[1].replace(/\\"/g, '"') : "";
  };
  const cat = g("cat"), sub = g("sub"), name = g("name");
  if (!cat || !sub || !name) continue;
  const key = `${cat}|${sub}`;
  (byKey[key] = byKey[key] || []).push({
    name,
    asin: g("asin"),
    url: g("url"),
    img: g("img"),
    tier: g("tier"),
    bestFor: g("bestFor"),
    top: /\btop:\s*true/.test(block),
  });
}
const TIER = { "$": 1, "$$": 2, "$$$": 3 };
let attached = 0;
for (const phase of PHASES) {
  for (const step of phase.steps) {
    const pool = (byKey[step.id] || []).slice().sort((a, b) => {
      if (!!b.top !== !!a.top) return b.top ? 1 : -1;
      return (TIER[a.tier] || 9) - (TIER[b.tier] || 9);
    });
    step.picks = pool.slice(0, 3).filter((x) => x.asin || x.url);
    attached += step.picks.length;
  }
}
fs.writeFileSync(path.join(OUT, "plan.json"), JSON.stringify(PHASES, null, 1) + "\n");
const withPicks = PHASES.reduce((n, p) => n + p.steps.filter((s) => s.picks.length).length, 0);
console.log(`plan.json            ${steps.length} steps, ${withPicks} with picks, ${attached} products`);

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
