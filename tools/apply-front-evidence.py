#!/usr/bin/env python3
"""
Record facts. Derive verdicts.

Legal is the best evidenced front we hold, 614 findings against 3 guesses, and
the reason is data/recall-cache.json: somebody establishes a fact, it is written
down as input, every rebuild reads it. Formula, packaging and testing had no
such file, so their findings lived as prose in a product note and were
re-derived from that prose, differently, on every run.

The fix is not only a file. It is recording the right thing.

"Is this packaging a pass" is a judgement, and a judgement has to be argued
again every time anyone looks at it. "What is the container made of" is a fact.
It is one lookup, it does not change, and no classifier is needed to read it.
So packaging records a material, or nothing, and how bad that material is gets
worked out from what is inside and what the product is for.

That is not a simplification, it is the actual rule. Glass is glass whatever it
holds. A plastic jar is a different problem for an oil balm than for a bar of
soap, because fat is the strongest extractant there is, which is why food
contact testing uses oil as the aggressive simulant and water as the mild one.
Motherlove's 4 oz plastic jar and its 2 oz glass jar hold the same formula and
get different answers for exactly this reason.

    data/front-evidence.json
    {
      "B0825WHHGJ": {
        "materials": {"material": "pet", "source": "earthmama.com/faq"},
        "formula":   {"base": "anhydrous", "use": "leave-on"}
      }
    }

    python3 tools/apply-front-evidence.py            # dry run
    python3 tools/apply-front-evidence.py --write
    python3 tools/apply-front-evidence.py --seed     # capture what we already hold
"""

import argparse
import collections
import datetime
import importlib.util
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
EVIDENCE = ROOT / "data" / "front-evidence.json"
TODAY = datetime.date.today().isoformat()


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# One vocabulary, one negation reader. Duplicating either is how the extension
# and the tools came to answer the same listing two ways.
_apr = _load("_apr", "tools/audit-product-rules.py")
_bf = _load("_bf", "tools/backfill-fronts.py")

# Question 3, the material of the parts actually in contact. Inert means the
# answer does not depend on what it holds, which is the point of asking.
INERT = {"glass", "borosilicate", "tempered glass", "stainless", "stainless steel",
         "steel", "tin", "ceramic", "porcelain", "enamel", "bamboo", "wood",
         "maple wood", "beeswax", "paper-uncoated", "silicone", "cotton", "metal",
         "rubber", "cast iron", "carbon steel", "titanium",
         "cork", "linen", "hemp", "silk", "jute", "wool", "leather", "felt",
         "aluminum foil", "paper", "cardboard", "glass-ceramic",
         # A dried plant sponge, the fibre of the luffa gourd, not a processed polymer.
         "loofah",
         # Coconut husk fibre, a plant fibre like jute. A coir pad is bonded, so
         # rule 3.7's binder question is what decides it.
         "coir",
         # Lyocell (TENCEL Lyocell) is spun from a closed solvent loop without
         # carbon disulfide. Cellulose here is plant pulp. A bare "TENCEL" names
         # Lenzing's brand, which covers both lyocell and modal, so it is rule
         # 3.11 below until the maker says which.
         "lyocell", "cellulose"}

# How much of a problem the polymer is before the contents are considered. PVC
# carries phthalate plasticisers, polystyrene leaches styrene, 7 is the catch all
# that includes polycarbonate. PET is its own case: antimony from the
# polymerisation catalyst, and it sheds. PP and the polyethylenes are steadier.
POLYMER = {
    "pvc": 2, "ps": 2, "polystyrene": 2, "pc": 2, "polycarbonate": 2, "other": 2,
    "melamine": 2, "non stick": 2, "nonstick": 2, "ptfe": 2,
    # The foams. EVA carries the formamide story and ranked below PVC in the
    # 2025 Ecotoxicology and Environmental Safety volatile screening of 34 play
    # mats; polyurethane foam is the nap mat flame retardant category (22 of 24
    # mats in the 2013 Duke analysis) and memory foam is polyurethane by
    # another name.
    "eva": 2, "polyurethane": 2, "memory foam": 2, "spandex": 2, "elastane": 2,
    "pet": 1.5, "pete": 1.5, "tritan": 1.5, "acrylic": 1.5, "nylon": 1.5, "polyamide": 1.5,
    # Polyester is PET as a fiber, and TPU is the plasticizer-free film family:
    # both shed, neither carries PVC's additive package.
    "polyester": 1.5, "tpu": 1.5,
    "pp": 1, "polypropylene": 1, "hdpe": 1, "ldpe": 1, "polyethylene": 1,
    "aluminum": 1, "aluminium": 1,
    # Coated board only. Plain cardboard sat here and in INERT at once, so a
    # brand stated plastic free cardboard tube (HiBAR) failed where the same
    # tube recorded as paper (Ethique) passed. The coating is the hazard.
    "paper-coated": 1, "paperboard": 1, "carton": 1,
    "plastic": 1.5,      # named as plastic and no more
}

# A material is inert or ranked, never both.
assert not (INERT & set(POLYMER)), sorted(INERT & set(POLYMER))

# Rule 3.11. Viscose, rayon and modal are cellulose once made, but no published
# study has measured what carbon disulfide or finish they leave on skin. Worn for
# hours they need a certification that tests the finished product.
VISCOSE_FIBRE = re.compile(r"\b(viscose|rayon|modal)\b|\btencel\b(?!.*\blyocell\b)", re.I)
FINISHED_PRODUCT_CERT = re.compile(r"oeko.?tex\W*standard\W*100|made safe|\bgots\b|eu ecolabel", re.I)
# Rule 3.12's list is its own, so widening it never moves 3.11 on a wrap or a wipe.
CAR_SEAT_CERT = re.compile(r"oeko.?tex\W*standard\W*100|made safe|\bgots\b|\bbluesign\b", re.I)


def _car_seat_front(pack):
    """Rule 3.12, a car seat's fabric is judged like clothing.

    A clothed child sits on the fabric and nothing is eaten, and the testing
    split on chemistry, not fibre: in the Ecology Center's 2022 round all 10
    seats sold flame retardant free tested clean, most of them polyester, and
    all 12 conventional seats were flagged. Scoring the fibre left every seat
    but one at careful for polyester. So the fibre is disclosed and not scored,
    and the front rests on the maker's statement that the fabric and the foam
    carry no added flame retardants and that the seat is PFAS free, verified by
    a certificate that tests the finished fabric (with its number) or an
    independent test under 36 months old. Rule 3.9 has already failed a maker
    who admits flame retardants before this runs.
    """
    fr = str(pack.get("frFree") or "").lower()
    stated_fr = (bool(re.search(r"\bfabric", fr)) and bool(re.search(r"\bfoam", fr))
                 and bool(str(pack.get("frFreeSource") or "").strip()))
    stated_pfas = (bool(str(pack.get("pfasFree") or "").strip())
                   and bool(str(pack.get("pfasFreeSource") or "").strip()))
    cert = str(pack.get("certification") or "").strip()
    certified = (bool(CAR_SEAT_CERT.search(cert))
                 and bool(str(pack.get("certificateNumber") or "").strip())
                 and bool(str(pack.get("certificationSource") or "").strip()))
    tested = str((pack.get("_testing") or {}).get("status") or "") == "pass"
    fibre = str(pack.get("material") or "").strip()
    shown = (f"The fabric is {fibre}, disclosed and not scored" if fibre
             else "The maker does not publish the fibre")
    missing = []
    if not stated_fr:
        missing.append("a maker statement that the fabric and the foam carry no added flame retardants")
    if not stated_pfas:
        missing.append("a PFAS free statement")
    if not (certified or tested):
        missing.append("a certificate that tests the finished fabric, with its number, or an "
                       "independent test under 36 months old, to verify it")
    if missing:
        return "caution", f"Missing {'; '.join(missing)} (rule 3.12). {shown}"
    how = f"{cert} {pack.get('certificateNumber')}" if certified else "an independent test"
    return "pass", ("No added flame retardants in fabric or foam and no PFAS by the maker's "
                    f"statement, verified by {how} (rule 3.12). {shown}")

