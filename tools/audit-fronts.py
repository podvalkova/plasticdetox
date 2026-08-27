#!/usr/bin/env python3
"""
Find brands whose scorecard contradicts their own write-up.

The failure this catches: a card saying "Independent tests: Not assessed yet"
directly under a paragraph that opens "ANSES 2020 and Greenpeace testing
flagged...". The research plainly exists, the classifier just failed to pull it
out, and the reader sees the site contradict itself at the point of purchase.

That is worse than an honest gap. A blank front says "we have not looked". A
blank front sitting under prose about the very thing says "we are careless".

Ranked worst first: skip and careful brands carry the strongest claims, so a
visible contradiction there costs the most.

    python3 tools/audit-fronts.py              # summary + the worst 25
    python3 tools/audit-fronts.py --all        # every contradiction
    python3 tools/audit-fronts.py --json out.json   # worklist for backfilling
"""

import argparse
import collections
import importlib.util
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

spec = importlib.util.spec_from_file_location("bf", ROOT / "tools" / "backfill-fronts.py")
bf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bf)

# How loudly the prose has to talk about a front before a blank is a contradiction
# rather than a passing mention.
MIN_CUES = 1

STANCE_RANK = {"skip": 0, "careful": 1, "neutral": 2, "good": 3}


def prose(brand):
    parts = [brand.get("reason", ""), brand.get("evidence", "")]
    parts += [c for c in (brand.get("cautions") or [])]
    parts += [p.get("note", "") for p in (brand.get("products") or [])]
    return " ".join(parts).lower()


def cue_hits(text, front):
    return [c for c in bf.CUES[front] if bf.has(text, c)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="list every contradiction")
    ap.add_argument("--json", metavar="PATH", help="write a backfill worklist")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    rows = []
    per_front = collections.Counter()
    silent = []          # no fronts at all and no prose cues either: a genuine gap

    for b in brands:
        text = prose(b)
        fronts = b.get("fronts") or {}
        contradictions = []
        for f in bf.FRONTS:
            status = (fronts.get(f) or {}).get("status", "unknown")
            if status != "unknown":
                continue
            hits = cue_hits(text, f)
            if len(hits) >= MIN_CUES:
                contradictions.append({"front": f, "cues": hits[:6]})
                per_front[f] += 1
        if contradictions:
            rows.append({
                "brand": b["brand"],
                "id": b["id"],
                "stance": b.get("stance"),
                "category": b.get("category"),
                "missing": contradictions,
                "reason": b.get("reason", ""),
            })
        elif all((fronts.get(f) or {}).get("status", "unknown") == "unknown" for f in bf.FRONTS):
            silent.append(b["brand"])

    rows.sort(key=lambda r: (STANCE_RANK.get(r["stance"], 9), -len(r["missing"]), r["brand"]))

    total_cells = len(brands) * 4
    filled = sum(
        1 for b in brands for f in bf.FRONTS
        if (b.get("fronts") or {}).get(f, {}).get("status", "unknown") != "unknown"
    )
    contradicting_cells = sum(len(r["missing"]) for r in rows)

    print(f"{len(brands)} brands, {total_cells} scorecard cells")
    print(f"  populated                {filled:>5}  ({filled * 100 // total_cells}%)")
    print(f"  blank but prose covers it{contradicting_cells:>5}  <- fixable from text we already wrote")
    print(f"  blank and genuinely unresearched {total_cells - filled - contradicting_cells:>5}")
    print()
    # A caution or skip naming no failing front is a card that warns without
    # saying why. The prose carries the reason, but the scorecard is silent, and
    # a warning badge over an empty scorecard reads as an oversight.
    unexplained = [
        b for b in brands if b.get("stance") in ("careful", "skip")
        and not [f for f in bf.FRONTS
                 if (b.get("fronts") or {}).get(f, {}).get("status") in ("caution", "fail")]
    ]
    print(f"careful/skip brands that warn without naming a failing front: {len(unexplained)}")
    for b in unexplained[:10]:
        print(f"   [{b['stance']:7}] {b['brand']}")
    print()

    print(f"brands showing at least one contradiction: {len(rows)}")
    print(f"brands with a fully blank card and no prose cues: {len(silent)}")
    print()
    print("contradictions by front:")
    for f in bf.FRONTS:
        print(f"  {f:<11}{per_front[f]:>5}")

    show = rows if args.all else rows[:25]
    print(f"\nworst {len(show)} (skip and careful first, these cards are the most damaging):\n")
    for r in show:
        fronts = ", ".join(f"{m['front']}({'/'.join(m['cues'][:3])})" for m in r["missing"])
        print(f"  [{r['stance']:7}] {r['brand']}")
        print(f"      blank: {fronts}")
        print(f"      says:  {r['reason'][:110]}")

    if args.json:
        out = pathlib.Path(args.json)
        out.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n")
        print(f"\nworklist -> {out}")


if __name__ == "__main__":
    sys.exit(main())
