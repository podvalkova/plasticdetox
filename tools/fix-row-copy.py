#!/usr/bin/env python3
"""
Two fixes to what a card actually says, both in data so they reach every
installed version rather than waiting on a store review.

1. A brand-line row's note is a copy of the brand's own `reason`, and the card
   renders both: once as the product note and again under "About the brand".
   Every one of the 69 brand-line rows showed the same paragraph twice. The row
   does not need a note at all, because the card already falls back to the brand
   reason when a row has none, so dropping it leaves one paragraph instead of two.

2. A match group containing a plural word only fires on a listing that also uses
   the plural. Our editorial names say "Pampers Diapers" and the listing says
   "Our Best Diaper", so the specific researched row missed and the generic
   whole-range row answered in its place, which is how a diaper listing ended up
   talking about wipes. The matcher grew singular/plural tolerance in 1.2.0, but
   putting both forms in the data means the row fires regardless of which
   version someone has installed.

    python3 tools/fix-row-copy.py            # report only
    python3 tools/fix-row-copy.py --write
"""

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

# Words where dropping the s changes the meaning rather than the number.
KEEP = {"basics", "foods", "less", "plus", "wellness", "always", "kids",
        "oats", "grass", "class", "glass", "press", "pass", "gloss", "moss",
        "bliss", "swiss", "cross", "brands", "naturals", "essentials"}


def variants(group, brand_words=frozenset()):
    """
    Every singular/plural form of a group, as separate groups.

    Never singularises the brand's own name. "Pampers" is not a plural of
    "Pamper" and "Babyganics" is not a plural of "Babyganic"; generating those
    adds match rules that can only ever fire on something the brand did not make.
    """
    out = [list(group)]
    for i, w in enumerate(group):
        if w in brand_words:
            continue
        if len(w) > 3 and w.endswith("s") and w not in KEEP and not w.endswith("ss"):
            alt = list(group)
            alt[i] = w[:-1]
            if alt not in out:
                out.append(alt)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    stripped = expanded = 0
    examples = []

    for b in brands:
        brand_words = {w for w in re.split(r"[^a-z0-9]+", b["brand"].lower()) if w}
        for p in (b.get("products") or []):
            if p.get("origin") == "brand-line" and (p.get("note") or "").strip():
                p["note"] = ""
                stripped += 1
            groups = p.get("matchAll")
            if not groups:
                continue
            out = []
            for g in groups:
                for v in variants(g, brand_words):
                    if v not in out:
                        out.append(v)
            if out != groups:
                if len(examples) < 8:
                    examples.append((b["brand"], p.get("name"), groups[0], out))
                p["matchAll"] = out
                expanded += 1

    print(f"stripped the duplicated note from {stripped} brand-line rows")
    print(f"added singular/plural variants to {expanded} rows\n")
    for brand, name, before, after in examples:
        print(f"  {brand} / {name}")
        print(f"     was {before}")
        print(f"     now {after}")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
