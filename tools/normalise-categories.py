#!/usr/bin/env python3
"""
One name per category.

The category is a filter on Brand Check and in the published standard, so two
spellings of one thing split its products across two entries and a reader
filtering by either sees half the list. Three pairs had drifted: air purifiers
by casing and plural, diapers and wipes by separator, water filters by noun.

They drifted because different tools wrote the field from different sources.
store-to-brands takes the store's own `cat`, which says "Air Purifiers"; the
hand-written entries say "Air purifier". Canonicalising after the fact is the
fix, plus a report on anything new that looks like a variant.

    python3 tools/normalise-categories.py            # report only
    python3 tools/normalise-categories.py --write
"""

import argparse
import collections
import difflib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

# variant -> canonical
CANON = {
    "Air Purifiers": "Air purifier",
    "Air purifiers": "Air purifier",
    "Diapers / wipes": "Diapers & wipes",
    "Water filtration": "Water filter",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    moved = collections.Counter()
    for b in brands:
        c = b.get("category")
        if c in CANON:
            b["category"] = CANON[c]
            moved[f"{c} -> {CANON[c]}"] += 1

    print("renamed:")
    for k, v in moved.items():
        print(f"  {v:>3}  {k}")
    if not moved:
        print("  nothing to rename")

    live = collections.Counter(b.get("category") or "?" for b in brands if b.get("products"))
    print(f"\ncategories in use: {len(live)}")

    # Anything new that looks like a variant, so the next drift is visible
    keys = sorted(live)
    warn = []
    for i, a in enumerate(keys):
        for x in keys[i + 1:]:
            if re.sub(r"[^a-z0-9]", "", a.lower()).rstrip("s") == \
               re.sub(r"[^a-z0-9]", "", x.lower()).rstrip("s"):
                warn.append((a, live[a], x, live[x]))
    if warn:
        print("\nstill look like the same category spelled two ways:")
        for a, na, x, nx in warn:
            print(f"  {a} ({na})  ~  {x} ({nx})")
    else:
        print("no two categories differ only by case, plural or punctuation.")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
