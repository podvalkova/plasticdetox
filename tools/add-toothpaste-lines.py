#!/usr/bin/env python3
"""
Add product-line verdicts from the toothpaste guide.

A product line sits between a brand verdict, which is too broad (Colgate sells
around forty pastes), and an ASIN verdict, which is too narrow (one entry per
size and multipack). "Colgate Total" matched on title keywords covers every
listing of that line while claiming nothing about Optic White.

Every note names the lab, the year, and the fact that the brands dispute the
results, because the article does. These are Lead Safe Mama's 2025 figures, not
ours, and a card asserting a negative about a named brand's product at the
moment of purchase has to carry its attribution with it.

Verdicts follow the article rather than rounding everything to skip. Sensodyne
at 116 ppb is a caution, not a skip, and Boka Ela Mint at 32 ppb is described
there as the least bad hydroxyapatite pick.

    python3 tools/add-toothpaste-lines.py            # report only
    python3 tools/add-toothpaste-lines.py --write
"""

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
SOURCE = "best-non-toxic-toothpaste-guide.html"
LAB = ("Independent lab testing published by Lead Safe Mama in 2025. "
       "The brands dispute these results.")

# Brands the guide rates that Brand Check did not have at all.
NEW_BRANDS = [
    ("colgate", "Colgate", "Oral care", "skip",
     "Independent 2025 testing put lead at about 539 ppb in Total and Whitening, "
     "the highest of the mainstream pastes, alongside titanium dioxide and SLS. "
     "Named in consumer lawsuits over lead. Colgate disputes the testing.",
     "Lead ~539 ppb (Lead Safe Mama 2025); titanium dioxide; SLS",
     "Weleda Salt Toothpaste, or Dr. Brown's and Spry for kids"),
    ("burts-bees-toothpaste", "Burt's Bees", "Personal care", "skip",
     "Independent 2025 testing put lead at about 446 ppb in the whitening paste, "
     "higher than several mainstream brands it is marketed against. "
     "Burt's Bees disputes the testing.",
     "Lead ~446 ppb in the whitening paste (Lead Safe Mama 2025)",
     "Weleda Salt Toothpaste"),
    ("risewell", "RiseWell", "Oral care", "careful",
     "Hydroxyapatite paste with lead detected in independent 2025 testing at an "
     "undisclosed concentration, and no published efficacy research on the formula. "
     "The kids version was among those showing lead.",
     "Lead detected, concentration not disclosed (Lead Safe Mama 2025)",
     "Weleda Salt Toothpaste, or Dr. Brown's and Spry for kids"),
    ("boka", "Boka", "Oral care", "careful",
     "At about 32 ppb lead the Ela Mint is the cleanest adult hydroxyapatite paste "
     "in the 2025 testing by a wide margin, but it is still a detection rather than "
     "a non detect, and the kids version showed more.",
     "Lead ~32 ppb, Ela Mint (Lead Safe Mama 2025)",
     "Weleda Salt Toothpaste for a non detect result"),
    ("redmond", "Redmond", "Oral care", "skip",
     "Earthpaste is a clay tooth powder and measured about 3,500 ppb lead in "
     "independent 2025 testing, roughly seven times the worst conventional paste. "
     "Clay based oral products are the worst category we have seen.",
     "Earthpaste ~3,500 ppb lead (Lead Safe Mama 2025)",
     "Weleda Salt Toothpaste"),
]

# brand -> product lines. `match` is matched against the listing title.
LINES = {
    "Colgate": [
        ("Total / Whitening", ["colgate total", "colgate optic white", "colgate whitening"],
         "skip", f"Lead about 539 ppb, the highest mainstream result, plus titanium dioxide and SLS. {LAB}"),
    ],
    "Crest": [
        ("Toothpaste", ["crest toothpaste", "crest pro-health", "crest 3d white", "crest cavity"],
         "skip", f"Lead about 399 ppb, with titanium dioxide and artificial dyes. {LAB}"),
    ],
    "Sensodyne": [
        ("Whitening", ["sensodyne whitening", "sensodyne extra whitening"],
         "careful", f"Lead about 116 ppb in the whitening version. An effective active, but not a clean result. {LAB}"),
    ],
    "Tom's of Maine": [
        ("Kids toothpaste", ["tom's of maine kids", "toms of maine kids", "tom's of maine children"],
         "skip", f"Lead about 240 ppb in the kids paste, and the company settled a class action over heavy metals. {LAB}"),
    ],
    "Burt's Bees": [
        ("Whitening toothpaste", ["burt's bees toothpaste", "burts bees toothpaste", "burt's bees whitening"],
         "skip", f"Lead about 446 ppb in the whitening paste. {LAB}"),
    ],
    "Hello": [
        ("Fluoride free toothpaste", ["hello fluoride free", "hello toothpaste"],
         "skip", f"Lead about 493 ppb in the fluoride free version. {LAB}"),
    ],
    "Davids": [
        ("Hydroxi hydroxyapatite", ["davids hydroxi", "davids toothpaste", "david's toothpaste"],
         "skip", f"Lead and arsenic detected, around 457 ppb lead. A recyclable aluminium tube does not offset what is inside it. {LAB}"),
    ],
    "RiseWell": [
        ("Mineral toothpaste", ["risewell", "rise well toothpaste"],
         "careful", f"Lead detected at an undisclosed concentration, and no published efficacy research on the formula. {LAB}"),
    ],
    "Boka": [
        ("Ela Mint", ["boka ela mint", "boka toothpaste"],
         "careful", f"Lead about 32 ppb, the lowest of the adult hydroxyapatite pastes, but still a detection. {LAB}"),
    ],
    "Redmond": [
        ("Earthpaste", ["redmond earthpaste", "earthpaste"],
         "skip", f"About 3,500 ppb lead, roughly seven times the worst conventional paste. {LAB}"),
    ],
    "Weleda": [
        ("Salt Toothpaste", ["weleda salt", "weleda toothpaste"],
         "good", f"Non detect for lead, one of only three pastes in the guide to clear the 5 ppb detection line. {LAB}"),
    ],
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    collapse = lambda s: re.sub(r"[^a-z0-9]+", "", (s or "").lower())
    by_name = {collapse(b["brand"]): b for b in brands}

    created = 0
    for bid, name, cat, stance, reason, evidence, alt in NEW_BRANDS:
        if collapse(name) in by_name:
            continue
        entry = {"id": bid, "brand": name, "category": cat, "stance": stance,
                 "reason": reason, "evidence": evidence, "alternative": alt,
                 "sources": [SOURCE], "reviewed": True}
        brands.append(entry)
        by_name[collapse(name)] = entry
        created += 1

    added = 0
    for brand_name, lines in LINES.items():
        b = by_name.get(collapse(brand_name))
        if not b:
            print(f"  !! {brand_name} not found")
            continue
        rows = b.setdefault("products", [])
        for pname, match, verdict, note in lines:
            if any(p.get("name") == pname for p in rows):
                continue
            rows.append({"name": pname, "match": match, "verdict": verdict,
                         "note": note, "origin": "article", "source": SOURCE})
            added += 1
        s = set(b.get("sources") or []); s.add(SOURCE); b["sources"] = sorted(s)

    brands.sort(key=lambda b: collapse(b["brand"]))
    print(f"created {created} brands the guide rates but Brand Check lacked")
    print(f"added   {added} product lines matched on listing title\n")
    for brand_name, lines in LINES.items():
        for pname, match, verdict, _ in lines:
            print(f"   {brand_name:<16} {pname:<26} {verdict:<8} matches {match[0]!r}")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}, now {len(brands)} brands")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