ACRONYMS = {"pet", "pete", "pvc", "ps", "pc", "pp", "hdpe", "ldpe", "ptfe"}
OILY = {"anhydrous", "oil", "oily", "fatty", "balm", "alcohol"}
DRY = {"dry", "solid", "powder"}


def pretty(m):
    return m.upper() if m in ACRONYMS else m


# A material named as the thing the product does NOT contain. Both orders occur
# in listings: "aluminium free", "BPA-free" and "free of parabens", "no PVC",
# "without phthalates", "non-toxic".
NEGATED = re.compile(
    r"\b[\w-]+[\s-]*free\b"
    r"|\bfree\s+(?:of|from)\s+[\w-]+"
    r"|\b(?:no|without|non)[\s-]+[\w-]+",
    re.I,
)


def classify(name):
    """Which rule a material name falls under, matched on the words in it.

    Listings write "Borosilicate Glass", "Medical-Grade Tritan", "Aluminum, Non
    Stick Granite". Exact matching missed all three.
    """
    n = (name or "").strip().lower()
    if not n:
        return None, None

    # Rule 3.4: a material the copy rules out is not a material in contact.
    # "Aluminum Free Deodorant" contains the word aluminium, and a bare
    # substring match read that as aluminium against the skin, which is the
    # exact opposite of what the label says. Same for "BPA free", "PVC free",
    # "no polycarbonate", "non toxic". Strip the negated spans before matching
    # rather than after, so the term never reaches the polymer table.
    n = NEGATED.sub(" ", n)
    if not n.strip():
        return None, None

    best = None
    for term, rank in POLYMER.items():
        if names(term, n) and (best is None or len(term) > len(best[0])):
            best = (term, rank)
    for term in INERT:
        if names(term, n) and (best is None or len(term) > len(best[0])):
            best = (term, 0)
    return best if best else (None, None)


def names(term, n):
    """Is the material a word of the text, not letters inside another word?

    A bare substring match read "pp" in "applicator" and "copper", "ps" in
    "pumps", "pet" in "pipette" and "tin" in "listing". So a record saying the
    maker names no material scored as polypropylene, polystyrene, PET or tin:
    MARA's face oil failed on its dropper pipette, a Gaia Guy boar bristle brush
    read polypropylene off its copper staples, and Transparent Labs' tub passed
    as tin because the note mentioned the listing. Wood keeps its compounds
    (beechwood), and "other" counts only as resin code 7, never the English word.
    """
    if term == "other":
        return re.search(r"#\s*7\b|\b7\s*\(?\s*other\b|\bother\s+plastics?\b", n) is not None
    lead = "" if term == "wood" else r"(?<![a-z0-9])"
    return re.search(lead + re.escape(term) + r"(?:e?s)?(?![a-z0-9])", n) is not None


def worst(materials):
    """Of the parts in contact, the one that decides.

    A jar and its gasket, a housing and its fittings. The worst non inert part
    decides, because that is the one that can migrate, and an object whose
    contact parts are all inert is inert.
    """
    parts = [m.strip() for m in re.split(r"[,^/;+&]|\band\b", str(materials or "")) if m.strip()]
    scored = [classify(m) for m in parts]
    bad = [(r, t) for t, r in scored if r]
    if bad:
        return max(bad)[1]
    inert = [t for t, r in scored if t and r == 0]
    return inert[0] if inert else ""


