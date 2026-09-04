#!/usr/bin/env python3
"""
Look for the shapes of mistake we keep finding one screenshot at a time.

Every check here exists because something reached a person's phone wrong: a
serum filed as a baby bottle, tampons rated low exposure, a formula check on
cast iron, a vacuum in the air purifier aisle, an ASIN pointing at a competitor.
Each was found by looking. This looks on purpose.

    python3 tools/audit-database.py
    python3 tools/audit-database.py --detail category
"""
import argparse
import collections
import json
import pathlib
import re
import sys

import importlib.util as _ilu

ROOT = pathlib.Path(__file__).resolve().parent.parent
_spec = _ilu.spec_from_file_location("_bf", ROOT / "tools" / "backfill-fronts.py")
_bf = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_bf)
DATA = ROOT / "brand-data.json"
EXPOSURE = ROOT / "data" / "exposure.json"
BLANK = (None, "", "unknown", "unassessed")
FRONTS = ("formula", "materials", "legal", "testing")

# An object: no recipe, so formula is `none` and materials carries it.
DURABLE_TYPES = {
    "air appliance", "equipment", "floss", "food surface", "food vessel",
    "heated cookware", "heated vessel", "mouthed object", "oral appliance",
    "reusable bottle", "room textile", "slept on", "wet room textile",
    "worn gear", "worn textile",
}

# A device is judged by what it is made of, whatever the exposure model calls
# it: a shower filter is typed "drinking water" because that is what it acts on.
# Without this the audit reported 52 correctly answered water filters as wrong.
DEVICE_CATS = {
    "Water filters", "Air purifiers", "Vacuums", "Air fryers",
    "Kitchen appliances", "Humidifiers", "Toothbrushes",
}

# Manufactured articles with no ingredient list. A diaper is not a formulation:
# what it is made of is the materials check. Some add a lotion or fragrance,
# which is a real formula finding, so only an unearned pass is wrong here.
NO_INGREDIENT_CATS = {"Diapers"}

# A word in a product name that all but settles what kind of thing it is.
NAME_SIGNALS = [
    (r"\bserum\b|\bface oil\b|moisturi[sz]er|\beye cream\b", {"Skincare"}),
    (r"\btampons?\b", {"Tampons"}),
    (r"\bdiapers?\b(?!.*(cream|balm|rash))", {"Diapers", "Cloth diapers", "Swim diapers"}),
    (r"diaper (cream|balm|ointment|paste)", {"Diaper cream"}),
    (r"\bvacuum\b(?![- ](insulat|seal|flask))", {"Vacuums"}),
    (r"\bsunscreen\b|\bspf\b", {"Sunscreen"}),
    (r"\btoothpaste\b", {"Toothpaste"}),
    (r"\bshampoo\b", {"Shampoo", "Conditioner"}),
    (r"\bmattress\b", {"Crib mattresses", "Bedding"}),
    (r"\bskillet\b|\bdutch oven\b|\bfrying pan\b", {"Cookware"}),
    (r"\bwipes?\b", {"Baby wipes", "Cleaning products"}),
]


def load():
    brands = json.loads(DATA.read_text())
    rows = [(b, p) for b in brands for p in (b.get("products") or [])]
    return brands, rows


def is_brand_line(b, p):
    if p.get("asins"):
        return False
    n = str(p.get("name") or "").strip().lower()
    if not n or n == "whole range":
        return True
    if ((p.get("ext") or {}).get("scope")) == "brand":
        return True
    return n == f"{b['brand']} {b.get('category') or ''}".strip().lower()


