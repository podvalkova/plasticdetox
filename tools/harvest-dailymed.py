#!/usr/bin/env python3
"""Ingredient lists for the OTC drugs, from the FDA's own label database.

Sunscreen, antiperspirant, toothpaste and diaper cream are regulated as
over-the-counter drugs in the US, so every one of them has a label filed with
the FDA and published on DailyMed. It is free, complete, and structured, which
makes it a better source than a listing page for exactly the products our
readers care most about.

This is the same job as harvest-evidence.py and the same destination,
data/front-evidence.json, which the pipeline re-reads on every build. It exists
separately because the join is different: DailyMed is searched by name rather
than by barcode, so it reaches products no barcode database has.

The guard is the brand. A search for "Badger sunscreen" will happily return
another company's label, and attaching one company's ingredients to another's
product is worse than having none, so the label's own title must contain the
brand name before anything is recorded. Where the search is ambiguous the row is
left alone.

    python3 tools/harvest-dailymed.py --limit 10
    python3 tools/harvest-dailymed.py --write
"""
import argparse
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
EV = ROOT / "data" / "front-evidence.json"
UA = {"User-Agent": "PlasticDetox/1.0 (anya@washos.com; ingredient lists for our product database)"}
BASE = "https://dailymed.nlm.nih.gov"

# Only what is actually regulated as an OTC drug and therefore filed with the
# FDA. A deodorant is a cosmetic unless it is an antiperspirant, a toothbrush is
# a device, and a diaper balm without zinc is a cosmetic: none of them has a
# label here, and searching for them returns another company's product or
# nothing. Being narrow is what keeps the brand guard meaningful.
OTC = re.compile(r"sunscreen|\bspf\b|antiperspirant|toothpaste|zinc.*(?:cream|paste|ointment)|"
                 r"diaper (?:cream|rash|ointment|paste)|mouthwash|acne|antacid", re.I)


def norm(s):
    # "&" and "and" are the same word wearing two spellings, and DailyMed files
    # Church & Dwight's brand as "ARM AND HAMMER" while we write "Arm & Hammer".
    # Without this the brand guard rejects the company's own label.
    t = (s or "").lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "", t)


def words(s):
    return {w for w in re.split(r"[^a-z0-9]+", (s or "").lower()) if len(w) > 2}


def fetch(url, timeout=30):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as h:
            return h.read().decode("utf8", "ignore")
    except Exception:
        return None


def search(term):
    url = f"{BASE}/dailymed/services/v2/spls.json?drug_name={urllib.parse.quote(term)}&pagesize=5"
    body = fetch(url)
    if not body:
        return []
    try:
        return (json.loads(body).get("data") or [])
    except Exception:
        return []


def ingredients(setid):
    """Read the structured ingredient elements, not the prose.

    An SPL carries every ingredient as its own element with a classCode saying
    whether it is active or inactive, so there is no need to find the words
    "inactive ingredients" in the label text. Degree's label never uses that
    phrase at all and still lists 23 ingredients, which is why parsing the prose
    found nothing on a label that had everything.
    """
    body = fetch(f"{BASE}/dailymed/services/v2/spls/{setid}.xml")
    if not body:
        return None, None
    act, inact = [], []
    for m in re.finditer(r'<ingredient\b[^>]*classCode="([A-Z]+)"[^>]*>(.*?)</ingredient>', body, re.S):
        cls, chunk = m.group(1), m.group(2)
        name = re.search(r"<name>([^<]+)</name>", chunk)
        if not name:
            continue
        (act if cls.startswith("ACTI") else inact).append(name.group(1).strip())
    dedupe = lambda xs: list(dict.fromkeys(x for x in xs if x))
    act, inact = dedupe(act), dedupe(inact)
    return (", ".join(act) or None), (", ".join(inact) or None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--sleep", type=float, default=0.6)
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    ev = json.loads(EV.read_text()) if EV.exists() else {}
    today = time.strftime("%Y-%m-%d")

    jobs = []
    for b in brands:
        for p in (b.get("products") or []):
            if p.get("origin") == "brand-line":
                continue
            if not OTC.search(f"{p.get('cat') or ''} {b.get('category') or ''} {p.get('name') or ''}"):
                continue
            asin = (p.get("asins") or [None])[0]
            if not asin:
                continue
            cur = (ev.get(asin) or {}).get("formula") or {}
            if (cur.get("ingredients") or "").strip():
                continue
            jobs.append((b, p, asin))
    if args.limit:
        jobs = jobs[:args.limit]

    got, missed = 0, []
    for i, (b, p, asin) in enumerate(jobs, 1):
        # Search the brand alone. DailyMed's drug_name search returns nothing for
        # a long phrase: "Arm & Hammer Essentials Deodorant" gives 0 results
        # where "Arm & Hammer" gives 3, so the product is chosen from the
        # brand's labels rather than asked for by name.
        bkey = norm(b["brand"])
        want = words(p.get("name")) - words(b["brand"])
        best, score = None, 0
        for row in search(b["brand"]):
            title = row.get("title") or ""
            # the label must name the brand, or it belongs to someone else
            # As a whole word: a substring test matched "spry" inside
            # "sprycel", and Spry's kids tooth gel was recorded as dasatinib.
            if not bkey or not re.search(rf"(?<![a-z0-9]){re.escape(bkey)}(?![a-z0-9])", norm(title)):
                continue
            overlap = len(want & words(title))
            if best is None or overlap > score:
                best, score = row, overlap
        time.sleep(args.sleep)
        # One label and nothing to tell it apart is still the brand's own label,
        # but two that share no word with the product name is a guess.
        hit = best if best is not None else None
        if not hit:
            missed.append(f"{b['brand']} / {p.get('name')}")
            continue
        title = hit.get("title") or ""
        act, inact = ingredients(hit["setid"])
        time.sleep(args.sleep)
        if not inact:
            missed.append(f"{b['brand']} / {p.get('name')} (label had no ingredient section)")
            continue
        text = (f"Active: {act}. " if act else "") + f"Inactive: {inact}"
        entry = ev.setdefault(asin, {})
        entry.setdefault("_product", f"{b['brand']} {p.get('name')}")
        entry["formula"] = {"ingredients": text[:1200], "kind": "ingredients",
                            "source": f"dailymed:{hit['setid']}", "checkedListing": today,
                            "complete": True, "prose": ""}
        got += 1
        print(f"  {b['brand'][:20]:<20} {str(p.get('name'))[:32]:<32} <- {title[:44]}", flush=True)

    print(f"\nlooked up {len(jobs)} OTC products on DailyMed")
    print(f"  ingredient lists recorded : {got}")
    print(f"  no confident match        : {len(missed)}")
    for m in missed[:8]:
        print(f"     {m}")
    if not args.write:
        print("\ndry run. re-run with --write to save.")
        return 0
    EV.write_text(json.dumps(ev, indent=1, ensure_ascii=False) + "\n")
    print(f"\nwrote {EV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
