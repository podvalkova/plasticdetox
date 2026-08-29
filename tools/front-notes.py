#!/usr/bin/env python3
"""
Say why each front is flagged, and flag the front the finding is actually about.

Two faults, both visible on one card. Native's verdict rests on a pre-litigation
investigation for PFAS, which is a legal matter, and the card flagged Formula.
Then under "Why we flag it" it printed the word Formula and nothing else, because
the card renders a per-front note and the data carries none.

So a reader saw a red cross beside Formula, no explanation of what was wrong with
the formula, and a paragraph above it discussing a lawsuit.

This does two things:

  Moves a finding to the front it belongs on. A recall, a filed suit, a warning
  letter or an investigation is the legal front. It was landing on formula
  because that is where the classifier puts anything it cannot place.

  Writes a per-front note, so the card can say which sentence of the reasoning
  applies to which check. Stored alongside the statuses rather than replacing
  them, so a build that has not shipped yet keeps working unchanged.

    python3 tools/front-notes.py            # report only
    python3 tools/front-notes.py --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

# A sentence is about the legal front when it names a legal event, and only then.
LEGAL = re.compile(
    r"\b(recall(ed|s)?|class action|lawsuit|litigation|settle(d|ment)?|sued|"
    r"consent decree|warning letter|pre[- ]?litigation|investigation|"
    r"attorney general|injunction|fined|court)\b", re.I)
TESTING = re.compile(
    r"\b(tested|testing|lab\b|laborator|ppb|ppm|non[- ]?detect|detected|"
    r"screening|screened|certified|verified|iapmo|nsf|oeko|gots|greenguard|"
    r"consumer reports|lead safe mama|mamavation|anses|study)\b", re.I)
PACKAGING = re.compile(
    r"\b(packag\w*|bottle|jar|lid|pouch|carton|tube|wrapper|liner|sachet|"
    r"stick pack|container|housing|film)\b", re.I)


def sentences(note):
    n = re.sub(r"(\d)\.(\d)", r"\1<D>\2", note or "")
    return [s.replace("<D>", ".").strip() for s in re.split(r"(?<=[.;])\s+", n)
            if len(s.strip()) > 12]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    moved, noted = 0, 0
    examples = []

    for b in brands:
        for p in (b.get("products") or []):
            e = p.get("ext")
            if not e:
                continue
            note = p.get("note") or ""
            sents = sentences(note)
            if not sents:
                continue
            fronts = e.get("fronts") or {}

            # A legal finding sitting on formula, because that is the
            # classifier's fallback for anything it cannot place.
            legal_sents = [s for s in sents if LEGAL.search(s)]
            if legal_sents and fronts.get("legal") in (None, "unassessed", "unknown"):
                for other in ("formula", "packaging"):
                    if fronts.get(other) in ("fail", "caution") and not any(
                            re.search(r"\b(ingredient|material|coating|fibre|fiber|"
                                      r"plastic|polymer|fragrance)\b", s, re.I)
                            for s in sents if other == "formula"):
                        fronts["legal"] = fronts.pop(other)
                        moved += 1
                        if len(examples) < 10:
                            examples.append((b["brand"], p.get("name"), other,
                                             legal_sents[0][:78]))
                        break

            # A note per front, so the card can say which sentence applies.
            fn = {}
            for key, rx in (("legal", LEGAL), ("testing", TESTING),
                            ("packaging", PACKAGING)):
                if fronts.get(key) in ("pass", "caution", "fail"):
                    hit = next((s for s in sents if rx.search(s)), None)
                    if hit:
                        fn[key] = hit[:200]
            # formula takes whatever sentence the others did not claim
            if fronts.get("formula") in ("pass", "caution", "fail"):
                taken = set(fn.values())
                hit = next((s for s in sents if s[:200] not in taken), None)
                if hit:
                    fn["formula"] = hit[:200]
            if fn:
                e["frontNotes"] = fn
                noted += 1
            for k, v in (e.get("legalNote"), e.get("testingNote")), :
                pass
            if e.get("legalNote"):
                e.setdefault("frontNotes", {})["legal"] = e["legalNote"][:200]
            if e.get("testingNote"):
                e.setdefault("frontNotes", {})["testing"] = e["testingNote"][:200]

    print(f"findings moved from formula or packaging to the legal front: {moved}")
    print(f"rows given a per-front note: {noted}\n")
    for brand, name, was, why in examples:
        print(f"  [{brand}] {str(name)[:26]:<26} {was} -> legal")
        print(f"      {why}")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
