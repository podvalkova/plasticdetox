#!/usr/bin/env python3
"""
Check that every ASIN in the map really belongs to the brand it is filed under.

harvest-asins.py resolves an ASIN two ways. A `store` row carries the product
name the store gave it, so the brand can be checked against it. A `link` row is
just an Amazon URL found in an article, and the brand is inferred from whatever
brand the surrounding copy mentions. That inference is wrong whenever an article
names a product in order to criticise it, which is exactly what our comparison
articles do:

    cleanest-prenatal-vitamins.html links Nature Made, Ritual and One A Day so a
    reader can see what it is arguing against. All three were filed under the
    brands the article recommends, so the extension answered "FullWell, good
    choice" on a Nature Made listing.

This compares the mapped brand against the real Amazon title. The brand must
appear in the title, or the row is unsafe and gets dropped: a wrong brand on a
product page is worse than no answer, because a wrong brand carries a verdict.

Needs a titles file of `ASIN|Title` lines, from the Creators API.

A caution learned the hard way: the Creators API reports "not in catalog" for
ASINs that are perfectly alive in a browser, including variation children (the
ones whose URL carries `th=1`). Nine store links were called dead on its word and
eight were repointed, two of them to a different brand's product. Treat a "dead"
result from that API as a prompt to check in a browser, never as grounds to
change a link.

    python3 tools/audit-asin-map.py --titles /tmp/pd/titles.txt
    python3 tools/audit-asin-map.py --titles /tmp/pd/titles.txt --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MAP = ROOT / "extension" / "data" / "asin-map.json"
DATA = ROOT / "brand-data.json"


def collapse(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--titles", required=True)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    titles = {}
    for line in pathlib.Path(args.titles).read_text().splitlines():
        if "|" in line:
            a, t = line.split("|", 1)
            titles[a.strip()] = t.strip()

    amap = json.loads(MAP.read_text())
    brands = {b["id"]: b for b in json.loads(DATA.read_text())}

    ok = wrong = unchecked = 0
    bad = []
    for asin, row in list(amap.items()):
        title = titles.get(asin)
        if not title:
            unchecked += 1
            continue
        b = brands.get(row.get("brandId"))
        labels = [row.get("brand") or ""]
        if b:
            labels += [b["brand"]] + list(b.get("aliases") or [])
        # Collapse both sides so "Dr. Brown's" matches "Dr. Browns" and
        # "Beech-Nut" matches "Beech Nut".
        hay = collapse(title)
        hay_words = set(re.split(r"[^a-z0-9]+", title.lower())) - {""}

        def matches(label):
            c = collapse(label)
            if c and c in hay:
                return True
            # Our label and Amazon's differ in the qualifier more often than in
            # the name: "Epic Pure" against "Epic Water Filters Pure", "Eden
            # Foods" against "Eden Organic". Every distinctive word of ours
            # appearing in the title is the same brand, not a mismatch.
            ours = [w for w in re.split(r"[^a-z0-9]+", label.lower())
                    if len(w) > 2 and w not in
                    {"the", "and", "for", "inc", "llc", "co", "company",
                     "foods", "organics", "organic", "odor", "brands", "products"}]
            return bool(ours) and all(w in hay_words for w in ours)

        if any(matches(l) for l in labels):
            ok += 1
        else:
            wrong += 1
            bad.append((asin, row.get("brand"), title, row.get("source"),
                        (row.get("pages") or ["?"])[0]))

    print(f"asin-map: {len(amap)} rows, {len(titles)} checked against real titles")
    print(f"  brand appears in the title: {ok}")
    print(f"  BRAND DOES NOT MATCH:       {wrong}")
    print(f"  no title available:         {unchecked}\n")

    by_src = collections.Counter(r[3] for r in bad)
    by_page = collections.Counter(r[4] for r in bad)
    print("mismatches by source:", dict(by_src))
    print("worst pages:", dict(by_page.most_common(6)), "\n")
    for asin, brand, title, src, page in sorted(bad, key=lambda r: r[4]):
        print(f"  {asin}  filed as {str(brand)[:20]:<20} really {title[:44]:<44} ({page})")

    if args.write:
        for asin, *_ in bad:
            amap.pop(asin, None)
        MAP.write_text(json.dumps(amap, indent=2, ensure_ascii=False) + "\n")
        print(f"\ndropped {len(bad)} unsafe rows, wrote {MAP.name} ({len(amap)} left)")
    else:
        print("\ndry run. re-run with --write to drop the unsafe rows.")


if __name__ == "__main__":
    sys.exit(main())
