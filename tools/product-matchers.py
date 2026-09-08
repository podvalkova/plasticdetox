#!/usr/bin/env python3
"""Give the products we recommend a way to be found by name.

A product row is reached by title through `match` / `matchAll` phrases. 135 of
the 165 products on the shop shelf had none, so clicking one of our own
recommendations, or scanning it, resolved only to the brand and answered "we
have not researched this exact product" about a product we sell. Wild's
deodorant was the case that surfaced it: recommended as the alternative to
Native, and unreachable when tapped.

Generating matchers is the one direction with real risk. Too broad and a
researched `good` lands on a variant nobody tested. So the phrase is built to
distinguish, not merely to match:

  * the brand's own words are always required, so a phrase can never reach
    another company's product;
  * plus the words that separate THIS row from the brand's other rows. Where a
    brand has one row we add its head noun; where it has several we add the
    tokens unique to each, so "Avanchy spoons" cannot answer for "Avanchy cup".

Then it checks itself. Every generated row must resolve to itself from its own
name, and no row may resolve to a sibling. A generation that breaks either is
dropped rather than shipped.

Usage:
    python3 tools/product-matchers.py            # dry run
    python3 tools/product-matchers.py --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

# Words that describe a package or a size rather than a product, so they can
# never be the thing that tells two of a brand's products apart.
NOISE = {
    "the", "and", "for", "with", "from", "your", "our", "a", "an", "of", "in",
    "pack", "packs", "set", "sets", "count", "ct", "oz", "ml", "litre", "liter",
    "size", "sizes", "large", "small", "mini", "value", "new", "original",
    "free", "natural", "organic", "certified", "premium", "best", "plus",
    "inch", "inches", "piece", "pieces", "pc", "pcs", "each", "every",
}
NUM = re.compile(r"^[\d.,x]+$")


def toks(s):
    out = []
    for w in re.split(r"[^A-Za-z0-9]+", (s or "").lower()):
        if not w or NUM.match(w) or w in NOISE or len(w) < 3:
            continue
        out.append(w)
    return out


def stem(w):
    return re.sub(r"(ies|es|s)$", "", w)


def has_word(w, title_low):
    """The same singular/plural tolerance productFor uses."""
    n = stem(w)
    for cand in (w, n, n + "s", n + "es"):
        if f" {cand} " in title_low:
            return True
    return False


def resolves(group, title):
    low = " " + " ".join(toks(title)) + " "
    return all(has_word(w, low) for w in group)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--all", action="store_true",
                    help="every researched row, not just the ones on the shelf")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    made, skipped, dropped = 0, 0, []

    for b in brands:
        rows = [p for p in (b.get("products") or []) if p.get("origin") != "brand-line"]
        if not rows:
            continue
        bt = toks(b["brand"])
        if not bt:
            continue

        # what each row's name says, brand words removed
        own = {}
        for p in rows:
            own[id(p)] = [w for w in toks(p.get("name")) if stem(w) not in {stem(x) for x in bt}]

        for p in rows:
            if (p.get("match") or p.get("matchAll")):
                continue
            e = p.get("ext") or {}
            on_shelf = e.get("verdict") == "good" and (p.get("asins") or [])
            if not (on_shelf or args.all):
                continue
            mine = own[id(p)]
            if not mine:
                skipped += 1
                continue
            siblings = [own[id(q)] for q in rows if q is not p]
            # The head noun first: it is what the product IS, and what a real
            # listing title will say. Keying on the distinctive words alone gave
            # Wild's deodorant ['wild','full','monty'], which matches our own
            # row name and almost nothing on a shelf, because Amazon calls the
            # same thing an Ultimate Starter Kit.
            sized = lambda w: bool(re.search(r"\d", w))
            head = next((w for w in reversed(mine) if not sized(w)), mine[-1])
            # then whatever separates it from the brand's other rows, so the
            # phrase is longer and more specific than a broad catch-all row's.
            # Only add distinguishing words when there is something to be
            # distinguished FROM. With one row per brand there is not, and
            # adding them keyed Wild's deodorant to "full monty", words that
            # appear on our row and on no shelf.
            distinct = [w for w in mine
                        if not any(stem(w) in {stem(x) for x in s} for s in siblings)
                        and stem(w) != stem(head)] if siblings else []
            key = [head] + distinct[:2]
            if not mine:
                # nothing tells it apart from a sibling, so a phrase would
                # answer for both. Leave it to the ASIN.
                skipped += 1
                continue
            group = bt + key
            p["matchAll"] = [group]
            p["_gen"] = True
            made += 1

    # ---- the check: self yes, siblings no --------------------------------
    for b in brands:
        rows = [p for p in (b.get("products") or []) if p.get("origin") != "brand-line"]
        for p in rows:
            if not p.pop("_gen", False):
                continue
            group = p["matchAll"][0]
            # A row is often named without its brand, "Glass Carafe" under
            # AquaTru, while the title a scan or a listing hands us carries
            # both. Test against what actually arrives.
            full = f"{b['brand']} {p.get('name')}"
            if not resolves(group, full):
                dropped.append((b["brand"], p["name"], "does not match its own name"))
                p.pop("matchAll", None)
                made -= 1
                continue
            hit = next((q for q in rows if q is not p
                        and resolves(group, f"{b['brand']} {q.get('name')}")), None)
            if hit:
                dropped.append((b["brand"], p["name"], f"also answers for {hit.get('name')}"))
                p.pop("matchAll", None)
                made -= 1

    # A brand-line stand-in answers for whatever no researched row covers. Once
    # a row answers a phrase specifically, the stand-in holding the same phrase
    # means two rows answer one title with different verdicts, which is the
    # collision validate-data forbids. The specific row wins; the stand-in keeps
    # the rest of its range.
    yielded = 0
    for b in brands:
        direct = [p for p in (b.get("products") or []) if p.get("origin") != "brand-line"]
        stand = [p for p in (b.get("products") or []) if p.get("origin") == "brand-line"]
        # Compare stemmed. The matcher treats singular and plural as the same
        # word, so ['ecoable','insert'] and ['ecoable','inserts'] are one phrase
        # wearing two spellings, and an exact tuple comparison let the pair
        # through to collide at build time.
        key = lambda g: tuple(sorted(stem(w) for w in g))
        taken = {key(g) for p in direct for g in (p.get("matchAll") or [])}
        for sp in stand:
            keep = [g for g in (sp.get("matchAll") or []) if key(g) not in taken]
            if len(keep) != len(sp.get("matchAll") or []):
                yielded += len(sp["matchAll"]) - len(keep)
                sp["matchAll"] = keep
    print(f"stand-in phrases yielded: {yielded}")
    print(f"matchers generated:       {made}")
    print(f"left alone (ambiguous):   {skipped}")
    print(f"dropped by the self test: {len(dropped)}")
    for br, n, why in dropped[:10]:
        print(f"   {br[:20]:<20} {n[:34]:<34} {why}")

    if not args.write:
        print("\ndry run. re-run with --write to apply.")
        return
    DATA.write_text(json.dumps(brands, indent=1, ensure_ascii=False) + "\n")
    print(f"\nwrote {DATA}")


if __name__ == "__main__":
    sys.exit(main())
