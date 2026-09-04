#!/usr/bin/env python3
"""
Move a verdict's stated reason onto the front it belongs to.

145 careful/skip rows carry no adverse finding on any front, so the app renders
the badge over an empty "why we flag it". None is unjustified: the reason is
written in the note. This reads the note and proposes the front.

It is deliberately timid. It proposes only when a sentence carries a signal
that cannot mean anything else, it never touches a front that is already
answered, and it prints the sentence it matched so a person can check the
reading before it is written. Everything it cannot place is listed at the end
for hand work rather than guessed at.

    python3 tools/encode-stated-reasons.py [--write] [--cat "Sunscreen"]
"""
import json, re, sys, argparse, pathlib, collections

DATA = pathlib.Path("brand-data.json")

# A lab result. These words only appear when somebody measured something.
TESTING = re.compile(r"\b(ppb|ppm|ppt|non[- ]detect|nondetect|detected|detection|"
                     r"lead safe mama|mamavation|consumer reports|clean label project|"
                     r"organic fluorine|independent (?:lab |screening|testing)|"
                     r"tested (?:positive|non)|heavy metals? (?:result|testing))\b", re.I)
# A court or a regulator. Not a chemistry claim.
LEGAL = re.compile(r"\b(lawsuit|class action|recall(?:ed|s)?|settlement|"
                   r"settled (?:a |with |for |\$)|"
                   r"litigation|consent decree|FTC|CPSC|NAD |attorney general|"
                   r"warning letter|prop(?:osition)? 65)\b", re.I)
# Composition of the thing itself, not of what is in it.
MATERIALS = re.compile(r"\b(plastic (?:bottle|jar|tub|pouch|liner|lid|container)|"
                       r"polypropylene|polyethylene|PET\b|HDPE|multilayer|"
                       r"plastic[- ]lined|elemental chlorine free|ECF\b|"
                       r"viscose|rayon|synthetic (?:fib|substrate))", re.I)

# The word that turns an ingredient into a finding.
CONTAMINANT = re.compile(r"\b(contaminat\w*|recall\w*|found in|traces? of|"
                         r"returned|measured|reported|carr(?:y|ies|ied)|came back)\b", re.I)

def sentences(t):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", t or "") if s.strip()]

# A sentence can name a hazard while saying the product is clean of it, or
# while praising the result. "Certified carbon block for PFAS" is a filter that
# removes PFAS. "Cleanest result of the nine prenatals" is the best in its
# round. Both were being written down as failures.
FAVOURABLE = re.compile(r"\b(non[- ]?detect|cleanest|lowest|best|free of|"
                        r"clear of|no detectable|removes?|filters?|certified for|"
                        r"tested clean|came back clean|nothing detected|"
                        r"purity award|certified|certification|verified)\b", re.I)

def negated_near(s, term):
    """Is this hazard word carried by a negation rather than a finding?"""
    for m in re.finditer(r"(?<![a-z])" + re.escape(term) + r"s?(?![a-z])", s, re.I):
        before = s[max(0, m.start() - 46):m.start()].lower()
        if re.search(r"\b(no|non|not|never|without|free of|clear of|removes?|"
                     r"filters?|for|against)\s*$|\bfree\b", before):
            continue
        return False
    return True

def negated(s):
    return bool(re.match(r"^\s*(no|none|never)\b", s, re.I)) or bool(FAVOURABLE.search(s))

def hazards():
    import importlib.util
    spec = importlib.util.spec_from_file_location("apr", "tools/audit-product-rules.py")
    m = importlib.util.module_from_spec(spec)
    sys.modules["apr"] = m
    spec.loader.exec_module(m)
    return [h.lower() for h in m.HAZARD], [d.lower() for d in m.DISCLOSURE_FAILURE]

ALL_HAZARD, DISCLOSE = hazards()

# The hazard list mixes two different questions, because a verdict needs both.
# A polymer is what the thing is MADE of; an ingredient is what is IN it. Left
# undivided, "glass body with a plastic lid" and "multilayer plastic pouch"
# came out as formula failures, which claims the maker put plastic in the
# recipe. That is rule 3.1's front, not rule 2.1's.
MATERIAL_HAZARD = {
    "plastic", "polyester", "nylon", "acrylic", "spandex", "elastane",
    "ptfe", "teflon", "nonstick", "non-stick", "pfoa", "pvc",
    "polycarbonate", "polypropylene", "polyethylene", "polystyrene", "styrene",
    "melamine", "viscose", "rayon", "neoprene", "flame retardant",
    "bpa", "bps", "bpf",
}
# Elements a lab measures. They are never an ingredient somebody chose.
CONTAMINANT_HAZARD = {"lead", "cadmium", "benzene", "arsenic", "mercury"}
FORMULA_HAZARD = [h for h in ALL_HAZARD
                  if h not in MATERIAL_HAZARD and h not in CONTAMINANT_HAZARD]

