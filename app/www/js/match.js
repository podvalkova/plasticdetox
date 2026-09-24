// Brand and product matching, shared by every surface of the app.
//
// This is the same resolution order the Chrome extension uses on Amazon
// listings, lifted out of extension/src/content.js so the app and the
// extension can never drift into disagreeing about the same product:
//
//   1. a barcode we have already mapped
//   2. an ASIN we have already researched and linked
//   3. the brand name, exact
//   4. a longest prefix match of a product title against known brand names
//
// Everything here is pure. No DOM, no fetch, no platform calls, so it runs
// unchanged in the app webview, in a unit test, and in the extension.

export const FRONTS = [
  ["formula", "Formula"],
  ["materials", "Materials"],
  ["legal", "Recalls & lawsuits"],
  ["testing", "Independent tests"],
];

export const STANCE_LABEL = {
  good: "Good choice",
  careful: "Careful",
  skip: "Skip",
  neutral: "Context",
};

// Brand names that are ordinary English words. Matched only as the whole
// leading token, never as part of a longer prefix, to keep "Pure Leaf" from
// colliding with a brand called "Pure".
const GENERIC = new Set([
  "pure", "native", "one", "blu", "core", "well", "life", "basics", "all",
]);

export const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const collapse = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export class Index {
  constructor(brands, asins = {}, barcodes = {}) {
    this.brands = brands || [];
    this.asins = asins || {};
    this.barcodes = barcodes || {};
    // Company prefixes, kept only where every barcode under one belongs to a
    // single brand. Built here rather than shipped, so it cannot drift from the
    // map it is derived from.
    this.prefixes = {};
    {
      const seen = {};
      for (const code of Object.keys(this.barcodes)) {
        const bare = String(code).replace(/\D/g, "").replace(/^0+/, "");
        for (const n of [6, 7, 8]) {
          if (bare.length <= n) continue;
          const k = bare.slice(0, n);
          const id = this.barcodes[code].brandId;
          if (!(k in seen)) seen[k] = id;
          else if (seen[k] !== id) seen[k] = null;
        }
      }
      for (const k of Object.keys(seen)) if (seen[k]) this.prefixes[k] = seen[k];
    }
    this.byId = new Map();
    this.byCollapsed = new Map();
    for (const b of this.brands) {
      this.byId.set(b.id, b);
      for (const label of [b.brand, ...(b.aliases || [])]) {
        const key = collapse(label);
        // First writer wins so the canonical brand beats an alias collision.
        //
        // Every brand is indexed, however short. The length guard used to live
        // here, which meant a brand whose name collapses under three characters
        // was never in the map at all: A+D collapses to "ad", so the app could
        // not find it by name however it was typed. The guard belongs in
        // fromTitle, where a two letter prefix really would match half the file,
        // and not on an exact lookup of what somebody typed.
        if (!this.byCollapsed.has(key)) this.byCollapsed.set(key, b);
      }
    }
  }

  // ---------------------------------------------------------------- lookups

  fromBarcode(code) {
    const digits = code && String(code).replace(/\D/g, "");
    if (!digits) return null;
    const hit = this.barcodes[digits];
    if (hit) {
      const brand = this.byId.get(hit.brandId);
      if (brand) return { brand, hint: hit, via: "barcode" };
    }
    // The manufacturer, when the exact code is unknown to everyone.
    //
    // A barcode opens with a GS1 company prefix, so everything a company makes
    // shares its leading digits. Native's Coconut & Vanilla scanned to nothing
    // because neither we nor any of the three open databases hold
    // 030772233559, while we already held 0030772245439 under the same prefix
    // and a careful verdict on Native. Saying "we could not identify that" when
    // we know whose product it is throws away the answer we have.
    //
    // Only prefixes that resolve to ONE brand are used. A company prefix can
    // carry several: Procter & Gamble's covers Old Spice and Secret, and
    // guessing between them would put one brand's verdict on another's
    // product. Those stay unresolved on purpose.
    const bare = digits.replace(/^0+/, "");
    for (const n of [8, 7, 6]) {
      if (bare.length <= n) continue;
      const id = this.prefixes[bare.slice(0, n)];
      const brand = id && this.byId.get(id);
      // No hint is returned: a prefix names the maker, never the product, so
      // the screen must not read it as a verdict on what is in someone's hand.
      if (brand) return { brand, via: "barcode-prefix" };
    }
    return null;
  }

  fromAsin(asin) {
    const hit = asin && this.asins[asin];
    if (!hit) return null;
    const brand = this.byId.get(hit.brandId);
    return brand ? { brand, hint: hit, via: "asin" } : null;
  }

  fromBrandName(name) {
    const brand = this.byCollapsed.get(collapse(name));
    return brand ? { brand, via: "brand" } : null;
  }

  fromTitle(title) {
    const words = norm(title).split(" ").filter(Boolean);
    if (!words.length) return null;
    for (let n = Math.min(4, words.length); n >= 1; n--) {
      const key = words.slice(0, n).join("");
      if (key.length < 3) continue;
      const brand = this.byCollapsed.get(key);
      if (!brand) continue;
      // A generic word only counts when it stands alone as the first token.
      if (GENERIC.has(key) && n !== 1) continue;
      return { brand, via: "title" };
    }
    return null;
  }

  /**
   * Resolve whatever a scan or a search gave us into a brand.
   *
   * `brandName` comes from a barcode database byline and is the most reliable
   * signal after our own mappings, because it is the manufacturer's own field
   * rather than a marketing title. The title prefix is the last resort.
   */
  resolve({ barcode, asin, brandName, title } = {}) {
    return (
      this.fromBarcode(barcode) ||
      this.fromAsin(asin) ||
      (brandName ? this.fromBrandName(brandName) : null) ||
      (brandName ? this.fromTitle(brandName) : null) ||
      (title ? this.fromTitle(title) : null) ||
      null
    );
  }

  // ----------------------------------------------------------- free search

  /**
   * Type ahead over brands and the products under them.
   *
   * Scored rather than filtered, because "water" should surface the water
   * filter brands before a brand whose reason paragraph mentions water. Brand
   * name beats product name beats category beats reason text.
   */
  search(query, limit = 25) {
    const q = norm(query);
    if (q.length < 2) return [];
    const terms = q.split(" ").filter(Boolean);
    const out = [];

    for (const b of this.brands) {
      const name = norm(b.brand);
      const cat = norm(b.category);
      let score = 0;

      if (name === q) score = 1000;
      else if (name.startsWith(q)) score = 700;
      else if (name.includes(q)) score = 500;
      else if (terms.every((t) => name.includes(t))) score = 400;

      // A product under the brand can answer a query the brand name cannot:
      // nobody searches "Aquasana", they search "shower filter".
      //
      // Terms are matched against the brand and the product name together.
      // People type both, and the words are split across the two: "Brita
      // Elite" has no match on either alone, because the brand is not called
      // Elite and the product row is not called Brita.
      let bestProduct = null;
      for (const p of b.products || []) {
        const pn = norm(p.name);
        const combined = name + " " + pn;
        let ps = 0;
        if (pn === q) ps = 900;
        else if (pn.startsWith(q)) ps = 600;
        else if (pn.includes(q)) ps = 450;
        else if (terms.every((t) => pn.includes(t))) ps = 380;
        else if (terms.every((t) => combined.includes(t))) ps = 340;
        if (ps > score) { score = ps; bestProduct = p; }
      }

      if (!score && cat.includes(q)) score = 200;
      if (!score && terms.every((t) => norm(b.reason).includes(t))) score = 80;
      if (!score) continue;

      // Researched brands answer before ones we only hold context on, and a
      // shorter name beats a longer one at equal relevance so "Brita" wins
      // over "Brita Elite Replacement" for the query "brita".
      if (b.reviewed !== false) score += 25;
      score -= Math.min(name.length, 40) / 10;

      out.push({ brand: b, product: bestProduct, score });
    }

    // A letter out and the search gave up. "Woopsie" found nothing while
    // "Whoopsie" was right there, and a brand name on a package is exactly the
    // thing people mistype. Only when nothing else matched, so a real hit is
    // never pushed down by a near miss.
    if (!out.length && q.length >= 4) {
      for (const b of this.brands) {
        const name = norm(b.brand);
        let best = near(q, name) ? 300 : 0;
        let bestProduct = null;
        if (!best) {
          for (const p of b.products || []) {
            if (near(q, norm(p.name))) { best = 260; bestProduct = p; break; }
          }
        }
        if (best) out.push({ brand: b, product: bestProduct, score: best - name.length / 10 });
      }
    }

    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

// Shops that sell everybody's products, so the address names the shop and
// never the maker. Anywhere else, the domain IS the brand.
const MARKETPLACE = /^(amazon|amzn|a\.co|target|walmart|ebay|etsy|costco|samsclub|kroger|instacart|thrivemarket|iherb|vitacost|wayfair|overstock|shop|tiktok|temu|shein|aliexpress|google|bing)\b/i;

// Path words that route rather than name: /dp/, /products/, /ip/.
const PATH_NOISE = new Set([
  "dp", "gp", "product", "products", "p", "ip", "d", "o", "item", "items",
  "shop", "store", "collections", "catalog", "pd", "buy", "en", "en-us", "us",
]);

/**
 * What a pasted product link tells us before anyone fetches anything.
 *
 * Typing is where the check goes wrong. Somebody types "ointment" and A+D's
 * only product is "Original diaper rash ointment", so a full scorecard reads
 * as no verdict. A link has none of that: it names one thing exactly.
 *
 * Most of what we need is in the address itself, so this is pure, instant,
 * works with no signal and costs nothing. An Amazon link carries the ASIN,
 * which is the key our whole database is built on, so a product we have
 * already rated answers from the phone with no pass spent. A brand's own shop
 * carries the maker in the domain and the product in the slug.
 *
 * It never guesses a verdict, only an identity, and the screen shows what it
 * read so a person can correct it.
 */
export function parseProductLink(input) {
  const raw = String(input || "").trim();
  if (!/^https?:\/\//i.test(raw) && !/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(raw)) return null;
  // A shortened link is an address for an address. Nothing in it names a
  // product, and following it needs a request, so say so rather than offering
  // "2xY9abc" as a product name.
  if (/^(https?:\/\/)?(a\.co|amzn\.to|amzn\.eu|bit\.ly|tinyurl\.com|t\.co|shorturl\.at|rstyle\.me|shop\.app)\b/i.test(raw)) {
    return { shortened: true, url: raw, host: "", asin: "", brand: "", product: "", marketplace: true };
  }
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segs = url.pathname.split("/").map((s) => s.trim()).filter(Boolean);

  // The ASIN, wherever it sits. Amazon puts it after /dp/, /gp/product/ or
  // /product/, and a short a.co link has none at all.
  const asin = (segs.find((s) => /^[A-Z0-9]{10}$/.test(s) && /[0-9]/.test(s)) || "");

  // The slug is the longest segment that names rather than routes. Target
  // writes /p/up-up-baby-wipes/-/A-79362508, Amazon writes the name BEFORE
  // /dp/, and a brand shop writes it last, so position cannot be trusted.
  const words = (s) => s.replace(/[-_+]+/g, " ").replace(/\.(html?|php|aspx)$/i, "").trim();
  const named = segs
    .filter((s) => !PATH_NOISE.has(s.toLowerCase()))
    .filter((s) => !/^[A-Z0-9]{10}$/.test(s))
    .filter((s) => !/^[-a-z]?\d[\d-]*$/i.test(s))
    .filter((s) => !/^a-\d+$/i.test(s))
    // Amazon's tracking crumb sits in the path like any other segment, so on a
    // link carrying no product name "ref=pd_bxgy_d_sccl_1" was the longest
    // thing left standing and became the product name.
    .filter((s) => !/^ref=/i.test(s))
    .map(words)
    .filter((s) => s.length > 2 && /[a-z]{3}/i.test(s));
  const slug = named.sort((a, b) => b.length - a.length)[0] || "";

  const marketplace = MARKETPLACE.test(host);
  // A brand's own shop names the maker in its address. "ifyoucare.com" is If
  // You Care, and no amount of typing gets that more right.
  const brand = marketplace ? "" : titleCase(host.split(".").slice(0, -1).pop() || "");
  const product = tidy(slug);
  if (!asin && !product) return null;
  return { url: url.href, host, asin, brand, product, marketplace };
}

function titleCase(s) {
  return String(s || "").replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();
}

/** A slug reads as lowercase-with-hyphens. People read sentences. */
function tidy(s) {
  // A shop's own SKU rides at the end of most slugs: "balance-bike-black-03619".
  const t = String(s || "").replace(/\s+\d[\d\s]*$/, "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Brand names we hold nothing on, for the Brand field's type ahead.
 *
 * The field knew only the brands we have rated, so four letters of anything
 * else left the dropdown empty. An empty dropdown reads as a broken field, not
 * as "we have not checked that one", and the way out of it, typing the product
 * and asking for a check, was invisible.
 *
 * These carry no verdict and never will: the dictionary is a list of names.
 * The caller marks them as unchecked, and picking one fills the brand and
 * leaves the product to the person holding it.
 *
 * `taken` holds the collapsed names already answered by the database, so a
 * brand we rate is never shadowed by a bare name of itself.
 */
export function suggestNames(names, query, taken = null, limit = 5) {
  const q = collapse(query);
  if (q.length < 2 || !names || !names.length) return [];
  const starts = [], inside = [];
  for (const n of names) {
    const k = collapse(n);
    if (taken && taken.has(k)) continue;
    if (k.startsWith(q)) starts.push(n);
    else if (starts.length < limit && inside.length < limit && k.includes(q)) inside.push(n);
    if (starts.length >= limit * 3) break;
  }
  // Shortest first: somebody typing "cera" wants CeraVe before Ceramic Glaze
  // Imports, and the file is stored alphabetically so nothing else orders them.
  const byLength = (a, b) => a.length - b.length || a.localeCompare(b);
  starts.sort(byLength);
  inside.sort(byLength);
  return [...starts, ...inside].slice(0, limit);
}

/**
 * Close enough to be the same word: one edit away, or one edit away from the
 * start of it, so "woopsie" reaches "whoopsie" and "carlsen" reaches "carlson"
 * without "water" reaching "waxed".
 */
function near(q, name) {
  if (!name) return false;
  if (name.includes(q)) return true;
  if (editsWithinOne(q, name)) return true;
  const head = name.slice(0, q.length + 1);
  return head.length >= 4 && editsWithinOne(q, head);
}

/** True when one insertion, deletion or substitution turns a into b. */
function editsWithinOne(a, b) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

// -------------------------------------------------------------- verdicts

/**
 * Find the per-product verdict for a specific product.
 *
 * Ported verbatim in behaviour from the extension. Nearly half our product
 * verdicts disagree with their own brand, so a brand level answer on a
 * specific product is wrong about as often as it is right.
 */
export function productFor(brand, { asin, title } = {}) {
  const rows = brand.products || [];
  if (asin) {
    const exact = rows.find((p) => Array.isArray(p.asins) && p.asins.includes(asin));
    if (exact) return exact;
  }
  if (!title) return null;
  const low = " " + norm(title) + " ";

  // Tolerate the singular/plural split between an editorial name and a real
  // listing title: we write "Aveeno Sunscreens", the label says "Sunscreen".
  const hasWord = (w) => {
    const n = norm(w);
    if (!n) return false;
    if (low.includes(" " + n + " ")) return true;
    if (n.endsWith("s") && low.includes(" " + n.slice(0, -1) + " ")) return true;
    return low.includes(" " + n + "s ");
  };

  let best = null, bestLen = 0, bestDirect = false, bestEvidence = -1;
  const isDirect = (p) => p.origin !== "brand-line";
  const evidenceOf = (p) => {
    const f = (p.ext && p.ext.fronts) || {};
    return Object.values(f).filter((v) => v && v !== "unassessed" && v !== "unknown").length;
  };
  // Rule 1.1, inside the matcher. A title that names one product must never be
  // answered by a sibling carrying a BETTER verdict: "Clearly Filtered Pitcher"
  // is a careful, and it was resolving to the brand's water filters row, which
  // is a good, so a cautioned product wore a recommendation it had not earned.
  // Seven rows did this. A worse sibling may still answer, because adverse
  // evidence is allowed to travel and a warning shown in error costs nobody
  // their health.
  const RANK = { skip: 0, careful: 1, unrated: 2, good: 3 };
  const rankOf = (p) => RANK[(p.ext || {}).verdict] ?? 2;
  const namesItself = (p) => {
    const n = norm(p.name || "");
    return !!n && low.includes(" " + n + " ");
  };
  const better = (p, len, d) => {
    // Where the title literally spells out a row's own name, that row wins
    // outright. Both directions: Honest's "Sensitive diaper rash cream" is a
    // skip and was losing to the brand's "Diapers" row, a careful, purely
    // because Diapers happened to be evaluated first and the guard only ran
    // one way.
    if (best && namesItself(best) && !namesItself(p) && rankOf(p) > rankOf(best)) return false;
    if (namesItself(p) && best && !namesItself(best)) return true;
    if (d !== bestDirect) return d;
    const e = evidenceOf(p);
    if (e !== bestEvidence) return e > bestEvidence;
    return len > bestLen;
  };

  for (const p of rows) {
    if ((p.matchNot || []).some(hasWord)) continue;
    for (const phrase of p.match || []) {
      const needle = norm(phrase);
      if (!needle || !low.includes(needle)) continue;
      const d = isDirect(p);
      if (better(p, needle.length, d)) {
        best = p; bestLen = needle.length; bestDirect = d; bestEvidence = evidenceOf(p);
      }
    }
    for (const group of p.matchAll || []) {
      if (!group.length || !group.every(hasWord)) continue;
      const weight = group.join("").length;
      const d = isDirect(p);
      if (better(p, weight, d)) {
        best = p; bestLen = weight; bestDirect = d; bestEvidence = evidenceOf(p);
      }
    }
  }
  return best;
}

/**
 * The verdict we are allowed to assert about a product.
 *
 * Favourable evidence never propagates from a brand to a product, so a
 * recommendation needs direct evidence about this exact thing. Where that is
 * missing the honest answer is no status at all, which is what "unrated" says.
 */
export function productVerdict(row) {
  if (!row) return null;
  const v = row.ext ? row.ext.verdict : row.verdict;
  return v && v !== "unrated" && v !== "neutral" ? v : null;
}

/**
 * Everything a result screen needs, resolved once.
 *
 * `level` is the honest scope of the answer: "product" when we researched this
 * exact thing, "brand" when all we hold is a judgement about the maker.
 */
/**
 * A finding the researcher recorded about the whole range, not one SKU.
 *
 * Rule 1.1 lets adverse evidence reach a product we have not researched, and
 * 1.2 makes the copy name the scope it came from. That is the difference
 * between an answer and a leak: scanning a Pampers variant we never opened
 * still meets a recorded finding about Pampers diapers, while scanning an
 * Optimum Nutrition tub meets nothing, because all we hold there is one SKU
 * that happens to be careful. Agreement between SKUs is not a range finding.
 *
 * Favourable never travels this way. `good` is excluded outright: a
 * recommendation has to rest on evidence about the exact thing.
 *
 * And it stays silent wherever the brand has a product we rated good. A range
 * finding speaks for the part of the range nobody researched, so the moment an
 * unmatched scan could plausibly BE the good one, it must not answer: Caboo's
 * whole range is careful while its wipes are a good we sell, and telling a
 * shopper "Careful" over a product on our own shelf is worse than telling them
 * we do not know which one they are holding. 92 of 457 scans sat in that trap,
 * Dr. Bronner's, Aveeno and Caboo the largest.
 */
function rangeFinding(brand) {
  const rows = brand.products || [];
  const researchedGood = rows.some((p) => (p.ext || {}).verdict === "good"
    && !(String(p.name || "").trim().toLowerCase() === "whole range" || p.origin === "brand-line"));
  if (researchedGood) return null;
  const standIn = (p) => String(p.name || "").trim().toLowerCase() === "whole range"
    || p.origin === "brand-line"
    || (((p.ext || {}).scope === "brand") && !(p.asins || []).length);
  let best = null;
  for (const p of rows) {
    const v = (p.ext || {}).verdict;
    if (v !== "careful" && v !== "skip") continue;
    const scope = (p.ext || {}).scope;
    if (scope !== "line" && scope !== "brand" && !standIn(p)) continue;
    // Skip outranks careful: the worst recorded range finding is the one the
    // reader needs before buying.
    if (!best || (v === "skip" && (best.ext || {}).verdict === "careful")) best = p;
  }
  return best;
}

export function verdictFor(match, ctx = {}) {
  const brand = match.brand;
  const title = ctx.title || (match.hint && match.hint.name) || brand.brand;
  // Did the person name a product, or only a brand? Scanning a barcode and
  // typing a product both name one; browsing to a brand does not.
  const productNamed = !!ctx.productNamed;
  // An explicit row wins over matching. It means the person told us which of
  // the brand's products they are holding, which is better than any guess we
  // could make from a title.
  const row = ctx.product || productFor(brand, { asin: ctx.asin, title });
  const productStance = productVerdict(row);
  // A brand verdict is not a product verdict, and must never stand in for one.
  //
  // Caboo is a good brand whose wipes are a careful, and whose whole-range row
  // is unrated because a recommendation cannot rest on inherited evidence.
  // Scanning the wipes matched the unrated row, fell through to the brand, and
  // answered "Good choice" over two unassessed checks. That is the gate the
  // site spent a release building, and the extension has always held: where
  // there is no product verdict there is no verdict, only context.
  // Where the scan named a product and no row answers for it, a recorded range
  // finding still does. Read the verdict off that row, never off brand.stance:
  // Caboo's stance is good while its wipes are the thing being asked about.
  const range = (productNamed && !productStance) ? rangeFinding(brand) : null;
  const rangeStance = range ? (range.ext || {}).verdict : null;
  const asserted = productNamed
    ? !!(productStance || rangeStance)
    : !!(productStance || brand.stance);
  const productNote = (row && row.note) || "";
  const brandNote = brand.reason || "";
  // Fifteen percent of our product rows carry the brand's own sentence
  // verbatim. Printing it again under "About the brand" promised more and
  // delivered the same paragraph twice, which read as a bug because it was one.
  const brandAdds = productNote && brandNote && norm(productNote) !== norm(brandNote);
  // A row whose only note is the brand's own sentence has not been researched
  // as a product, whatever the row's name implies. Saying so is the difference
  // between a category finding and a claim about the thing in someone's hand.
  const brandCopyOnly = !!productNote && !!brandNote && !brandAdds;
  return {
    brand,
    product: row,
    level: productStance ? "product" : "brand",
    asserted,
    stance: asserted ? (productStance || rangeStance || brand.stance || "neutral") : "neutral",
    fronts: (row && row.ext && expandFronts(row.ext, brand))
      || (range && expandFronts(range.ext, brand)) || brand.fronts || {},
    reason: productNote || (range && range.note) || brandNote,
    brandReason: brandAdds ? brandNote : "",
    scoped: brandCopyOnly || !!rangeStance || !!(row && row.ext && row.ext.disclose),
    heldBack: (row && row.ext && row.ext.heldBack) || [],
    // The row's own record, for the blocks that only exist where we did the
    // work: the exposure line, the ingredient list, the story worth telling.
    ext: (row && row.ext) || null,
    why: (row && row.ext && row.ext.why) || "",
    reviewed: brand.reviewed !== false,
    article: brand.article || (brand.sources && brand.sources[0]) || "",
    via: match.via,
  };
}

/**
 * Product rows store a bare status string per front; brands store an object.
 *
 * The note matters as much as the status. A card that flags Formula and says
 * nothing else asks someone to take a warning on trust at the moment they are
 * deciding whether to buy. `frontNotes` holds the reason we recorded, and where
 * a front was inherited from the brand the brand's note is the one that
 * applies, because it is the brand's finding.
 */
function expandFronts(ext, brand) {
  const statuses = ext && ext.fronts;
  if (!statuses) return null;
  const notes = ext.frontNotes || {};
  const inherited = ext.inheritedFronts || [];
  const brandFronts = (brand && brand.fronts) || {};
  const out = {};
  for (const [key] of FRONTS) {
    const v = statuses[key];
    const fallback = inherited.includes(key) ? (brandFronts[key] || {}).note : "";
    out[key] = {
      status: !v || v === "unassessed" ? "unknown" : v,
      note: notes[key] || fallback || "",
    };
  }
  return out;
}

/**
 * The products under a brand that carry a verdict of their own.
 *
 * A brand level answer is often the least useful one we hold. Brita is a skip
 * as a range while its Elite filter is a careful and its standard filter is a
 * skip for different reasons, so the honest next move is to ask which one the
 * person actually has rather than average the three into a shrug.
 */
/**
 * Is this row a stand-in for the brand rather than something you can hold?
 *
 * Three kinds are not products. Rows literally called "Whole range". Rows
 * whose evidence is recorded at brand scope. And 85 search aliases, which are
 * the ones that kept leaking: a matchAll list, no ASIN, source "alternative",
 * and a `cat` naming the aisle a shopper might be standing in rather than the
 * category of anything the brand sells. "Hydro Flask vacuums" exists to catch
 * someone typing "hydro flask vacuum", because a vacuum flask is what it is.
 * "Kjaer Weis cookware" catches "kjaer weis pan", where the pan is a makeup
 * pan and the brand has never made a skillet.
 *
 * Testing the name against "<brand> <that brand's own category>" recognised
 * 46 of those 85, because an alias is named after the aisle it catches and
 * not after the brand's category. The other 39 reached the picker, where
 * "which Saalt?" offered "Saalt menstrual products" beside two real cups.
 * Match on the shape instead, which is what actually distinguishes them and
 * needs no upkeep as new aliases are generated.
 *
 * An ASIN settles it either way: Eco by Naty Diapers is named exactly like a
 * generated row and is a real listing. Aliases still match, since matching
 * never consults this; only the "which one do you have" list does.
 */
export function isBrandLine(brand, row) {
  if ((row.asins || []).length) return false;
  const name = String(row.name || "").trim().toLowerCase();
  if (!name) return true;
  if (name === "whole range") return true;
  if (((row.ext || {}).scope) === "brand") return true;
  if ((row.matchAll || []).length && row.source === "alternative") return true;
  return name === `${brand.brand} ${brand.category || ""}`.trim().toLowerCase();
}

/**
 * Every product of this brand we hold a row for, rated or not.
 *
 * `ratedProducts` drops anything unrated, which is right when the question is
 * "what do we recommend" and wrong when the question is "which one are you
 * holding". Asking Primally Pure offered Deodorant and nothing else, because
 * their Body Oil, Baby Balm and Sun Cream are all unrated, so somebody holding
 * the sunscreen could not say so, and we do hold something to say about it: a
 * 466 ppb lead result. A row with no verdict still has a scorecard, and the
 * screen it opens explains what is missing and offers the free check.
 *
 * The stance comes back null for those, so a caller can mark them neutral
 * rather than borrow a colour they have not earned.
 */
export function knownProducts(brand) {
  const seen = new Set();
  const out = [];
  for (const p of brand.products || []) {
    if (!p.name) continue;
    if (isBrandLine(brand, p)) continue;
    const key = p.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ row: p, stance: productVerdict(p) });
  }
  return out;
}

export function ratedProducts(brand) {
  const seen = new Set();
  const out = [];
  for (const p of brand.products || []) {
    const v = productVerdict(p);
    if (!v || !p.name) continue;
    if (isBrandLine(brand, p)) continue;
    const key = p.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ row: p, stance: v });
  }
  return out;
}

/**
 * A better thing to buy, drawn from the brands we already rated good in the
 * same category. Ordered the way the site orders a card grid, cheapest tier
 * first, which here means the shortest researched entry list first is wrong,
 * so we simply keep the data order and let the store be the source of truth.
 */
/**
 * What we would buy instead, chosen at product scope.
 *
 * This used to pick brands whose stance is good in the same brand category,
 * which put Babo Botanicals on a diaper cream page: the brand is good because
 * its lotions are, and its diaper cream is the one that tested leaded. The
 * subtitle even printed "Diaper cream tested leaded" as the reason to buy it.
 * That is section 1's opening failure, a brand verdict standing in for a
 * product one, on the surface where it does the most damage.
 *
 * So: a product row we rate good, in the same product category, from a brand
 * we have reviewed. Falls back to the brand category only where the row has
 * none, and never returns the brand being looked at.
 */
export function alternativesFor(index, brand, limit = 3, cat = "") {
  const want = cat || (brand && brand.category) || "";
  if (!want) return [];
  const out = [];
  for (const b of index.brands) {
    if (!b || b.reviewed === false) continue;
    if (brand && b.id === brand.id) continue;
    for (const row of (b.products || [])) {
      const ext = row.ext || {};
      if (ext.verdict !== "good") continue;
      if ((row.cat || b.category) !== want) continue;
      out.push({ brand: b, row });
      break;
    }
    if (out.length >= limit) break;
  }
  return out;
}
