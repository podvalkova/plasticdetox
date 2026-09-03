#!/usr/bin/env python3
"""
Harvest the material a product states in its own name.

Renaming packaging to materials asked a new question of 377 durable goods and
correctly refused to answer it from the old data. But for a large share the
answer was never missing: it is in the name the maker chose. "Cooks Standard
Stainless Steel Cookware" states its material. "JOCO Reusable Glass Cup" states
its material. Holding those back for research is not caution, it is failing to
read the title.

Deliberately narrow. It reads the product NAME only, never the note. An earlier
prose sweep read "365 sea salt" as tin because the word appeared inside
"testing", and read a cotton swaddle as bamboo from a sentence saying to skip
bamboo rayon. A name is the maker's own statement about the object; a note is
our prose about it, and the two are not the same evidence.

    python3 tools/formula/materials-from-name.py
    python3 tools/formula/materials-from-name.py --write
"""
import argparse, collections, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "brand-data.json"
EVIDENCE = ROOT / "data" / "front-evidence.json"

# Ordered: the first match wins, so a compound beats its own substring.
NAMED = [
    ("borosilicate glass", "borosilicate"), ("tempered glass", "tempered glass"),
    ("stainless steel", "stainless steel"), ("cast iron", "cast iron"),
    ("carbon steel", "carbon steel"), ("organic cotton", "cotton"),
    ("merino wool", "wool"), ("natural rubber", "rubber"),
    ("food grade silicone", "silicone"), ("medical grade silicone", "silicone"),
    ("platinum silicone", "silicone"), ("solid wood", "wood"),
    ("glass", "glass"), ("stainless", "stainless steel"), ("steel", "steel"),
    ("ceramic", "ceramic"), ("porcelain", "porcelain"), ("stoneware", "stoneware"),
    ("enamel", "enamel"), ("bamboo", "bamboo"), ("wood", "wood"),
    ("maple", "maple wood"), ("walnut", "wood"), ("beeswax", "beeswax"),
    ("linen", "linen"), ("hemp", "hemp"), ("wool", "wool"), ("cotton", "cotton"),
    ("silicone", "silicone"), ("titanium", "titanium"), ("copper", "copper"),
    ("cork", "cork"), ("aluminum", "aluminum"), ("aluminium", "aluminum"),
    ("silk", "silk"), ("jute", "jute"), ("rubber", "rubber"),
    # Named plastics count too. A material is a fact whichever way it reads,
    # and the severity is decided downstream by what it holds and who touches it.
    ("polypropylene", "polypropylene"), ("polyethylene", "polyethylene"),
    ("tritan", "tritan"), ("acrylic", "acrylic"), ("nylon", "nylon"),
    ("polyester", "polyester"), ("melamine", "melamine"), ("pvc", "pvc"),
]


def material_in(name):
    low = f" {name.lower()} "
    for token, material in NAMED:
        if re.search(r"(?<![a-z])" + re.escape(token) + r"(?![a-z])", low):
            return token, material
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    ev = json.loads(EVIDENCE.read_text()) if EVIDENCE.exists() else {}
    found = collections.Counter()
    samples = []

    for b in brands:
        for p in (b.get("products") or []):
            e = p.get("ext") or {}
            if ((e.get("fronts") or {}).get("materials")) not in (None, "", "unknown", "unassessed"):
                continue
            token, material = material_in(p.get("name") or "")
            if not material:
                continue
            key = (list(p.get("asins") or []) or [f"{b['brand']}::{p.get('name')}"])[0]
            slot = ev.setdefault(key, {"_product": f"{b['brand']} {p.get('name')}"})
            mats = slot.setdefault("materials", {})
            if mats.get("material"):
                continue
            mats["material"] = material
            mats["source"] = "product name"
            mats["contactFrom"] = "stated in the product name"
            found[material] += 1
            if len(samples) < 10:
                samples.append(f"{b['brand']} / {p.get('name')[:40]}  ->  {material}")

    for s in samples:
        print("   " + s)
    print(f"\nmaterials read from {sum(found.values())} product names")
    print("  " + "  ".join(f"{k} {n}" for k, n in found.most_common(9)))
    if args.write:
        EVIDENCE.write_text(json.dumps(ev, indent=1, ensure_ascii=False) + "\n")
        print(f"\nwrote {EVIDENCE.relative_to(ROOT)}")
    else:
        print("\ndry run. re-run with --write")
    return 0


if __name__ == "__main__":
    sys.exit(main())
