#!/usr/bin/env python3
"""Look for an independent test, so the testing front can say "looked".

Rule 5.6: an absent test is a gap, not a finding. `none` on the testing front
means somebody looked and nothing exists, which satisfies the completeness
gate; `unassessed` means nobody looked, which blocks a recommendation. 669
rows sat on unassessed across 438 brands because looking was never recorded.

This looks, and records it. For every brand with a row lacking a recorded
testing check it searches the two independent testers our verdicts already
cite, Lead Safe Mama (tamararubin.com) and Mamavation, through WordPress's
own REST search, and caches every hit with its title and URL in
data/testing-checks.json.

Only one thing sets a front: zero hits at both sources. That row's testing
front becomes `none`, dated, naming both sources. A hit never sets a front,
because a full text search cannot tell Badger's mercury result from a coffee
guide that mentions Badger in passing; hits are printed as leads, strongest
first (the brand in the title), for a person to read and record properly.

    python3 tools/check-testing-sources.py --limit 15     # dry run
    python3 tools/check-testing-sources.py --write
    python3 tools/check-testing-sources.py --apply --write  # cache only, no network
"""
import argparse, datetime, html, json, pathlib, re, sys, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
CACHE = ROOT / "data" / "testing-checks.json"
SOURCES = {
    "leadsafemama": "https://tamararubin.com",
    "mamavation":   "https://www.mamavation.com",
}
UA = {"User-Agent": "Mozilla/5.0 (Macintosh) plasticdetox research (anya@washos.com)"}
BLANK = (None, "", "unassessed", "unknown")
RECORDED = {"database", "hand", "stated", "class", "rollup"}


def search(base, brand):
    url = (f"{base}/wp-json/wp/v2/search?search={urllib.parse.quote(brand)}"
           "&per_page=20&subtype=post")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                d = json.loads(r.read().decode("utf-8", "replace"))
            if isinstance(d, list):
                return [{"title": html.unescape(str(x.get("title") or "")),
                         "url": str(x.get("url") or "")} for x in d]
            return None
        except Exception:
            time.sleep(3 * (attempt + 1))
    return None


def names_brand(title, brand):
    return bool(re.search(r"(?<![A-Za-z])" + re.escape(brand) + r"(?![A-Za-z])", title, re.I))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--apply", action="store_true", help="no network; re-apply the cache")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    today = datetime.date.today().isoformat()

    def needs_check(b):
        for p in b.get("products") or []:
            e = p.get("ext") or {}
            if ((e.get("fronts") or {}).get("testing") in BLANK
                    or (e.get("frontOrigin") or {}).get("testing") not in RECORDED):
                return True
        return False

    todo = [] if args.apply else [b for b in brands if needs_check(b) and b["brand"] not in cache]
    if args.limit:
        todo = todo[:args.limit]
    print(f"brands with an unchecked testing front and no cached search: {len(todo)}")

    for i, b in enumerate(todo, 1):
        entry = {"checked": today, "sources": {}, "strong": []}
        complete = True
        for name, base in SOURCES.items():
            hits = search(base, b["brand"])
            if hits is None:
                complete = False          # the source did not answer; do not claim we looked
                continue
            entry["sources"][name] = hits
            entry["strong"] += [h["title"] for h in hits if names_brand(h["title"], b["brand"])]
            time.sleep(1.0)
        if not complete:
            print(f"  {b['brand']}: a source did not answer, not cached")
            continue
        cache[b["brand"]] = entry
        total = sum(len(v) for v in entry["sources"].values())
        if total == 0:
            print(f"  {b['brand']:<26} nothing at either source")
        else:
            print(f"  {b['brand']:<26} {total:>2} hits, {len(entry['strong'])} naming the brand"
                  + (f"  e.g. {entry['strong'][0][:50]}" if entry["strong"] else ""))
        if i % 10 == 0:
            # Write as we go. A twenty minute run that saved only at the end
            # would lose every search to one dropped connection.
            CACHE.parent.mkdir(exist_ok=True)
            CACHE.write_text(json.dumps(cache, indent=1, ensure_ascii=False) + "\n")
            print(f"  … {i}/{len(todo)}")

    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, indent=1, ensure_ascii=False) + "\n")

    clean = [k for k, v in cache.items() if sum(len(x) for x in v["sources"].values()) == 0]
    leads = [k for k in cache if k not in clean]
    print(f"\ncached: {len(cache)} brands   nothing found: {len(clean)}   leads for a person: {len(leads)}")
    if not args.write:
        print("\ndry run. re-run with --write to set the testing front where nothing was found.")
        return 0

    set_none = 0
    for b in brands:
        c = cache.get(b["brand"])
        if not c or b["brand"] not in clean:
            continue
        for p in b.get("products") or []:
            e = p.get("ext")
            if not e:
                continue
            fr = e.setdefault("fronts", {})
            if fr.get("testing") not in BLANK:
                continue                         # a person or a lab got here first
            fr["testing"] = "none"
            e.setdefault("frontOrigin", {})["testing"] = "database"
            e.setdefault("frontNotes", {})["testing"] = (
                f"Checked Lead Safe Mama and Mamavation on {c['checked']}. No independent "
                f"test of {b['brand']} on record at either. Not a pass: nothing has been "
                f"measured. It means the gap is known rather than unexamined.")
            set_none += 1
    DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
    print(f"testing front set to none on {set_none} rows")
    strong = [(k, cache[k]["strong"][0]) for k in leads if cache[k]["strong"]]
    if strong:
        print(f"\n{len(strong)} brands where a tester names the brand outright; read these first:")
        for k, t in sorted(strong)[:40]:
            print(f"  {k:<24} {t[:70]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
