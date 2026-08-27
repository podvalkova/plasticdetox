#!/usr/bin/env python3
"""
Pick the article each brand's "Better:" line should send people to.

The alternative sits under a skip verdict at the moment someone is deciding
what to buy instead, and today it is dead text. Making it a link to the guide
that covers the category is the single most useful thing that line can do: the
reader gets the full comparison and the tiers, and the click lands on our own
site where affiliate links belong. Amazon's Associates terms forbid affiliate
links inside a browser extension, so pointing at our own article is both the
compliant route and the better one.

The mapping already exists in the data. 93 percent of brands cite the article
they were researched for in `sources`, so this picks the best of those rather
than inventing a category table to maintain. Where a brand cites several, the
one whose filename best matches the brand's category wins.

    python3 tools/link-articles.py            # report only
    python3 tools/link-articles.py --write
"""

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
ARTICLES = ROOT / "articles"

STOP = {"best", "non", "toxic", "nontoxic", "guide", "the", "for", "and", "a", "of",
        "your", "how", "to", "what", "are", "is", "in", "2026", "2025", "html"}


def tokens(s):
    return {t for t in re.split(r"[^a-z0-9]+", (s or "").lower()) if t and t not in STOP}


def singular(ts):
    """Crude depluralisation so 'diapers' matches 'diaper'."""
    out = set()
    for t in ts:
        out.add(t)
        if len(t) > 3 and t.endswith("s"):
            out.add(t[:-1])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    on_disk = {p.name for p in ARTICLES.glob("*.html")}
    brands = json.loads(DATA.read_text())

    linked = unlinked = 0
    examples = []
    for b in brands:
        cands = [s for s in (b.get("sources") or [])
                 if s.endswith(".html") and s in on_disk]
        if not cands:
            b.pop("article", None)
            if b.get("alternative"):
                unlinked += 1
            continue

        want = singular(tokens(b.get("category", "")) | tokens(b.get("brand", "")))
        # Score by overlap with the category, longest filename breaking ties so a
        # specific guide beats a broad 101 page.
        best = max(cands, key=lambda s: (len(want & singular(tokens(s))), len(s)))
        b["article"] = best
        linked += 1
        if b.get("alternative") and len(examples) < 12:
            examples.append((b["brand"], b.get("category"), best, len(cands)))

    print(f"{len(brands)} brands")
    print(f"  article assigned:                 {linked}")
    print(f"  has an alternative but no article: {unlinked}")
    print("\nsample (brand -> chosen article, of N candidates):")
    for name, cat, art, n in examples:
        print(f"   {name:<22} {str(cat)[:18]:<18} -> {art}   (of {n})")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
