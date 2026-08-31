# Product data structure

One file, `brand-data.json`, 814 brands. Everything the site and the extension
know lives here. This is the reference for reading it, editing it by hand, and
knowing which fields a rebuild will overwrite.

Last revised 2026-08-31.

---

## 1. Shape

```jsonc
{
  "id": "coterie",
  "brand": "Coterie",
  "aliases": ["Coterie Baby"],
  "category": "Diapers / wipes",

  "stance": "good",              // the brand verdict Brand Check shows
  "reason": "…",                 // the paragraph under the badge
  "evidence": "…",               // the one line evidence chip
  "alternative": "…",            // the "Better:" line
  "article": "best-non-toxic-diapers.html",
  "sources": ["…"],
  "generalises": true,           // false = the verdict does not cover the range
  "reviewed": true,              // false = research, not yet reviewed by a person

  "fronts": { … },               // brand level scorecard, see section 3
  "rollup": { … },               // generated, see section 5
  "rollupApplied": true,         // generated
  "rollupNote": "…",             // generated

  "products": [ … ]              // section 2
}
```

## 2. A product row

```jsonc
{
  "name": "Coterie Diapers",
  "asins": ["B0C2DCB188"],       // exact listings this row speaks about
  "match": ["colgate total"],    // adjacent phrase in a listing title
  "matchAll": [["pampers","diaper"]],  // words that must all appear, any order
  "verdict": "good",             // EDITORIAL. what the site says.
  "note": "…",                   // the reasoning, shown on both surfaces
  "origin": "registry",          // where this row came from, see section 4
  "source": "best-non-toxic-diapers.html",

  "ext": { … }                   // GENERATED. what the extension may assert.
}
```

### How a row is matched to a listing

Three mechanisms, most specific first:

| Field | Matches | Use for |
|---|---|---|
| `asins` | that exact listing | a product we researched by hand |
| `match` | an adjacent phrase in the title | a named line, "Colgate Total" |
| `matchAll` | every word present, any order | a whole line, `["pampers","diaper"]` |

`matchAll` exists because real titles read "Pampers Swaddlers Diapers", so
requiring "pampers diaper" adjacent misses nearly all of them.

Precedence when several rows match, in order:

1. an exact ASIN hit
2. a researched row over a generated `brand-line` row, however long the match
3. the better evidenced row, counting fronts that are not `unassessed`
4. the longer match

## 3. The `ext` block

The strict per-product verdict, written by `tools/apply-product-rules.py`
against `docs/rating-rules.md`.

```jsonc
"ext": {
  "verdict": "good",             // good | careful | skip | unrated
  "why": "direct evidence at sku scope on formula, testing",
  "fronts": { "formula": "pass", "packaging": "unassessed",
              "legal": "unassessed", "testing": "pass" },
  "scope":  "sku",               // sku | line | brand | none
  "basis":  "direct",            // direct | inherited
  "disclose": false,             // true = the card must name the inherited scope
  "rules": ["2 formula-read-from-materials"],
  "dated": "2026-08-29",         // when the VERDICT last changed, not the build date
  "authored": true               // OPTIONAL. see below.
}
```

A front's status is `pass | caution | fail | unassessed | none`. The last two
are different states and the difference carries weight: `unassessed` means
nobody has looked yet and it blocks a recommendation; `none` means we looked
and no evidence of that kind exists for this product (no lab tests a
toothbrush handle), which is a finding and satisfies the completeness gate.

The completeness gate (`enforce-scorecard.py`) adds three more fields it owns:

```jsonc
"heldFrom": "good",              // the verdict the gate is sitting on
"heldBack": ["legal","testing"], // the checks still to do; the extension shows these
"cappedFrom": "good"             // verdict lowered by a caution or fail front
```

A held row renders in the extension as "Checks in progress", naming what is
done and what is still open. It returns to its verdict on its own the moment
the missing fronts are filled.

`verdict` and `ext.verdict` differ on purpose, on a large share of rows. The
site can carry a hedge and a paragraph of context; the extension gets one line
at the moment of purchase, so it holds the stricter line. `unrated` renders as
no asserted status, with either a request a review button or, for held rows,
the checks in progress panel.

### Editing by hand

**Add `"authored": true` and the rebuild will never touch that row again.**
Everything else in `ext` is regenerated from the note on every build, so an edit
without the flag is silently destroyed on the next `build-extension.py`.

```jsonc
"ext": {
  "verdict": "good",
  "why": "Reviewed by hand: the silicone pouch is the only milk contact surface, the PP shell never touches it.",
  "fronts": { "formula": "pass", "packaging": "pass",
              "legal": "unassessed", "testing": "unassessed" },
  "scope": "sku", "basis": "direct", "disclose": false,
  "authored": true
}
```

