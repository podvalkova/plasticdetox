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
// The store carries two image forms and store.html reads both: img is an
// Amazon image id, imgUrl is a full URL for products whose photo we host
// ourselves. Harvesting only img left six picks showing the woven placeholder
// in the app while the website showed them fine.
const images = {};
for (const obj of store.match(/\{[^{}]*\}/g) || []) {
  const asin = (obj.match(/asin:\s*"([A-Z0-9]{10})"/) || [])[1];
  if (!asin || images[asin]) continue;
  const id = (obj.match(/\bimg:\s*"([^"]+)"/) || [])[1];
  const url = (obj.match(/\bimgUrl:\s*"([^"]+)"/) || [])[1];
  if (id) images[asin] = id;
  else if (url) images[asin] = url;
}
// What the store says about each pick: the tier, the line about what it is best
// for, and the pros and cons. The app showed a name and a link and nothing else,
// so the reasoning that exists on the website never reached the phone.
const notes = {};
for (const obj of store.match(/\{[^{}]*\}/g) || []) {
  const asin = (obj.match(/asin:\s*"([A-Z0-9]{10})"/) || [])[1];
  if (!asin || notes[asin]) continue;
  const one = (k) => (obj.match(new RegExp(k + ':\\s*"((?:[^"\\\\]|\\\\.)*)"')) || [])[1];
  const many = (k) => {
    const raw = (obj.match(new RegExp(k + ':\\s*\\[([^\\]]*)\\]')) || [])[1];
    return raw ? [...raw.matchAll(/"((?:[^"\\\\]|\\\\.)*)"/g)].map((m) => m[1]) : [];
  };
  const row = {};
  const tier = one("tier"); if (tier) row.tier = tier;
  const best = one("bestFor"); if (best) row.bestFor = best;
  const pros = many("pros"); if (pros.length) row.pros = pros;
  const cons = many("cons"); if (cons.length) row.cons = cons;
  if (Object.keys(row).length) notes[asin] = row;
}
fs.writeFileSync(path.join(OUT, "product-notes.json"), JSON.stringify(notes, null, 1) + "\n");
console.log(`product-notes.json   ${Object.keys(notes).length} products with pros and cons`);

