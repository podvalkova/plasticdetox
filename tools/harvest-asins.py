#!/usr/bin/env python3
"""
Build an ASIN to brand map for the Chrome extension.

Amazon's `data-asin` attribute is a stable exact key, so matching on it beats
guessing a brand out of a product title. Every ASIN already linked anywhere on
the site is a product we have researched and taken a position on, so harvesting
them gives the extension exact hits on our own picks from day one.

Sources, in order of confidence:
  1. data/store-products.js  structured {name, asin, cat, sub}
  2. *.html and articles/*.html  affiliate links, brand resolved from context

Writes extension/data/asin-map.json.

    python3 tools/harvest-asins.py
"""

import json
import pathlib
import re
import sys
import collections

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "extension" / "data" / "asin-map.json"

ASIN_RE = re.compile(r"/(?:dp|gp/product|gp/aw/d)/([A-Z0-9]{10})")
# The anchor's own text, which is almost always the product name we chose to
# print. Resolving the brand from a window of surrounding copy instead put
# Manduka PRO under "Made In", because "made in" is a cookware brand and also an
# ordinary English phrase that appears in the paragraph around the link.
ANCHOR_RE = re.compile(
    r"<a\b[^>]*?/(?:dp|gp/product|gp/aw/d)/([A-Z0-9]{10})[^>]*?>(.*?)</a>",
    re.I | re.S)
ASIN_FIELD_RE = re.compile(r'asin:\s*"([A-Z0-9]{10})"')
STORE_ROW_RE = re.compile(r'name:\s*"([^"]+)"[^}]*?asin:\s*"([A-Z0-9]{10})"')
TAG_RE = re.compile(r"<[^>]+>")


def load_brands():
    data = json.loads((ROOT / "brand-data.json").read_text())
    # Longest names first so "Burt's Bees Baby" wins over "Burt's Bees".
    names = []
    for b in data:
        for label in [b["brand"]] + list(b.get("aliases") or []):
            if len(label) >= 3:
                names.append((label.lower(), b["brand"], b["id"]))
    names.sort(key=lambda t: -len(t[0]))
    return names


def collapse_name(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def resolve_brand(context, brand_names):
    low = context.lower()
    for label, brand, bid in brand_names:
        if re.search(r"(?<![a-z0-9])" + re.escape(label) + r"(?![a-z0-9])", low):
            return brand, bid
    return None, None


def main():
    brand_names = load_brands()
    found = {}          # asin -> {name, brand, brandId, source}
    contexts = collections.defaultdict(list)
    anchors = {}        # asin -> the link text we printed for it

    # 1. The store catalog: exact name and ASIN on the same record.
    store = ROOT / "data" / "store-products.js"
    if store.exists():
        text = store.read_text()
        for name, asin in STORE_ROW_RE.findall(text):
            brand, bid = resolve_brand(name, brand_names)
            found[asin] = {"name": name, "brand": brand, "brandId": bid, "source": "store"}

    # 1b. Every ASIN already filed against a product row. These are the most
    # certain attributions we hold, because a person wrote the row against that
    # product, and exact-ASIN matching then works even where brand detection
    # from the title cannot: "A+D" collapses to two characters and is below the
    # matcher's minimum, and "Amazon Brand - Mama Bear" leads with words that
    # name no brand at all.
    for b in json.loads((ROOT / "brand-data.json").read_text()):
        for p in (b.get("products") or []):
            for asin in (p.get("asins") or []):
                found[asin] = {"name": p.get("name") or b["brand"],
                               "brand": b["brand"], "brandId": b.get("id"),
                               "source": "product"}

    # 2. Every affiliate link on the site, brand resolved from surrounding copy.
    html_files = list(ROOT.glob("*.html")) + list((ROOT / "articles").glob("*.html"))
    for path in html_files:
        try:
            raw = path.read_text(errors="ignore")
        except OSError:
            continue
        # The link's own anchor text first. It names the product, so the guard
        # below can actually check it, which it never could for link rows while
        # every one of them carried an empty name.
        for m in ANCHOR_RE.finditer(raw):
            label = re.sub(r"\s+", " ", TAG_RE.sub(" ", m.group(2))).strip()
            if 3 <= len(label) <= 90:
                anchors.setdefault(m.group(1), label)
        for m in ASIN_RE.finditer(raw):
            asin = m.group(1)
            window = TAG_RE.sub(" ", raw[max(0, m.start() - 700): m.end() + 400])
            window = re.sub(r"\s+", " ", window)
            contexts[asin].append((window, path.name))

    for asin, ctxs in contexts.items():
        # A store row carries the product's real name, so it is authoritative.
        # Falling back to surrounding article copy attributed S'well to Klean
        # Kanteen and Cocofloss to Oral-B, simply because those brands were
        # mentioned nearby. If the name yields no brand we know, say so.
        if asin in found and found[asin].get("source") == "store" \
                and not found[asin].get("brand"):
            found[asin]["pages"] = sorted({p for _, p in ctxs})
            continue
        if asin in found and found[asin].get("brand"):
            found.setdefault(asin, {}).setdefault("pages", [])
            found[asin]["pages"] = sorted({p for _, p in ctxs})
            continue
        brand = bid = None
        for window, _ in ctxs:
            brand, bid = resolve_brand(window, brand_names)
            if brand:
                break
        entry = found.get(asin, {})
        # Prefer the anchor text over a guess from the paragraph around it.
        label = anchors.get(asin, "")
        if label:
            named, named_id = resolve_brand(label, brand_names)
            if named:
                brand, bid = named, named_id
        entry.setdefault("name", label)
        entry["brand"] = entry.get("brand") or brand
        entry["brandId"] = entry.get("brandId") or bid
        entry.setdefault("source", "link")
        entry["pages"] = sorted({p for _, p in ctxs})
        found[asin] = entry

    # Last guard: the brand must appear in the product name. A link row with no
    # anchor text to check against is a guess from surrounding copy, and in a
    # comparison article the surrounding copy names what we recommend rather than
    # what we are criticising. 87 of 146 verified rows were wrong that way, so an
    # unverifiable row now resolves to no brand rather than to a plausible one.
    dropped = 0
    for asin, e in list(found.items()):
        name, brand = e.get("name"), e.get("brand")
        if not brand or e.get("source") == "product":
            continue
        if not name or collapse_name(brand) not in collapse_name(name):
            e["brand"] = e["brandId"] = None
            dropped += 1
    if dropped:
        print(f"  dropped {dropped} where the brand did not appear in the product name")

    resolved = {a: e for a, e in found.items() if e.get("brandId")}
    unresolved = sorted(a for a, e in found.items() if not e.get("brandId"))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(resolved, indent=2, ensure_ascii=False, sort_keys=True) + "\n")

    by_source = collections.Counter(e["source"] for e in resolved.values())
    print(f"ASINs found:      {len(found)}")
    print(f"  brand resolved: {len(resolved)}  ({dict(by_source)})")
    print(f"  unresolved:     {len(unresolved)}")
    if unresolved:
        print("  " + ", ".join(unresolved[:12]) + ("…" if len(unresolved) > 12 else ""))
    print(f"\nwrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
