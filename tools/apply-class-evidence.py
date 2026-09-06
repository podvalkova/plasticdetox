#!/usr/bin/env python3
"""
What we know about a KIND of product, applied to products nobody has tested.

Our testing front only ever asked one question: has anyone tested this brand's
product? For most rows the answer is no, and the card said "not yet assessed",
which reads identically for a tea bag and a wooden spoon. Those are not the
same state. Nobody will ever lab test a wooden spoon. Tea bags have been
measured at 11.6 billion particles per cup, and we cite that number in
thirteen places on the site while showing our own tea rows as unassessed.

So the front asks two questions now. Has anyone tested this product, and has
anyone tested this kind of product. The first wins wherever it exists, because
it is about the actual thing.

Three rules, all of them already in the standard:

  1.1  A class study can warn and can never clear. Only a test of the product
       itself can carry a recommendation, so status here is caution or fail.
  1.2  Inherited evidence names its scope in the copy the shopper sees, so a
       reader can judge the inference rather than take it from us.
  2.2  Weight follows determinability. Where the product's own material or name
       puts it in the class, the finding lands at full weight. Where only the
       category matches, it caps at caution and says what is unconfirmed.

And one guard that is not yet written down anywhere, which this needs most.
A finding earns a place only where something escapes it. Loose leaf has no
bag; glass is not the polymer that was measured. A finding every product in a
category carries stops carrying information, which is rule 5.3's mistake and
the one I made rating Sonicare a skip for bristles every electric brush has.

    python3 tools/apply-class-evidence.py
    python3 tools/apply-class-evidence.py --write
"""
import argparse
import collections
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
TABLE = ROOT / "data" / "class-evidence.json"

# A specific finding from a real source outranks anything about the category.
HELD = ("pass", "caution", "fail")
OPEN = (None, "", "unknown", "unassessed", "none")


def haystack(brand, product):
    """
    What the product IS: its name and the material we recorded for it.

    Deliberately not the note. The note is our prose about the product, and it
    routinely names the alternative rather than the thing: every supermarket tea
    row says loose leaf somewhere, because that is what we tell people to buy
    instead. Matching on it let Lipton and Twinings escape a finding about
    exactly their kind of bag. Same rule as the material harvester, and the same
    reason: a name and a recorded material are facts about the object, prose is
    our commentary on it, and only the first can decide membership.
    """
    e = product.get("ext") or {}
    parts = [product.get("name") or "",
             e.get("materialsList") or "",
             (e.get("materialAnswers") or {}).get("material") or ""]
    return " " + " ".join(parts).lower() + " "


def hit(text, terms):
    return next((t for t in terms if t and t.lower() in text), None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    findings = json.loads(TABLE.read_text())["findings"]
    rows = [(b, p) for b in brands for p in (b.get("products") or [])]

    applied = collections.Counter()
    per = collections.Counter()
    skipped_flat = []

    for f in findings:
        cats = set(f.get("appliesTo", {}).get("cats") or [])
        confirm = f.get("confirmedBy", {}).get("any") or []
        escape = f.get("escapedBy", {}).get("any") or []

        in_class = [(b, p) for b, p in rows if (p.get("cat") or "") in cats]

        def has_own_test(b, p):
            e = p.get("ext") or {}
            held = (e.get("fronts") or {}).get(f["front"])
            origin = (e.get("frontOrigin") or {}).get(f["front"])
            note = ((e.get("frontNotes") or {}).get(f["front"]) or "").strip()
            # A result has to exist to outrank a finding about the class. A
            # bare "pass" with no note and no recorded origin is an assertion,
            # not a measurement, and treating it as one let a sea salt escape
            # the sea salt finding on the strength of an empty field.
            if not note and not origin:
                return False
            return held in HELD and origin != "inferred"

        # A product somebody actually tested escapes a claim about its class by
        # definition, and that counts for the guard too. Saalt's period
        # underwear tested non detect while Thinx measured 940 ppm: that is the
        # finding discriminating, and reading only the escape words missed it
        # because the non detect lives in a test result, not in the name.
        escapes = [(b, p) for b, p in in_class
                   if hit(haystack(b, p), escape) or has_own_test(b, p)]

        # The guard. A finding nothing escapes is a fact about the world, not a
        # way to tell two products apart, so it belongs in an article. The one
        # exception is a category that carries it whole, where the escape is
        # real but sits outside the category: nothing sold as bottled water
        # avoids the bottle, and the answer is a filter, not another brand.
        # That case has to say so out loud rather than pass by default.
        if in_class and not escapes and not f.get("alternative"):
            skipped_flat.append((f["id"], len(in_class)))
            continue

        for b, p in in_class:
            text = haystack(b, p)
            if hit(text, escape):
                per[f["id"] + " escaped"] += 1
                continue

            e = p.setdefault("ext", {})
            fronts = e.setdefault("fronts", {})
            origin = (e.get("frontOrigin") or {}).get(f["front"])
            held = fronts.get(f["front"])
            # A real test of this product answers the question already.
            if held in HELD and origin and origin != "inferred":
                per[f["id"] + " has its own test"] += 1
                continue
            if held not in OPEN and held in HELD:
                per[f["id"] + " has its own test"] += 1
                continue

            confirmed = hit(text, confirm)
            status = f["status"] if confirmed else "caution"
            scope = ("This product's own materials put it in that class."
                     if confirmed else
                     f"This is about {p.get('cat', 'this kind of product').lower()} "
                     "generally. We have not confirmed it for this product.")

            if f.get("alternative"):
                scope += " " + f["alternative"]
            fronts[f["front"]] = status
            e.setdefault("frontOrigin", {})[f["front"]] = "class"
            e.setdefault("frontNotes", {})[f["front"]] = (
                f"{f['headline']} ({f['source']}). {scope}")
            e["classEvidence"] = {
                "id": f["id"], "headline": f["headline"], "detail": f["detail"],
                "source": f["source"], "year": f.get("year"),
                "status": status, "membership": "confirmed" if confirmed else "inferred",
                "confirmedBy": confirmed or "", "escape": f.get("escapeNote", ""),
                "alternative": f.get("alternative", ""),
            }
            applied[status] += 1
            per[f["id"]] += 1

    print(f"class findings: {len(findings)}")
    for f in findings:
        n = per.get(f["id"], 0)
        esc = per.get(f["id"] + " escaped", 0)
        own = per.get(f["id"] + " has its own test", 0)
        print(f"  {f['id']:<30} applied {n:>3}   escaped {esc:>3}   own test {own:>3}")
    print(f"\nrows given a class finding: {sum(applied.values())}   {dict(applied)}")
    for fid, n in skipped_flat:
        print(f"  ! {fid} skipped: nothing in its {n} rows escapes it, so it does not "
              "tell two products apart")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print("\nwrote brand-data.json")
    else:
        print("\ndry run. re-run with --write")
    return 0


if __name__ == "__main__":
    sys.exit(main())
