#!/usr/bin/env python3
"""
Pull the actual numbers out of prose and into a field.

63 product notes carry a measured result and 136 name a lab, and none of it is
readable by anything except a person. "913 ppb" sitting in a sentence cannot be
shown on a card, compared between products, sorted, or checked against a
detection limit. Rule 4.3 says a clean result without its limit is not citable;
we cannot even tell which results have one.

So a testing result becomes a record:

    "results": [
      {"analyte": "lead", "value": 913, "unit": "ppb", "outcome": "detected",
       "lab": "Consumer Reports", "year": 2025, "lod": null}
    ]

Deliberately conservative. It proposes, it does not decide: an analyte and a
number in the same clause, a lab name where one is written, and nothing
invented. Everything else is left for a person, because a fabricated lab result
about a named product is the one mistake here with real consequences.

    python3 tools/extract-testing-results.py
    python3 tools/extract-testing-results.py --write
"""
import argparse
import collections
import importlib.util
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

_spec = importlib.util.spec_from_file_location("_bf", ROOT / "tools" / "backfill-fronts.py")
_bf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_bf)

ANALYTES = {
    "lead": "lead", "mercury": "mercury", "arsenic": "arsenic", "cadmium": "cadmium",
    "pfas": "PFAS", "organic fluorine": "organic fluorine", "fluorine": "organic fluorine",
    "benzene": "benzene", "phthalate": "phthalates", "phthalates": "phthalates",
    "bpa": "BPA", "antimony": "antimony", "glyphosate": "glyphosate",
    "microplastic": "microplastic particles", "nanoplastic": "nanoplastic particles",
}
LABS = {
    "lead safe mama": "Lead Safe Mama", "mamavation": "Mamavation",
    "consumer reports": "Consumer Reports", "clean label project": "Clean Label Project",
    "ewg": "EWG", "nsf": "NSF", "oeko-tex": "OEKO-TEX", "oeko tex": "OEKO-TEX",
    "informed sport": "Informed Sport", "usp": "USP", "iapmo": "IAPMO", "wqa": "WQA",
    "mcgill": "McGill University", "nature food": "Nature Food",
    "trinity college": "Trinity College Dublin", "pnas": "PNAS",
    "columbia university": "Columbia University",
    # Not a lab, but it publishes numbers and it sits in the same sentence as
    # Consumer Reports in Beech-Nut's note. Without it here, nothing competed
    # for the 913 ppb arsenic figure and Consumer Reports was credited with a
    # measurement the 2021 Congressional report produced.
    "congressional": "Congressional report",
    "detox project": "Detox Project", "fda": "FDA", "cpsc": "CPSC",
}
UNITS = r"ppb|ppm|µg/g|ug/g|mcg/g|ng/g|mg/kg|billion|million|thousand"
VALUE = re.compile(
    r"(?P<value>\d[\d,]*(?:\.\d+)?)\s*(?P<unit>" + UNITS + r")\b", re.I)
NONDETECT = re.compile(r"non[\s-]?detect\w*|not detected|below (?:the )?(?:detection|limit)", re.I)
LOD = re.compile(r"(?:limit of detection|detection (?:limit|line)|lod)\D{0,18}"
                 r"(\d[\d,.]*\s*(?:" + UNITS + r"))", re.I)
YEAR = re.compile(r"\b(20[12]\d)\b")


def sentence_around(text, at):
    """The sentence a position sits in, so attribution cannot cross one."""
    start = max(text.rfind(". ", 0, at) + 1, text.rfind("; ", 0, at) + 1, 0)
    end = len(text)
    for mark in (". ", "; "):
        i = text.find(mark, at)
        if i != -1:
            end = min(end, i + 1)
    return start, end


