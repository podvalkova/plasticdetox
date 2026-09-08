#!/usr/bin/env python3
"""A brand-line stand-in yields any phrase a researched row already answers.

brand-lines.py projects the brand's stance onto a category and gives that
stand-in row a set of match phrases. A researched product row in the same
category often answers to the same words: Coterie's wipes row and the Coterie
stand-in both want ['coterie','wipe']. Two rows answering one title with
different verdicts is the collision apply-product-rules refuses to write past,
and it is right to refuse, because which one wins would be decided by file
order.

The specific row wins. It is direct evidence about one product; the stand-in is
the brand's own verdict projected back down, and it exists to answer for
everything no researched row covers. So it keeps the rest of its range and gives
up only what is now answered better.

This was fixed by hand twice in one session and came back both times, because
brand-lines regenerates the phrases on every build. It belongs in the pipeline,
between the step that creates them and the step that refuses them.

Compared stemmed: the matcher treats singular and plural as one word, so
['coterie','wipe'] and ['coterie','wipes'] are one phrase in two spellings.
"""
import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"


def stem(w):
    return re.sub(r"(ies|es|s)$", "", w)


def key(group):
    return tuple(sorted(stem(w) for w in group))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    yielded, touched = 0, []
    for b in brands:
        rows = b.get("products") or []
        direct = [p for p in rows if p.get("origin") != "brand-line"]
        stand = [p for p in rows if p.get("origin") == "brand-line"]
        if not (direct and stand):
            continue
        taken = {key(g) for p in direct for g in (p.get("matchAll") or [])}
        taken |= {key([m]) for p in direct for m in (p.get("match") or [])}
        for sp in stand:
            groups = sp.get("matchAll") or []
            keep = [g for g in groups if key(g) not in taken]
            if len(keep) != len(groups):
                yielded += len(groups) - len(keep)
                touched.append(f"{b['brand']} / {sp.get('name')}")
                sp["matchAll"] = keep

    print(f"stand-in phrases yielded to a researched row: {yielded}")
    for t in touched[:10]:
        print(f"   {t}")
    if not args.write:
        print("dry run. re-run with --write to apply.")
        return 0
    DATA.write_text(json.dumps(brands, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {DATA}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
