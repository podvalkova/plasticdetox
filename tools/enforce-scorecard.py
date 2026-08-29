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

Two things this has to get right that a first pass got wrong.

It has to be reversible. The first version only looked at rows that were still
"good", so the moment it held one back the row stopped being good and the gate
never looked at it again. Research that landed afterwards could not un-hold it,
which made filling in a front pointless. It now records what the row was held
back from and restores that verdict once the missing checks arrive.

It also has to apply section 6, not just the completeness half of it. A fail on
any front is a skip and a caution anywhere is at best a careful, whatever the
row claims about itself. The ceiling only ever lowers a verdict. Nothing here
raises one except the restore above, and that only returns a row to the verdict
it already had.

The testing front carries a third option. "none" says we checked and there is
nothing to check against, which is the normal state for a durable good. Anna's
rule was that a product should not be marked careful merely because no third
party has tested it, and this is where that rule lives.

On the legal front the distinction that matters is whether anything was actually
decided. An active complaint is an allegation, so it caps at caution; a
settlement, judgment or recall is an outcome, so it fails. A settlement whose own
terms impose corrective action, and where that action is verifiable, is a caution
rather than a fail, because the remedy is part of the record too.

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
# "none" is a finding: we looked, and no applicable evidence exists. A lab does
# not test a toothbrush handle, so holding one back until someone does means
# holding it back forever, for a gap that is not a gap. It differs from
# "unassessed", which means nobody has looked yet. Only the second blocks a
# recommendation. Use it where evidence is genuinely not expected, never on an
# ingestible, where silence is itself informative.
BLANK = (None, "unassessed", "unknown", "")
RANK = {"skip": 0, "careful": 1, "good": 3}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    gated, kept, restored, capped, released = 0, 0, 0, 0, 0
    missing = collections.Counter()
    by_cat = collections.Counter()
    examples = []

    for b in brands:
        for p in (b.get("products") or []):
            e = p.get("ext")
            if not e:
                continue
            f = e.get("fronts") or {}
            blank = [k for k in FRONTS if f.get(k) in BLANK]

            # Give a held back row its verdict back once the checks arrive.
            if e.get("verdict") == "unrated" and e.get("heldFrom") and not blank:
                e["verdict"] = e.pop("heldFrom")
                e.pop("heldBack", None)
                if str(e.get("why", "")).startswith("a recommendation needs"):
                    e["why"] = e.get("restoreWhy") or ""
                e.pop("restoreWhy", None)
                restored += 1

            # Section 6, as a ceiling. This only ever lowers a verdict, and it
            # lets go again when the front that caused it does. Without the
            # release a verdict capped on evidence later withdrawn stayed
            # capped, which is how Native sat at skip with no finding left.
            vals = [f.get(k) for k in FRONTS]
            ceiling = "skip" if "fail" in vals else (
                "careful" if "caution" in vals else "good")
            if e.get("cappedFrom") and RANK[ceiling] > RANK[e["verdict"]]:
                e["verdict"] = min(e.pop("cappedFrom"), ceiling, key=RANK.get)
                released += 1
            if e.get("verdict") in ("good", "careful"):
                if RANK[e["verdict"]] > RANK[ceiling]:
                    e.setdefault("cappedFrom", e["verdict"])
                    e["verdict"] = ceiling
                    capped += 1

            if e.get("verdict") != "good":
                continue
            if not blank:
                kept += 1
                continue
            e["heldFrom"] = "good"
            e["restoreWhy"] = e.get("why", "")
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
    print(f"held back for an incomplete scorecard:      {gated}")
    print(f"restored once the missing checks arrived:   {restored}")
    print(f"capped by a fail or caution (section 6):    {capped}")
    print(f"released once that finding was withdrawn:   {released}\n")
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
