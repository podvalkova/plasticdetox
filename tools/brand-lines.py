#!/usr/bin/env python3
"""
Turn a whole-line brand verdict into a product line the extension can match.

Most of the diaper research is about the entire line: which pulp bleaching a
brand uses, what its cloth is made of, what a lab found in its wipes. That is a
product judgement written at brand level, and after the strict rule it produced
nothing, because a chip needs a product. 34 diaper brands researched, 15 product
entries, one ASIN each, so a live search lit up once.

This is not the Cuisinart problem. There the verdict covered appliances and the
shopper was looking at a skillet, so applying it was wrong. Here the verdict
covers the brand's diapers and the shopper is looking at diapers.

So a line is created only when both hold:
  - the verdict generalises, meaning nothing in the range contradicts it
  - the brand sits in a category we can name in the match, so the line asserts
    about that category rather than everything the brand sells

The match is the brand name plus a category word, so "Pampers" only claims
about Pampers diapers and wipes, never a future Pampers something else.

    python3 tools/brand-lines.py            # report only
    python3 tools/brand-lines.py --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

# Categories where our write-up is about the whole line, mapped to the words
# that must also appear in a listing title for the line to apply.
CATEGORY_WORDS = {
    "diapers": ["diaper", "diapers", "nappy", "nappies", "pull up", "pull-ups", "training pant"],
    "wipes": ["wipe", "wipes"],
    "diapers / wipes": ["diaper", "diapers", "wipe", "wipes", "pull up", "training pant"],
    "diapers & wipes": ["diaper", "diapers", "wipe", "wipes", "pull up", "training pant"],
    "cloth diapers": ["diaper", "diapers", "cover", "insert"],
    "baby food": ["baby food", "puree", "pouch"],
    "baby formula": ["formula"],
    "sunscreen": ["sunscreen", "spf", "sunblock"],
    "bottled water": ["water"],
    "oral care": ["toothpaste", "tooth powder", "floss", "mouthwash"],
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    added, skipped_varies, skipped_have = 0, 0, 0
    by_cat = collections.Counter()
    examples = []

    for b in brands:
        cat = (b.get("category") or "").strip().lower()
        words = CATEGORY_WORDS.get(cat)
        if not words:
            continue
        # A verdict that does not carry across the range must not become a line.
        if b.get("generalises") is False:
            skipped_varies += 1
            continue
        rows = b.setdefault("products", [])
        # Nothing to add if a line already covers this category.
        if any(p.get("match") for p in rows):
            skipped_have += 1
            continue

        brand_l = b["brand"].lower()
        # Skip a category word the brand name already ends with, or we generate
        # "black girl sunscreen sunscreen", which matches nothing.
        match = [brand_l if brand_l.endswith(w) else f"{brand_l} {w}" for w in words]
        match = list(dict.fromkeys(match))
        rows.append({
            "name": b.get("category", "Products"),
            "match": match,
            "verdict": b.get("stance"),
            "note": (b.get("reason") or "")[:400],
            "origin": "brand-line",
        })
        added += 1
        by_cat[b.get("category")] += 1
        if len(examples) < 12:
            examples.append((b["brand"], b.get("stance"), match[0]))

    print(f"added {added} product lines from whole-line brand verdicts")
    print(f"  skipped, verdict varies across the range: {skipped_varies}")
    print(f"  skipped, already had a line:              {skipped_have}")
    print("\nby category:", dict(by_cat))
    print("\nexamples:")
    for name, stance, m in examples:
        print(f"   {name:<22} {stance:<8} matches {m!r}")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
