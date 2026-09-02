#!/usr/bin/env python3
"""
Change a product's link everywhere at once.

brand-data.json is the source of truth for verdicts, but a buy link is copied
into articles, the store catalogue and the registry by hand, so moving a product
meant grepping and hoping. Motherlove's diaper balm moved from the 4 oz plastic
jar to the 2 oz glass one and the ASIN appeared in five files; missing one would
have left a link recommending the container we had just flagged.

This changes it in every place at once, including the standard itself, and
tells you exactly what it touched.

    python3 tools/relink.py B08KSQV695 B000XJ2LDW
    python3 tools/relink.py B08KSQV695 B000XJ2LDW --write
"""

import argparse
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
# Generated files are rebuilt from the standard, so editing them here would be
# undone on the next build and hide where the real reference lives.
SKIP_DIRS = {"node_modules", "dist", "app", "docs", ".git", "Pinterest", "Instagram"}
SUFFIXES = {".html", ".js", ".json", ".md"}
ASIN = re.compile(r"^[A-Z0-9]{10}$")


def files():
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path.suffix not in SUFFIXES:
            continue
        rel = path.relative_to(ROOT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        yield rel, path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("old")
    ap.add_argument("new")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    for value in (args.old, args.new):
        if not ASIN.match(value):
            print(f"not an ASIN: {value}")
            return 1
    if args.old == args.new:
        print("those are the same ASIN")
        return 1

    hits = []
    for rel, path in files():
        src = path.read_text(errors="ignore")
        n = src.count(args.old)
        if not n:
            continue
        hits.append((rel, n))
        if args.write:
            path.write_text(src.replace(args.old, args.new))

    if not hits:
        print(f"{args.old} does not appear anywhere.")
        return 1

    total = sum(n for _, n in hits)
    verb = "changed" if args.write else "would change"
    print(f"{args.old} -> {args.new}: {verb} {total} reference(s) in {len(hits)} file(s)\n")
    for rel, n in hits:
        print(f"  {n:>3}  {rel}")

    if not args.write:
        print("\ndry run. re-run with --write to make the change.")
    else:
        print("\nNow re-run tools/audit-links.py, and rebuild the extension and app "
              "snapshots so they carry it too.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