def _assess_container(pack):
    """The four questions, in order, with unknown allowed at each one.

    1  Does it touch the contents, the mouth or the skin? A plastic kettle body
       around a stainless interior is not a finding, and asking this first
       dismisses most of the plastic on most products before anyone researches
       anything.
    2  Would contact matter? Fat is the strongest extractant there is, heat
       drives migration, a chewed spout is abrasion, and time multiplies all of
       it. A dry bar in a card box exits here.
    3  What are the contact parts made of.
    4  Which polymer, where we know it. Not asked when the answer changes
       nothing; an independent test is the better evidence anyway.

    Returns (status, reason). Unknown is an outcome, not a gap to be filled with
    a guess: it means unassessed, which is not a pass.
    """
    contact = str(pack.get("contact") or "").strip().lower()
    raw = str(pack.get("material") or "")

    # Question 1 asks which part of a container touches the contents, and that
    # was the right first question while this front was about packaging. It is
    # the wrong one for an object that is made of a single stated material: a
    # stainless steel bowl has no part that is not stainless steel, so there is
    # nothing left to establish. Rule 5.4, a fully specified inert material is
    # the complete safety case. Only a single material qualifies; the moment a
    # name lists two, which one is in contact is a real question again.
    single = [m.strip() for m in re.split(r"[,^/;+&]|\band\b", raw) if m.strip()]
    if (len(single) == 1 and str(pack.get("source") or "") == "product name"
            and not VISCOSE_FIBRE.search(single[0])):
        term, rank = classify(single[0])
        if term is not None and rank == 0:
            return "pass", (f"Made of {pretty(term)}, which the product name states, "
                            "and which puts nothing into what it touches")
        if term is not None:
            contact = "yes"

    if contact in ("no", "false", "none"):
        return "pass", "Nothing the product touches is plastic"
    if contact not in ("yes", "true"):
        return None, "We have not established what the product actually touches"

    # Rule 3.9, a treatment the maker states is part of the material. A car seat
    # cover reads polyester whether or not a flame retardant was added to it, so
    # the fibre alone could not tell Doona's seat, whose FAQ says its materials
    # "do have flame retardants", from a seat sold free of them, and it sat at
    # careful. The maker's own statement is a primary source for a named hazard
    # in the part that touches a person, which fails the front under rule 2.1.
    # Recorded as `treatment` with `treatmentSource`; a denial ("flame retardant
    # free") is stripped before matching, and nothing is read off our own prose.
    treatment = NEGATED.sub(" ", str(pack.get("treatment") or "").lower())
    if treatment.strip() and str(pack.get("treatmentSource") or "").strip():
        named = [h for h in _apr.HAZARD if h in treatment]
        if named:
            return "fail", (f"The maker states it is treated with {max(named, key=len)}, "
                            "a named hazard, in the part that touches a person")

    # Rule 3.12. Keyed on the row's own category, not the brand's, which files
    # Evenflo's seat under baby bottles. The polymer matrix and 3.11 never run on
    # a car seat: its fibre is a disclosed fact, not the verdict.
    if str(pack.get("rowCategory") or "").strip().lower() == "car seats":
        return _car_seat_front(pack)

    parts = [m.strip() for m in re.split(r"[,^/;+&]|\band\b", raw) if m.strip()]
    # Rule 3.11. A viscose process fibre against the skin for hours is a caution
    # unless a certification that tests the finished product is recorded; off the
    # body it is plant fibre. Judged apart from the other parts, then combined.
    vis = [m for m in parts if VISCOSE_FIBRE.search(m)]
    fibre = (f"{vis[0]} (the maker does not say whether it is lyocell or modal)"
             if vis and not re.search(r"viscose|rayon|modal", vis[0], re.I) else (vis[0] if vis else ""))
    if vis:
        use = str(pack.get("use") or "").strip().lower().replace("_", "-").replace(" ", "-")
        cert = str(pack.get("certification") or "").strip()
        certified = bool(FINISHED_PRODUCT_CERT.search(cert)) and bool(str(pack.get("certificationSource") or "").strip())
        if use in ("never-on-body", "not-on-body", "no-body-contact"):
            vstatus, vreason = "pass", f"{fibre}, a plant fibre off the body"
        elif certified:
            vstatus, vreason = "pass", f"{fibre} against the skin, with {cert} testing the finished product"
        else:
            vstatus, vreason = "caution", (f"{fibre} against the skin with no certification that "
                                           "tests the finished product (rule 3.11)")
        rest = [m for m in parts if m not in vis]
        if not rest:
            return vstatus, vreason
        rstatus, rreason = _assess_container(dict(pack, material=", ".join(rest)))
        order = {"fail": 3, "caution": 2, "pass": 1}
        if rstatus is None:
            return (vstatus, vreason) if vstatus == "caution" else (None, rreason)
        if order[rstatus] >= order[vstatus]:
            return rstatus, f"{rreason}; {vreason}"
        return vstatus, f"{vreason}; {rreason}"
    ranks = [classify(m) for m in parts]
    mixed = any(r for t, r in ranks if r) and any(t and r == 0 for t, r in ranks)
    if mixed and pack.get("contactFrom") != "recorded":
        # Question 3 asks what the parts in contact are made of, and a listing
        # names every part without saying which. 24Bottles is single wall
        # stainless with a plastic cap: taking the worst part called a good
        # bottle a caution, and taking the best would be worse. Which part is in
        # the drink path is a fact somebody has to establish.
        return None, (f"The listing names {raw}, and we have not established which of "
                      "those the contents actually touch")

    material = worst(raw)
    term, rank = classify(material)
    # Aluminium is scored as its lining (rule 3.1): bottles, cans and tubes are
    # coated inside with a resin, so it sits with the polyolefins. Only a maker's
    # statement that the container is unlined makes it bare metal, and inert.
    if term in ("aluminum", "aluminium") and str(pack.get("lining") or "").strip().lower() in ("none", "unlined", "uncoated"):
        term, rank = "metal", 0
    if term is None:
        return None, "The contact material is not recorded"
    # Rule 2.1 disclosure, on an object rather than a recipe. A composite is
    # glued, and the glue is in the contact path with the wood. Where the record
    # says the binder is undisclosed, that is a recorded finding and caps at
    # caution: Astercook and Kitsure carried a hand written careful for exactly
    # this while their evidence described only the bamboo.
    if str(pack.get("binder") or "").strip().lower() in ("undisclosed", "unnamed", "unknown"):
        return "caution", (f"{pretty(term)} bonded with an adhesive the maker does not name, "
                           f"in the same contact path as the {pretty(term)}")

    if rank == 0:
        return "pass", f"In contact with {pretty(term)}, which puts nothing into what it holds"

    base = str(pack.get("base") or "").strip().lower()
    heated = bool(pack.get("heated"))
    mouthed = bool(pack.get("mouthed"))
    # `reuse` is recorded but moves nothing. A pitcher refilled daily for years
    # holds the same water in the same polymer as one filled once, and rule 3.1
    # scores that pairing. Counting repetition as a step worse was never written
    # in the rulebook; it held the Clearly Filtered pitcher at careful for water
    # in Tritan, which the matrix passes.

    # Rule 3.3, exposure route gives relief. What migrates out of the bottle
    # only matters in proportion to how much of it stays on a person: a body
    # wash is diluted and rinsed down the drain, a laundry powder never touches
    # skin at all. Recorded as a fact, `use`, so a person states the route
    # rather than a regex guessing it from the name.
    use = str(pack.get("use") or "").strip().lower().replace("_", "-").replace(" ", "-")
    relief = 2 if use in ("never-on-body", "not-on-body", "no-body-contact") else (
        1 if use in ("rinse-off", "rinsed-off", "rinse") else 0)

    # An object is not a container.
    #
    # This matrix exists because contents extract from a polymer, so it asks
    # what is inside and defaults to caution when nobody has said. For a diaper
    # or a mat nothing is inside: the product IS the surface, and the only
    # route is the contact the exposure model already scores. Cautioning those
    # for a blank field marked them down for missing information, which the
    # standard forbids everywhere else, and it did it to every disposable
    # diaper equally, which tells a shopper nothing about any of them.
    if str(pack.get("holds") or "").strip().lower() == "none":
        drivers = []
        if heated:
            drivers.append("heat")
        if mouthed:
            drivers.append("being mouthed or chewed")
        if rank <= 1 and not drivers:
            return "pass", (f"Made of {pretty(term)}, with nothing inside it to pull anything "
                            "out. What that contact means is the exposure read")
        if rank <= 1:
            return "caution", (f"{pretty(term)} against the skin, with "
                               + ", ".join(drivers))
        return ("fail" if rank >= 2 and len(drivers) >= 2 else "caution"), (
            f"{pretty(term)} in direct contact"
            + (", with " + ", ".join(drivers) if drivers else ""))

    if not base:
        # An unrecorded contents field is a gap, not a finding. The matrix
        # needs two axes and we only have one: without knowing whether the
        # tube holds a dry stick or a face oil, "caution" is not a reading of
        # the product, it is a reading of our own missing note. Rule 5.6, and
        # the same mistake the `holds == none` branch above was fixed for.
        # This cautioned two aluminium-free deodorants and a mineral bronzer
        # for the crime of having a blank field.
        return None, (f"{pretty(term)} in contact, and we have not recorded what it "
                      "holds, so the matrix has only one of the two axes it needs")

    # Rule 3.1, the matrix itself, exactly as the rulebook prints it. Contents
    # down the side by how hard they pull, polymer across by what it has to
    # give. Until September 2026 this function scored by adding weights, which
    # agreed with the matrix on oils and heat but cautioned every aqueous
    # toner and every leave-on wash in a polyolefin bottle that the rulebook
    # passes, and never said what it did with an emulsion at all. The prose
    # classifier in audit-product-rules.py had the grid all along; the
    # recorded-evidence path now reads the same one.
    PULL = {
        "dry": 0, "solid": 0, "powder": 0, "dry powder": 0, "bar": 0, "tablet": 0,
        "aqueous": 1, "water": 1, "gel": 1, "toner": 1, "hydrosol": 1,
        "surfactant": 2, "wash": 2, "cleanser": 2, "shampoo": 2,
        "alcohol": 2, "spray": 2, "sanitizer": 2, "acidic": 2, "acid": 2,
        "emulsion": 3, "lotion": 3, "cream": 3, "conditioner": 3, "milk": 3,
        "anhydrous": 4, "oil": 4, "oily": 4, "fatty": 4, "balm": 4, "butter": 4,
        "salve": 4, "ointment": 4,
    }
    if base not in PULL:
        return None, (f"{pretty(term)} in contact with contents recorded as \"{base}\", which "
                      "is not a row of the matrix (dry, aqueous, surfactant, alcohol, acidic, "
                      "emulsion or anhydrous)")
    pull = PULL[base]
    col = 3 if rank >= 2 else (2 if rank > 1 else 1)
    GRID = {
        (0, 1): "pass", (0, 2): "pass", (0, 3): "caution",
        (1, 1): "pass", (1, 2): "pass", (1, 3): "caution",
        (2, 1): "pass", (2, 2): "caution", (2, 3): "fail",
        (3, 1): "caution", (3, 2): "caution", (3, 3): "fail",
        (4, 1): "caution", (4, 2): "fail", (4, 3): "fail",
    }
    ROW = {0: "dry", 1: "aqueous", 2: "surfactant or alcohol", 3: "emulsion", 4: "anhydrous"}
    status = GRID[(pull, col)]
    bits = [f"{ROW[pull]} contents in {pretty(term)}"]
    worse = {"pass": "caution", "caution": "fail", "fail": "fail"}
    softer = {"fail": "caution", "caution": "pass", "pass": "pass"}
    # Rule 3.2, heat moves everything one step worse; a chewed spout is
    # abrasion.
    if heated:
        status = worse[status]; bits.append("heated in use")
    if mouthed:
        status = worse[status]; bits.append("mouthed or chewed")
    for _ in range(relief):
        status = softer[status]
    if relief:
        bits.append("diluted and rinsed, never left on skin" if relief == 2 else "rinsed off")

    # Rule 3.6. Where the format has no non plastic version on the market, the
    # polymer is a note and not a cap: the shopper could not have done anything
    # about it, so flagging it ranks a good product level with a bad one and
    # tells them nothing. The rule was written in docs/rating-rules.md months
    # ago and implemented in none of the three rule files, which is why APEC's
    # reverse osmosis system sat at careful for the only way an undersink RO is
    # built. Availability is the test, not inconvenience: deodorant sticks are
    # NOT here, because Wild sells one in a paperboard cartridge.
    if status in ("caution", "fail") and no_alternative(pack):
        return "pass", (", ".join(bits) + ", and no version of this format exists without it, "
                        "so it is recorded rather than counted")
    return status, ", ".join(bits)


