#!/usr/bin/env python3
"""
A front finding has to carry its evidence, or it is not a finding.

Product level fronts were largely filled by extracting sentences from brand
prose, and the extraction kept the verdict while dropping the sentence. That
produced 260 adverse fronts with no note attached against 42 with one, and it
produced contradictions: Dr. Bronner's brand record says the toothpaste suit is
filed and unresolved with no recall, which is a caution, while the product row
said fail. Carter's and Magna-Tiles had legal fail on the product and legal
unknown on the brand. Nothing was there to notice, because a status without a
note reads exactly like a status with one.

This matters more since section 6 became a ceiling. An unsourced fail now drags
a product to skip, and the standing rule is that a skip comes out of every
article and out of the store. Bad evidence would start deleting good picks.

Three passes, in order:

1. An adverse product front with no note inherits the brand's front when the
   brand has one with a note and the brand's evidence generalises. Adverse
   evidence is allowed to propagate downward, so this is the direction the
   asymmetry rule permits, but only for a brand that means one thing. Philips
   sells espresso machines and Sonicare toothbrushes, and inheriting across that
   gap put a note about descaling hot water lines onto a toothbrush.
2. Anything still adverse and still unsourced becomes unassessed. Not a pass,
   which would be a claim we cannot support either, just an open question. This
   can only lower a verdict, never raise one, because a blank front blocks good.
3. The legal front is graded on whether anything was decided. A complaint is an
   allegation and caps at caution. A recall, settlement or judgment is an
   outcome and fails.

    python3 tools/front-evidence.py            # report only
    python3 tools/front-evidence.py --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
FRONTS = ("formula", "materials", "legal", "testing")
ADVERSE = ("fail", "caution")

# Something was decided.
OUTCOME = re.compile(
    r"\brecall(ed|s)?\b|\bsettle(d|ment)\b|\bjudgment\b|\bverdict\b|\bconsent decree\b"
    r"|\bfined\b|\bbanned\b|\bwarning letter\b|\bpleaded\b|\bfound liable\b", re.I)
# Someone asserted something.
ALLEGATION = re.compile(
    r"\balleg(e|es|ed|ation|ations)\b|\bclaims that\b|\bpre.?litigation\b|\binvestigation\b"
    r"|\bfiled\b|\bunresolved\b|\bproposed class\b|\blawsuit (says|claims)\b|\bsued\b"
    r"|\bcomplaint\b|\brevived\b", re.I)


NEGATED = re.compile(r"\b(no|not|never|nor|without)\b[^.;]{0,24}$", re.I)


def decided(note):
    """
    True when the note reports something that was actually decided.

    Checking for the word alone read "Live claims, not settled" as a settlement
    and sent LOLA to skip on a case nobody has decided. So each match is tested
    against the words immediately before it.
    """
    for m in OUTCOME.finditer(note):
        if not NEGATED.search(note[:m.start()]):
            return True
    return False


def note_for(e, k):
    n = (e.get("frontNotes") or {}).get(k) or ""
    if not n and k == "legal":
        n = e.get("legalNote") or ""
    if not n and k == "testing":
        n = e.get("testingNote") or ""
    return n.strip()


def brand_front(b, k):
    f = (b.get("fronts") or {}).get(k)
    if not isinstance(f, dict):
        return None, ""
    return f.get("status"), (f.get("note") or "").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    inherited = blanked = regraded = 0
    by_front = collections.Counter()
    examples, regrades = [], []

    for b in brands:
        for p in (b.get("products") or []):
            e = p.get("ext")
            if not e:
                continue
            fr = e.setdefault("fronts", {})
            notes = e.setdefault("frontNotes", {})

            for k in FRONTS:
                if fr.get(k) not in ADVERSE or note_for(e, k):
                    continue
                bs, bn = brand_front(b, k)
                # Only from a brand whose evidence actually generalises. Philips
                # sells espresso machines and Sonicare toothbrushes under one
                # name, and its formula note is about the espresso machines, so
                # inheriting it put descaling copy on a toothbrush.
                if bs in ADVERSE and bn and b.get("generalises"):
                    # 1. take the brand's finding, and its reasoning with it
                    fr[k] = bs
                    notes[k] = bn + f" (Recorded for {b['brand']} as a whole rather than this "
                    notes[k] += "product specifically.)"
                    e.setdefault("inheritedFronts", []).append(k)
                    inherited += 1
                    if len(examples) < 6:
                        examples.append(("inherit", b["brand"], p.get("name"), k, bs))
                else:
                    # 2. an assertion with nothing behind it is an open question
                    fr[k] = "unassessed"
                    blanked += 1
                    by_front[k] += 1
                    if len(examples) < 12:
                        examples.append(("blank", b["brand"], p.get("name"), k, None))

            # 3. allegation caps at caution; only an outcome fails
            n = note_for(e, "legal")
            if fr.get("legal") == "fail" and n:
                if not decided(n) and ALLEGATION.search(n):
                    fr["legal"] = "caution"
                    regraded += 1
                    if len(regrades) < 8:
                        regrades.append((b["brand"], p.get("name"), n[:88]))

    print(f"adverse fronts that took the brand's evidence:  {inherited}")
    print(f"unsourced assertions reopened as unassessed:    {blanked}")
    print(f"legal fails regraded to caution, nothing decided: {regraded}\n")
    if by_front:
        print("reopened, by front:")
        for k, n in by_front.most_common():
            print(f"  {n:>4}  {k}")
    if regrades:
        print("\nregraded, an allegation is not an outcome:")
        for br, nm, n in regrades:
            print(f"  {br} / {str(nm)[:30]}\n      {n}")
    if examples:
        print("\nexamples:")
        for kind, br, nm, k, s in examples[:8]:
            tail = f"-> {s} from the brand" if kind == "inherit" else "-> unassessed"
            print(f"  {kind:<8} {br[:18]:<18} {str(nm)[:26]:<26} {k:<10} {tail}")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
