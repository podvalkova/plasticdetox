#!/usr/bin/env python3
"""
Nothing we flag may also be recommended.

A recommendation and a warning about the same product, live at the same time on
the same site, is worse than either alone: the reader cannot tell which one we
mean. Brand Check and the extension exist to warn. Articles and the store exist
to recommend. A product we rate careful or skip has no business in the second
pair, and this fails the build when one turns up there.

What counts as a recommendation:

  a store listing, in any of the three copies of the store data, which do not
  reference each other and drift: store.html is what the site serves,
  index.html holds the homepage picks, data/store-products.js is what the tools
  read

  an affiliate link inside a product card or a picks list in an article

A row carrying `tradeoff` is exempt: it is the honest best option in a category
with no clean one, listed with its caveat.

What does not count is a mention inside a caution card or a "skip" section,
which is the article doing its job. Those are matched and excluded by hand,
because getting that distinction wrong in the other direction would strip real
warnings out of the site.

    python3 tools/audit-recommendations.py
    python3 tools/audit-recommendations.py --strict
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
STORE_FILES = ["store.html", "index.html", "data/store-products.js"]

# Blocks where naming a product is a warning, not a pick.
WARNING_BLOCK = re.compile(
    r'<div class="caution-card"[\s\S]{0,4000}?</div>|'
    r'<(section|div)[^>]*(skip|avoid|caution|worst|flag)[^>]*>[\s\S]{0,4000}?</\1>',
    re.I)


def flagged_asins(brands):
    """ASIN -> (brand, verdict) for every product row we rate careful or skip."""
    out = {}
    for b in brands:
        for p in (b.get("products") or []):
            v = (p.get("ext") or {}).get("verdict") or p.get("verdict")
            # A deliberate trade-off pick is not a contradiction. Some
            # categories have no clean option: the only genuinely plastic free
            # toothbrush bristle is boar, which is not vegan, so the nylon brush
            # is the best available choice under that constraint. Listing it with
            # the caveat stated is the article doing its job, not contradicting
            # itself. `tradeoff` says so explicitly and must give the reason.
            if v in ("careful", "skip") and not (p.get("tradeoff") or "").strip():
                for a in (p.get("asins") or []):
                    out[a] = (b["brand"], p.get("name"), v)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    flagged = flagged_asins(brands)

    hits = collections.defaultdict(list)

    # 1. the store, all three copies
    for fn in STORE_FILES:
        path = ROOT / fn
        if not path.exists():
            continue
        src = path.read_text()
        for blob in re.findall(r"\{[^{}]*?name:\s*\"[^\"]+\"[^{}]*?\}", src):
            a = re.search(r'asin:\s*"([A-Z0-9]{10})"', blob)
            n = re.search(r'name:\s*"([^"]+)"', blob)
            if a and a.group(1) in flagged:
                brand, prod, v = flagged[a.group(1)]
                hits[f"store: {fn}"].append((n.group(1) if n else "?", brand, v))

    # 2. articles, excluding warning blocks
    for path in sorted((ROOT / "articles").glob("*.html")) + [ROOT / "index.html"]:
        src = path.read_text(errors="ignore")
        safe = WARNING_BLOCK.sub(" ", src)
        for m in re.finditer(r"/dp/([A-Z0-9]{10})", safe):
            a = m.group(1)
            if a not in flagged:
                continue
            window = safe[max(0, m.start() - 400): m.end() + 400]
            # only count it where the markup frames it as a pick
            if re.search(r'product-card|product-grid|class="pick|<li>\s*<a href="[^"]*'
                         + a, window, re.I):
                brand, prod, v = flagged[a]
                hits[f"article: {path.name}"].append((prod or a, brand, v))

    total = sum(len(v) for v in hits.values())
    print(f"products we rate careful or skip: {len(flagged)} ASINs")
    print(f"places they are also recommended: {total}\n")
    for where in sorted(hits):
        seen = set()
        for prod, brand, v in hits[where]:
            if (prod, brand) in seen:
                continue
            seen.add((prod, brand))
            print(f"  {where}")
            print(f"     {v.upper():<8} {brand} — {prod}")

    if not total:
        print("  nothing flagged is recommended anywhere. Good.")
    if args.strict and total:
        raise SystemExit(f"\n{total} flagged products are still recommended")


if __name__ == "__main__":
    sys.exit(main())
