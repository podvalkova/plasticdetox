#!/usr/bin/env python3
"""
Every product in the store must produce a verdict in the extension.

The store is the authority on what we recommend: a listing there is a product a
person vetted and chose to put their name to. So a shopper who finds one of our
own picks on Amazon and gets "we have not reviewed this" is seeing two of our
systems disagree, which is worse than either answer alone.

This walks the store catalogue, runs each ASIN and name through the same matcher
the extension uses, and reports every pick that does not resolve.

    python3 tools/audit-store-coverage.py
    python3 tools/audit-store-coverage.py --strict     # non-zero exit on any gap
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
STORE = ROOT / "data" / "store-products.js"


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (s or "").lower())).strip()


def has_word(low, w):
    n = norm(w)
    if not n:
        return False
    if f" {n} " in low:
        return True
    if n.endswith("s") and f" {n[:-1]} " in low:
        return True
    return f" {n}s " in low


def product_for(brand, asin, title):
    rows = brand.get("products") or []
    if asin:
        hit = next((p for p in rows if asin in (p.get("asins") or [])), None)
        if hit:
            return hit
    low = " " + norm(title) + " "
    best, best_len, best_direct, best_ev = None, 0, False, -1
    for p in rows:
        if any(has_word(low, w) for w in (p.get("matchNot") or [])):
            continue
        ev = sum(1 for v in ((p.get("ext") or {}).get("fronts") or {}).values()
                 if v not in ("unassessed", "unknown"))
        direct = p.get("origin") != "brand-line"
        for phrase in (p.get("match") or []):
            n = norm(phrase)
            if n and n in low:
                if (direct != best_direct and direct) or (
                        direct == best_direct and (ev > best_ev or (ev == best_ev and len(n) > best_len))):
                    best, best_len, best_direct, best_ev = p, len(n), direct, ev
        for g in (p.get("matchAll") or []):
            if not g or not all(has_word(low, w) for w in g):
                continue
            w = len("".join(g))
            if (direct != best_direct and direct) or (
                    direct == best_direct and (ev > best_ev or (ev == best_ev and w > best_len))):
                best, best_len, best_direct, best_ev = p, w, direct, ev
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    by_key = {}
    for b in brands:
        for label in [b["brand"]] + list(b.get("aliases") or []):
            k = re.sub(r"[^a-z0-9]+", "", label.lower())
            if len(k) >= 3:
                by_key.setdefault(k, b)

    src = STORE.read_text()
    picks = []
    for blob in re.findall(r"\{[^{}]*?name:\s*\"[^\"]+\"[^{}]*?\}", src):
        name = re.search(r'name:\s*"([^"]+)"', blob)
        asin = re.search(r'asin:\s*"([A-Z0-9]{10})"', blob)
        cat = re.search(r'cat:\s*"([^"]+)"', blob)
        if name:
            picks.append((name.group(1), asin.group(1) if asin else None,
                          cat.group(1) if cat else "?"))

    def resolve_brand(title):
        words = norm(title).split()
        for n in range(min(4, len(words)), 0, -1):
            b = by_key.get("".join(words[:n]))
            if b:
                return b
        return None

    ok, no_brand, no_row, unrated = 0, [], [], []
    for name, asin, cat in picks:
        b = resolve_brand(name)
        if not b:
            no_brand.append((name, cat))
            continue
        row = product_for(b, asin, name)
        if not row:
            no_row.append((name, cat, b["brand"]))
            continue
        v = (row.get("ext") or {}).get("verdict")
        if v in (None, "unrated", "neutral"):
            unrated.append((name, cat, b["brand"], (row.get("ext") or {}).get("why", "")))
            continue
        ok += 1

    total = len(picks)
    gaps = len(no_brand) + len(no_row) + len(unrated)
    print(f"store picks: {total}")
    print(f"  resolve to a verdict:        {ok}  ({100 * ok // max(1, total)}%)")
    print(f"  brand not in Brand Check:    {len(no_brand)}")
    print(f"  brand known, no row matches: {len(no_row)}")
    print(f"  row matches but is unrated:  {len(unrated)}")

    if unrated:
        print("\nour own picks that would show no status:")
        for name, cat, brand, why in unrated[:20]:
            print(f"  [{cat}] {name[:44]:<44} {why[:46]}")
    if no_row:
        print("\nbrand known but nothing matches:")
        for name, cat, brand in no_row[:12]:
            print(f"  [{cat}] {name[:44]:<44} ({brand})")
    if no_brand:
        print("\nnot in Brand Check at all:")
        for name, cat in no_brand[:12]:
            print(f"  [{cat}] {name[:56]}")

    if args.strict and gaps:
        raise SystemExit(f"\n{gaps} store picks do not resolve")


if __name__ == "__main__":
    sys.exit(main())
