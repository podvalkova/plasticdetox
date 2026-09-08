#!/usr/bin/env python3
"""The data pipeline, as its own command.

The pipeline was not missing. It has been in build-extension.py all along, about
twenty tools in a deliberate order, every step carrying a comment explaining why
it sits where it sits. The problem was never the order. It was that the only way
to run it was to invoke a tool named after building a Chrome extension, so
nobody ran it to keep the data honest, and the data drifted between the times
somebody happened to build the extension. 57 products sat off the shop shelf
held back by scorecards the pipeline would have refreshed, and 14 rows carried
no scorecard at all.

Two other things made it something to avoid rather than reach for. It wrote
without asking, so running it to see what it would do meant it had already done
it, which cost a rollback twice in one session. And it ended in packaging, so a
data refresh and a release were the same act.

So: the order lives here now, once, and build-extension.py calls it. Running it
without --write tells you what it would change and touches nothing.

    python3 tools/pipeline.py            # what would change
    python3 tools/pipeline.py --write
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

# In order, with the reasons kept where they were written. Each entry is
# (script, args, why-it-is-here-if-the-position-matters).
STEPS = [
    ("validate-data.py", ["--stage", "pre"],
     "shapes first, so no tool can propagate a malformed field"),
    ("backfill-fronts.py", ["--write"], ""),
    ("link-articles.py", ["--write"], ""),
    ("mark-scope.py", ["--write"], ""),
    ("store-to-brands.py", ["--write"],
     "before store-to-products, which resolves brands through the ASIN map"),
    ("store-to-products.py", ["--write"], ""),
    ("articles-to-products.py", ["--write"], ""),
    ("registry-to-products.py", ["--write"], ""),
    ("brand-lines.py", ["--write"], ""),
    ("name-to-match.py", ["--write"], "give hand researched rows a way to fire"),
    ("add-category-top5.py", ["--write"], ""),
    ("add-article-top5.py", ["--write"], ""),
    ("fix-row-copy.py", ["--write"], ""),
    ("normalise-categories.py", ["--write"], ""),
    ("product-categories.py", ["--write"], "the category belongs on the product"),
    ("reconcile-matchers.py", ["--write"],
     "after brand-lines regenerates stand-in phrases, before the step that refuses collisions"),
    ("apply-product-rules.py", ["--write"], "the strict per product verdict"),
    ("brand-rollup.py", ["--write"], "reads product verdicts, so it follows them"),
    ("extract-testing.py", ["--write"],
     "after apply-product-rules, which would otherwise wipe these fronts"),
    ("check-recalls.py", ["--write"], ""),
    ("front-evidence.py", ["--write"],
     "before the gate, so an unsourced fail cannot delete a good pick"),
    ("exposure.py", ["--write"],
     "after apply-product-rules rebuilds ext, before apply-front-evidence reads it"),
    ("formula/materials-from-name.py", ["--write"], ""),
    ("apply-front-evidence.py", ["--write"], ""),
    ("apply-class-evidence.py", ["--write"],
     "after front-evidence, which blanks unsourced adverse fronts"),
    ("enforce-scorecard.py", ["--write"],
     "last of the writers: a recommendation needs all four checks"),
    ("harvest-asins.py", [],
     "last, so it sees every row the steps above created"),
]

AUDITS = [
    ("audit-alternatives.py", ["--strict"], "no card may point at something we flag"),
    ("audit-recommendations.py", [], ""),
    ("audit-store-coverage.py", [], ""),
    ("audit-site-alignment.py", [], ""),
    ("validate-data.py", ["--stage", "post"], ""),
]


def run(script, args, quiet=False):
    r = subprocess.run([sys.executable, str(ROOT / "tools" / script), *args],
                       cwd=ROOT, capture_output=True, text=True)
    if not quiet:
        sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stdout.write(r.stdout)
        sys.stderr.write(r.stderr)
        raise SystemExit(f"{script} failed")
    return r.stdout


def verdicts():
    d = json.loads(DATA.read_text())
    return {f"{b['brand']}|{p.get('name')}": (p.get("ext") or {}).get("verdict")
            for b in d for p in (b.get("products") or [])}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--skip-audits", action="store_true")
    args = ap.parse_args()

    backup = None
    if not args.write:
        backup = pathlib.Path(tempfile.mkdtemp()) / "brand-data.json"
        shutil.copy(DATA, backup)
        before = verdicts()

    # A failing step must not leave a dry run's edits on disk. The first run of
    # this found apply-product-rules failing halfway and walked away with the
    # file half rewritten, which is the exact behaviour the dry run exists to
    # prevent.
    try:
        for script, a, why in STEPS:
            if not args.quiet:
                print(f"\n$ tools/{script} {' '.join(a)}" + (f"   # {why}" if why else ""))
            run(script, a, quiet=args.quiet)

        if not args.skip_audits:
            for script, a, why in AUDITS:
                if not args.quiet:
                    print(f"\n$ tools/{script} {' '.join(a)}" + (f"   # {why}" if why else ""))
                run(script, a, quiet=args.quiet)
    except SystemExit:
        if backup:
            shutil.copy(backup, DATA)
            print("\na step failed. brand-data.json restored to where it was.")
        raise

    if args.write:
        print("\npipeline complete, brand-data.json written.")
        return 0

    after = verdicts()
    moved = [(k, before.get(k), after[k]) for k in after if before.get(k) != after[k]]
    shutil.copy(backup, DATA)
    print(f"\ndry run, brand-data.json restored. verdicts that would change: {len(moved)}")
    for k, a, b in moved[:25]:
        brand, _, name = k.partition("|")
        print(f"   {brand[:20]:<20} {name[:34]:<34} {str(a):<8} -> {b}")
    if len(moved) > 25:
        print(f"   ... and {len(moved) - 25} more")
    if moved:
        print("\nrun with --write to apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
