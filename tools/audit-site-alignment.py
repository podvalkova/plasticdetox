#!/usr/bin/env python3
"""
The standard is the source of truth. Everything on the site must agree with it.

brand-data.json holds one verdict per product, judged against
docs/rating-rules.md. Articles carry their own verdicts in ranked tables, and
those two can drift silently: an article keeps saying GOOD CHOICE for something
we later moved to skip, and the reader gets both answers from the same site
without being told which is current.

This compares every verdict an article states against the verdict the standard
holds, matched on ASIN, and reports the disagreements.

    python3 tools/audit-site-alignment.py
    python3 tools/audit-site-alignment.py --strict
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
ARTICLES = ROOT / "articles"

VERDICT = {"GOOD CHOICE": "good", "USE CAREFULLY": "careful", "SKIP": "skip"}
RANK = {"good": 0, "careful": 1, "skip": 2, "unrated": 3}


ALIAS = {}


def truth():
    """ASIN -> (brand, product, verdict) from the standard."""
    out = {}
    for b in json.loads(DATA.read_text()):
        ALIAS[b["brand"]] = list(b.get("aliases") or [])
        for p in (b.get("products") or []):
            v = (p.get("ext") or {}).get("verdict")
            if not v:
                continue
            for a in (p.get("asins") or []):
                # A researched row outranks a generated one for the same ASIN.
                if a in out and p.get("origin") == "brand-line":
                    continue
                out[a] = (b["brand"], p.get("name"), v)
    return out


def article_tables():
    for path in sorted(ARTICLES.glob("*.html")):
        src = path.read_text(errors="ignore")
        m = re.search(r"PRODUCTS\s*=\s*\[", src)
        if not m:
            continue
        start, depth, end = m.end() - 1, 0, None
        for i in range(start, len(src)):
            if src[i] == "[":
                depth += 1
            elif src[i] == "]":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if not end:
            continue
        try:
            yield path.name, json.loads(src[start:end])
        except json.JSONDecodeError:
            continue


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    std = truth()
    checked = agree = 0
    softer, harsher, missing = [], [], []

    for article, rows in article_tables():
        for row in rows:
            if len(row) < 8:
                continue
            _, _, product, brand, verdict, _, _, asin = row[:8]
            v = VERDICT.get((verdict or "").upper())
            if not v or not re.fullmatch(r"[A-Z0-9]{10}", str(asin or "")):
                continue
            if asin not in std:
                missing.append((article, brand, product, v))
                continue
            checked += 1
            _, _, sv = std[asin]
            if sv == v:
                agree += 1
            elif RANK[v] < RANK.get(sv, 3):
                softer.append((article, brand, product, v, sv))
            else:
                harsher.append((article, brand, product, v, sv))

    # The deeper failure: the article's own ASIN belongs to a different brand,
    # so the link under a product's name goes to somebody else's product. Every
    # verdict disagreement below was a symptom of this.
    print("article rows whose ASIN belongs to a different brand:")
    wrong = 0
    def norm(x):
        return re.sub(r"[^a-z0-9]+", "", (x or "").lower())
    for article, rows in article_tables():
        for row in rows:
            if len(row) < 8:
                continue
            _, _, product, brand, verdict, _, _, asin = row[:8]
            if asin not in std:
                continue
            owner, oprod, _ = std[asin]
            # A brand and its parent are not a mismatch: Vulli makes Sophie la
            # Girafe. Aliases in brand-data record those relationships.
            names = {norm(owner)} | {norm(a) for a in ALIAS.get(owner, [])}
            if all(n and n not in norm(brand) and norm(brand)[:6] not in n for n in names):
                wrong += 1
                print(f"  {article[:34]:<34} says {str(brand)[:18]:<18} -> ASIN is {owner}'s "
                      f"({str(oprod)[:26]})")
    print(f"  total: {wrong}\n")

    print(f"article verdicts checked against the standard: {checked}")
    print(f"  agree:                     {agree}")
    print(f"  article is SOFTER:         {len(softer)}")
    print(f"  article is HARSHER:        {len(harsher)}")
    print(f"  no verdict in the standard: {len(missing)}")

    if softer:
        print("\nthe article recommends more than the standard allows:")
        for a, b, p, av, sv in softer[:20]:
            print(f"  {a[:38]:<38} {str(b)[:16]:<16} {str(p)[:26]:<26} says {av}, standard says {sv}")
    if harsher:
        print("\nthe article warns more than the standard does:")
        for a, b, p, av, sv in harsher[:20]:
            print(f"  {a[:38]:<38} {str(b)[:16]:<16} {str(p)[:26]:<26} says {av}, standard says {sv}")

    bad = len(softer) + len(harsher)
    if args.strict and bad:
        raise SystemExit(f"\n{bad} article verdicts disagree with the standard")


if __name__ == "__main__":
    sys.exit(main())
