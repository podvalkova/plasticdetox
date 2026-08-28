#!/usr/bin/env python3
"""
Stamp the strict per-product verdict onto every product row.

Two surfaces, two verdicts, one database. This writes the extension's answer
into `ext` and never touches `verdict`, which stays the editorial call that
Brand Check shows.

    product.verdict   what we say about this product on the site
    product.ext = {
        verdict     what the extension is allowed to assert on a listing page
        why         the rule that produced it, shown in the card
        fronts      the four front statuses after the rules corrections
        scope       sku | line | brand | none
        basis       direct | inherited
        disclose    true when the copy must name the scope it was inherited from
    }

They differ on purpose. The site can carry a hedge and a paragraph of context.
The extension gets one line at the moment of purchase, so it holds the stricter
line: a recommendation needs direct evidence about the exact product on screen.

    python3 tools/apply-product-rules.py            # report only
    python3 tools/apply-product-rules.py --write
"""

import argparse
import collections
import importlib.util
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

_spec = importlib.util.spec_from_file_location(
    "audit_product_rules", ROOT / "tools" / "audit-product-rules.py")
_a = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_a)
FRONTS = _a.FRONTS


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    dist = collections.Counter()
    diverge = 0
    dedup = 0
    hand_kept = 0

    for b in brands:
        rows = b.get("products") or []

        # brand-lines.py tested for `match` before adding a row but writes
        # `matchAll`, so the guard never fired and every build appended another
        # copy. Wet Ones carried seven identical rows. Collapse them here.
        seen, keep = set(), []
        for p in rows:
            key = (p.get("name"), json.dumps(p.get("matchAll"), sort_keys=True),
                   json.dumps(p.get("match"), sort_keys=True),
                   json.dumps(sorted(p.get("asins") or [])))
            if key in seen:
                dedup += 1
                continue
            seen.add(key)
            keep.append(p)
        if len(keep) != len(rows):
            b["products"] = keep
        rows = keep

        consumable = _a.is_consumable(b.get("category"), "")
        for p in rows:
            # A hand-written verdict is the point of the whole exercise: the
            # generated one is a first pass over a 150 character note, and a
            # person who has read the actual listing knows more. Anything
            # carrying authored: true is left exactly as written, on every
            # rebuild, forever. This is what makes the file editable.
            if (p.get("ext") or {}).get("authored"):
                dist[p["ext"].get("verdict")] += 1
                hand_kept += 1
                continue
            scope, basis = _a.scope_of(p), _a.basis_of(p)
            raw, authored = _a.fronts_for(p, b)
            f, fired = _a.apply_rules(raw, _a.clean_note(p.get("note")), scope, basis,
                                      f"{p.get('name') or ''} {b.get('category') or ''}")
            if authored:
                v, why, disclose = p.get("verdict"), "hand authored scorecard", False
            else:
                v, why, disclose = _a.correct(p.get("verdict"), f, p.get("note"),
                                              scope, basis, consumable=consumable)
            p["ext"] = {
                "verdict": v,
                "why": why,
                "fronts": {k: f[k]["status"] for k in FRONTS},
                "scope": scope,
                "basis": basis,
                "disclose": disclose,
                "rules": fired,
            }
            dist[v] += 1
            if v != p.get("verdict"):
                diverge += 1

    # Two rows under one brand resolving to the same rule is a silent
    # mis-verdict: whichever sorts first answers for both, and a stale row can
    # outrank the corrected one that replaced it. Levoit carried a good row and
    # a skip row on the identical match, and the good one won.
    clash = 0
    for b in brands:
        seen = {}
        for p in (b.get("products") or []):
            for g in (p.get("matchAll") or []):
                k = tuple(sorted(g))
                other = seen.get(k)
                if other is not None and other["ext"]["verdict"] != p["ext"]["verdict"]:
                    print(f"  !! COLLISION under {b['brand']}: {other.get('name')!r} "
                          f"({other['ext']['verdict']}) vs {p.get('name')!r} "
                          f"({p['ext']['verdict']}) both need {sorted(g)}")
                    clash += 1
                seen[k] = p

    print(f"stamped ext onto {sum(dist.values())} product rows")
    print(f"  rule collisions with different verdicts: {clash}")
    print(f"  hand-authored, left untouched: {hand_kept}")
    print(f"  collapsed duplicate rows: {dedup}")
    print(f"  extension verdict differs from the site verdict: {diverge}")
    print("\nextension verdict distribution:")
    for k, v in dist.most_common():
        print(f"  {str(k):<8} {v:>4}")

    if clash:
        raise SystemExit("refusing to write: two rows would answer for the same listing")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
