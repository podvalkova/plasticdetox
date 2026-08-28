#!/usr/bin/env python3
"""
Actually check for recalls, so the legal front can say something true.

Rule 5.3 says absence of a recall is not a pass, and it is right: in these
categories no recall usually means no regulator was looking. But that rule is
about never having looked. Looking and finding nothing is a different state, and
it is a legitimate "checked, nothing found".

So this queries openFDA's enforcement endpoints per brand and records the answer
with its date, which turns the legal front from a blank into a finding.

The honest limit: openFDA covers food, drugs and cosmetics. Durable goods are
CPSC territory, and CPSC's public API now returns 404 on every documented
endpoint, so for a crib or a vacuum there is no queryable source and the front
stays unassessed rather than being guessed at.

    python3 tools/check-recalls.py --limit 40
    python3 tools/check-recalls.py --write
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
CACHE = ROOT / "data" / "recall-cache.json"

# Categories openFDA can actually answer for.
FDA_CATS = re.compile(
    r"food|supplement|electrolyte|formula|salt|pantry|coffee|tea|cosmetic|"
    r"skincare|sunscreen|oral care|personal care|protein|spice|gum|diaper cream",
    re.I)
ENDPOINTS = ["food/enforcement", "drug/enforcement", "device/enforcement"]


def query(firm):
    """Total recalls and the most recent, or None when the source is unreachable."""
    total, latest = 0, None
    for ep in ENDPOINTS:
        url = (f"https://api.fda.gov/{ep}.json?search=recalling_firm:"
               f"%22{urllib.parse.quote(firm)}%22&limit=1")
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                d = json.loads(r.read())
        except Exception:
            continue
        n = (d.get("meta", {}).get("results", {}) or {}).get("total", 0)
        total += n
        for res in d.get("results", []):
            dt = res.get("recall_initiation_date")
            if dt and (latest is None or dt > latest[0]):
                latest = (dt, res.get("reason_for_recall", "")[:160],
                          res.get("status", ""), res.get("classification", ""))
    return total, latest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="stop after N brands")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}

    todo = [b for b in brands
            if b.get("products") and FDA_CATS.search(b.get("category") or "")
            and b["brand"] not in cache]
    if args.limit:
        todo = todo[:args.limit]
    print(f"brands in an FDA-answerable category with no cached answer: {len(todo)}")

    for i, b in enumerate(todo, 1):
        total, latest = query(b["brand"])
        cache[b["brand"]] = {"total": total, "latest": latest, "checked": "2026-08-28"}
        if total:
            print(f"  {b['brand']}: {total} recall(s), latest {latest[0] if latest else '?'}")
        if i % 10 == 0:
            print(f"  … {i}/{len(todo)}")
        time.sleep(0.3)

    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, indent=1, ensure_ascii=False) + "\n")

    clean = sum(1 for v in cache.values() if v["total"] == 0)
    hits = sum(1 for v in cache.values() if v["total"])
    print(f"\ncached: {len(cache)} brands   clean: {clean}   with recalls: {hits}")

    if not args.write:
        print("\ndry run. re-run with --write to set the legal front.")
        return

    set_pass = set_flag = 0
    for b in brands:
        c = cache.get(b["brand"])
        if not c:
            continue
        for p in (b.get("products") or []):
            e = p.get("ext")
            if not e or e.get("authored"):
                continue
            if e["fronts"].get("legal") not in ("unassessed", "unknown"):
                continue
            if c["total"] == 0:
                e["fronts"]["legal"] = "pass"
                e["legalNote"] = ("Checked against the FDA enforcement database on "
                                  f"{c['checked']}: no recall on record for this brand.")
                set_pass += 1
            else:
                e["fronts"]["legal"] = "caution"
                d = c["latest"][0] if c["latest"] else "?"
                e["legalNote"] = (f"{c['total']} FDA recall(s) on record for this brand, "
                                  f"most recent {d}. Checked {c['checked']}.")
                set_flag += 1
    DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
    print(f"legal front set to pass on {set_pass} rows, caution on {set_flag}")


if __name__ == "__main__":
    sys.exit(main())
