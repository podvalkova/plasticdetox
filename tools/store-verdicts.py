#!/usr/bin/env python3
"""Does the store only sell what Brand Check can stand behind?

Nothing has ever asked. validate-data checks brand-data against itself, and
check.sh asks whether the rules still agree with the evidence. Neither has ever
opened store.html, so the shelf and the verdicts drift apart silently and the
first person to notice is a customer tapping a product and getting "no verdict".
That is how Klean Athlete Magnesium ended up on sale reading unrated: its
materials front was never filled in, the rules correctly refused to call it
good, and nothing connected those two facts.

Every listing is checked, not only the ones with an ASIN. This file used to
collect ASINs and nothing else, so the 70 listings sold through a maker's own
site or an Amazon search link were never looked at: SeaTurtle's toothbrush and
Blessed Nest's pillow sat on sale at careful that way. Product Check is the
source of truth and the shelf follows it, so a listing without an ASIN is
matched to its Product Check row by the store `url`, which the row carries in
`urls`.

Outcomes, and they are not the same problem:

  never sell    careful or skip, or an ASIN with no brand-data row at all. A
                careful product is one we have actively flagged; selling it
                contradicts the verdict on our own site. This fails.
  trade off     careful, but the listing names the trade off in a `careful`
                label on the card AND the Product Check row carries a written
                `tradeoff`. The narrow case where no product rates good for a
                stated need, such as a vegan floss. Allowed, and counted.
  backlog       unrated (the checks are not finished), or a listing without an
                ASIN not yet linked to a Product Check row. Ratcheted rather
                than failed: each count may fall, never rise.
  fine          good.

    python3 tools/store-verdicts.py            # report, non zero on a problem
    python3 tools/store-verdicts.py --accept   # write today's backlogs as the ceilings
"""
import argparse, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASELINE = ROOT / "data" / "store-backlog.json"
NEVER = ("careful", "skip")
OBJ = re.compile(r'\{\s*cat:\s*"[^"]*"[^{}]*\}')
FIELD = re.compile(r'(\w+):\s*"((?:[^"\\]|\\.)*)"')


def listings(src):
    """Every product object in the page's `storeProducts` array, one per key."""
    k = src.find("const storeProducts = [")
    if k < 0:
        return []
    # Drop whole line comments first, the way the browser does. A lost line
    # break once joined "// Coffee > Travel Mugs" to the JOCO glass cup's entry,
    # hiding it from the page while this check still counted it on sale. Only
    # a comment that starts the line counts, since every url holds "//".
    body = re.sub(r"(?m)^[ \t]*//[^\n]*", "", src[k:src.find("];", k)])
    out, seen = [], set()
    for m in OBJ.finditer(body):
        rec = dict(FIELD.findall(m.group(0)))
        key = rec.get("asin") or rec.get("url") or rec.get("name")
        if key and key not in seen:
            seen.add(key)
            out.append(rec)
    return out


def judge(recs, by_asin, by_url):
    good, flagged, missing, backlog, unlinked, traded = [], [], [], [], [], []
    for rec in recs:
        a = rec.get("asin")
        hit = by_asin.get(a) if a else by_url.get(rec.get("url"))
        label = a or rec.get("name")
        if not hit:
            (missing if a else unlinked).append(label)
        elif hit["verdict"] == "careful" and rec.get("careful", "").strip() and hit["tradeoff"]:
            traded.append((label, hit))
        elif hit["verdict"] in NEVER:
            flagged.append((label, hit))
        elif hit["verdict"] != "good":
            backlog.append((label, hit))
        else:
            good.append(label)
    return good, flagged, missing, backlog, unlinked, traded


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--accept", action="store_true")
    args = ap.parse_args()

    by_asin, by_url = {}, {}
    for b in json.loads((ROOT / "brand-data.json").read_text()):
        for p in (b.get("products") or []):
            hit = {"verdict": (p.get("ext") or {}).get("verdict"), "brand": b["brand"],
                   "name": p.get("name"), "tradeoff": bool((p.get("tradeoff") or "").strip())}
            for a in (p.get("asins") or []):
                by_asin[a] = hit
            for u in (p.get("urls") or []):
                by_url[u] = hit

    fail = False
    store = listings((ROOT / "store.html").read_text())
    good, flagged, missing, backlog, unlinked, traded = judge(store, by_asin, by_url)
    print(f"store lists {len(store)} products")
    print(f"  good                          {len(good)}")
    print(f"  careful, labelled trade off   {len(traded)}")
    print(f"  careful or skip               {len(flagged)}")
    print(f"  ASIN with no brand-data row   {len(missing)}")
    print(f"  unrated (backlog)             {len(backlog)}")
    print(f"  not linked to Product Check   {len(unlinked)}")
    for label, hit in traded:
        print(f"     trade off: {label}  {hit['brand']} / {hit['name']}")
    for label, hit in flagged:
        print(f"  !! {hit['verdict'].upper()} ON SALE: {label}  {hit['brand']} / {hit['name']}")
        fail = True
    for a in missing:
        print(f"  !! NO VERDICT AT ALL: {a}")
        fail = True

    # The homepage carries its own copy of the shop, `storeProducts` in
    # index.html, and nothing here read it. In September 2026 it still sold the
    # Clearly Filtered pitcher, Viori's scented bar and Blueland's scented kit
    # at careful, and 18 products with no Brand Check row at all. Same rule as
    # the store: careful or skip fails; a missing row, an unlinked listing or an
    # unrated one is a backlog that may fall and never rise.
    home = listings((ROOT / "index.html").read_text())
    h_good, h_flagged, h_missing, h_backlog, h_unlinked, h_traded = judge(home, by_asin, by_url)
    home_unfinished = h_backlog + [(a, None) for a in h_missing]
    print(f"homepage lists {len(home)} products")
    print(f"  careful, labelled trade off   {len(h_traded)}")
    print(f"  careful or skip               {len(h_flagged)}")
    print(f"  unrated or no row             {len(home_unfinished)}")
    print(f"  not linked to Product Check   {len(h_unlinked)}")
    for label, hit in h_flagged:
        print(f"  !! {hit['verdict'].upper()} ON THE HOMEPAGE: {label}  {hit['brand']} / {hit['name']}")
        fail = True

    base = json.loads(BASELINE.read_text()) if BASELINE.exists() else {}
    counts = {"unrated": len(backlog), "unlinked": len(unlinked),
              "home": len(home_unfinished), "home_unlinked": len(h_unlinked)}
    if args.accept:
        BASELINE.write_text(json.dumps(dict(counts, note=(
            "Ceilings for store and homepage listings whose checks are unfinished (unrated, home) "
            "or that are not yet linked to a Product Check row (unlinked, home_unlinked). "
            "They may fall and never rise.")), indent=1) + "\n")
        print(f"\naccepted as the ceilings: {counts}")
        return 0
    for key, n in counts.items():
        ceiling = base.get(key, 10**9)
        if n > ceiling:
            print(f"  !! the {key} backlog grew: {n} > {ceiling}")
            fail = True
        elif n < ceiling < 10**9:
            print(f"  {key} backlog fell from {ceiling} to {n}. Run --accept to lock it in.")

    print("\nnot clean." if fail else "\nclean.")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