The same convention already exists one level up: a brand whose `fronts` object
carries `"authored": true` is never regenerated either.

Run `python3 tools/audit-product-rules.py` after editing. It reports what every
row would become and why, and writes nothing.

## 4. `origin`, and what it means for trust

| origin | count | what it is | can it recommend? |
|---|---|---|---|
| `store` | 185 | a store listing, so already vetted | yes |
| `brand-line` | generated | the brand verdict projected onto a category | **no**, rule 1.1 |
| `article` | 79 | a row in a ranked article table | yes |
| `registry` | 51 | a baby registry pick | yes |
| `hand` | 95 | written during research, no ASIN | yes |

`brand-line` rows are the only ones that cannot carry a recommendation, because
they are inherited rather than researched. They can still warn, and when they do
the card says so.

## 5. Generated fields, never edit these

Everything below is rewritten by `tools/build-extension.py` on every run.

| Field | Written by |
|---|---|
| `fronts` (brand) | `backfill-fronts.py`, unless `authored` |
| `article` | `link-articles.py` |
| `generalises`, `scopeNote` | `mark-scope.py` |
| `products[]` rows | `store-to-products`, `articles-to-products`, `registry-to-products`, `brand-lines` |
| `products[].matchAll` on hand rows | `name-to-match.py` |
| `products[].ext` | `apply-product-rules.py`, unless `authored` |
| `rollup`, `rollupApplied`, `rollupNote` | `brand-rollup.py` |

## 6. The pipeline

`python3 tools/build-extension.py --zip` runs, in order:

```
validate-data --stage pre   field shapes, unique ids and labels, rule collisions.
                            the gate a hand edit or an AI research run must clear
backfill-fronts       brand scorecard from brand prose
harvest-asins         ASIN to brand map
link-articles         attach the guide that covers each brand
mark-scope            set generalises
store-to-products     \
articles-to-products   >  product rows from existing research
registry-to-products  /
brand-lines           whole-line rows where the verdict generalises
name-to-match         give hand rows a way to fire
apply-product-rules   stamp ext, collapse duplicate rows, refuse to write if two
                      rules would answer one listing with different verdicts
brand-rollup          products up into the brand stance
extract-testing       structured testing evidence onto the fronts
check-recalls         legal front against the recall databases
enforce-scorecard     the completeness gate: a good ships only with all four
                      checks carrying a finding, held back and named otherwise
audit-alternatives    fail the build if a "Better:" points at a flagged brand
validate-data --stage post  every invariant the standard promises, on the file
                            about to ship
build-verdict-standard      regenerate docs/verdict-standard.html from the data
```

## 7. Adding new research

To add one product you have researched:

```jsonc
// inside the brand's "products" array
{
  "name": "Whatever it is called",
  "asins": ["B0XXXXXXXX"],
  "verdict": "careful",
  "note": "What you found and where it came from. Name the lab and the year.",
  "origin": "hand",
  "ext": { "verdict": "careful", "why": "…",
           "fronts": {"formula":"pass","packaging":"caution",
                      "legal":"unassessed","testing":"unassessed"},
           "scope":"sku", "basis":"direct", "disclose": false,
           "authored": true }
}
```

If the brand is not in the file yet, add the brand object first with at least
`id`, `brand`, `category`, `stance`, `reason`. One entry per brand: if the
company already has an entry under another spelling, add your spelling to its
`aliases` instead of creating a second entry. `validate-data.py` refuses
duplicate ids and labels for exactly this reason.

Then:

```
python3 tools/validate-data.py --stage pre   # shapes and collisions, instantly
python3 tools/audit-product-rules.py         # check what it will do
python3 tools/build-extension.py --zip       # rebuild and package
```

### The same contract for an AI research run

A model vetting a product on a customer's request follows this section exactly:
it writes one brand entry and one product row in the shapes above, scoped to
what it actually researched, with the evidence in the note (lab, year, limit of
detection). Three rules keep that safe:

1. **The row must clear `validate-data --stage pre` before anything else runs.**
   A malformed field is rejected, not propagated.
2. **`reviewed: false` on the brand until a person has looked.** The extension
   then shows "Research, not yet reviewed" instead of a stance badge; a machine
   verdict is presented as findings, never as our recommendation.
3. **The pipeline, not the model, decides the verdict.** The model records
   evidence; `apply-product-rules` and the completeness gate turn evidence into
   the verdict under the written standard. An AI-authored `ext` block with
   `authored: true` is reserved for rows a person has signed off.
