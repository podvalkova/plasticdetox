#!/usr/bin/env python3
"""
Anything we name as the better choice must answer when the reader gets there.

The extension tells someone to skip Native and points them at Each & Every. They
follow it, land on an Each & Every deodorant, and the card says "not reviewed".
That is worse than saying nothing: we sent them, and then failed to stand behind
it at the moment it mattered.

The cause is narrow matching. Each & Every had one ASIN and no title rule, so it
fired on exactly one listing out of the brand's range. A row keyed only to ASINs
answers for the sizes we happened to record and nothing else.

So: every brand named in an `alternative` must have at least one product row that
can fire on a title, not just on an ASIN we already hold.

    python3 tools/audit-alternatives-resolve.py
    python3 tools/audit-alternatives-resolve.py --strict
"""

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"


def collapse(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    by = {}
    for b in brands:
        for label in [b["brand"]] + list(b.get("aliases") or []):
            if len(collapse(label)) >= 4:
                by.setdefault(collapse(label), b)

    named, unresolved, no_entry = set(), [], []
    for b in brands:
        alt = b.get("alternative") or ""
        if not alt:
            continue
        # the brands actually named in the "Better:" line
        for other in brands:
            if other is b or len(other["brand"]) < 4:
                continue
            if re.search(r"\b" + re.escape(other["brand"]) + r"\b", alt, re.I):
                named.add(other["brand"])

    for name in sorted(named):
        t = by.get(collapse(name))
        if not t:
            no_entry.append(name)
            continue
        rows = t.get("products") or []
        fires_on_title = any(p.get("matchAll") or p.get("match") for p in rows)
        recommends = any((p.get("ext") or {}).get("verdict") == "good" for p in rows)
        if not rows:
            unresolved.append((name, "no product rows at all"))
        elif not fires_on_title:
            unresolved.append((name, f"{len(rows)} row(s), all keyed to ASINs only"))
        elif not recommends:
            unresolved.append((name, "no row we would call good"))

    print(f"brands named as a better alternative: {len(named)}")
    print(f"  that cannot answer on a listing:    {len(unresolved)}")
    print(f"  with no Brand Check entry at all:   {len(no_entry)}\n")
    for name, why in unresolved:
        print(f"  {name:<26} {why}")
    if no_entry:
        print("\nnamed but not in Brand Check:")
        for n in no_entry:
            print(f"  {n}")

    if args.strict and (unresolved or no_entry):
        raise SystemExit(f"\n{len(unresolved) + len(no_entry)} alternatives do not resolve")


if __name__ == "__main__":
    sys.exit(main())
