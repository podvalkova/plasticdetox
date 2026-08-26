#!/usr/bin/env python3
"""
Attach ASINs to per-product verdicts, and let a product override the brand.

Nearly half of our product-level verdicts disagree with their own brand: Aveeno
is careful but its sunscreens are skip, Brita is skip but the Elite and
Longlast+ filters are careful. Those distinctions never reached the extension,
because it matched a product entry by exact name and the names never matched
("Aquasana AQ-4100 Shower Filter" from the ASIN map versus "AQ-4100 shower
filter" in the entry). Zero of 63 candidates resolved.

Matching on the ASIN instead makes it exact. This finds the links by checking
whether an editorial product name appears inside a linked product's title, then
writes them onto the product entry as `asins`.

    python3 tools/link-product-asins.py           # report only
    python3 tools/link-product-asins.py --write
"""

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
ASINS = ROOT / "extension" / "data" / "asin-map.json"

# Words that carry no identity, so they never justify a match on their own.
NOISE = re.compile(r"\b(the|and|for|with|size|count|pack|oz|ct|ml|l|kit|set)\b", re.I)


def collapse(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def core(s):
    """Product name with brand-agnostic noise stripped, for containment tests."""
    return collapse(NOISE.sub(" ", s or ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    by_id = {b["id"]: b for b in brands}
    asin_map = json.loads(ASINS.read_text())

    linked, ambiguous, unmatched = [], [], []

    for asin, entry in asin_map.items():
        brand = by_id.get(entry.get("brandId"))
        if not brand or not brand.get("products"):
            continue
        title = core(entry.get("name", ""))
        if not title:
            continue

        # A product entry matches when its distinctive name sits inside the
        # listing title. Longest name wins, so "Claryum under sink" beats
        # a shorter entry that happens to also be contained.
        cands = []
        for p in brand["products"]:
            pc = core(p.get("name", ""))
            if len(pc) >= 6 and pc in title:
                cands.append((len(pc), p))
        if not cands:
            unmatched.append((brand["brand"], entry.get("name", "")))
            continue
        cands.sort(key=lambda t: -t[0])
        if len(cands) > 1 and cands[0][0] == cands[1][0]:
            ambiguous.append((brand["brand"], entry.get("name", "")))
            continue

        product = cands[0][1]
        got = product.setdefault("asins", [])
        if asin not in got:
            got.append(asin)
            linked.append((brand["brand"], product["name"], asin,
                           product.get("verdict"), brand.get("stance")))

    print(f"linked {len(linked)} ASINs onto product entries")
    diverge = [r for r in linked if r[3] and r[3] != r[4]]
    print(f"  of which {len(diverge)} now show a verdict different from their brand:")
    for b, p, a, v, s in diverge[:15]:
        print(f"    {b:<18} {p[:34]:<34} {a}  {s} -> {v}")
    if ambiguous:
        print(f"\n  {len(ambiguous)} ambiguous, left unlinked:")
        for b, n in ambiguous[:5]:
            print(f"    {b}: {n[:50]}")
    print(f"\n  {len(unmatched)} linked ASINs matched no product entry (brand verdict still applies)")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
