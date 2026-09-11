#!/usr/bin/env python3
"""
Every product the app puts in front of someone carries a photo and its pros and
cons, and every swap carries its guide.

The app draws a pick's photo and its pros and cons from the product catalog,
data/store-products.js, keyed by ASIN. A pick the catalog did not hold showed a
bare row, 28 of 61 Kids room picks on 2026-09-11, and nothing reported it. The
catalog had also drifted from the store page: it still held eleven careful or
skip products the store had dropped, and lacked the store's newest twelve.

Rules, each a failure:
  1  every product on the store page (store.html) is in the catalog
  2  no careful or skip product is in the catalog
  3  every app swap pick has a photo, and pros and cons
  4  every app swap links its guide
  5  every app swap pick has a brand-data row and is not careful or skip;
     picks still unrated may not grow past data/app-picks-backlog.json
     (--accept locks in a lower count)
  6  a careful or skip verdict names the check it rests on. 126 rows carried
     one with all four checks blank, so a card showed CAREFUL over a single
     green tick and three gaps. Capped by data/verdict-anchor-backlog.json

It reads the generated app data (app/www/data/plan.json and
worker/kids-data.js), so run app/scripts/sync-data.mjs after editing a swap.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def entries(text):
    out = {}
    for line in text.split("\n"):
        if "{ cat: " not in line:
            continue
        key = (re.search(r'asin: "([A-Z0-9]{10})"', line) or re.search(r'name: "([^"]*)"', line)).group(1)
        arr = lambda k: re.findall(r'"([^"]*)"', (re.search(k + r": \[([^\]]*)\]", line) or [None, ""])[1])
        out[key] = {"img": (re.search(r'img: "([^"]*)"', line) or [None, ""])[1],
                    "pros": arr("pros"), "cons": arr("cons")}
    return out


def main():
    catalog = entries((ROOT / "data" / "store-products.js").read_text())
    shelf = set(re.findall(r'asin: "([A-Z0-9]{10})"', (ROOT / "store.html").read_text()))
    extra = json.loads((ROOT / "data" / "extra-product-images.json").read_text())
    verdict = {a: (p.get("ext") or {}).get("verdict")
               for b in json.loads((ROOT / "brand-data.json").read_text())
               for p in b.get("products") or [] for a in p.get("asins") or []}
    kids = (ROOT / "worker" / "kids-data.js").read_text()
    kids = json.loads(kids[kids.index("export const KIDS = ") + 20: kids.rindex(";")])
    rooms = json.loads((ROOT / "app" / "www" / "data" / "plan.json").read_text()) + [kids]

    bad = []
    for a in sorted(shelf - set(catalog)):
        bad.append(f"!! on the store page but not in the catalog: {a}")
    for a in sorted(k for k in catalog if verdict.get(k) in ("careful", "skip")):
        bad.append(f"!! {verdict[a]} product still in the catalog: {a}")
    picks = 0
    unrated = []
    for room in rooms:
        for st in room.get("steps") or []:
            where = f"{room.get('title')} / {st.get('swap')}"
            if not st.get("article"):
                bad.append(f"!! no guide: {where}")
            for p in st.get("picks") or []:
                url = p.get("url") or ""
                if "/articles/" in url:
                    continue
                picks += 1
                asin = (re.search(r"/dp/([A-Z0-9]{10})", url) or [None, None])[1]
                row = catalog.get(asin) or catalog.get(p.get("name")) or {}
                if not (p.get("img") or row.get("img") or extra.get(asin)):
                    bad.append(f"!! no photo: {where} / {p.get('name')}")
                pros = p.get("pros") or row.get("pros")
                cons = p.get("cons") or row.get("cons")
                if not (pros and cons):
                    bad.append(f"!! no pros and cons: {where} / {p.get('name')}")
                if asin:
                    v = verdict.get(asin)
                    if v in ("careful", "skip"):
                        bad.append(f"!! {v} pick: {where} / {p.get('name')} ({asin})")
                    elif v is None:
                        bad.append(f"!! pick with no brand-data row: {where} / {p.get('name')} ({asin})")
                    elif v != "good":
                        unrated.append(f"{where} / {p.get('name')}")
    # Rule 6: a verdict has to name the check behind it.
    FRONTS = ("formula", "materials", "legal", "testing")
    unanchored = []
    for b in json.loads((ROOT / "brand-data.json").read_text()):
        for p in b.get("products") or []:
            e = p.get("ext") or {}
            fr = e.get("fronts") or {}
            if e.get("verdict") in ("careful", "skip") and not [
                    k for k in FRONTS if fr.get(k) in ("caution", "fail")]:
                unanchored.append(f"{b['brand']} / {p.get('name')}")
    anchor_file = ROOT / "data" / "verdict-anchor-backlog.json"
    anchor_ceiling = (json.loads(anchor_file.read_text()).get("unanchored")
                      if anchor_file.exists() else None)
    if "--accept" in sys.argv:
        anchor_file.write_text(json.dumps({"unanchored": len(unanchored)}) + "\n")
        anchor_ceiling = len(unanchored)
    if anchor_ceiling is not None and len(unanchored) > anchor_ceiling:
        bad.append(f"!! verdicts with no check behind them grew: "
                   f"{len(unanchored)} > {anchor_ceiling}")

    no_row = [a for a in catalog if re.fullmatch(r"[A-Z0-9]{10}", a) and a not in verdict]
    ceiling_file = ROOT / "data" / "app-picks-backlog.json"
    ceiling = json.loads(ceiling_file.read_text()).get("unrated", 0) if ceiling_file.exists() else None
    if "--accept" in sys.argv:
        ceiling_file.write_text(json.dumps({"unrated": len(unrated)}) + "\n")
        ceiling = len(unrated)
    if ceiling is not None and len(unrated) > ceiling:
        bad.append(f"!! unrated swap picks grew: {len(unrated)} > {ceiling}")
    if bad:
        print("\n".join(bad))
        return 1
    print(f"{picks} swap picks, each with a photo, pros and cons; every swap has its guide")
    print(f"catalog holds every store product and nothing careful or skip ({len(catalog)} entries)")
    print(f"unrated swap picks: {len(unrated)} (ceiling {ceiling})")
    print(f"verdicts with no check behind them: {len(unanchored)} (ceiling {anchor_ceiling})")
    if no_row:
        print(f"note: {len(no_row)} catalog products have no brand-data row: {', '.join(no_row)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
