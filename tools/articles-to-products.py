#!/usr/bin/env python3
"""
Pull product-level verdicts out of the ranked article tables.

The extension only asserts a verdict for a product we actually researched, and
articles like "Top 100 baby and kids products on Amazon" are exactly that: a
named product, on a named brand, with a verdict, the reasoning, and the ASIN.
That work was already done and published; it simply had never been written back
into brand-data.json where the extension can reach it.

Crucially this is the only source that supplies researched SKIP and USE
CAREFULLY verdicts on specific ASINs. The store can only ever yield picks, so
without these the extension can warn about nothing.

Rows are [id, category, product, brand, verdict, reasoning, evidence, asin, img].

    python3 tools/articles-to-products.py            # report only
    python3 tools/articles-to-products.py --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
ARTICLES = ROOT / "articles"

VERDICT = {"GOOD CHOICE": "good", "USE CAREFULLY": "careful", "SKIP": "skip"}


def collapse(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def product_tables():
    """Every article carrying a PRODUCTS = [...] table."""
    for path in sorted(ARTICLES.glob("*.html")):
        src = path.read_text(errors="ignore")
        m = re.search(r"PRODUCTS\s*=\s*\[", src)
        if not m:
            continue
        start, depth = m.end() - 1, 0
        end = None
        for i in range(start, len(src)):
            if src[i] == "[":
                depth += 1
            elif src[i] == "]":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if not end:
            continue
        try:
            yield path.name, json.loads(src[start:end])
        except json.JSONDecodeError:
            continue


def resolve(brand_name, by_name):
    """
    Match an article's brand label to a database brand.

    Article tables qualify the brand with a line or a parent company, so exact
    matching misses "Beech Nut Organics", "Hydro Flask Kids" and "Happy Baby
    (Happy Family)". Fall back to the longest known brand the label starts with,
    and require five characters so a short name cannot swallow an unrelated one.
    """
    key = collapse(brand_name)
    hit = by_name.get(key)
    if hit:
        return hit
    best = None
    for known, b in by_name.items():
        if len(known) >= 5 and key.startswith(known):
            if best is None or len(known) > len(best[0]):
                best = (known, b)
    return best[1] if best else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    by_name = {}
    for b in brands:
        for label in [b["brand"]] + list(b.get("aliases") or []):
            by_name.setdefault(collapse(label), b)

    added = updated = no_brand = no_asin = 0
    unknown_brands = collections.Counter()
    verdicts = collections.Counter()

    for article, rows in product_tables():
        for row in rows:
            if len(row) < 8:
                continue
            _, _, product, brand_name, verdict, reason, _, asin = row[:8]
            verdict = VERDICT.get((verdict or "").upper())
            if not verdict:
                continue
            if not re.fullmatch(r"[A-Z0-9]{10}", str(asin or "")):
                no_asin += 1
                continue
            brand = resolve(brand_name, by_name)
            if not brand:
                no_brand += 1
                unknown_brands[brand_name] += 1
                continue

            rows_ = brand.setdefault("products", [])
            hit = next((p for p in rows_ if asin in (p.get("asins") or [])), None)
            if hit:
                # An article verdict is researched, so it outranks a store-derived
                # one, which only ever infers "good" from the product being listed.
                if hit.get("origin") == "store" and hit.get("verdict") != verdict:
                    hit.update(verdict=verdict, note=(reason or "").strip()[:400],
                               origin="article", source=article)
                    updated += 1
                continue

            rows_.append({
                "name": (product or "").strip(),
                "asins": [asin],
                "verdict": verdict,
                "note": (reason or "").strip()[:400],
                "origin": "article",
                "source": article,
            })
            added += 1
            verdicts[verdict] += 1

    print(f"added {added} product verdicts from ranked article tables")
    print(f"  by verdict: {dict(verdicts)}")
    print(f"  corrected {updated} store-derived rows an article disagrees with")
    print(f"  skipped, no ASIN: {no_asin}")
    print(f"  skipped, brand not in the database: {no_brand}")
    if unknown_brands:
        print("  most common missing brands: "
              + ", ".join(f"{b} ({n})" for b, n in unknown_brands.most_common(8)))

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
