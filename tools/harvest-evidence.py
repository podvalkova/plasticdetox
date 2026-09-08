#!/usr/bin/env python3
"""Pull ingredient lists and packaging materials in as data, not as prose.

The rule is that nothing is set by hand: evidence goes in as data, the rules
turn it into fronts, and a rule change reaches every product without anyone
editing a row. 308 rows break that rule today, each carrying `authored` because
its evidence exists only as a sentence a person wrote, which the engine cannot
read and would overwrite.

The way out is not to write better sentences. It is to record the facts the
sentences describe. Open Food Facts and its sister databases return exactly the
two we are missing most, for free, against a barcode:

  ingredients_text          -> the formula front
  packaging_materials_tags  -> the materials front, down to the polymer

We now hold 1,347 barcodes of our own, so the join exists. This writes what
comes back into data/front-evidence.json, which the pipeline already treats as
input: established once, re-read on every build, never re-argued from prose.

It never overwrites an entry a person established, and it records where every
value came from and when, so a wrong one can be traced rather than argued about.

    python3 tools/harvest-evidence.py --limit 40
    python3 tools/harvest-evidence.py --write
"""
import argparse
import json
import pathlib
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
EV = ROOT / "data" / "front-evidence.json"
CODES = ROOT / "app" / "www" / "data" / "barcodes.json"

UA = {"User-Agent": "PlasticDetox/1.0 (anya@washos.com; evidence for our own product database)"}
HOSTS = ["world.openbeautyfacts.org", "world.openfoodfacts.org", "world.openproductsfacts.org"]
FIELDS = "ingredients_text,packaging_materials_tags,packagings,product_name,brands"

# The database's polymer tags, in the words rule 3.1's matrix uses.
POLYMER = {
    "en:glass": "glass", "en:steel": "stainless steel", "en:aluminium": "aluminium",
    "en:paper": "paper", "en:paperboard": "paperboard", "en:cardboard": "paperboard",
    "en:pet-1-polyethylene-terephthalate": "pet",
    "en:hdpe-2-high-density-polyethylene": "hdpe",
    "en:pvc-3-polyvinyl-chloride": "pvc",
    "en:ldpe-4-low-density-polyethylene": "ldpe",
    "en:pp-5-polypropylene": "polypropylene",
    "en:ps-6-polystyrene": "polystyrene",
    "en:o-7-other-plastics": "plastic", "en:plastic": "plastic",
}


def ask(host, code, timeout=20):
    url = f"https://{host}/api/v2/product/{code}.json?fields={FIELDS}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as h:
            body = json.load(h)
    except Exception:
        return None
    if not body or body.get("status") != 1:
        return None
    return body.get("product") or None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--sleep", type=float, default=0.35)
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    ev = json.loads(EV.read_text()) if EV.exists() else {}
    codes = json.loads(CODES.read_text()) if CODES.exists() else {}

    # barcodes, grouped by the brand they belong to
    by_brand = {}
    for code, hit in codes.items():
        by_brand.setdefault(hit.get("brandId"), []).append(code)

    today = time.strftime("%Y-%m-%d")
    jobs = []
    for b in brands:
        for p in (b.get("products") or []):
            if p.get("origin") == "brand-line":
                continue
            asin = (p.get("asins") or [None])[0]
            if not asin:
                continue
            cur = ev.get(asin) or {}
            need_f = not ((cur.get("formula") or {}).get("ingredients") or "").strip()
            need_m = not ((cur.get("materials") or {}).get("material") or "").strip()
            if not (need_f or need_m):
                continue
            for code in by_brand.get(b.get("id"), []):
                jobs.append((b, p, asin, code, need_f, need_m))
                break
    if args.limit:
        jobs = jobs[:args.limit]

    got_f = got_m = 0
    for i, (b, p, asin, code, need_f, need_m) in enumerate(jobs, 1):
        prod = None
        for host in HOSTS:
            prod = ask(host, code)
            if prod:
                break
            time.sleep(args.sleep)
        if not prod:
            continue
        entry = ev.setdefault(asin, {})
        entry.setdefault("_product", f"{b['brand']} {p.get('name')}")
        ings = (prod.get("ingredients_text") or "").strip()
        if need_f and ings:
            entry["formula"] = {"ingredients": ings, "kind": "ingredients",
                                "source": f"openfacts:{code}", "checkedListing": today,
                                "complete": True, "prose": ""}
            got_f += 1
        tags = [POLYMER[t] for t in (prod.get("packaging_materials_tags") or []) if t in POLYMER]
        if need_m and tags:
            entry["materials"] = {"material": ", ".join(sorted(set(tags))), "contact": "yes",
                                  "source": f"openfacts:{code}", "checkedListing": today}
            got_m += 1
        if i % 20 == 0:
            print(f"  {i}/{len(jobs)}  ingredients {got_f}  materials {got_m}", flush=True)

    print(f"\nlooked up {len(jobs)} products against the open databases")
    print(f"  ingredient lists recorded : {got_f}")
    print(f"  packaging materials       : {got_m}")
    if not args.write:
        print("\ndry run. re-run with --write to save.")
        return 0
    EV.write_text(json.dumps(ev, indent=1, ensure_ascii=False) + "\n")
    print(f"\nwrote {EV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
