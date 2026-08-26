#!/usr/bin/env python3
"""
Catch "Better:" lines that recommend a brand we ourselves rate careful or skip.

The extension puts the alternative directly under a skip verdict, at the moment
someone is deciding what to buy instead. Pointing them at something we have
flagged is the most damaging inconsistency the site can have, and it is
invisible unless something checks for it: the alternative lives as free text on
one brand, and the verdict lives on another.

Found in the wild: Pampers recommended WaterWipes, which we rate careful over
active microplastics litigation. Gerber and Happy Baby both recommended
Beech-Nut, which we rate skip over 913 ppb arsenic and 887 ppb lead.

A careful target is not automatically wrong. Earth Mama Organics is careful as a
brand while its Diaper Balm is a pick, so naming a specific good product is
legitimate. Skip targets are always wrong.

    python3 tools/audit-alternatives.py
    python3 tools/audit-alternatives.py --strict   # non-zero exit if any skip target
"""

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"


def words(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    lookup = []
    for b in brands:
        for label in [b["brand"]] + list(b.get("aliases") or []):
            w = words(label)
            if len(w) >= 4:
                lookup.append((w, b))
    lookup.sort(key=lambda t: -len(t[0]))

    skip_hits, careful_hits = [], []
    for b in brands:
        alt = b.get("alternative")
        if not alt:
            continue
        hay = " " + words(alt) + " "
        seen = set()
        for w, target in lookup:
            if target["id"] == b["id"] or target["id"] in seen:
                continue
            if re.search(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])", hay):
                seen.add(target["id"])
                stance = target.get("stance")
                if stance == "skip":
                    skip_hits.append((b, target, alt))
                elif stance == "careful":
                    # A careful brand with a good product named explicitly is fine.
                    good = [p["name"] for p in (target.get("products") or [])
                            if p.get("verdict") == "good"]
                    rescued = any(words(g) and words(g) in hay for g in good)
                    if not rescued:
                        careful_hits.append((b, target, alt))

    print(f"{sum(1 for b in brands if b.get('alternative'))} brands carry an alternative\n")
    print(f"ALWAYS WRONG, recommends a skip brand: {len(skip_hits)}")
    for src, tgt, alt in skip_hits:
        print(f"   {src['brand']} [{src.get('stance')}] -> {tgt['brand']} [skip]")
        print(f"      {alt[:88]}")
        print(f"      why {tgt['brand']} is skip: {tgt.get('reason','')[:88]}")

    print(f"\nNEEDS A LOOK, recommends a careful brand with no good product named: {len(careful_hits)}")
    for src, tgt, alt in careful_hits:
        print(f"   {src['brand']} [{src.get('stance')}] -> {tgt['brand']} [careful]")
        print(f"      {alt[:88]}")

    if args.strict and skip_hits:
        print("\nFAIL: an alternative points at a skip brand")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