def check(brands, rows):
    out = collections.OrderedDict()

    def add(key, title, items, why):
        out[key] = {"title": title, "items": items, "why": why}

    # 1. A name that says one thing and a category that says another.
    bad = []
    for b, p in rows:
        name = (p.get("name") or "").lower()
        cat = p.get("cat") or ""
        for pat, ok in NAME_SIGNALS:
            if re.search(pat, name) and cat and cat not in ok:
                bad.append(f"{b['brand']} / {p.get('name')} -> {cat}")
                break
    add("category", "Category contradicts the product's own name", bad,
        "The name is the strongest signal we have. Where it disagrees with the "
        "filed category, the category came from a note or a fallback.")

    # 2. Formula asserted on the wrong kind of thing.
    wrong = []
    for b, p in rows:
        e = p.get("ext") or {}
        t = ((e.get("exposure") or {}).get("type") or "")
        f = (e.get("fronts") or {}).get("formula")
        cat = p.get("cat") or ""
        # A diaper has no ingredient list, so a clean formula read is an
        # assertion nobody could have made. An adverse one is different: Luvs
        # and Pampers Swaddlers really do add lotion and fragrance, and that
        # finding is about something applied to skin, not about a recipe.
        if cat in NO_INGREDIENT_CATS:
            if f == "pass":
                wrong.append(f"{b['brand']} / {p.get('name')} [{cat}] formula=pass")
            continue
        if (t in DURABLE_TYPES or cat in DEVICE_CATS) \
                and f in ("pass", "caution", "fail"):
            wrong.append(f"{b['brand']} / {p.get('name')} [{t}] formula={f}")
        if (t and t not in DURABLE_TYPES and f == "none"
                and cat not in DEVICE_CATS):
            wrong.append(f"{b['brand']} / {p.get('name')} [{t}] formula=none")
    add("formula-kind", "Formula answered as if the product were another kind of thing", wrong,
        "An object has no ingredient list and a consumable has one. Either "
        "answer on the wrong side is an assertion nobody established.")

    # 3. A verdict its own fronts do not support.
    contradict = []
    for b, p in rows:
        e = p.get("ext") or {}
        f = e.get("fronts") or {}
        v = e.get("verdict")
        adverse = [k for k in FRONTS if f.get(k) in ("caution", "fail")]
        if v == "good" and adverse and not e.get("legalSuperseded"):
            contradict.append(f"{b['brand']} / {p.get('name')} good with {adverse}")
        if v == "skip" and not adverse:
            contradict.append(f"{b['brand']} / {p.get('name')} skip with nothing adverse")
    add("verdict", "Verdict disagrees with its own scorecard", contradict,
        "A verdict is the union of the fronts. Where they disagree, one of the "
        "two was written by something that did not read the other.")

    # 4. Everything answered, nothing adverse, still no verdict.
    stranded = []
    for b, p in rows:
        e = p.get("ext") or {}
        f = e.get("fronts") or {}
        if e.get("verdict") != "unrated" or is_brand_line(b, p):
            continue
        if any(f.get(k) in ("caution", "fail") for k in FRONTS):
            continue
        if not [k for k in FRONTS if f.get(k) in BLANK]:
            stranded.append(f"{b['brand']} / {p.get('name')}")
    add("stranded", "All four checks answered, nothing adverse, still unrated", stranded,
        "This is research already done that nobody can see.")

    # 5. One ASIN, two products.
    by_asin = collections.defaultdict(list)
    for b, p in rows:
        for a in (p.get("asins") or []):
            by_asin[a].append((b["brand"], p.get("name"), (p.get("ext") or {}).get("verdict")))
    clash = [f"{a}: " + " | ".join(f"{x[0]} {x[1]} ({x[2]})" for x in v)
             for a, v in by_asin.items()
             if len({x[2] for x in v}) > 1]
    add("asin", "One ASIN carrying two different verdicts", clash,
        "The same listing cannot be good and skip. Whichever row a shopper "
        "lands on decides, which is chance rather than judgement.")

    # 6. A brand stand-in row that can be recommended.
    synth = [f"{b['brand']} / {p.get('name')} ({(p.get('ext') or {}).get('verdict')})"
             for b, p in rows
             if is_brand_line(b, p)
             and (p.get("ext") or {}).get("verdict") == "good"
             and (p.get("ext") or {}).get("scope") == "brand"]
    add("brand-line", "Brand stand-in rows carrying a recommendation", synth,
        "'Whole range' is not a product anybody can buy, and a recommendation "
        "on one rests on inherited evidence by definition.")

    # 7. Exposure missing entirely.
    noexp = [f"{b['brand']} / {p.get('name')}" for b, p in rows
             if not ((p.get("ext") or {}).get("exposure") or {}).get("level")]
    add("exposure", "No exposure level", noexp,
        "Exposure is what turns a finding into an answer. A row without one "
        "cannot say why its cautions matter.")

    # 8. Recommended with nothing recorded behind it.
    thin = []
    for b, p in rows:
        e = p.get("ext") or {}
        if e.get("verdict") != "good":
            continue
        og = e.get("frontOrigin") or {}
        if not any(v in ("database", "hand", "stated") for v in og.values()):
            thin.append(f"{b['brand']} / {p.get('name')}")
    add("provenance", "Recommended, with no front from a recorded source", thin,
        "Rule 1.1: a recommendation needs direct evidence. A scorecard entirely "
        "inferred from prose is the Osea failure.")

    # 9. A front reading clean over an action our own note describes.
    ACTION = re.compile(
        r"\brecall\w*|\blawsuit\b|\bclass action\b|\bprop(?:osition)? 65\b|"
        r"\bconsent decree\b|\bsettle(?:d|ment)\b")
    # A measurement is not a finding against a product. "Lowest lead of any
    # mineral sunscreen we reviewed (77 ppb)" is why California Baby is a pick,
    # and "non detect for lead" is the cleanest result there is. Only language
    # that says the result was bad counts.
    FOUND = re.compile(
        r"\b(lead|mercury|arsenic|cadmium|pfas|benzene|phthalates?)\b[^.]{0,70}"
        r"\b(exceed\w*|above|failed|unsafe|concerning|high(?:est)?)\b|"
        r"\btested positive\b|\bpositive for\b")
    CLEAN = re.compile(
        r"non[\s-]?detect\w*|not detected|lowest|cleared|clear(?:s|ed)? the|"
        r"below (?:the )?(?:detection|limit)|free of")
    contra = []
    for b, p in rows:
        e = p.get("ext") or {}
        f = e.get("fronts") or {}
        note = str(p.get("note") or "").lower()
        if not note:
            continue
        legal_note = str(e.get("legalNote") or "").lower()
        # "No lawsuits or recalls found" is the opposite of a finding, so the
        # same negation reader the tools use has to run here too.
        acted = any(not _bf.is_negated(note, m.start(), m.end())
                    for m in ACTION.finditer(note))
        if acted and "no recall on record" in legal_note:
            contra.append(f"legal: {b['brand']} / {p.get('name')}")
        if FOUND.search(note) and not CLEAN.search(note) and f.get("testing") == "pass":
            contra.append(f"testing: {b['brand']} / {p.get('name')}")
    add("contradiction", "A front reads clean over a finding in the row's own note", contra,
        "The worst kind, because it shows a green tick on a product we ourselves "
        "documented a problem with. Beech-Nut carried 'recalled infant rice cereal "
        "in 2021 for arsenic' beside 'No recall on record'.")

    # 10. Front coverage, as a number rather than a list.
    cov = {k: collections.Counter((p.get("ext") or {}).get("fronts", {}).get(k) for b, p in rows)
           for k in FRONTS}
    add("coverage", "Front coverage", 
        [f"{k}: " + "  ".join(f"{s or 'blank'} {n}" for s, n in c.most_common())
         for k, c in cov.items()],
        "How much of the file is actually researched.")

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--detail", help="print every item for one check")
    args = ap.parse_args()

    brands, rows = load()
    out = check(brands, rows)

    print(f"{len(brands)} brands, {len(rows)} product rows\n")
    for key, r in out.items():
        n = len(r["items"])
        flag = "   " if key == "coverage" or not n else " ! "
        print(f"{flag}{n:>4}  {r['title']}   [{key}]")
    print()
    for key, r in out.items():
        if args.detail and key != args.detail:
            continue
        if not args.detail and key == "coverage":
            print(r["title"])
            for line in r["items"]:
                print(f"    {line}")
            print()
            continue
        if not args.detail or not r["items"]:
            continue
        print(f"{r['title']}  ({len(r['items'])})")
        print(f"  {r['why']}\n")
        for line in r["items"]:
            print(f"    {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
