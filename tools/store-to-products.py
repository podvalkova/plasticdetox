#!/usr/bin/env python3
"""
Turn store picks into product-level verdicts.

The extension only asserts a verdict for a product we have actually researched.
Knowing the brand is not knowing the product: Cuisinart is a skip for its
appliance line and that says nothing about a bare stainless skillet. Applied
strictly, that left 21 products with a verdict, which is no product at all.

The store closes most of that gap without inventing anything. A row in
data/store-products.js is already a product-level judgement, because the
standing rule is that a careful or skip verdict in Brand Check means the brand
cannot appear in the store. So a store row is a researched "good" on that exact
ASIN, and its own description, pros and cons are the reasoning.

Cons are carried into the note rather than dropped. A store pick with a caveat
is still a pick, and the caveat is the useful half.

    python3 tools/store-to-products.py            # report only
    python3 tools/store-to-products.py --write
"""

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
ASINS = ROOT / "extension" / "data" / "asin-map.json"
STORE = ROOT / "data" / "store-products.js"

ROW = re.compile(r"\{[^{}]*?asin:\s*\"([A-Z0-9]{10})\"[^{}]*?\}", re.S)
FIELD = re.compile(r'(\w+):\s*"((?:[^"\\]|\\.)*)"')
LIST = re.compile(r'(\w+):\s*\[([^\]]*)\]')


def parse_store():
    src = STORE.read_text()
    out = {}
    for m in ROW.finditer(src):
        blob = m.group(0)
        rec = {k: v for k, v in FIELD.findall(blob)}
        for k, body in LIST.findall(blob):
            rec[k] = [x.strip().strip('"') for x in body.split('","')] if body.strip() else []
        if rec.get("asin"):
            out[rec["asin"]] = rec
    return out


def note_for(rec):
    """
    A spec-sheet note: what it is, the evidence behind it, then the caveat.

    The store's `effectiveness` field is where the certifications live: "EWG
    Verified + GOTS certified", "IAPMO certified to NSF/ANSI 53". Leaving it out
    threw away the testing front on our own picks, which is why 87 store
    products resolved to "no front is directly evidenced by the note".
    """
    desc = (rec.get("desc") or "").strip()
    # Keep it to the first two sentences; the card has limited room.
    parts = re.split(r"(?<=[.!?])\s+", desc)
    note = " ".join(parts[:2]).strip()
    cons = [c for c in (rec.get("cons") or []) if c]
    ev = (rec.get("effectiveness") or "").strip()
    if ev and ev.lower() not in note.lower():
        note = (note + " " if note else "") + ev.rstrip(".") + "."
    if cons:
        note = (note + " " if note else "") + "Worth knowing: " + cons[0].rstrip(".") + "."
    return note[:400]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    by_id = {b["id"]: b for b in brands}
    amap = json.loads(ASINS.read_text())
    store = parse_store()

    added = skipped_no_brand = already = conflict = 0
    examples = []
    refreshed = 0

    for asin, rec in store.items():
        entry = amap.get(asin)
        brand = by_id.get(entry.get("brandId")) if entry else None
        if not brand:
            skipped_no_brand += 1
            continue

        # A store pick on a brand we rate careful or skip is a contradiction the
        # store audit should catch, not something to paper over here.
        if brand.get("stance") in ("careful", "skip"):
            conflict += 1
            continue

        rows = brand.setdefault("products", [])
        hit = next((p for p in rows if asin in (p.get("asins") or [])), None)
        if hit:
            already += 1
            # Refresh the note on rows this tool owns. It used to skip them
            # entirely, so when note_for started carrying the store's
            # `effectiveness` field, which is where the certifications live, none
            # of the 187 existing rows ever picked it up. A hand-authored row is
            # left alone.
            if hit.get("origin") == "store" and not (hit.get("ext") or {}).get("authored"):
                fresh = note_for(rec)
                if fresh and fresh != hit.get("note"):
                    hit["note"] = fresh
                    refreshed += 1
            continue

        rows.append({
            "name": rec.get("name", "").strip(),
            "asins": [asin],
            "verdict": "good",
            "note": note_for(rec),
            "origin": "store",
        })
        added += 1
        if len(examples) < 10:
            examples.append((brand["brand"], rec.get("name", "")[:40]))

    print(f"store rows with an ASIN: {len(store)}")
    print(f"  new product verdicts added:        {added}")
    print(f"  already had one:                   {already}")
    print(f"  notes refreshed with the store's evidence: {refreshed}")
    print(f"  ASIN not mapped to a known brand:  {skipped_no_brand}")
    print(f"  brand is careful or skip, skipped: {conflict}")
    print("\nexamples:")
    for b, n in examples:
        print(f"   {b:<24} {n}")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
