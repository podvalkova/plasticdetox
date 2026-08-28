#!/usr/bin/env python3
"""
Turn baby registry picks into product-level verdicts.

registry.html is a curated list of specific products with a name, a sentence of
reasoning, badges and an ASIN. Like the store, a listing there is already a
product-level judgement, because we only put something on the registry after
vetting it. That research had never reached brand-data.json, so the extension
could not see any of it.

The sentence is the reasoning and the badges are the evidence, so both go into
the note rather than being thrown away.

    python3 tools/registry-to-products.py            # report only
    python3 tools/registry-to-products.py --write
"""

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
REGISTRY = ROOT / "registry.html"


def collapse(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def registry_records():
    if not REGISTRY.exists():
        return []
    src = REGISTRY.read_text(errors="ignore")
    out, seen = [], set()
    for blob in re.findall(r'\{[^{}]*?"name"\s*:\s*"[^"]+"[^{}]*?\}', src):
        try:
            r = json.loads(blob)
        except json.JSONDecodeError:
            continue
        asin = r.get("asin")
        if not asin:
            m = re.search(r"/dp/([A-Z0-9]{10})", r.get("url", "") or "")
            asin = m.group(1) if m else None
        if not asin or asin in seen or not r.get("name"):
            continue
        seen.add(asin)
        out.append({"asin": asin, "name": r["name"].strip(),
                    "sentence": (r.get("sentence") or "").strip(),
                    "badges": r.get("badges") or []})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    lookup = []
    for b in brands:
        for label in [b["brand"]] + list(b.get("aliases") or []):
            key = collapse(label)
            if len(key) >= 4:
                lookup.append((key, b))
    lookup.sort(key=lambda t: -len(t[0]))

    added = already = no_brand = conflict = 0
    unknown = []

    for rec in registry_records():
        key = collapse(rec["name"])
        brand = next((b for k, b in lookup if key.startswith(k) or k in key), None)
        if not brand:
            no_brand += 1
            unknown.append(rec["name"])
            continue
        # A registry pick on a brand we rate careful or skip is a contradiction
        # for the store audit to raise, not something to convert into a "good".
        if brand.get("stance") in ("careful", "skip"):
            conflict += 1
            continue

        rows = brand.setdefault("products", [])
        if any(rec["asin"] in (p.get("asins") or []) for p in rows):
            already += 1
            continue

        note = rec["sentence"]
        if rec["badges"]:
            note = (note + " " if note else "") + "Badges: " + ", ".join(rec["badges"]) + "."
        rows.append({"name": rec["name"], "asins": [rec["asin"]], "verdict": "good",
                     "note": note[:400], "origin": "registry"})
        added += 1

    print(f"added {added} product verdicts from the baby registry")
    print(f"  already had one:                   {already}")
    print(f"  brand not in the database:         {no_brand}")
    print(f"  brand is careful or skip, skipped: {conflict}")
    if unknown:
        print("  unmatched: " + ", ".join(unknown[:8]) + ("…" if len(unknown) > 8 else ""))

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
