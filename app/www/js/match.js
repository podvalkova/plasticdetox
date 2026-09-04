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
    const hit = code && this.barcodes[String(code).replace(/\D/g, "")];
    if (!hit) return null;
    const brand = this.byId.get(hit.brandId);
    return brand ? { brand, hint: hit, via: "barcode" } : null;
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

    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }
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
  const better = (p, len, d) => {
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
  const asserted = productNamed ? !!productStance : !!(productStance || brand.stance);
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
    stance: asserted ? (productStance || brand.stance || "neutral") : "neutral",
    fronts: (row && row.ext && expandFronts(row.ext, brand)) || brand.fronts || {},
    reason: productNote || brandNote,
    brandReason: brandAdds ? brandNote : "",
    scoped: brandCopyOnly || !!(row && row.ext && row.ext.disclose),
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