def assess(pack):
    """Rule 3.10 wraps the four questions: a dispenser is noted, not counted.

    `dispenser` is recorded apart from `material`, so the container decides the
    front and the pump, dip tube, dropper or spray head only reaches the card.
    Osea's glass bottles had been scored on their plastic pumps, a part no
    shopper can buy without and a surface far smaller than the bottle's.
    """
    status, reason = _assess_container(pack)
    disp = str(pack.get("dispenser") or "").strip()
    if disp and status is not None:
        reason = f"{reason}; the {disp} is noted and does not count (rule 3.10)"
    return status, reason


# Formats that do not exist without plastic in the contact path. Each one is
# here because we looked for a version without it and there is not one, not
# because a better version would be inconvenient.
NO_PLASTIC_ALTERNATIVE = (
    # Every undersink reverse osmosis system on the market uses polymer
    # housings, a polyamide membrane and plastic tubing. There is no steel or
    # glass equivalent, and filtering through plastic removes far more than the
    # housing can contribute, which is the rule 5.7 trade off.
    "reverse osmosis", "under sink", "undersink", "under the sink",
    # Breast pumps and passive milk collectors: every one sold is silicone or
    # plastic. A search on 2026-09-11 for glass or steel versions returned
    # bottles and pitchers, never a pump or a collector.
    "breast pump", "milk collector", "milk catcher",
    # Stick foundation, cream blush and mineral bronzer, the worked example in
    # the rulebook: an anhydrous formula in a twist up tube is the only way the
    # format exists.
    "stick foundation", "foundation stick", "cream blush", "mineral bronzer",
    "bronzer stick", "concealer stick",
)


def no_alternative(pack):
    hay = " ".join(str(pack.get(k) or "") for k in ("product", "_product", "format", "category")).lower()
    return any(w in hay for w in NO_PLASTIC_ALTERNATIVE)


# Exposure types that name a thing you swallow or leave on your body. These
# have an ingredient list and formula is a real question. Everything else is an
# object, and objects are answered by the materials front.
# Exposure types that are an object rather than a recipe. A kettle, a bowl, a
# mat: nothing to list, so formula is `none` and the materials front carries
# the whole question.
# Categories that are a device, whatever the exposure model calls them. A
# shower filter is typed "drinking water" because that is what it acts on, and
# an air purifier "air appliance", but neither has an ingredient list. The type
# describes what reaches a person, which is the right question for exposure and
# the wrong one for whether a recipe exists.
# Brand categories that are objects. A cookware brand has no ingredient list,
# so a "Formula: PFAS free" line on its card is the materials answer wearing
# the wrong label, and 143 cookware brands were carrying one. Textiles, tools,
# furniture and drinkware are the same: what they are made of is the question,
# and materials is where it belongs.
DURABLE_BRAND_CATS = {
    "Cookware", "Bakeware", "Appliances", "Espresso machine", "Kitchen",
    "Food storage", "Baby food storage", "Baby food prep", "Cutting boards",
    "Tableware", "Tableware / bibs", "Tableware / toys", "Drinkware",
    "Water bottles", "Toddler drinkware", "Coolers", "Baby bottles",
    "Breast milk storage", "Reusable coffee pod", "Drying rack",
    "Water filter", "Showerheads / filters", "Water test kit",
    "Air purifier", "Vacuum", "Laundry microfiber filter",
    "Activewear", "Activewear / basics", "Activewear / socks", "Apparel",
    "Swimwear", "Swim diapers", "Socks", "Base layers", "Kids clothing",
    "Baby clothing", "Sun hats", "Kids sun hats", "Baby sun hats",
    "Sleepwear / basics", "Bedding / sleepwear", "Basics", "Bedding / basics",
    "Bedding", "Pillow / bedding", "Mattress", "Bedroom", "Home textiles",
    "Bath textiles", "Beach towels", "Beach blankets", "Beach textiles",
    "Curtains", "Shower curtains", "Rugs", "Play mats", "Nursing pillows",
    "Baby textiles", "Baby textiles / teethers", "Baby sleep", "Nursery",
    "Nursery furniture", "High chairs", "Car seats", "Car seats / sleep",
    "Car seats / strollers", "Strollers", "Baby carriers", "Home",
    "Toys", "Beach toys", "Teethers", "Pacifiers", "Yoga mats", "Fitness",
    "Beach seating", "Beach shade", "Beach shade / seating", "Beach gear",
    "Beach bags", "Bath accessories", "Razors", "Pumping",
}

# Types recorded for one product in data/exposure.json. They outrank the
# category, which files jars, kettles and brushes beside food and soap.
PRODUCT_TYPES = json.load(open(ROOT / "data" / "exposure.json")).get("products", {})

DEVICE_CATS = {
    "Water filters", "Air purifiers", "Vacuums", "Air fryers",
    "Kitchen appliances", "Humidifiers", "Toothbrushes",
}

# Manufactured articles with no ingredient list, which are still consumed in
# the sense that you throw them away. A diaper is not a formulation: what it is
# made of is the materials check. Some diapers do add a lotion or a fragrance,
# and that is a real formula finding, so only an unearned PASS is wrong here.
# Categories where the formula question does not apply, because the product is
# a thing rather than a formulation. Keyed on category, not exposure type: the
# type names the route, so a laundry detergent reads as "worn textile" and a
# razor as "rinse-off skin", and keying on it marked 17 detergents as having no
# ingredient list while a kettle got a formula caution.
NO_INGREDIENT_CATS = {
    "Air fryers", "Air purifiers", "Baby bottles", "Baby sleep", "Bedding",
    "Breast milk storage", "Car seats", "Clothing", "Cookware",
    "Crib mattresses", "Cribs & nursery", "Cutting boards", "Dental floss",
    "Diapers", "Food storage", "Kitchen appliances", "Menstrual cups",
    "Pacifiers", "Play mats", "Pumping", "Razors", "Shower curtains", "Strollers", "Tableware",
    "Teethers", "Toothbrushes", "Toys", "Vacuums", "Water bottles",
    "Water filters", "Yoga mats",
}

