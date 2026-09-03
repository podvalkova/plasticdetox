#!/usr/bin/env python3
"""
Exposure by product type, so it is decided once and not per product.

Risk is not the route on its own. Toothpaste and a water bottle are both
ingestion and sit at opposite ends, because what matters is how much actually
arrives. That splits into two independent things:

  release   what comes out of the material: heat, fat
  dose      what reaches a person: route, amount, duration, retention, frequency

Retention is the one that separates toothpaste from a water bottle, so it
multiplies rather than adds: spitting something out removes most of the dose
however efficient the route is.

Every row here is a fact about how a product type is used, not a judgement
about any brand. Toothpaste is toothpaste. So it is written once per type and
823 products inherit it.

One hard rule sits above the arithmetic: anything for a baby is high. Smaller
body, developing systems, hand to mouth, and a whole life ahead of the
exposure. It is not a weighting to be traded off against a short contact time.

    python3 tools/exposure.py            # dry run, shows the table
    python3 tools/exposure.py --write    # stamp it onto every product
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
TABLE = ROOT / "data" / "exposure.json"

ROUTE = {"ingestion": 3, "mucosal": 3, "inhalation": 3, "skin": 2, "none": 0}
# What is left of the dose after use. Spat or rinsed removes most of it.
RETAINED = {"swallowed": 1.0, "leave-on": 1.0, "prolonged": 1.0, "breathed": 1.0,
            "spat": 0.25, "rinsed": 0.25, "transfer": 0.6, "none": 0.0}
DURATION = {"seconds": 0, "minutes": 1, "hours": 2, "overnight": 3, "all day": 3}
FREQUENCY = {"rare": 0, "weekly": 1, "daily": 2, "several daily": 3}

BABY = re.compile(r"\bbab(y|ies)|infant|newborn|toddler|kids?\b|child|nursery|"
                  r"diaper|teether|pacifier|formula|breast ?milk|high chair|"
                  r"car seat|stroller|swaddle|crib", re.I)


def level(row):
    """The band, from the row. Release multiplies, dose adds."""
    route = ROUTE.get(row["route"], 0)
    retained = RETAINED.get(row["retained"], 1.0)
    amplify = 1 + (0.5 if row.get("heat") else 0) + (0.5 if row.get("fat") else 0)
    score = (route * retained * amplify
             + DURATION.get(row["duration"], 0)
             + FREQUENCY.get(row["frequency"], 0))
    band = "high" if score >= 8 else "medium" if score >= 5 else "low"
    return band, round(score, 2)


def is_baby(category, name):
    return bool(BABY.search(f"{category} {name}"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    table = json.loads(TABLE.read_text())
    types, by_category = table["types"], table["categories"]
    # A per-product name beats the category. Multi-category is a bucket for
    # brands that sell across the whole shop, so the category genuinely carries
    # no information and each row has to be named.
    by_product = table.get("products", {})
    brands = json.loads(DATA.read_text())

    # The table itself, with its band worked out rather than asserted.
    print(f"{'product type':<26} {'route':<11} {'dur':<9} {'retained':<10} "
          f"{'freq':<14} {'heat':<5} {'fat':<5} {'score':>6}  level")
    for name in sorted(types):
        r = types[name]
        band, score = level(r)
        r["level"], r["score"] = band, score
        print(f"  {name:<24} {r['route']:<11} {r['duration']:<9} {r['retained']:<10} "
              f"{r['frequency']:<14} {'yes' if r.get('heat') else '-':<5} "
              f"{'yes' if r.get('fat') else '-':<5} {score:>6}  {band}")

    stamped = collections.Counter()
    unmatched = collections.Counter()
    for b in brands:
        cat = b.get("category") or ""
        for p in (b.get("products") or []):
            t = by_product.get(f"{b['brand']}::{p.get('name')}") or by_category.get(cat)
            if not t:
                unmatched[cat] += 1
                continue
            row = types.get(t)
            if not row:
                unmatched[cat] += 1
                continue
            band, score = level(row)
            baby = is_baby(cat, p.get("name") or "")
            if baby and band != "high":
                band, why = "high", "for a baby, which is high whatever the arithmetic says"
            else:
                why = row.get("note", "")
            if args.write:
                p.setdefault("ext", {})["exposure"] = {
                    "type": t, "level": band, "score": score, "baby": baby,
                    "route": row["route"], "duration": row["duration"],
                    "retained": row["retained"], "frequency": row["frequency"],
                    "heat": bool(row.get("heat")), "fat": bool(row.get("fat")),
                    "why": why,
                }
            stamped[band] += 1

    print(f"\nproducts given an exposure level: {sum(stamped.values())}   {dict(stamped)}")
    if unmatched:
        print(f"\n{sum(unmatched.values())} products in {len(unmatched)} categories with no type yet:")
        for c, n in unmatched.most_common(14):
            print(f"  {n:>4}  {c}")
    if args.write:
        TABLE.write_text(json.dumps(table, indent=1, ensure_ascii=False) + "\n")
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print("\nwrote brand-data.json and data/exposure.json")
    else:
        print("\ndry run. re-run with --write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
