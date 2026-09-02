#!/usr/bin/env python3
"""
Every buy link on the site, checked against the standard.

audit-site-alignment.py only reads articles that carry a PRODUCTS array, which
is one article out of seventy four. Seventy one articles hardcode Amazon links
and nothing looked at them. That blind spot hid eleven ASINs reused across
different brands in the one file we could see, where a row we rate SKIP carried
the ASIN of the good alternative beside it, so a reader clicking a product we
told them to avoid landed on a different company's.

This reads every link in every page instead, and asks three things of each:

  known     is the ASIN one we hold a verdict on at all
  owner     does the text the reader clicks name the brand that ASIN belongs to
  unique    is the same ASIN being used for two different brands in one page

The link text is the check because it is what the reader is promised. A link
saying "Earth Mama" must not go to Aveeno, whatever the surrounding prose says.

    python3 tools/audit-links.py
    python3 tools/audit-links.py --strict     # exit 1 on any mismatch
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

# Everything a reader can reach. Generated reports are excluded: they are built
# from the standard, so auditing them only ever audits the generator.
SKIP_DIRS = {"node_modules", "dist", "app", "docs", "Pinterest", "Instagram", "emails"}

LINK = re.compile(
    r'<a\b[^>]*?href="[^"]*?(?:amazon\.[a-z.]+|amzn\.to)[^"]*?/(?:dp|gp/product)/([A-Z0-9]{10})[^"]*"[^>]*>(.*?)</a>',
    re.S | re.I)
TAG = re.compile(r"[?&]tag=([A-Za-z0-9-]+)")

ALIAS = {}


def truth():
    """ASIN -> (brand, product, verdict), and brand -> aliases."""
    out = {}
    for b in json.loads(DATA.read_text()):
        ALIAS[b["brand"]] = list(b.get("aliases") or [])
        for p in (b.get("products") or []):
            for a in (p.get("asins") or []):
                # A researched row outranks a generated one for the same ASIN.
                if a in out and p.get("origin") == "brand-line":
                    continue
                out[a] = (b["brand"], p.get("name"), (p.get("ext") or {}).get("verdict"))
    return out


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def names_for(brand):
    """Every way we might legitimately write a brand's name."""
    out = {norm(brand)} | {norm(a) for a in ALIAS.get(brand, [])}
    # "Dr. Brown's" reads as "Dr Browns"; a possessive is not a different brand.
    out |= {n.rstrip("s") for n in list(out) if len(n) > 4}
    return {n for n in out if n}


def owns(text, brand):
    """Does this link text name the brand that owns the ASIN?

    Generous on purpose. Link text is often the product rather than the brand
    ("Natural Glass Baby Bottle"), or a bare call to action ("View", "Buy it"),
    and neither is wrong. Only text that names a *different* brand we know of
    is a mismatch worth reporting.
    """
    t = norm(text)
    if not t:
        return True
    if any(n in t or t in n for n in names_for(brand)):
        return True
    generic = {"view", "viewonamazon", "buyit", "seeit", "shop", "checkprice",
               "amazon", "buyonamazon", "seeprice", "link", "here"}
    if t in generic or len(t) < 3:
        return True
    # Text naming some other brand we hold is the real failure.
    for other in ALIAS:
        if other == brand:
            continue
        for n in names_for(other):
            if len(n) >= 5 and (t.startswith(n) or n == t):
                return False
    return None       # names neither: not a pass, not a failure


def brand_named(text):
    """The brand a link's text names, if it names one we hold."""
    t = norm(text)
    if not t:
        return None
    best = None
    for brand in ALIAS:
        for n in names_for(brand):
            if len(n) >= 4 and n in t:
                # Longest name wins so "Earth Mama Organics" beats "Earth".
                if best is None or len(n) > best[1]:
                    best = (brand, len(n))
    return best[0] if best else None


def pages():
    for path in sorted(ROOT.rglob("*.html")):
        rel = path.relative_to(ROOT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        yield rel, path.read_text(errors="ignore")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    std = truth()
    unknown, mismatch, unclear, dupes = [], [], [], []
    tags = collections.Counter()
    total = 0

    for rel, src in pages():
        seen = {}
        for m in LINK.finditer(src):
            asin, text = m.group(1), re.sub(r"<[^>]+>", " ", m.group(2))
            text = re.sub(r"\s+", " ", text).strip()
            total += 1
            tag = TAG.search(m.group(0))
            tags[tag.group(1) if tag else "(no tag)"] += 1

            if asin not in std:
                unknown.append((rel, asin, text))
                continue
            brand, product, _ = std[asin]

            verdict = owns(text, brand)
            if verdict is False:
                mismatch.append((rel, asin, text, brand, product))
            elif verdict is None:
                unclear.append((rel, asin, text, brand))

            # The same ASIN sold as two different brands on one page.
            #
            # Different wording for the same product is normal: a card badge
            # and a sentence link the same thing and read differently. What is
            # never right is one ASIN carrying two different brand names, which
            # is how a SKIP row ends up pointing at the good alternative.
            # Text that names the owner is fine however else it reads. A card
            # saying "Lodge Cast Iron Skillet ... Made in USA" is not a link to
            # the cookware brand Made In, and treating it as one made this
            # report mostly noise.
            if verdict is not True:
                named = brand_named(text)
                if named and named != brand:
                    if asin in seen and seen[asin] != named:
                        dupes.append((rel, asin, seen[asin], named, brand))
                    seen.setdefault(asin, named)

    print(f"buy links found: {total} across {len(list(pages()))} pages\n")

    print(f"link text names a different brand than the ASIN belongs to: {len(mismatch)}")
    for rel, asin, text, brand, product in mismatch[:40]:
        print(f"  {str(rel)[:44]:<46} \"{text[:26]:<26}\" -> {asin} is {brand}'s {str(product)[:26]}")
    print()

    print(f"same ASIN linked under two different brand names: {len(dupes)}")
    for rel, asin, a, b, brand in dupes[:25]:
        print(f"  {str(rel)[:42]:<44} {asin} is {brand}'s, linked as {a} and {b}")
    print()

    print(f"ASIN we hold no verdict on: {len(unknown)}")
    for rel, asin, text in unknown[:15]:
        print(f"  {str(rel)[:44]:<46} {asin}  \"{text[:34]}\"")
    if len(unknown) > 15:
        print(f"  ... and {len(unknown) - 15} more")
    print()

    print("affiliate tags in use:")
    for tag, n in tags.most_common():
        print(f"  {tag:<24} {n}")

    if len(unclear):
        print(f"\nlink text names neither the brand nor a known other: {len(unclear)} "
              f"(not counted as failures)")

    bad = len(mismatch) + len(dupes)
    if args.strict and bad:
        print(f"\nFAILED: {bad} links point somewhere their text does not promise.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
