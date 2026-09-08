#!/usr/bin/env python3
"""Build our own barcode map, so a scan does not depend on anyone else being up.

Every scan currently resolves through Open Food Facts and its sister databases.
That worked until it did not: a Native deodorant scanned to "we have not checked
that yet" while we held a careful verdict on Native, because Open Beauty Facts
was returning HTTP 500 that hour. The product was in the database the whole
time. `app/www/data/barcodes.json` held zero entries, so there was nothing to
fall back to.

This harvests barcodes for the brands we have already researched and writes them
into that file. Once a code is in there, `Index.fromBarcode` answers instantly
and offline, and the open databases become the fallback rather than the only
path.

The guard is the whole design. A barcode mapped to the wrong company asserts our
verdict on a product nobody researched, which is worse than answering nothing.
Two conditions have to hold before a code is kept:

  1. The database's own `brands` field matches our brand name exactly, after
     normalising. Not a substring: "Wild" must not collect "Wild Planet".
  2. The product reads like the thing we rated. Brand names like Native, Wild
     and Simply are ordinary English words, and some other company sells cereal
     under them. So the product name or its categories must share a word with
     our category or one of our product rows.

Usage:
    python3 tools/harvest-barcodes.py            # dry run, reports what it found
    python3 tools/harvest-barcodes.py --write
    python3 tools/harvest-barcodes.py --limit 40 # try it on a slice first
"""

import argparse
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
OUT = ROOT / "app" / "www" / "data" / "barcodes.json"

UA = {"User-Agent": "PlasticDetox/1.0 (anya@washos.com; mapping barcodes for our own product database)"}
HOSTS = [
    "world.openbeautyfacts.org",
    "world.openfoodfacts.org",
    "world.openproductsfacts.org",
]

# Words that carry no signal about what a product is, so they must never be the
# only thing linking a barcode to one of our brands.
STOP = {
    "the", "and", "for", "with", "free", "natural", "organic", "pack", "size",
    "new", "original", "value", "count", "oz", "ml", "kids", "baby", "care",
    "products", "product", "multi", "category", "personal", "home", "other",
}


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def words(s):
    return {w for w in re.split(r"[^a-z0-9]+", (s or "").lower()) if len(w) > 2 and w not in STOP}


def search(host, brand, timeout=25):
    url = (f"https://{host}/cgi/search.pl?search_terms={urllib.parse.quote(brand)}"
           "&search_simple=1&json=1&page_size=50"
           "&fields=code,product_name,brands,categories_tags")
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout) as h:
            return json.load(h).get("products", []) or []
    except Exception:
        return []


def subject_words(brand):
    """What this brand's products are, in words a listing would also use."""
    out = words(brand.get("category"))
    for p in (brand.get("products") or []):
        out |= words(p.get("name"))
        out |= words(p.get("cat"))
    out -= words(brand["brand"])          # the brand name is not the subject
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--sleep", type=float, default=0.34)
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    todo = [b for b in brands
            if b.get("reviewed") and b.get("stance") in ("good", "careful", "skip")]
    if args.limit:
        todo = todo[:args.limit]

    existing = {}
    if OUT.exists():
        try:
            existing = json.loads(OUT.read_text() or "{}")
        except Exception:
            existing = {}

    found, kept, rejected = dict(existing), 0, 0
    for i, b in enumerate(todo, 1):
        subject = subject_words(b)
        if not subject:
            continue
        bkey = norm(b["brand"])
        seen = {}
        for host in HOSTS:
            for p in search(host, b["brand"]):
                code = re.sub(r"\D", "", p.get("code") or "")
                if not code or len(code) < 8:
                    continue
                # 1. the database's own brand field, matched whole
                fields = [norm(x) for x in (p.get("brands") or "").split(",")]
                if bkey not in fields:
                    continue
                # 2. and it has to read like the thing we rated
                text = words(p.get("product_name")) | words(
                    " ".join(t.split(":")[-1] for t in (p.get("categories_tags") or [])))
                if not (text & subject):
                    rejected += 1
                    continue
                seen[code] = p.get("product_name") or b["brand"]
            time.sleep(args.sleep)
        for code, name in seen.items():
            if code in found and found[code].get("brandId") != b.get("id"):
                # Two brands claiming one barcode is not something to guess at.
                rejected += 1
                continue
            found[code] = {"brand": b["brand"], "brandId": b.get("id"),
                           "name": name, "source": "openfacts"}
            kept += 1
        if i % 25 == 0:
            print(f"  {i}/{len(todo)} brands, {kept} codes so far", flush=True)

    print(f"\nbarcodes kept:            {kept}")
    print(f"rejected by the guard:    {rejected}")
    print(f"map size:                 {len(found)} (was {len(existing)})")
    covered = len({v["brandId"] for v in found.values()})
    print(f"brands with a barcode:    {covered}")

    if not args.write:
        print("\ndry run. re-run with --write to save.")
        return
    OUT.write_text(json.dumps(found, indent=1, ensure_ascii=False) + "\n")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    sys.exit(main())