// Picks we recommend that are not in the store yet still need a picture. These
// are kept apart from the harvest so it stays obvious which products are
// missing a store entry, which is the thing that actually wants fixing.
try {
  const extra = JSON.parse(fs.readFileSync(path.join(REPO, "data", "extra-product-images.json"), "utf8"));
  for (const [asin, id] of Object.entries(extra)) {
    if (/^[A-Z0-9]{10}$/.test(asin) && !images[asin]) images[asin] = id;
  }
} catch {
  // Optional file.
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
        /\{\s*label:\s*"([^"]*)",\s*name:\s*"((?:[^"\\]|\\.)*)",\s*url:\s*([^,}]+?)\s*(?:,\s*note:\s*"((?:[^"\\]|\\.)*)"\s*)?(?:,\s*img:\s*"([^"]*)"\s*)?\}/g)) {
      const url = resolveUrl(one[3]);
      if (url) {
        const pick = { label: one[1], name: one[2].replace(/\\"/g, '"'), url };
        if (one[4]) pick.note = one[4].replace(/\\"/g, '"');
        // A pick that is not an Amazon product has no ASIN to look an image up
        // by, so it may carry its own.
        if (one[5]) pick.img = one[5];
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
// Extra blocks a swap can carry: a pro tip, or an order to work in. Kept in
// data/step-extras.json rather than plan.html, whose swap objects are parsed
// with regexes that nested fields would break.
let EXTRAS = {};
try {
  EXTRAS = JSON.parse(fs.readFileSync(path.join(REPO, "data", "step-extras.json"), "utf8"));
} catch {
  // No extras file is not an error; every swap simply renders without one.
}
/**
 * The article behind a swap, and the questions it already answers.
 *
 * The guides carry their FAQ as details/summary pairs. Repeating three of them
 * on the swap means the obvious question is answered where it is asked, rather
 * than behind a link somebody has to decide to follow.
 *
 * Which three has to depend on the swap, not on document order. One guide now
 * backs up to five swaps: the hidden processing guide answers for almonds,
 * decaf, dried fruit, citrus and shrimp at once. Taking the first three left a
 * shrimp swap asking "Are raw almonds actually raw?", which reads like the app
 * lost its place. So score each question against the swap it will sit on and
 * keep the three that actually match, falling back to document order when a
 * guide covers a single subject and nothing scores.
 */
const STOP = new Set(["the","a","an","and","or","your","you","it","in","on","of","to","for","is",
  "are","not","buy","switch","skip","that","this","with","from","if","do","does","what","how",
  "why","when","at","be","by","its","as","was","were","them","they","their","our","we"]);
const terms = (s) => new Set(String(s || "").toLowerCase().match(/[a-z]{3,}/g)?.filter(w => !STOP.has(w)) || []);
const stem = (w) => w.replace(/(ies|es|s)$/, "");

// How many of a guide's questions each word appears in. A word in most of them
// ("food", "safe", "plastic") separates nothing; a word in one ("glyphosate",
// "almond", "shrimp") identifies its question exactly. Without this a swap
// about dried fruit matched "Why is some fresh tuna so bright red?" on the
// word "bright", which is a coincidence rather than a subject.
const questionIdf = (faqs) => {
  const df = new Map();
  for (const f of faqs) {
    for (const w of new Set([...terms(f.q)].map(stem))) df.set(w, (df.get(w) || 0) + 1);
  }
  return df;
};

const scoreFaq = (faq, want, df, total) => {
  const inQ = new Set([...terms(faq.q)].map(stem));
  let n = 0;
  for (const w of want) {
    const k = stem(w);
    if (!inQ.has(k)) continue;
    // Distinctive within this guide, so it names the subject.
    if ((df.get(k) || 0) <= Math.max(1, total * 0.34)) n += 3;
    else n += 1;
  }
  return n;
};

const articleBits = (slug, swap = "", why = "", soleOwner = true, pick = null) => {
  try {
    const raw = fs.readFileSync(path.join(REPO, "articles", slug), "utf8");
    const body = raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
    const clean = (h) => h.replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&rarr;/g, "").replace(/&nbsp;/g, " ")
      .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
      .replace(/\s+/g, " ").trim();
    const title = clean((body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "");
    const faqs = [];
    for (const m of body.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)) {
      const q = clean(m[1]), a = clean(m[2]);
      // A one line answer is usually a teaser rather than an answer.
      if (q && a.length > 60) faqs.push({ q, a });
    }
    // The swap title carries the subject; the why text carries its vocabulary.
    const want = terms(swap + " " + why);
    const df = questionIdf(faqs);
    const scored = faqs.map((f, i) => ({ f, i, s: scoreFaq(f, want, df, faqs.length) }));
    // Three ways to choose, in order of how much we actually know.
    //
    // 1. The swap names its questions in step-extras. A guide backing five
    //    swaps is a survey, and which of its questions belongs on which card
    //    is an editorial judgement, not something to infer from shared words.
    //    Scoring produced a shrimp swap asking about tuna and a dried fruit
    //    swap asking about salmon, because those were the nearest questions
    //    in a guide that has none on either subject.
    // 2. The guide backs this swap alone, so every question in it is on
    //    subject and document order is right.
    // 3. Otherwise: none. The swap still links the guide, and no question is
    //    better than another swap's question.
    let chosen;
    if (pick && pick.length) {
      const byQ = new Map(faqs.map((f) => [f.q.toLowerCase().replace(/\s+/g, " ").trim(), f]));
      chosen = pick.map((q) => {
        const hit = byQ.get(String(q).toLowerCase().replace(/\s+/g, " ").trim());
        if (!hit) throw new Error(`${slug}: no FAQ matching ${JSON.stringify(q)}`);
        return hit;
      }).slice(0, 3);
    } else if (soleOwner) {
      chosen = scored.slice(0, 3).map((x) => x.f);
    } else {
      chosen = [];
    }
    return { title, faqs: chosen };
  } catch {
    return null;
  }
};

// How many swaps each guide backs. A guide used once was written for that
// swap and every question in it is on subject; a guide used five times is a
// survey, and only the questions matching this swap belong on this card.
const GUIDE_USE = {};
for (const ph of PHASES) {
  for (const st of ph.steps) {
    const ex = EXTRAS[st.swap];
    if (ex && ex.article) GUIDE_USE[ex.article] = (GUIDE_USE[ex.article] || 0) + 1;
  }
}

let extraCount = 0;
let faqCount = 0;
for (const ph of PHASES) {
  for (const st of ph.steps) {
    const ex = EXTRAS[st.swap];
    if (!ex) continue;
    if (ex.tip) st.tip = ex.tip;
    if (ex.order) st.order = ex.order;
    if (ex.article) {
      const bits = articleBits(ex.article, st.swap, st.why, GUIDE_USE[ex.article] === 1, ex.faqs);
      if (bits) {
        st.article = { slug: ex.article, title: bits.title };
        if (bits.faqs.length) { st.faqs = bits.faqs; faqCount += bits.faqs.length; }
      }
    }
    extraCount++;
  }
}
console.log(`swap FAQs            ${faqCount} questions lifted from the guides`);
console.log(`step extras          ${extraCount} swaps carry a tip or an order`);

// ---- The Kids room, lifted from baby-kids-101 rather than written twice ----
//
// The article already carries "The 23 baby and kid swaps, in priority order",
// each with an impact, a why, a free version and its picks. Copying that into
// a second source would guarantee the two drift, so the app reads the article.
// Edit the article and the room follows.
const kidsSrc = fs.readFileSync(path.join(REPO, "articles", "baby-kids-101.html"), "utf8")
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
const text = (h) => h.replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&rarr;/g, "").replace(/&nbsp;/g, " ")
  .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const kidsSteps = [];
for (const m of kidsSrc.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|<h2|$)/g)) {
  const body = m[2];
  const desc = (body.match(/class="step-desc"[^>]*>([\s\S]*?)<\/p>/) || [])[1];
  if (!desc) continue;
  const free = text((desc.match(/<b>Free version:<\/b>([\s\S]*)$/) || [])[1] || "");
  // The related-article cards at the foot are h3s with a description too. What
  // separates a swap is that every one of them names a free version; checking
  // the markup instead let both cards through as swaps.
  if (!free) continue;
  const why = text(desc.replace(/<b>Free version:<\/b>[\s\S]*$/, ""));
  const picks = [];
  for (const c of body.matchAll(
      /href="(https:\/\/www\.amazon\.com\/dp\/[^"]+)"[\s\S]*?product-card-tier">([^<]*)<[\s\S]*?product-card-name">([^<]*)<(?:[\s\S]*?product-card-best">([^<]*)<)?/g)) {
    // The store shows a price tier and a line saying what the pick is best for.
    // Cutting that line down to two words gave "Best glyphosate" and "Easiest
    // to", so the tier becomes the chip and the line stays whole as the note,
    // which is how the store itself presents them.
    picks.push({
      label: text(c[2]) || "Pick",
      name: text(c[3]),
      url: c[1],
      note: text(c[4] || ""),
    });
  }
  // A swap whose picks live in its own guide gets the guide, the way the
  // fibres swap already does, rather than an empty "our picks" heading.
  if (!picks.length) {
    const guide = (body.match(/class="step-link"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="step-link"/) || []);
    const href = guide[1] || guide[2];
    if (href) {
      picks.push({ label: "Guide", name: "Read the full guide",
        url: href.startsWith("http") ? href : `https://plasticdetox.org/articles/${href}` });
    }
  }
  kidsSteps.push({
    id: `Kids::${text(m[1])}`.slice(0, 120),
    swap: text(m[1]),
    why,
    heat: /heat|warm|hot/i.test(why),
    free,
    picks,
  });
}
// The Kids room is paid, so it does not go in the bundle. Bundles are served
// from a public URL: shipping the swaps inside one and hiding them behind a
// flag would put the whole thing a single unzip away from anyone who found the
// link. It is written into the worker instead, which is not public, and served
// only against a valid entitlement.
const kidsPhase = {
  title: "Kids", sub: "Kids",
  focus: "Bottles and feeding, the nursery, wipes and creams, in the order that matters for someone that small.",
  steps: kidsSteps,
};
fs.writeFileSync(path.join(REPO, "worker", "kids-data.js"),
  "// Generated by app/scripts/sync-data.mjs from articles/baby-kids-101.html.\n"
  + "// Edit the article, not this file. Bundled into the worker, never into the app.\n"
  + `export const KIDS = ${JSON.stringify(kidsPhase, null, 1)};\n`);
console.log(`kids room            ${kidsSteps.length} swaps, ${kidsSteps.reduce((n, s) => n + s.picks.length, 0)} picks (worker only)`);

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
