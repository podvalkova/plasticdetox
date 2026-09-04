#!/usr/bin/env python3
"""
Rule 5.3, applied to the data.

    "No recall found" renders as checked, nothing found. It can never be the
    reason a product is rated good.

460 rows say legal=pass, and the note under them is an automated sweep:
"Checked against the FDA enforcement database. No recall on record." That is
an absence, not a credential. Most of our categories are barely regulated, so
no recall usually means no regulator was looking.

Two consequences, both visible on cards today.

The scorecard reads as though a legal check was passed when nobody looked.

And 43 rows carry that pass over a documented action in our own note: Aveeno
in the 2021 J&J benzene recall, Beech-Nut's 2021 rice cereal recall, a Prop 65
notice on Boudreaux's. Because a pass is not blank, the transcriber that fills
empty fronts skipped every one of them, so the real finding could never land.

    python3 tools/legal-absence-is-not-a-pass.py [--write]
"""
import json, re, sys, pathlib

DATA = pathlib.Path("brand-data.json")
SWEEP = re.compile(r"No recall on record|No recall, safety warning or regulatory action|"
                   r"no firm with a similar name", re.I)
ACTION = re.compile(r"\b(was recalled|were recalled|recalled in|recalled by|"
                    r"issued a .{0,20}recall|class action|lawsuit|settlement|"
                    r"litigation|prop(?:osition)? 65 notice|prop(?:osition)? 65 action|"
                    r"consent decree|warning letters?)\b", re.I)
# "no vacuum litigation found" and "no open class action over its HEPA claims"
# are absences. Allow any words between the "no" and the thing being denied.
NEG = re.compile(r"\bno\b[^.]{0,30}?\b(recall|suit|class action|action|litigation|"
                 r"regulatory)\b", re.I)
# The note tells us the finding belongs to a different line. Burt's Bees crib
# sheets say "the caution on this brand is the personal care line, not the
# fabric"; Dr. Brown's pacifier says "the bottles are the problem".
ELSEWHERE = re.compile(r"\b(cosmetics line|personal care line|the bottles are|"
                       r"on a different SKU|not the fabric|parent brand also|"
                       r"its \w+ line)\b", re.I)
CHECKED = ("Checked, nothing found. No recall or action on record, which in a barely "
           "regulated category means no regulator was looking rather than a clean bill")


def sentence_with(text, m):
    lo = max(text.rfind(". ", 0, m.start()) + 1, 0)
    hi = text.find(". ", m.start())
    return text[lo:hi + 1 if hi > 0 else len(text)].strip()


def main():
    write = "--write" in sys.argv
    brands = json.loads(DATA.read_text())
    found, demoted = [], 0
    for b in brands:
        for p in b.get("products") or []:
            e = p.setdefault("ext", {})
            f = e.setdefault("fronts", {})
            if f.get("legal") != "pass":
                continue
            notes = e.setdefault("frontNotes", {})
            legal_note = str(notes.get("legal") or "") + " " + str(e.get("legalNote") or "")
            # Product scope only. A brand level action propagates under rule
            # 1.1, but it has to name its scope under 1.2, and applying a
            # cosmetics class action to a crib sheet fails that badly enough
            # that it pulled four sound recommendations.
            own = (p.get("note") or "")

            m = ACTION.search(own)
            if (m and not NEG.search(own[max(0, m.start() - 90):m.start() + 60])
                    and not ELSEWHERE.search(own)):
                f["legal"] = "caution"
                notes["legal"] = sentence_with(own, m)[:300]
                e.setdefault("frontOrigin", {})["legal"] = "hand"
                found.append((b.get("brand"), p.get("name"), m.group(0)))
                continue
            # An absence, recorded honestly. `none` means we looked; it answers
            # the gate without claiming a credential nobody earned.
            if SWEEP.search(legal_note):
                f["legal"] = "none"
                notes["legal"] = CHECKED
                demoted += 1

    print(f"legal passes replaced by the action our own note records: {len(found)}")
    for bn, nm, what in found[:16]:
        print(f"    {bn[:22]:<23} {str(nm)[:30]:<32} {what}")
    print(f"\nlegal passes that were only an absence, now 'none': {demoted}")
    if write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA}")
    else:
        print("\ndry run. re-run with --write")


if __name__ == "__main__":
    main()