def nearest(text, at, words, window=110, decline_if_ambiguous=False):
    """
    The named thing closest to a number, within its own sentence.

    Beech-Nut's note names Consumer Reports and 2023 in one sentence and "the
    2021 Congressional heavy metals report with ingredients up to 913 ppb" in
    the next. A window that reaches across the full stop credited Consumer
    Reports with a number it did not produce, which is a fabricated citation
    against a named brand: the one mistake here that actually matters.
    """
    lo, hi = sentence_around(text, at)
    lo, hi = max(lo, at - window), min(hi, at + window)
    span = text[lo:hi].lower()
    hits = {}
    for key, label in words.items():
        for m in re.finditer(r"(?<![a-z])" + re.escape(key) + r"(?![a-z])", span):
            d = abs((lo + m.start()) - at)
            if label not in hits or d < hits[label]:
                hits[label] = d
    if not hits:
        return None
    # Two candidates in reach and no way to tell which produced the number.
    # Beech-Nut's note names Consumer Reports and the Congressional report in
    # one comma spliced sentence, and 913 ppb belongs to the second. Guessing
    # attaches a real brand to a citation it did not earn, so decline instead.
    # For the analyte, closest wins: "lead and cadmium, lead at 913 ppb" names
    # two and the nearer one is still the right answer, and refusing here threw
    # away the measurement itself. For a lab or a year, a wrong pick fabricates
    # a citation, so ambiguity declines instead.
    if decline_if_ambiguous and len(hits) > 1:
        return None
    return min(hits, key=hits.get)


def year_near(text, at):
    """Only when the sentence offers exactly one year."""
    lo, hi = sentence_around(text, at)
    years = {m.group(1) for m in YEAR.finditer(text[lo:hi])}
    return int(next(iter(years))) if len(years) == 1 else None


def lod_near(text, at):
    lo, hi = sentence_around(text, at)
    m = LOD.search(text[lo:hi])
    return m.group(1) if m else None


def results_from(note):
    text = str(note or "")
    if not text:
        return []
    out, seen = [], set()
    for m in VALUE.finditer(text):
        analyte = nearest(text, m.start(), ANALYTES)
        if not analyte:
            continue
        key = (analyte, m.group("value"), m.group("unit").lower())
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "analyte": analyte,
            "value": float(m.group("value").replace(",", "")),
            "unit": m.group("unit").lower(),
            "outcome": "detected",
            "lab": nearest(text, m.start(), LABS, 200, decline_if_ambiguous=True),
            "year": year_near(text, m.start()),
            "lod": lod_near(text, m.start()),
        })
    for m in NONDETECT.finditer(text):
        analyte = nearest(text, m.start(), ANALYTES)
        if not analyte or (analyte, "nd", "") in seen:
            continue
        seen.add((analyte, "nd", ""))
        out.append({
            "analyte": analyte, "value": None, "unit": None,
            "outcome": "non-detect",
            "lab": nearest(text, m.start(), LABS, 200, decline_if_ambiguous=True),
            "year": year_near(text, m.start()),
            "lod": lod_near(text, m.start()),
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--show", type=int, default=14)
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    found = collections.Counter()
    rows = 0
    shown = 0
    for b in brands:
        for p in (b.get("products") or []):
            res = results_from(p.get("note"))
            if not res:
                continue
            rows += 1
            for r in res:
                found[r["outcome"]] += 1
            if args.write:
                p.setdefault("ext", {})["testingResults"] = res
            if shown < args.show:
                shown += 1
                print(f"  {b['brand'][:20]:22} {(p.get('name') or '')[:30]:32}")
                for r in res:
                    val = ("non detect" if r["outcome"] == "non-detect"
                           else f"{r['value']:g} {r['unit']}")
                    print(f"      {r['analyte']:22} {val:18} "
                          f"lab={r['lab'] or '-'}  year={r['year'] or '-'}  lod={r['lod'] or '-'}")

    print(f"\nrows with a structured result: {rows}   measurements: {dict(found)}")
    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print("wrote brand-data.json")
    else:
        print("\ndry run. re-run with --write")
    return 0


if __name__ == "__main__":
    sys.exit(main())
