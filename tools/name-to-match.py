#!/usr/bin/env python3
"""
Give hand-researched product rows a way to fire.

96 rows carried a name, a verdict and a researched note but no ASIN and no match
rule, so the extension could never surface them. They are the best data we hold,
written by a person against a specific product, and they were invisible.

The match is the brand's words plus the distinctive words of the product name,
all of which must appear in the listing title in any order. "AquaTru Classic"
becomes [aquatru, classic], which fires on "AquaTru Classic Countertop Water
Filter Purifier" and not on the Glass Carafe.

A row is skipped when its name carries no distinctive word, because a match on
the brand alone is a brand verdict wearing a product's clothes, and that is the
thing these rules exist to stop.

    python3 tools/name-to-match.py            # report only
    python3 tools/name-to-match.py --write
"""

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

# Words too generic to identify a product. Requiring them narrows nothing and
# risks missing listings that simply phrase the title differently.
STOP = {
    "the", "a", "an", "and", "or", "with", "for", "of", "in", "on", "plus",
    "whole", "range", "line", "all", "our", "its", "new", "pack", "count",
    "set", "size", "sizes", "oz", "ml", "l", "ct", "pcs", "piece", "pieces",
    "product", "products", "version", "versions", "series", "model", "type",
    "style", "kids", "baby", "adult", "original", "classic",
}
# ...except where the word IS the product's identity, which is the whole point
# of a line name. Kept when the name would otherwise have nothing left.
SOFT = {"classic", "original", "kids", "baby", "adult"}


# A parenthetical is a list of the models the row covers, not words that appear
# together in any one title. "Turbo pressure cookers (BH-1080 6L, BH-1081 8L)"
# required both model numbers at once, so it matched nothing ever.
PARENS = re.compile(r"\([^)]*\)|\[[^\]]*\]")
# Requiring more than a few words is the same failure in a different costume:
# every extra word is another way for a real listing title to miss.
MAX_DISTINCT = 3


def words(s):
    return [w for w in re.split(r"[^a-z0-9]+", PARENS.sub(" ", (s or "").lower())) if w]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    added, skipped, examples = 0, [], []

    for b in brands:
        bw = words(b["brand"])
        for p in (b.get("products") or []):
            if p.get("asins") or p.get("match") or p.get("matchAll"):
                continue
            nw = [w for w in words(p.get("name")) if w not in bw]
            distinct = [w for w in nw if w not in STOP and len(w) > 1]
            # A number or model code is the differentiator, never the filler.
            # Capping on position alone gave Badger SPF 30 and SPF 40 the same
            # match group, so a careful row and a skip row became the same rule.
            distinct.sort(key=lambda w: (0 if any(c.isdigit() for c in w) else 1,
                                         nw.index(w)))
            if not distinct:
                # Fall back to the soft stop words before giving up: "Classic"
                # really is the name of the AquaTru model.
                distinct = [w for w in nw if w in SOFT]
            if not distinct:
                skipped.append(f"{b['brand']} / {p.get('name')}")
                continue
            group = bw + [w for w in distinct if w not in bw][:MAX_DISTINCT]
            p["matchAll"] = [group]
            p["matchFrom"] = "name"
            p.setdefault("origin", "hand")
            added += 1
            if len(examples) < 14:
                examples.append((b["brand"], p.get("name"), p.get("verdict"), group))

    # Two rows under one brand resolving to the same rule is a silent
    # mis-verdict: whichever sorts first answers for both.
    clash = 0
    for b in brands:
        seen = {}
        for p in (b.get("products") or []):
            for g in (p.get("matchAll") or []):
                k = tuple(sorted(g))
                if k in seen and seen[k].get("verdict") != p.get("verdict"):
                    print(f"  !! collision under {b['brand']}: "
                          f"{seen[k].get('name')!r} ({seen[k].get('verdict')}) vs "
                          f"{p.get('name')!r} ({p.get('verdict')}) both need {sorted(g)}")
                    clash += 1
                seen[k] = p

    print(f"gave {added} hand-researched rows a match rule")
    print(f"collisions between rows with different verdicts: {clash}")
    print(f"skipped, no distinctive word in the name: {len(skipped)}")
    print("\nexamples:")
    for brand, name, v, g in examples:
        print(f"  {brand:<18} {str(name)[:34]:<34} {str(v):<8} needs all of {g}")
    if skipped:
        print("\nskipped:")
        for s in skipped[:12]:
            print("  " + s)

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