# Formulations. The question applies and only a label read may answer it.
FORMULA_CATS = {
    "Baby food", "Baby formula", "Baby lotion", "Baby wipes", "Body lotion",
    "Bottled water", "Chewing gum", "Cleaning products", "Conditioner",
    "Deodorant", "Diaper cream", "Electrolytes", "Laundry detergent", "Makeup",
    "Pantry", "Prenatal vitamins", "Sea salt", "Shampoo", "Skincare", "Soap",
    "Sunscreen", "Supplements", "Tea", "Toothpaste",
}

DURABLE_TYPES = {
    "air appliance", "equipment", "floss", "food surface", "food vessel",
    "heated cookware", "heated vessel", "mouthed object", "oral appliance",
    "reusable bottle", "room textile", "slept on", "wet room textile",
    "worn gear", "worn textile",
}

CONSUMED = {
    "chewed supplement", "chewing gum", "drinking water", "food", "hot drink",
    "leave-on face", "leave-on skin", "mouth rinse", "rinse-off skin",
    "sprayed", "sunscreen", "supplement", "toothpaste",
}

CONSUMABLE = re.compile(
    r"cosmetic|personal care|sunscreen|skincare|supplement|bottled water|baby food|"
    r"snack|pantry|formula|electrolyte|oral care|toothpaste|mouthwash|floss|cleaning|"
    r"laundry|dish|coffee|tea|salt|spice|protein|diaper cream|lotion|balm|soap|shampoo|"
    r"conditioner|deodorant|wipe|honey|chocolate|diaper|period", re.I)


def read_formula(entry, cat=""):
    """
    Return (status, why, origin) for the formula front from a recorded list.

    Section 2 is explicit that a prose summary may warn but never clear, and
    that is not a nicety. Osea's cleanser was rated good on the phrase "no
    synthetic polymers" while its own note admits a plastic pump, and three
    products were failed on notes that say the hazard is absent: Newton Baby on
    "no chemical flame retardants", Quut on "BPA, phthalate and PVC free",
    Branch Basics on a sentence about washing formaldehyde OUT of clothing.

    So the two directions are not symmetric here either. A recorded list can
    clear a product or convict it. Marketing prose can only ever warn, and
    warns at caution, because rule 6 caps an inferred adverse reading.
    """
    fm = entry.get("formula") or {}
    if fm.get("asinMismatch"):
        return None, ("The listing we hold for this product serves a different item, "
                      f"{fm['asinMismatch']}"), None, []

    text = fm.get("ingredients") or ""
    # A recorded "list" that is only a web address, or the scraper's own "no
    # ingredients found", is not a list. Lysol's spray carried
    # "Visit www.rbnainfo.com" and passed its formula check on it.
    if (re.fullmatch(r"[\s\W]*(visit\s+)?(https?://)?(www\.)?[\w.-]+\.(com|org|net)[\s\W]*",
                     text.strip(), re.I)
            or text.strip().lower() == "no ingredients found"):
        text = ""
    # The scraper appends its own "No ingredients found" after a list it did
    # find. Blanking the whole value on that substring threw away Lysol's real
    # panel, quat and all, and left the stale pass standing.
    text = re.sub(r",?\s*no ingredients found\s*$", "", text, flags=re.I)
    complete = bool(fm.get("complete")) and bool(text)
    if not complete:
        text = fm.get("prose") or ""
        if not text:
            return None, "No ingredient list recorded", None, []

    low = text.lower()

    # The 26 fragrance allergens the EU requires to be listed separately once
    # they pass a threshold. INCI puts them after the umbrella as their own
    # entries rather than inside a bracket, which is the convention almost every
    # brand follows, and spelled_out only ever looked inside the bracket.
    EU_ALLERGENS = (
        "limonene", "linalool", "citral", "citronellol", "geraniol", "eugenol",
        "coumarin", "farnesol", "benzyl alcohol", "benzyl benzoate",
        "benzyl salicylate", "benzyl cinnamate", "cinnamal", "cinnamyl alcohol",
        "hydroxycitronellal", "isoeugenol", "amyl cinnamal", "anise alcohol",
        "hexyl cinnamal", "butylphenyl methylpropional", "alpha-isomethyl ionone",
        "methyl 2-octynoate", "evernia prunastri", "evernia furfuracea",
        "amylcinnamyl alcohol", "cinnamyl cinnamate",
    )
    SOURCE_STATED = (
        "essential oil", "natural essential", "from natural", "plant derived",
        "plant-derived", "derived from natural", "of natural origin",
    )

    def allergens_named(text):
        """Rule 2.1a. Umbrella term, but the allergens are named and sourced.

        Weleda's Salt Toothpaste ends "Flavor (Aroma)*, Limonene*, Linalool*"
        with "*From natural essential oils". Nothing is concealed that the
        reader could act on: the two sensitisers present are named, and the
        source is stated. It was held at careful anyway, because our check only
        looked inside a bracket immediately after the word.

        Both halves are required. Naming allergens without a source still
        leaves the mixture unexplained, and claiming a natural source without
        naming anything is marketing, which is what Wild does.
        """
        named = sum(1 for a in EU_ALLERGENS if a in text)
        sourced = any(p in text for p in SOURCE_STATED)
        return named >= 1 and sourced

    def spelled_out(text, end):
        """Does the umbrella name its own contents right after itself?

        "Parfum (Citrus Dulcis Extract, Amyris Balsamifera Bark Oil, Coriandrum
        Sativum Fruit Oil...)" is not a disclosure failure. Rule 2.1 objects to
        the standing in, and here nothing stands in: every component is named.
        Natracare's baby wipes were held at careful for a word that is followed
        by its own seven-ingredient breakdown.

        Two or more comma separated items in the bracket, so "fragrance (natural)"
        still counts as hiding.
        """
        rest = text[end:end + 400].lstrip()
        if not rest.startswith("("):
            return False
        depth, inner = 0, []
        for ch in rest:
            if ch == "(":
                depth += 1
                if depth == 1:
                    continue
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    break
            if depth >= 1:
                inner.append(ch)
        body = "".join(inner)
        return len([x for x in body.split(",") if x.strip()]) >= 2

    def hits(terms):
        out = []
        for t in terms:
            rx = re.compile(r"(?<![a-z0-9])" + re.escape(t) + r"s?(?![a-z0-9])")
            for m in rx.finditer(low):
                if _bf.is_negated(low, m.start(), m.end(), lists=True):
                    continue
                if t in _apr.DISCLOSURE_FAILURE and (
                        spelled_out(low, m.end()) or allergens_named(low)):
                    continue
                out.append(t)
                break
        return out

    named = hits(_apr.HAZARD)
    hidden = hits(_apr.DISCLOSURE_FAILURE)
    # Category scoped cautions: a documented downside in this category only.
    # Runs on the recorded list like the hazard scan, with the same negation
    # guard, so "no palm oil" on a clean label never trips it.
    scoped_cautions = _apr.CATEGORY_CAUTION.get(cat, {})
    scoped = hits(list(scoped_cautions))

    if not complete:
        # A hazard word in description copy is not a formula finding, and the
        # sentence this used to emit said so out loud: "a reading of marketing
        # copy and not of the label". It still capped the verdict.
        #
        # It read the word "plastic" off a Fellow kettle listing whose own note
        # says zero plastic contact and a verified 304 stainless water path, and
        # held it at careful. Same for two all-metal safety razors and a
        # stainless baby food maker. Five products, all held back by a finding
        # that admitted it was not evidence.
        #
        # A hazard named in copy is worth recording where it points, which is
        # what the thing is made of, so it is left for the materials front and
        # for a person. Formula stays unanswered until somebody reads a label.
        return None, ("The listing publishes no ingredient list, only description copy, "
                      "which can warn but cannot clear"), None, []

    if named:
        return ("fail", "The published ingredient list names "
                + ", ".join(sorted(named)[:4]), "database", sorted(named))
    if scoped:
        return ("caution", "The published ingredient list includes "
                + scoped_cautions[sorted(scoped)[0]], "database", sorted(scoped))
    if hidden:
        return ("caution", "The published ingredient list hides composition behind "
                + ", ".join(sorted(hidden)[:3]), "database", sorted(hidden))
    return "pass", "The published ingredient list carries nothing on the hazard list", "database", []


