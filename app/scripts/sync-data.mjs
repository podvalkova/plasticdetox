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
