#!/usr/bin/env python3
"""
A brand verdict should follow from its products, not compete with them.

Products carry the evidence. Each row has its own four checks and its own
verdict, gated by enforce-scorecard.py. A brand is an aggregation of those, so
its stance should be derivable, and where a person overrides the derivation the
override should say why, the way a capped verdict already records cappedFrom
and capRestoreWhy.

Today 90 percent of brands with rated products already equal their rollup, so
this is mostly already true. It just is not checked, and it is not true for 42.

The rule:

  all good           -> good
  all careful        -> careful
  nothing good or careful -> skip
  mixed              -> careful, because that is what mixed means to a buyer

A brand with no rated product is not a failure. 543 of ours have none, and for
those the stance is the only thing we hold; it is brand level by definition and
every surface already labels it as such.

    python3 tools/audit-brand-rollup.py
    python3 tools/audit-brand-rollup.py --strict
"""

import argparse
import collections
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
RANK = {"skip": 0, "careful": 1, "good": 3}


def rollup(verdicts):
    s = set(verdicts)
    if s == {"good"}:
        return "good"
    if not (s & {"good", "careful"}):
        return "skip"
    if s == {"careful"}:
        return "careful"
    return "careful"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    none, agree = 0, 0
    drift, justified = [], 0
    moves = collections.Counter()

    for b in brands:
        vs = [(p.get("ext") or {}).get("verdict") for p in (b.get("products") or [])]
        vs = [v for v in vs if v in RANK]
        if not vs:
            none += 1
            continue
        want = rollup(vs)
        have = b.get("stance")
        if have == want:
            agree += 1
        elif str(b.get("stanceWhy") or "").strip():
            # A person looked at the products and decided otherwise, and said
            # why. Brita's Elite filter is a careful while the range is a skip,
            # because no Brita filter is certified for what the category turns
            # on. That is a judgement the rollup cannot make.
            justified += 1
        else:
            drift.append((b["brand"], have, want, dict(collections.Counter(vs))))
            moves[(have, want)] += 1

    total = agree + justified + len(drift)
    print(f"brands with at least one rated product: {total}")
    print(f"  stance equals the rollup:            {agree}")
    print(f"  overrides the rollup, and says why:  {justified}")
    print(f"  differs with no reason given:        {len(drift)}")
    print(f"\nbrands with no rated product: {none} (stance is all we hold, and is labelled brand level)")

    if drift:
        print("\nwhich way they differ:")
        for (h, w), n in moves.most_common():
            print(f"   {str(h):8} -> {w:8}  {n}")
        print("\nfirst twenty:")
        for name, have, want, c in drift[:20]:
            print(f"   {name[:24]:<26} stance={str(have):8} rollup={want:8} products={c}")
        print("\nEither move the stance, or record a stanceWhy saying what the "
              "rollup cannot see.")

    if args.strict and drift:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
