// Barcode to product, and packaging to plain English.
//
// We hold verdicts on brands, not on barcodes, so a scan has to become a brand
// name before our own data can answer. Open Food Facts and its sister
// databases are the bridge: they are free, need no key, and return the
// manufacturer's own brand field rather than a marketing title, which is the
// signal our matcher is most reliable on.
//
// They also carry something no other scanner app uses: the packaging material,
// down to the polymer. Even when we have never researched a brand, a scan can
// still answer the question the app exists to answer, which is what plastic is
// touching this food.
//
// Sister databases are tried in order and any one of them can be down without
// taking the scan with it. Open Beauty Facts in particular times out often
// enough that it is never the first call and never the only one.

const HOSTS = [
  { id: "food", url: "https://world.openfoodfacts.org" },
  { id: "products", url: "https://world.openproductsfacts.org" },
  { id: "beauty", url: "https://world.openbeautyfacts.org" },
];

const FIELDS = [
  "product_name", "brands", "categories_tags",
  "packaging_materials_tags", "packagings", "image_front_small_url", "quantity",
].join(",");

// Polymer tags as the databases spell them, mapped to what a person needs to
// know standing in a shop. `concern` drives the colour, `why` is the one line.
const MATERIALS = {
  "en:glass":        { label: "Glass", concern: "none", why: "Inert. Nothing migrates into the food." },
  "en:steel":        { label: "Steel", concern: "none", why: "Inert, though can linings are worth checking." },
  "en:aluminium":    { label: "Aluminium", concern: "low", why: "Usually lined, and the lining is the part that matters." },
  "en:paper":        { label: "Paper", concern: "low", why: "Often has a thin plastic or PFAS coating on the food side." },
  "en:paperboard":   { label: "Paperboard", concern: "low", why: "Often has a thin plastic or PFAS coating on the food side." },
  "en:cardboard":    { label: "Cardboard", concern: "low", why: "Often has a thin plastic or PFAS coating on the food side." },
  "en:pet-1-polyethylene-terephthalate": { label: "PET (1)", concern: "high", why: "Sheds microplastics into what it holds, more so with heat, age and sunlight.", article: "articles/how-to-remove-microplastics-from-bottled-water.html" },
  "en:hdpe-2-high-density-polyethylene": { label: "HDPE (2)", concern: "medium", why: "Among the more stable plastics, but still a plastic in contact with food." },
  "en:pvc-3-polyvinyl-chloride": { label: "PVC (3)", concern: "high", why: "Can carry phthalate plasticisers and is one to avoid around food.", article: "articles/how-to-avoid-bpa-and-phthalates.html" },
  "en:ldpe-4-low-density-polyethylene": { label: "LDPE (4)", concern: "medium", why: "Flexible film. Stable, but a plastic contact surface all the same." },
  "en:pp-5-polypropylene": { label: "PP (5)", concern: "medium", why: "Heat tolerant, and still sheds particles when scratched or microwaved." },
  "en:ps-6-polystyrene": { label: "PS (6)", concern: "high", why: "Can leach styrene, especially with hot or fatty food.", article: "articles/not-all-plastic-is-the-same.html" },
  "en:o-7-other-plastics": { label: "Other plastic (7)", concern: "high", why: "A catch all that includes polycarbonate, the BPA one.", article: "articles/bpa-free-is-not-safe.html" },
  "en:plastic":      { label: "Plastic", concern: "high", why: "The label does not say which polymer, which is itself worth knowing.", article: "articles/not-all-plastic-is-the-same.html" },
};

const CONCERN_ORDER = { none: 0, low: 1, medium: 2, high: 3 };

/** Normalise whatever the scanner handed us into digits. */
export function cleanCode(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

/**
 * A UPC-A read as a 12 digit code and the same product listed as a 13 digit
 * EAN are the same barcode. Try both spellings before giving up.
 */
function variants(code) {
  const out = [code];
  if (code.length === 12) out.push("0" + code);
  if (code.length === 13 && code.startsWith("0")) out.push(code.slice(1));
  return out;
}

async function ask(host, code, signal) {
  const res = await fetch(`${host.url}/api/v2/product/${code}.json?fields=${FIELDS}`, { signal });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body || body.status !== 1 || !body.product) return null;
  return { host: host.id, ...body.product };
}

/**
 * Look a barcode up across the open databases.
 *
 * Each host gets its own short timeout rather than one budget for all of them,
 * so a hanging sister database cannot eat the whole scan. Returns null when
 * nothing knows the code, which is a normal outcome and a screen of its own.
 */
export async function lookup(rawCode, { timeout = 6000 } = {}) {
  const code = cleanCode(rawCode);
  if (!code) return null;

  for (const host of HOSTS) {
    for (const variant of variants(code)) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      try {
        const hit = await ask(host, variant, ctl.signal);
        if (hit) return normalise(code, hit);
      } catch {
        // Down, slow, or rate limited. Next host.
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return null;
}

function normalise(code, p) {
  // The brands field is a comma separated list, most specific first, and the
  // first entry is the one a shopper would name.
  const brands = String(p.brands || "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    code,
    source: p.host,
    title: p.product_name || "",
    brandName: brands[0] || "",
    allBrands: brands,
    quantity: p.quantity || "",
    image: p.image_front_small_url || "",
    categories: (p.categories_tags || []).filter((t) => t.startsWith("en:")),
    packaging: readPackaging(p),
  };
}

/**
 * What the package is made of, worst material first.
 *
 * Worst first because that is the answer: a jar with a plastic lid is a
 * plastic contact surface, and listing the glass first would bury the part
 * that matters.
 */
function readPackaging(p) {
  const tags = new Set(p.packaging_materials_tags || []);
  for (const row of p.packagings || []) {
    if (row && row.material) tags.add(String(row.material).toLowerCase());
  }
  const out = [];
  for (const tag of tags) {
    const known = MATERIALS[tag];
    if (known) out.push({ tag, ...known });
  }
  out.sort((a, b) => CONCERN_ORDER[b.concern] - CONCERN_ORDER[a.concern]);
  return out;
}

/** The single line that heads a packaging read. */
export function packagingHeadline(materials) {
  if (!materials || !materials.length) return null;
  const worst = materials[0];
  if (worst.concern === "none") return { concern: "none", text: `Packaged in ${worst.label.toLowerCase()}.` };
  if (worst.concern === "low") return { concern: "low", text: `Packaged in ${worst.label.toLowerCase()}.` };
  return { concern: worst.concern, text: `Your food is touching ${worst.label}.` };
}