def keys_for(brand, product, ev=None):
    """The evidence keys for a row, best first.

    A row carries several ASINs for the same product: a two pack, a single, a
    variant. The first one listed is not the best one. Lysol's spray listed a
    two pack whose panel is a web address ahead of the single bottle that
    prints the real ingredient list, so the reader took the empty one and the
    quat conviction never landed. An entry with a complete formula comes first.
    """
    out = list(product.get("asins") or [])
    out.append(f"{brand}::{product.get('name')}")
    if ev:
        def rank(k):
            fm = (ev.get(k) or {}).get("formula") or {}
            return 0 if fm.get("complete") and fm.get("ingredients") else 1
        out.sort(key=rank)
    return out


def load():
    return json.loads(EVIDENCE.read_text()) if EVIDENCE.exists() else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--seed", action="store_true",
                    help="open an entry for every product that has none")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    ev = load()

    # Orphaned records first, before anything reads the file. A record keyed
    # by an ASIN the row has since dropped is still true of the product; only
    # the join broke. Under the Nile's cotton stuffies lost their listing, the
    # ASIN came off the row, and a GOTS cotton pass fell to unassessed. Every
    # record carries the product's label, so find it by that and re-key it to
    # the name, which a row cannot lose. Done here so the loop below reads the
    # recovered record in the same run rather than the next one.
    rekeyed = 0
    for b in brands:
        for p in b.get("products") or []:
            e = p.get("ext") or {}
            fr = e.get("fronts") or {}
            if fr.get("materials") not in (None, "", "unassessed", "unknown") \
                    and (e.get("frontOrigin") or {}).get("materials") != "database":
                continue
            keys = keys_for(b["brand"], p, ev)
            if any((ev.get(k) or {}).get("materials") for k in keys):
                continue
            label = f"{b['brand']} {p.get('name') or ''}".strip().lower()
            orphan = next((v for k, v in ev.items()
                           if isinstance(v, dict) and v.get("materials") and k not in keys
                           and str(v.get("_product") or "").strip().lower() == label), None)
            if orphan:
                ev[f"{b['brand']}::{p.get('name')}"] = orphan
                rekeyed += 1
    if rekeyed:
        print(f"  orphaned records re-keyed to the product name: {rekeyed}")
        EVIDENCE.write_text(json.dumps(ev, indent=1, ensure_ascii=False, sort_keys=True) + "\n")

    if args.seed:
        added = 0
        for b in brands:
            for p in (b.get("products") or []):
                key = keys_for(b["brand"], p)[0]
                if key in ev:
                    continue
                # An empty entry is a question, not an answer. It names the
                # product and waits for a material.
                ev[key] = {"_product": f"{b['brand']} {p.get('name')}",
                           "materials": {"material": ""},
                           "formula": {"base": "", "use": ""}}
                added += 1
        if args.write:
            EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
            EVIDENCE.write_text(json.dumps(ev, indent=1, ensure_ascii=False, sort_keys=True) + "\n")
            print(f"opened {added} entries, {len(ev)} total")
        else:
            print(f"would open {added} entries. re-run with --write")
        return 0

    applied = collections.Counter()
    formula = collections.Counter()
    testing = collections.Counter()
    filled = 0
    for b in brands:
        for p in (b.get("products") or []):
            entry = next((ev[k] for k in keys_for(b["brand"], p, ev) if k in ev), None)
            if not entry:
                continue

            # Formula reads its own recorded list and is independent of the
            # material, so it runs whether or not a material is on file. The
            # category rides along for the category scoped cautions.
            cat = p.get("cat") or b.get("category") or ""
            f_status, f_why, f_origin, f_terms = read_formula(entry, cat)
            # A thing has no ingredient list, so there is nothing for the reader
            # to return and nothing to overwrite. Without this the reader cleared
            # 40 diapers back to unassessed on every run. A product recorded as
            # consumed is not a thing, whatever its category: Howard's mineral
            # oil conditioner sits under Cutting boards and has a label.
            if cat in NO_INGREDIENT_CATS and PRODUCT_TYPES.get(f"{b['brand']}::{p.get('name')}") not in CONSUMED:
                e = p.setdefault("ext", {})
                e.setdefault("fronts", {})["formula"] = "none"
                e.setdefault("frontNotes", {})["formula"] = (
                    "An object has no ingredient list. What it is made of is "
                    "the materials check.")
                e.setdefault("frontOrigin", {})["formula"] = "hand"
                f_why = None
            if f_why:
                e = p.setdefault("ext", {})
                e.setdefault("frontNotes", {})["formula"] = f_why + "."
                held = (e.get("fronts") or {}).get("formula")
                held_origin = (e.get("frontOrigin") or {}).get("formula")
                if f_status:
                    e.setdefault("fronts", {})["formula"] = f_status
                    e.setdefault("frontOrigin", {})["formula"] = f_origin
                    formula[f_status] += 1
                elif held in (None, "unknown", "unassessed") or (
                        held == "pass" and held_origin == "inferred"):
                    # Nothing recorded clears a front that was never established,
                    # and it withdraws an inferred pass, which section 2 says
                    # prose could not have granted in the first place. It must
                    # not touch a stated or hand finding, or an adverse one:
                    # a silent Amazon listing is not evidence against them.
                    e.setdefault("fronts", {})["formula"] = "unassessed"
                    e.setdefault("frontOrigin", {}).pop("formula", None)
                    formula["unassessed"] += 1
                else:
                    # Leave a stated or adverse finding exactly as it stands,
                    # and drop the note this run would have written over it.
                    # This must not skip the product: materials is a separate
                    # front and still has to be assessed below.
                    formula["left as recorded"] += 1
                    e.setdefault("frontNotes", {}).pop("formula", None)
                fm = entry.get("formula") or {}
                # Save the list AND the reading of it. A stored ingredient list
                # nobody has judged is a document, not an answer; a stored
                # verdict with no list behind it is an assertion. Keeping both
                # together is what lets a person check our work in one glance.
                WORD = {"pass": "good", "caution": "careful", "fail": "bad"}
                held = (e.get("fronts") or {}).get("formula")
                e["formulaAnswers"] = {
                    "ingredients": fm.get("ingredients") or "",
                    "prose": "" if fm.get("ingredients") else (fm.get("prose") or ""),
                    "complete": bool(fm.get("complete") and fm.get("ingredients")),
                    "verdict": WORD.get(f_status or held, "open"),
                    "summary": f_why + "." if f_why else "",
                    "flagged": f_terms,
                    "source": fm.get("source") or "",
                    "checked": fm.get("checkedListing") or "",
                }

            test = entry.get("testing") or {}
            # The measurements themselves, where a person recorded them from the
            # lab report. A card that says "independent testing found lead" is
            # weaker than one that shows 76.53 ppb at a stated limit, and the app
            # already renders ext.testingResults as "What the lab measured".
            # Carried whether or not a status is set: a number is a fact before
            # anyone decides what it means.
            if test.get("results"):
                p.setdefault("ext", {})["testingResults"] = test["results"]
                if test.get("lod"):
                    p["ext"]["testingLod"] = test["lod"]
            if test.get("status"):
                te = p.setdefault("ext", {})
                te.setdefault("fronts", {})["testing"] = test["status"]
                te.setdefault("frontOrigin", {})["testing"] = "database"
                if test.get("note"):
                    te.setdefault("frontNotes", {})["testing"] = test["note"]
                    te["testingNote"] = test["note"]
                # When the lab measured it, not when we read the result. The
                # ceiling weighs this date against a legal finding's, and our
                # own reading date made Lead Safe Mama's July 2025 test of
                # Primally Pure's sun cream look newer than the NAD referral of
                # September 2025 that it could not have answered.
                years = [int(str(r.get("year"))[:4]) for r in (test.get("results") or [])
                         if str(r.get("year") or "")[:4].isdigit()]
                when = test.get("tested") or (str(max(years)) if years else test.get("checked"))
                if when:
                    te["testingDate"] = when
                testing[test["status"]] += 1

            pack = entry.get("materials") or {}
            if not pack:
                continue
            # Rule 3.6 asks what the format is, and the format is named on the
            # entry rather than inside the materials block. Without this the
            # rule could never fire on anything.
            pack = dict(pack, _product=entry.get("_product") or "",
                        category=(b.get("category") or ""),
                        # Rule 3.12 reads the row's own category and its test
                        # record; `category` stays the brand's, which 3.6 reads.
                        rowCategory=(p.get("cat") or ""),
                        _testing=(entry.get("testing") or {}))
            status, reason = assess(pack)
            filled += 1
            if status is None:
                held = (p.get("ext", {}).get("fronts") or {}).get("materials")
                held_origin = (p.get("ext", {}).get("frontOrigin") or {}).get("materials")
                # A "database" answer can only have come from this record, read
                # the way it used to be read. When the same record now answers
                # nothing, that answer is stale: MARA's face oil kept a fail
                # for a dropper "pipette" read as PET after the word match was
                # fixed and the record said, as it always had, that no material
                # is published.
                if held in ("pass", "caution", "fail") and held_origin not in ("inferred", "database"):
                    # Rule 5.4 answers a durable good's material from the object
                    # itself, and a person may have answered it by hand. Having
                    # no row in the evidence file is not a finding against
                    # either: absence of a record is not a record of absence.
                    # Writing unassessed here withdrew 85 recommendations that
                    # a rule had already answered correctly.
                    applied["left as derived"] += 1
                    continue
                applied["unassessed"] += 1
                # Not knowing is a state worth recording, so the view can show
                # what still needs answering rather than an empty cell that
                # looks the same as a pass.
                e = p.setdefault("ext", {})
                # An unanswered question has to clear the old answer too, or a
                # stale caution sits under a note saying we do not know.
                e.setdefault("fronts", {})["materials"] = "unassessed"
                e.setdefault("frontOrigin", {}).pop("materials", None)
                e.setdefault("frontNotes", {})["materials"] = reason + "."
                e.pop("materialsList", None)
                e["materialAnswers"] = {
                    "contact": pack.get("contact") or "",
                    "contactFrom": pack.get("contactFrom") or "",
                    "base": pack.get("base") or "",
                    "heated": bool(pack.get("heated")),
                    "mouthed": bool(pack.get("mouthed")),
                    "reuse": pack.get("reuse") or "",
                    "use": pack.get("use") or "",
                    "binder": pack.get("binder") or "",
                    "material": pack.get("material") or "",
                    "treatment": pack.get("treatment") or "",
                    "treatmentSource": pack.get("treatmentSource") or "",
                    "dispenser": pack.get("dispenser") or "",
                    "lining": pack.get("lining") or "",
                    "certification": pack.get("certification") or "",
                    "certificationSource": pack.get("certificationSource") or "",
                    "source": pack.get("source") or "",
                    "checked": pack.get("checked") or pack.get("checkedListing") or "",
                    "open": reason,
                    # Rule 3.12's facts, only where recorded, so other rows do not churn.
                    **{k: pack[k] for k in ("certificateNumber", "frFree", "frFreeSource",
                                            "pfasFree", "pfasFreeSource") if pack.get(k)},
                }
                continue
            e = p.setdefault("ext", {})
            e.setdefault("fronts", {})["materials"] = status
            e.setdefault("frontNotes", {})["materials"] = reason + "."
            e.setdefault("frontOrigin", {})["materials"] = "database"
            mat = worst(pack.get("material"))
            if mat:
                e["materialsList"] = ", ".join(
                    x.strip() for x in re.split(r"[,^/;+&]", str(pack.get("material"))) if x.strip())
            # Keep the answers, not just the conclusion. A mark with no working
            # is the same problem as a status with no note: you have to take it
            # on trust, and you cannot tell a researched answer from a default.
            e["materialAnswers"] = {
                "contact": pack.get("contact"),
                "contactFrom": pack.get("contactFrom") or "recorded",
                "base": pack.get("base") or "",
                "heated": bool(pack.get("heated")),
                "mouthed": bool(pack.get("mouthed")),
                "reuse": pack.get("reuse") or "",
                "use": pack.get("use") or "",
                "material": pack.get("material") or "",
                "treatment": pack.get("treatment") or "",
                "treatmentSource": pack.get("treatmentSource") or "",
                    "dispenser": pack.get("dispenser") or "",
                    "lining": pack.get("lining") or "",
                    "certification": pack.get("certification") or "",
                    "certificationSource": pack.get("certificationSource") or "",
                "source": pack.get("source") or "",
                "checked": pack.get("checked") or pack.get("checkedListing") or "",
                **{k: pack[k] for k in ("certificateNumber", "frFree", "frFreeSource",
                                        "pfasFree", "pfasFreeSource") if pack.get(k)},
            }
            applied[status] += 1

    # Brand cards carry fronts too, and a brand card is what somebody sees when
    # we hold no verdict on the exact product. Lodge showed "Formula: PFAS
    # free" on a cast iron skillet.
    nobf = 0
    for b in brands:
        if (b.get("category") or "") not in DURABLE_BRAND_CATS:
            continue
        fr = b.get("fronts")
        if not isinstance(fr, dict):
            continue
        cur = fr.get("formula")
        status = cur.get("status") if isinstance(cur, dict) else cur
        if status in ("pass", "unknown", "unassessed", None, ""):
            fr["formula"] = {
                "status": "none",
                "note": ("A durable good has no ingredient list. What it is made of "
                         "is the materials check."),
                "origin": "database",
            }
            nobf += 1
    if nobf:
        print(f"  formula marked none on durable brands:   {nobf}")

    # A durable good has no ingredient list and never will. Section 5.4: its
    # formula is `none`, a completed check, not `unassessed`, a gap. Leaving it
    # as a gap makes a steel kettle wait forever for a recipe it does not have,
    # and reads to the shopper as a check we skipped.
    nofm, undone = 0, 0
    for b in brands:
        for p in (b.get("products") or []):
            e0 = p.get("ext") or {}
            # Correct the saved answer wherever the front already says `none`,
            # before any skip below can step over the row. These are decided
            # elsewhere and kept read_formula's "no ingredient list recorded",
            # which describes a gap where the front records a finding.
            if ((e0.get("fronts") or {}).get("formula")) == "none":
                fa = e0.get("formulaAnswers")
                if fa is not None and fa.get("verdict") != "n/a":
                    fa["verdict"] = "n/a"
                    fa["summary"] = ("A durable good has no ingredient list. "
                                     "What it is made of is the materials check.")
            etype = ((e0.get("exposure") or {}).get("type") or "").strip().lower()
            # A `none` this rule wrote before, on something that is not an
            # object after all. It has to come back off, or the correction only
            # ever applies to rows nobody had reached yet.
            # Note or no note. Some of these were written before the rule kept
            # one, so matching on the sentence missed exactly the rows that had
            # been wrong longest. A person's own scorecard is left alone.
            if (etype and etype not in DURABLE_TYPES
                    and ((e0.get("fronts") or {}).get("formula")) == "none"
                    and not e0.get("authored")):
                e0["fronts"]["formula"] = "unassessed"
                (e0.get("frontOrigin") or {}).pop("formula", None)
                (e0.get("frontNotes") or {}).pop("formula", None)
                fa = e0.get("formulaAnswers")
                if fa is not None and fa.get("verdict") == "n/a":
                    fa["verdict"] = "open"
                    fa["summary"] = "No ingredient list recorded."
                undone += 1

            cat = p.get("cat") or b.get("category") or ""
            # A type recorded for this product outranks its category, both
            # ways. Pantry and Coffee sent ComSaf's jars and Forlife's infuser
            # down the formulation branch; Cutting boards called Howard's
            # mineral oil conditioner an object with no ingredient list.
            ptype = PRODUCT_TYPES.get(f"{b['brand']}::{p.get('name')}")
            # Only a type that is eaten, drunk or put on skin makes it a
            # formulation. "diaper" is neither an object nor consumed, and the
            # Diapers category already answers it.
            if ptype and ptype in CONSUMED:
                e = p.setdefault("ext", {})
                if (e.get("fronts") or {}).get("formula") == "none":
                    e["fronts"]["formula"] = "unassessed"
                    (e.get("frontNotes") or {}).pop("formula", None)
                    (e.get("frontOrigin") or {}).pop("formula", None)
                continue
            if ptype in DURABLE_TYPES:
                etype = ptype
            else:
                ptype = None
            # Category decides whether the formula question applies, because
            # the exposure type names the route rather than the thing. Keyed on
            # type, a laundry detergent is a "worn textile" and got marked as
            # having no ingredient list, seventeen times over.
            if not ptype and cat in NO_INGREDIENT_CATS:
                e = p.setdefault("ext", {})
                e.setdefault("fronts", {})["formula"] = "none"
                e.setdefault("frontNotes", {})["formula"] = (
                    "An object has no ingredient list. What it is made of is "
                    "the materials check.")
                e.setdefault("frontOrigin", {})["formula"] = "hand"
                continue
            if not ptype and cat in FORMULA_CATS:
                # A formulation. Only a real label read may answer this, and a
                # stored "none" is the exposure type talking, so clear it and
                # leave the question open rather than assert an absence.
                e = p.setdefault("ext", {})
                if (e.get("fronts") or {}).get("formula") == "none":
                    e["fronts"]["formula"] = "unassessed"
                    (e.get("frontNotes") or {}).pop("formula", None)
                    (e.get("frontOrigin") or {}).pop("formula", None)
                continue

            if (p.get("cat") or "") in DEVICE_CATS:
                etype = ""   # judged as an object below, whatever its type says

            if etype:
                # An allowlist, not an exclusion.
                #
                # This used to mark formula `none` for any exposure type that
                # was not on the consumable list, which asserts "this has no
                # ingredient list" about things nobody checked. It stamped that
                # on diapers, whose wipes carry six published ingredients, and
                # on period products. Asserting a finding we have not
                # established is the one thing this file exists to prevent, so
                # only types that are unambiguously an object qualify, and
                # anything else stays unassessed.
                if etype not in DURABLE_TYPES:
                    continue
            else:
                entry = next((ev[k] for k in keys_for(b["brand"], p, ev) if k in ev), None)
                named = str(((entry or {}).get("materials") or {}).get("source") or "") == "product name"
                if not named and CONSUMABLE.search(f"{p.get('cat') or ''} {b.get('category') or ''}"):
                    continue
            e = p.setdefault("ext", {})
            fr = e.setdefault("fronts", {})
            # Overwrite a pass too, unless a person set it.
            #
            # A durable good having no ingredient list is a fact about the kind
            # of thing, not a judgement worth preserving, and a formula `pass`
            # on one is the materials answer wearing the wrong label: Lodge
            # read "Formula: PFAS free" on cast iron. Filling only blanks left
            # every row the classifier had already guessed at.
            blank = fr.get("formula") in (None, "", "unknown", "unassessed")
            # The front's own provenance, not the row's. `authored` means a
            # person signed off the scorecard, which is not the same as having
            # set every front in it: Lodge's row is authored and its formula
            # came from the classifier, marked `inferred`, and that combination
            # was enough to keep "PFAS free" on a cast iron skillet.
            origin = (e.get("frontOrigin") or {}).get("formula")
            mislabelled = fr.get("formula") == "pass" and origin != "hand"
            if blank or mislabelled:
                fr["formula"] = "none"
                e.setdefault("frontOrigin", {})["formula"] = "database"
                e.setdefault("frontNotes", {})["formula"] = (
                    "A durable good has no ingredient list. What it is made of "
                    "is the materials check.")
                # The saved answer has to agree with the front. read_formula ran
                # first and wrote "no ingredient list recorded", which is a gap;
                # this is a finding. A bottle is not missing a recipe.
                fa = e.get("formulaAnswers")
                if fa is not None:
                    fa["verdict"] = "n/a"
                    fa["summary"] = ("A durable good has no ingredient list. "
                                     "What it is made of is the materials check.")
                nofm += 1
    print(f"  formula marked none on durable goods: {nofm}")
    if undone:
        print(f"  stale none cleared off non-durables:   {undone}")

    # A "database" origin promises a record in this file. Where the record is
    # gone, because a harvester took back a reading its later guard rejected,
    # the front is standing on nothing and has to say so. The loop above only
    # visits rows that HAVE a record, so without this the Owala FreeSip kept a
    # stainless steel pass after the record behind it was withdrawn, and a
    # skip for plastic in the drink path had softened to careful.
    withdrawn = 0
    for b in brands:
        for p in b.get("products") or []:
            e = p.get("ext") or {}
            if (e.get("frontOrigin") or {}).get("materials") != "database":
                continue
            if any((ev.get(k) or {}).get("materials") for k in keys_for(b["brand"], p, ev)):
                continue
            e["fronts"]["materials"] = "unassessed"
            e["frontOrigin"].pop("materials", None)
            e.setdefault("frontNotes", {})["materials"] = (
                "The recorded material this front rested on was withdrawn, and nothing "
                "has replaced it.")
            e.pop("materialsList", None)
            e.pop("materialAnswers", None)
            withdrawn += 1
    if withdrawn:
        print(f"  materials fronts reset, their record withdrawn: {withdrawn}")

    total = sum(v for k, v in applied.items() if k != "skipped")
    print(f"entries in {EVIDENCE.relative_to(ROOT)}: {len(ev)}")
    print(f"  with a material recorded: {filled}")
    print(f"  materials derived from it: {total}   "
          + "  ".join(f"{k} {n}" for k, n in applied.items()))
    if testing:
        print(f"  testing read from a recorded check: {sum(testing.values())}   "
              + "  ".join(f"{k} {n}" for k, n in testing.items()))
    print(f"  formula derived from a recorded list: {sum(formula.values())}   "
          + "  ".join(f"{k} {n}" for k, n in formula.items()))
    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print("\nwrote brand-data.json")
    else:
        print("\ndry run. re-run with --write to apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
