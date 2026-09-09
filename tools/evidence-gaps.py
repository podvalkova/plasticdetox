#!/usr/bin/env python3
"""What each product still needs before the engine can rate it without a person.

The goal is a database with no hand-set verdicts: evidence goes in as data, the
rules turn it into fronts, the fronts turn into a verdict, and nobody overwrites
anything. Most of that machinery exists. data/front-evidence.json is already
"established once, re-read on every build, never re-argued from prose", and
apply-front-evidence derives materials and formula from it.

What is missing is coverage, and it is measurable. Where a row has no evidence
entry, the classifier falls back to reading the note as prose, which is why
"Aluminum Free" was read as aluminium in contact and "No talc" as talc, and why
308 rows carry `authored` to stop the engine overwriting research it cannot
read. Every row that gains real evidence is a row that can drop the flag.

This reports the gap per front, per product, so a new article's picks show what
they need the moment they enter the database rather than sitting unrated with no
indication why.

    python3 tools/evidence-gaps.py                 # the summary
    python3 tools/evidence-gaps.py --missing formula
    python3 tools/evidence-gaps.py --brand Coterie
    python3 tools/evidence-gaps.py --new           # rows with no evidence at all
"""
import argparse
import collections
import json
import pathlib
import re
import sys

# The gate's own vocabulary, copied from enforce-scorecard so the two cannot
# disagree about what a consumable is.
CONSUMABLE = re.compile(
    r"cosmetic|personal care|sunscreen|skincare|supplement|bottled water|baby food|"
    r"snack|pantry|formula|electrolyte|oral care|toothpaste|mouthwash|floss|cleaning|"
    r"laundry|dish|coffee|tea|salt|spice|protein|diaper cream|lotion|balm|soap|shampoo|"
    r"conditioner|deodorant|wipe|honey|chocolate|diaper|period", re.I)

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
EV = ROOT / "data" / "front-evidence.json"
RECALLS = ROOT / "data" / "recall-cache.json"


# Where an answer came from. A front is only "data" when its origin says a
# lookup or a stated fact produced it; anything else is the prose classifier
# guessing, which is what we are trying to stop relying on.
DATA_ORIGINS = {"database", "stated", "class", "rollup", "hand"}


def state(product, front):
    """answered-from-data / answered-from-prose / unanswered, for one front.

    Measuring "is it in front-evidence.json" was wrong twice. check-recalls
    writes the legal front directly rather than into that file, and
    apply-front-evidence writes a materials front without keeping its input, so
    the file held 147 materials answers while 481 rows actually had one. The
    front and its recorded origin are the only honest test.
    """
    e = product.get("ext") or {}
    v = (e.get("fronts") or {}).get(front)
    if v in (None, "", "unassessed", "unknown"):
        return "unanswered"
    return "data" if (e.get("frontOrigin") or {}).get(front) in DATA_ORIGINS else "prose"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--missing", choices=("formula", "materials", "legal", "testing"))
    ap.add_argument("--brand")
    ap.add_argument("--new", action="store_true")
    ap.add_argument("--limit", type=int, default=25)
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    ev = json.loads(EV.read_text()) if EV.exists() else {}
    recalls = json.loads(RECALLS.read_text()) if RECALLS.exists() else {}
    checked_brands = {k.lower() for k in recalls}

    rows, gaps, optional = [], collections.Counter(), []
    for b in brands:
        for p in (b.get("products") or []):
            if p.get("origin") == "brand-line":
                continue
            asin = (p.get("asins") or [None])[0]
            e = ev.get(asin) if asin else None
            # What the gate actually requires, not a fresh list of mine.
            # enforce-scorecard blocks on materials and legal always, and on
            # formula for a consumable. Testing is deliberately outside it,
            # rule 5.6: almost nothing in these categories is independently
            # tested and the maker does not control whether a lab looked, so an
            # absent test is disclosed rather than held against the product.
            miss = []
            if state(p, "materials") != "data":
                miss.append("materials")
            # The legal front is data when it came from a database lookup.
            # check-recalls writes the front directly rather than into the
            # cache, so testing the cache asked the wrong question and reported
            # 164 gaps that were already closed.
            if state(p, "legal") != "data":
                miss.append("legal")
            if CONSUMABLE.search(f"{p.get('cat') or ''} {b.get('category') or ''}") \
               and state(p, "formula") != "data":
                miss.append("formula")
            if state(p, "testing") == "unanswered":
                optional.append(p)
            for m in miss:
                gaps[m] += 1
            rows.append((b, p, asin, miss))

    total = len(rows)
    complete = sum(1 for *_, m in rows if not m)
    print(f"{total} researched product rows\n")
    print(f"  {complete:>4}  have evidence on all four fronts, so the engine can rate them alone")
    print(f"  {total - complete:>4}  still need a person, or a prose fallback, somewhere\n")
    print("  what is missing, by front:")
    for f in ("formula", "materials", "legal"):
        print(f"    {gaps[f]:>4}  {f}")
    print(f"\n  {len(optional)} rows have no independent test on file. Rule 5.6 does not")
    print("  hold a product for that, so it is disclosed rather than counted above.")

    authored = sum(1 for b, p, *_ in rows if (p.get("ext") or {}).get("authored"))
    print(f"\n  {authored} rows carry `authored`. Each one is a row whose evidence is prose.")

    sel = rows
    if args.missing:
        sel = [r for r in sel if args.missing in r[3]]
    if args.brand:
        sel = [r for r in sel if r[0]["brand"].lower() == args.brand.lower()]
    if args.new:
        sel = [r for r in sel if len(r[3]) == 4]

    if args.missing or args.brand or args.new:
        print(f"\n{len(sel)} rows match. First {min(args.limit, len(sel))}:\n")
        for b, p, asin, miss in sel[:args.limit]:
            print(f"   {b['brand'][:20]:<20} {p['name'][:34]:<34} {asin or 'no asin':<12} needs {', '.join(miss)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
