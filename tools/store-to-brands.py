#!/usr/bin/env python3
"""
Create a Brand Check entry for every store brand that does not have one.

A listing in the store is a product a person vetted and chose to put our name to.
That is a researched judgement, and it was reaching nobody: 81 store brands had
no Brand Check entry at all, so a shopper who found one of our own picks on
Amazon was told we had not reviewed it.

The entry is written from the store record itself. `desc` is the reasoning,
`effectiveness` is the evidence, `cons` become the caveats, and the verdict is
good, because that is what listing it in the store already asserts.

`generalises` is false on every one of them. We vetted a product, not a company,
and nothing here licenses a verdict on the rest of a brand's range.

    python3 tools/store-to-brands.py            # report only
    python3 tools/store-to-brands.py --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
STORE = ROOT / "data" / "store-products.js"

FIELD = re.compile(r'(\w+):\s*"([^"]*)"')
LIST = re.compile(r'(\w+):\s*\[([^\]]*)\]')

# Words that are not the brand: a store name often leads with the product.
STOP_FIRST = {"the", "a", "an", "organic", "natural", "reusable", "stainless",
              "glass", "wool", "cotton", "linen", "bamboo", "silicone", "wide",
              "large", "small", "double", "zero", "eco", "biodegradable",
              "medical", "gots", "plastic", "pack", "set", "solid", "classic"}

CATEGORY = {
    "Kids": "Baby & kids", "Bathroom": "Personal care", "Makeup": "Cosmetics",
    "Kitchen": "Kitchen", "Food Storage": "Food storage", "Coffee": "Coffee",
    "Pantry": "Pantry", "Supplements": "Supplements", "Bedroom": "Bedroom",
    "Cleaning and Laundry": "Cleaning", "Vacuums": "Vacuum", "Fitness": "Fitness",
    "Clean Water": "Water filtration", "Cookware": "Cookware", "Tea": "Tea",
}


def parse_store():
    out = []
    for blob in re.findall(r"\{[^{}]*?name:\s*\"[^\"]+\"[^{}]*?\}", STORE.read_text()):
        r = {k: v for k, v in FIELD.findall(blob)}
        for k, body in LIST.findall(blob):
            r[k] = [x.strip().strip('"') for x in body.split('","')] if body.strip() else []
        if r.get("name"):
            out.append(r)
    return out


def brand_from(name):
    """The leading words of a store name, up to the first product noun."""
    words = [w for w in re.split(r"\s+", name.strip()) if w]
    keep = []
    for w in words[:3]:
        bare = re.sub(r"[^A-Za-z0-9'&+.-]", "", w)
        if not bare:
            break
        if keep and bare.lower() in STOP_FIRST:
            break
        keep.append(bare)
        # A capitalised run is the brand; stop at the first lowercase word.
        if len(keep) >= 2 and not bare[0].isupper():
            break
    return " ".join(keep).strip(" -")


# A store name that leads with the product rather than a maker: "Organic Cotton
# Sheets", "Soy Wax Candle Set", "Stainless Steel Dog Bowls". There is no brand
# to match on, so an entry would assert a verdict under a name no listing carries.
GENERIC_WORDS = {
    "organic", "cotton", "glass", "stainless", "steel", "soy", "wax", "candle",
    "food", "grade", "mineral", "oil", "dog", "bowls", "containers", "with",
    "bamboo", "lids", "set", "pack", "reusable", "biodynamic", "decaf", "coffee",
    "sheets", "rug", "bags", "brush", "sponge", "cloth", "wool", "linen", "bread",
    "produce", "mesh", "silicone", "wooden", "wood", "natural", "clean", "pure",
    "medical", "one", "size", "large", "small", "plastic", "free", "zero", "waste",
}


def is_generic(name):
    words = [w.lower() for w in re.split(r"[^A-Za-z0-9]+", name) if w]
    return not words or all(w in GENERIC_WORDS for w in words)


def collapse(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    known = set()
    for b in brands:
        for label in [b["brand"]] + list(b.get("aliases") or []):
            if len(collapse(label)) >= 3:
                known.add(collapse(label))

    def resolves(name):
        w = re.sub(r"[^a-z0-9 ]", "", name.lower()).split()
        for n in range(min(4, len(w)), 0, -1):
            if "".join(w[:n]) in known:
                return True
        return False

    made, skipped = [], 0
    seen = {}
    for r in parse_store():
        if resolves(r["name"]):
            skipped += 1
            continue
        bn = brand_from(r["name"])
        if len(collapse(bn)) < 3 or is_generic(bn):
            continue
        seen.setdefault(collapse(bn), (bn, r))

    for key, (bn, r) in seen.items():
        cat = CATEGORY.get(r.get("cat", ""), r.get("cat") or "Multi-category")
        desc = (r.get("desc") or "").strip()
        ev = (r.get("effectiveness") or "").strip()
        reason = desc if desc else f"A vetted store pick: {r['name']}."
        if ev and ev.lower() not in reason.lower():
            reason = reason.rstrip(".") + ". " + ev.rstrip(".") + "."
        entry = {
            "id": re.sub(r"[^a-z0-9]+", "-", bn.lower()).strip("-"),
            "brand": bn,
            "category": cat,
            "stance": "good",
            "reason": (reason + " Vetted for the store; this verdict covers the "
                       "product we listed, not the brand's whole range.")[:600],
            "evidence": ev[:200] or "Vetted for the Plastic Detox store",
            "sources": ["store"],
            "reviewed": True,
            "generalises": False,
            "products": [],
        }
        if r.get("cons"):
            entry["cautions"] = [c for c in r["cons"][:2] if c]

        # Create the product row here too. store-to-products.py resolves brands
        # through the ASIN map, which is built after this runs, so a brand made
        # here would sit with an empty products array and still answer nothing.
        note = desc
        if ev and ev.lower() not in note.lower():
            note = (note.rstrip(".") + ". " if note else "") + ev.rstrip(".") + "."
        if r.get("cons"):
            note = (note + " " if note else "") + "Worth knowing: " + r["cons"][0].rstrip('."') + "."
        row = {"name": r["name"], "verdict": "good", "note": note[:400],
               "origin": "store", "source": "store"}
        if r.get("asin"):
            row["asins"] = [r["asin"]]
        else:
            words = [w.lower() for w in re.split(r"[^A-Za-z0-9]+", r["name"]) if len(w) > 2]
            if len(words) >= 2:
                row["matchAll"] = [words[:4]]
        entry["products"] = [row]
        brands.append(entry)
        made.append((bn, cat, r["name"]))

    brands.sort(key=lambda b: collapse(b["brand"]))
    print(f"store picks already resolving to a brand: {skipped}")
    print(f"brands created from the store:            {len(made)}")
    by_cat = collections.Counter(c for _, c, _ in made)
    print(f"  by category: {dict(by_cat.most_common(10))}\n")
    for bn, cat, name in made[:25]:
        print(f"  {bn[:24]:<24} {cat[:16]:<16} from {name[:44]}")
    if len(made) > 25:
        print(f"  … and {len(made) - 25} more")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}, now {len(brands)} brands")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
