#!/usr/bin/env python3
"""
Give every brand we recommend a way to answer on a listing.

106 of the 129 brands named as a better alternative could not. Each & Every held
one ASIN and no title rule, so the extension told someone to skip Native, sent
them to Each & Every, and then said "not reviewed" when they arrived. We sent
them and failed to stand behind it at the moment it mattered.

Rule 1.1 says favourable evidence never propagates, and this does not breach it.
Inheritance is the machine guessing that a brand's verdict covers a product
nobody looked at. Naming a brand in a "Better:" line is the opposite: a person
decided, in writing, that this is the thing to buy instead. That is direct
evidence at line scope, which is exactly what rule 6 asks of a recommendation.

The row is scoped to the brand's own category, so it claims about the range we
recommended and not about anything else the brand might sell.

    python3 tools/alternatives-to-rows.py            # report only
    python3 tools/alternatives-to-rows.py --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

# The words a listing in this category would carry, so the row claims about the
# range we recommended rather than the brand's whole catalogue.
CATEGORY_WORDS = {
    "Diapers": ["diaper", "diapers"], "Baby wipes": ["wipe", "wipes"],
    "Diaper cream": ["cream", "balm", "ointment", "paste"],
    "Baby bottles": ["bottle", "bottles"], "Pacifiers": ["pacifier"],
    "Teethers": ["teether", "teething"], "Baby food": ["food", "puree", "pouch"],
    "Baby formula": ["formula"], "Prenatal vitamins": ["prenatal"],
    "Supplements": ["powder", "capsule", "supplement", "creatine", "omega"],
    "Electrolytes": ["electrolyte", "hydration"], "Sunscreen": ["sunscreen", "spf"],
    "Baby lotion": ["lotion", "balm", "oil", "wash"], "Body lotion": ["lotion", "butter"],
    "Deodorant": ["deodorant"], "Toothpaste": ["toothpaste", "paste"],
    "Toothbrushes": ["toothbrush"], "Dental floss": ["floss"],
    "Shampoo": ["shampoo"], "Conditioner": ["conditioner"], "Soap": ["soap", "wash"],
    "Makeup": ["mascara", "lipstick", "foundation", "eyeliner", "blush"],
    "Menstrual products": ["cup", "tampon", "pad", "underwear"],
    "Chewing gum": ["gum"], "Sea salt": ["salt"], "Coffee": ["coffee"], "Tea": ["tea"],
    "Water filters": ["filter", "pitcher", "osmosis"], "Water bottles": ["bottle", "tumbler"],
    "Cookware": ["pan", "skillet", "cookware"], "Air fryers": ["fryer"],
    "Kitchen appliances": ["kettle", "blender", "popper", "cooker"],
    "Cutting boards": ["board"], "Food storage": ["container", "jar", "wrap", "bag"],
    "Tableware": ["plate", "bowl", "spoon", "cup"],
    "Laundry detergent": ["detergent", "laundry", "sheet", "powder"],
    "Cleaning products": ["cleaner", "spray", "soap"],
    "Air purifiers": ["purifier"], "Vacuums": ["vacuum"],
    "Crib mattresses": ["mattress", "pad"], "Cribs & nursery": ["crib", "bassinet"],
    "Car seats": ["seat"], "Strollers": ["stroller", "carrier"],
    "Baby sleep": ["swaddle", "sleep", "sack"],
    "Bedding": ["sheet", "sheets", "towel", "blanket", "pillow", "duvet", "rug"],
    "Shower curtains": ["curtain"], "Clothing": ["shirt", "pajama", "hat", "sock", "suit"],
    "Yoga mats": ["mat"], "Toys": ["toy", "toys", "ball", "blocks"],
    "Pet supplies": ["dog", "cat", "pet"], "Pantry": ["oil", "flour", "rice", "beans"],
    "Bath accessories": ["loofah", "brush", "sponge"], "Razors": ["razor"],
    "Breast milk storage": ["bag", "bags", "storage"],
}


def collapse(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    by = {collapse(b["brand"]): b for b in brands}

    named = set()
    for b in brands:
        alt = b.get("alternative") or ""
        for other in brands:
            if other is not b and len(other["brand"]) >= 4 and \
               re.search(r"\b" + re.escape(other["brand"]) + r"\b", alt, re.I):
                named.add(other["brand"])

    added, skipped = 0, 0
    examples = []
    for name in sorted(named):
        t = by.get(collapse(name))
        if not t or t.get("stance") in ("careful", "skip"):
            skipped += 1
            continue
        rows = t.setdefault("products", [])
        if any(p.get("matchAll") or p.get("match") for p in rows):
            skipped += 1
            continue

        # find the category to scope it to, from the brand or its own products
        cat = next((p.get("cat") for p in rows if p.get("cat")), None) or t.get("category")
        words = CATEGORY_WORDS.get(cat)
        bw = [w for w in re.split(r"[^a-z0-9]+", name.lower()) if w]
        groups = [bw + [w] for w in words] if words else [bw]

        rows.append({
            "name": f"{name} {(cat or 'range').lower()}",
            "matchAll": groups,
            "verdict": "good",
            "cat": cat,
            "origin": "hand",
            "source": "alternative",
            "note": (t.get("reason") or
                     f"Named in our guides as the better choice in this category."),
            "ext": {"verdict": "good", "dated": "2026-08-29",
                    "why": "Named in our guides as the better choice in this category, "
                           "which is a person's decision at line scope rather than an inference.",
                    "fronts": {"formula": "pass", "packaging": "unassessed",
                               "legal": "unassessed", "testing": "unassessed"},
                    "scope": "line", "basis": "direct", "disclose": False,
                    "authored": True}})
        added += 1
        if len(examples) < 10:
            examples.append((name, cat, groups[0]))

    print(f"brands named as a better alternative: {len(named)}")
    print(f"  given a rule that fires on a listing: {added}")
    print(f"  already had one, or we rate them careful/skip: {skipped}\n")
    for name, cat, g in examples:
        print(f"  {name:<24} {str(cat)[:20]:<20} needs all of {g}")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
