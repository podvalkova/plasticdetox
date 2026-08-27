#!/usr/bin/env python3
"""
Mark which brand verdicts may be applied to a product we have not researched.

The Brand Check page answers "what do you think of Cuisinart", so a brand-level
answer is exactly right there. The extension answers "should I buy this pan",
which is a different question, and a brand verdict is only a safe answer to it
when the brand's range is uniform.

Two listings showed the failure. A SENSARTE nonstick pan read "Good choice"
because the brand discloses no intentionally added PFAS, which says nothing
about a coating. A Cuisinart stainless skillet read "Skip" because Cuisinart is
a skip for its appliance line, which says nothing about a bare pan.

A verdict does not generalise when either is true:
  - its own product rows disagree with the brand stance, so the range is
    demonstrably mixed
  - the write-up says so, in the words we actually use for it

Everything else generalises. That is 86% of the database, so search results keep
working; the remaining 14% stop asserting things we never checked.

    python3 tools/mark-scope.py            # report only
    python3 tools/mark-scope.py --write
"""

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

# The phrasings we genuinely use when a verdict is scoped to part of a range.
VARIES = re.compile(
    r"depends on the product|per product|product line|across its .{0,24}line|"
    r"specific .{0,20}lines?|check the product rows|varies by|"
    r"one company, very different|the rest of the (business|range)|"
    r"some of its|most of its|its .{0,20}line lands",
    re.I,
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    mixed = varies = 0

    for b in brands:
        verdicts = {p.get("verdict") for p in (b.get("products") or []) if p.get("verdict")}
        text = (b.get("reason") or "") + " " + (b.get("evidence") or "")

        if len(verdicts) > 1 or (verdicts and b.get("stance") not in verdicts):
            b["generalises"] = False
            b["scopeNote"] = "Our verdict varies across this brand's range."
            mixed += 1
        elif VARIES.search(text):
            b["generalises"] = False
            b["scopeNote"] = "Our verdict covers part of this brand's range, not all of it."
            varies += 1
        else:
            b["generalises"] = True
            b.pop("scopeNote", None)

    total = len(brands)
    safe = total - mixed - varies
    print(f"{total} brands")
    print(f"  range demonstrably mixed:        {mixed:>4}")
    print(f"  write-up says the verdict varies:{varies:>4}")
    print(f"  safe to apply to any product:    {safe:>4}  ({safe * 100 // total}%)")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
