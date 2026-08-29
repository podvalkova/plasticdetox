#!/usr/bin/env python3
"""
Fold the taxonomy down to categories a shopper would actually filter by.

94 categories, 54 of them holding fewer than five products and 21 holding
exactly one. That is not thin coverage, it is fragmentation: coffee was split
across seven labels (Coffee, Coffee beans, Coffee & kitchen, Coffee brewer,
Coffee grinder, Espresso machine, Reusable coffee cup) holding sixteen products
between them, and diapers across four holding fifty-seven.

They fragmented because different tools wrote the field from different sources,
and because slash-categories like "Car seats / sleep" were invented one product
at a time. A category with one product in it is not a category, it is a label
someone used once, and as a filter it is a dead end.

The test applied here is what a person shopping would pick from a list, not how
the research happened to be organised.

    python3 tools/consolidate-categories.py            # report only
    python3 tools/consolidate-categories.py --write
"""

import argparse
import collections
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

MAP = {
    # one aisle, four labels
    "Diapers": "Diapers & wipes",
    "Wipes": "Diapers & wipes",
    "Cloth diapers": "Diapers & wipes",
    # everything you brew with
    "Coffee beans": "Coffee",
    "Coffee & kitchen": "Coffee",
    "Coffee brewer": "Coffee",
    "Coffee grinder": "Coffee",
    "Espresso machine": "Coffee",
    "Reusable coffee cup": "Coffee",
    "Tea accessory": "Tea",
    # feeding
    "Formula": "Baby food & formula",
    "Baby food": "Baby food & formula",
    "Baby food / formula": "Baby food & formula",
    "Baby food prep": "Baby food & formula",
    "Baby food storage": "Food storage",
    "Coolers": "Food storage",
    "Breast milk storage": "Baby bottles",
    "Pacifiers": "Baby bottles",
    "Teethers": "Baby bottles",
    "Baby textiles / teethers": "Textiles & bedding",
    # anything you drink from
    "Water bottles": "Drinkware",
    "Toddler drinkware": "Drinkware",
    # nursery and gear
    "Nursery furniture": "Nursery",
    "High chairs": "Nursery",
    "Mattress": "Baby sleep",
    "Car seats": "Car seats & strollers",
    "Car seats / sleep": "Car seats & strollers",
    "Car seats / strollers": "Car seats & strollers",
    "Strollers": "Car seats & strollers",
    "Baby carriers": "Baby & kids",
    # soft goods
    "Bedroom": "Textiles & bedding",
    "Bedding / basics": "Textiles & bedding",
    "Basics": "Textiles & bedding",
    "Baby textiles": "Textiles & bedding",
    "Bath textiles": "Textiles & bedding",
    "Rugs": "Textiles & bedding",
    "Kids clothing": "Clothing",
    "Baby clothing": "Clothing",
    "Swimwear": "Clothing",
    "Sun hats": "Clothing",
    "Baby sun hats": "Clothing",
    "Activewear": "Fitness",
    "Yoga mats": "Fitness",
    # play
    "Beach toys": "Toys",
    "Beach shade": "Toys",
    "Play mats": "Toys",
    "Tableware / toys": "Tableware",
    "Tableware / bibs": "Tableware",
    # the rest
    "Skincare": "Personal care",
    "Bath accessories": "Personal care",
    "Kids oral care": "Oral care",
    "Gum": "Chewing gum",
    "Grains": "Pantry",
    "Legumes": "Pantry",
    "Salt / electrolytes": "Salt",
    "Sunscreen / baby skincare": "Sunscreen",
    "Diaper cream": "Baby skincare",
    "Bakeware": "Cookware",
    "Cutting boards": "Kitchen",
}


def counts(brands):
    per = collections.Counter()
    for b in brands:
        n = len([p for p in (b.get("products") or []) if p.get("ext")])
        if n:
            per[b.get("category") or "?"] += n
    return per


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    before = counts(brands)

    moved = collections.Counter()
    for b in brands:
        c = b.get("category")
        if c in MAP:
            b["category"] = MAP[c]
            moved[f"{c} -> {MAP[c]}"] += 1

    after = counts(brands)
    print(f"categories: {len(before)} -> {len(after)}")
    print(f"holding fewer than 5 products: "
          f"{sum(1 for v in before.values() if v < 5)} -> "
          f"{sum(1 for v in after.values() if v < 5)}\n")

    print("after consolidation:")
    for c, n in sorted(after.items(), key=lambda t: (-t[1], t[0])):
        flag = "   <- still thin" if n < 5 else ""
        print(f"  {n:>3}  {c}{flag}")

    # A category with fewer than five products is a dead end as a filter: the
    # shopper picks it and finds almost nothing. Report rather than fail, since
    # the fix is research or a merge and neither should block a build.
    thin = sorted(((c, n) for c, n in after.items() if n < 5), key=lambda t: t[1])
    if thin:
        print(f"\n{len(thin)} categories hold fewer than five products:")
        for c, n in thin:
            print(f"  {n}  {c}")
    else:
        print("\nevery category holds at least five products.")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