def propose(note):
    """front -> (status, the sentence that says so). Only clear readings."""
    out = {}
    for s in sentences(note):
        low = s.lower()
        # An earlier, looser pass used to run here and set a front before the
        # strict rules below could reject it, which is how "no suit filed and
        # no recall" became a legal caution. The strict rules are the only ones.
        if negated(s):
            continue
        def seen(words):
            return [h for h in words
                    if re.search(r"(?<![a-z])" + re.escape(h) + r"s?(?![a-z])", low)
                    and not negated_near(s, h)]
        mat, con, form = seen(MATERIAL_HAZARD), seen(CONTAMINANT_HAZARD), seen(FORMULA_HAZARD)
        hidden = [d for d in DISCLOSE if d in low]

        # Testing, only with a measurement or a named lab behind it.
        measured = re.search(r"\b[\d,.]+\s*(ppb|ppm|ppt|ng/g|mg/kg)\b", s, re.I)
        lab = re.search(r"\b(lead safe mama|mamavation|consumer reports|valisure|"
                        r"clean label project|house oversight|congressional|"
                        r"independent (?:lab|testing|screening)|oversight report)\b", s, re.I)
        if (measured or lab) and (con or form or mat):
            # Always caution, never fail. A number is not a severity: "middle
            # tier, mid pack metals" and "about 116 ppb lead" both carry a
            # figure, and neither is a failure. Whether a result fails depends
            # on the category baseline and the threshold that applies, which
            # this script cannot see. Escalating to fail moved five real brands
            # to skip, which is a removal from every article and the store.
            # A caution states the finding and leaves the verdict where a
            # person put it.
            out.setdefault("testing", ("caution", s))
            continue
        # A court or a regulator acted. Unambiguous.
        legal_hit = LEGAL.search(s)
        if legal_hit and not negated_near(s, legal_hit.group(0).split()[0]):
            out.setdefault("legal", ("caution", s))
        # A polymer, but only where the sentence says it touches something.
        contact = re.search(r"\b(in contact|contact with|lining|lined|liner|pouch|lid|"
                            r"housing|reservoir|tank|coated|coating|basket|body|cover|"
                            r"upholstery|foam|topsheet|substrate|bottle|jar|cup|"
                            r"against skin|water path|interior)\b", s, re.I)
        if mat and contact:
            out.setdefault("materials", ("caution", s))
        # An ingredient somebody chose, said as such.
        chosen = re.search(r"\b(contains?|containing|using|made with|formulated with|"
                           r"includes?|added|listed|among the (?:in)?active)\b", s, re.I)
        if form and chosen:
            out.setdefault("formula", ("fail", s))
        elif hidden:
            out.setdefault("formula", ("caution", s))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--cat")
    ap.add_argument("--show", type=int, default=25)
    a = ap.parse_args()

    brands = json.loads(DATA.read_text())
    placed, unplaced, changes = [], [], 0
    for b in brands:
        for p in b.get("products") or []:
            cat = p.get("cat") or b.get("category") or ""
            if a.cat and cat != a.cat:
                continue
            e = p.setdefault("ext", {})
            fr = e.setdefault("fronts", {})
            if e.get("verdict") not in ("careful", "skip"):
                continue
            if any(fr.get(k) in ("caution", "fail") for k in
                   ("formula", "materials", "legal", "testing")):
                continue
            note = (p.get("note") or "").strip() or (b.get("reason") or "").strip()
            got = propose(note)
            # A clean testing read alone cannot explain a careful verdict.
            got = {k: v for k, v in got.items() if not (k == "testing" and v[0] == "pass")}
            if not got:
                unplaced.append((b, p, cat, note))
                continue
            placed.append((b, p, cat, got))
            for front, (status, why) in got.items():
                if fr.get(front) not in (None, "unassessed"):
                    continue
                fr[front] = status
                e.setdefault("frontNotes", {})[front] = why
                e.setdefault("frontOrigin", {})[front] = "hand"
                changes += 1

    print(f"rows with a placeable reason : {len(placed)}   fronts filled: {changes}")
    print(f"rows needing hand work       : {len(unplaced)}\n")
    for b, p, cat, got in placed[:a.show]:
        print(f"  {b['brand'][:20]:<21} {str(p.get('name'))[:30]:<32} [{cat}]")
        for f, (st, why) in got.items():
            print(f"      {f:<10} {st:<8} <- {why[:96]}")
    if unplaced:
        print(f"\n── could not place ({len(unplaced)}) ──")
        for b, p, cat, note in unplaced[:12]:
            print(f"  {b['brand'][:20]:<21} {str(p.get('name'))[:28]:<30} [{cat}]")
            print(f"      {note[:110]}")

    if a.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA}")
    else:
        print("\ndry run. re-run with --write")


if __name__ == "__main__":
    main()
