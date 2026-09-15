#!/usr/bin/env python3
"""Does the store only sell what Brand Check can stand behind?

Nothing has ever asked. validate-data checks brand-data against itself, and
check.sh asks whether the rules still agree with the evidence. Neither has ever
opened store.html, so the shelf and the verdicts drift apart silently and the
first person to notice is a customer tapping a product and getting "no verdict".
That is how Klean Athlete Magnesium ended up on sale reading unrated: its
materials front was never filled in, the rules correctly refused to call it
good, and nothing connected those two facts.

Three outcomes, and they are not the same problem:

  never sell    careful, skip, or no brand-data row at all. A careful product
                is one we have actively flagged; selling it contradicts the
                verdict on our own site. This fails.
  backlog       unrated. The checks are not finished, usually because nobody
                recorded what the thing is made of. Ratcheted rather than
                failed: the count may fall, never rise.
  fine          good.

    python3 tools/store-verdicts.py            # report, non zero on a problem
    python3 tools/store-verdicts.py --accept   # write today's backlog as the ceiling
"""
import argparse, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASELINE = ROOT / "data" / "store-backlog.json"
NEVER = ("careful", "skip")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--accept", action="store_true")
    args = ap.parse_args()

    brands = json.loads((ROOT / "brand-data.json").read_text())
    by = {}
    for b in brands:
        for p in (b.get("products") or []):
            for a in (p.get("asins") or []):
                by[a] = ((p.get("ext") or {}).get("verdict"), b["brand"], p.get("name"))

    store = (ROOT / "store.html").read_text()
    asins = sorted(set(re.findall(r'asin:\s*"([A-Z0-9]{10})"', store)))

    flagged, missing, backlog = [], [], []
    for a in asins:
        hit = by.get(a)
        if not hit:
            missing.append(a)
        elif hit[0] in NEVER:
            flagged.append((a, hit))
        elif hit[0] != "good":
            backlog.append((a, hit))

    print(f"store lists {len(asins)} products")
    print(f"  good                     {len(asins) - len(flagged) - len(missing) - len(backlog)}")
    print(f"  careful or skip          {len(flagged)}")
    print(f"  no brand-data row        {len(missing)}")
    print(f"  unrated (backlog)        {len(backlog)}")

    fail = False
    for a, hit in flagged:
        print(f"  !! {hit[0].upper()} ON SALE: {a}  {hit[1]} / {hit[2]}")
        fail = True
    for a in missing:
        print(f"  !! NO VERDICT AT ALL: {a}")
        fail = True

    # The homepage carries its own copy of the shop, `storeProducts` in
    # index.html, and nothing here read it. In September 2026 it still sold the
    # Clearly Filtered pitcher, Viori's scented bar and Blueland's scented kit
    # at careful, and 18 products with no Brand Check row at all. Same rule as
    # the store: careful or skip fails; a missing row or an unrated one is a
    # backlog that may fall and never rise.
    home_src = (ROOT / "index.html").read_text()
    k = home_src.find("const storeProducts = [")
    home = sorted(set(re.findall(r'asin:\s*"([A-Z0-9]{10})"',
                                 home_src[k:home_src.find("];", k)]))) if k >= 0 else []
    home_flagged, home_unfinished = [], []
    for a in home:
        hit = by.get(a)
        if hit and hit[0] in NEVER:
            home_flagged.append((a, hit))
        elif not hit or hit[0] != "good":
            home_unfinished.append(a)
    print(f"homepage lists {len(home)} products")
    print(f"  careful or skip          {len(home_flagged)}")
    print(f"  unrated or no row        {len(home_unfinished)}")
    for a, hit in home_flagged:
        print(f"  !! {hit[0].upper()} ON THE HOMEPAGE: {a}  {hit[1]} / {hit[2]}")
        fail = True

    base = json.loads(BASELINE.read_text()) if BASELINE.exists() else {}
    ceiling = base.get("unrated", 10**9)
    home_ceiling = base.get("home", 10**9)
    if args.accept:
        BASELINE.write_text(json.dumps({"unrated": len(backlog), "home": len(home_unfinished),
                                        "note": "Ceilings for store and homepage products whose checks are "
                                                "unfinished. They may fall and never rise."}, indent=1) + "\n")
        print(f"\naccepted {len(backlog)} (store) and {len(home_unfinished)} (homepage) as the ceilings")
        return 0
    if len(backlog) > ceiling:
        print(f"  !! the unfinished backlog grew: {len(backlog)} > {ceiling}")
        fail = True
    elif len(backlog) < ceiling:
        print(f"  backlog fell from {ceiling} to {len(backlog)}. Run --accept to lock it in.")
    if len(home_unfinished) > home_ceiling:
        print(f"  !! the homepage backlog grew: {len(home_unfinished)} > {home_ceiling}")
        fail = True
    elif len(home_unfinished) < home_ceiling and home_ceiling < 10**9:
        print(f"  homepage backlog fell from {home_ceiling} to {len(home_unfinished)}. Run --accept to lock it in.")

    print("\nnot clean." if fail else "\nclean.")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
