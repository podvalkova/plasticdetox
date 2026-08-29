#!/usr/bin/env python3
"""
A recommendation needs all four checks. One gate, at the end, for every path.

Anna asked for this repeatedly and it kept not happening. The reason was not
disagreement, it was structure: five different routes could award a good, and
only one of them looked at the fronts. A store pick went through unchecked, so
did a brand named as a better alternative, so did a lab result, so did anything
hand written. Each bypass was a reasonable local decision and together they meant
the rule was never actually in force anywhere.

So it lives in one place now, and it runs last, after every tool that fills a
front. Position matters: run inside apply-product-rules and the legal front is
always empty, because check-recalls has not run yet, which would have held back
every recommendation on the site for a reason that was about ordering.

Whatever awarded the good, it stays a good only if all four fronts carry a
finding. Otherwise it is held back, and the reason names the checks still to do.

    python3 tools/enforce-scorecard.py            # report only
    python3 tools/enforce-scorecard.py --write
"""

import argparse
import collections
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
FRONTS = ("formula", "packaging", "legal", "testing")
BLANK = (None, "unassessed", "unknown", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    gated, kept = 0, 0
    missing = collections.Counter()
    by_cat = collections.Counter()
    examples = []

    for b in brands:
        for p in (b.get("products") or []):
            e = p.get("ext")
            if not e or e.get("verdict") != "good":
                continue
            f = e.get("fronts") or {}
            blank = [k for k in FRONTS if f.get(k) in BLANK]
            if not blank:
                kept += 1
                continue
            e["verdict"] = "unrated"
            e["why"] = ("a recommendation needs all four checks; still to do: "
                        + ", ".join(blank))
            e["heldBack"] = blank
            gated += 1
            missing.update(blank)
            by_cat[p.get("cat") or b.get("category")] += 1
            if len(examples) < 8:
                examples.append((b["brand"], p.get("name"), blank))

    print(f"recommendations with all four checks, kept: {kept}")
    print(f"held back for an incomplete scorecard:      {gated}\n")
    if missing:
        print("the check that is missing:")
        for k, n in missing.most_common():
            print(f"  {n:>4}  {k}")
        print("\nworst categories:")
        for c, n in by_cat.most_common(8):
            print(f"  {n:>4}  {c}")
        print()
        for brand, name, blank in examples:
            print(f"  [{brand}] {str(name)[:28]:<28} needs {', '.join(blank)}")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
