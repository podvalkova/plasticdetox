#!/usr/bin/env python3
"""
Populate the four-front scorecard on every brand in brand-data.json.

The four fronts mirror the vetting standard used for every recommendation:
    formula    what the product is made of (ingredients, fibres, coatings, materials)
    packaging  what it ships and sits in (bottle, liner, lid, wrapper, housing)
    legal      recalls, class actions, lawsuits, regulatory action
    testing    third-party lab results and certifications

This reads only what the existing `reason`, `evidence` and `cautions` fields
already say. It never invents a finding. Anything it cannot attribute with
confidence stays "unknown", which the UI renders as "not assessed".

A brand whose `fronts` object carries `"authored": true` is skipped entirely.
Those were written by hand during research and outrank anything a classifier
could infer from prose. Extraction is a seeder for brands nobody has done that
work for yet, not a source of truth.

Precision matters far more than recall here: a wrong "fail" on a named brand
is the trade-libel exposure. When a fragment is ambiguous, we drop it.

    python3 tools/backfill-fronts.py            # report only, writes nothing
    python3 tools/backfill-fronts.py --write     # apply to brand-data.json
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

FRONTS = ("formula", "packaging", "legal", "testing")

# Vocabulary is matched on word boundaries against a lowercased fragment.
# Multi-word entries are matched as phrases.
CUES = {
    "formula": [
        "ingredient", "ingredients", "formula", "formulation", "made of", "made from",
        "fragrance", "parfum", "phthalate", "phthalates", "paraben", "parabens",
        "quats", "preservative", "preservatives", "dye", "dyes", "sulfate", "sls",
        "formaldehyde", "triclosan", "talc", "propylene glycol", "petrolatum",
        "avobenzone", "homosalate", "octisalate", "octocrylene", "oxybenzone",
        "chemical sunscreen", "chemical filter", "chemical filters", "mineral sunscreen",
        "zinc oxide", "titanium dioxide",
        "cotton", "linen", "hemp", "wool", "tencel", "lyocell", "bamboo", "silk",
        "polyester", "nylon", "acrylic", "spandex", "elastane", "polyurethane",
        "stainless", "cast iron", "carbon steel", "ceramic", "enamel", "enameled",
        "nonstick", "non-stick", "ptfe", "teflon", "pfoa", "coating", "coated",
        "pfas", "forever chemical", "forever chemicals",
        "silicone", "melamine", "bpa", "bps", "bpf", "phthalate-free",
        "polypropylene", "polyethylene", "polystyrene", "styrene", "pvc",
        "pet", "pla", "viscose", "rayon", "modal", "latex", "neoprene",
        "tpu", "eva", "abs", "substrate", "microplastic", "microplastics",
        "aluminium", "aluminum", "copper", "titanium",
        "sweetener", "sucralose", "aspartame", "natural flavor", "natural flavors",
        "seed oil", "seed oils", "additive", "additives", "fillers", "filler",
    ],
    "packaging": [
        "packaging", "packaged", "bottle", "bottled", "container", "canister",
        "lining", "liner", "lined", "can lining", "wrapper", "wrapped", "pouch",
        "sachet", "stick pack", "single-use", "lid", "lids", "cap", "caps",
        "carton", "tetra", "jar", "tube", "pump", "dispenser", "housing",
        "film", "seal", "sealed", "shrink wrap", "blister", "capsule shell",
        "plastic bottle", "pet bottle", "hdpe", "ldpe", "polycarbonate",
        "water path", "drink path", "straw", "gasket", "o-ring",
    ],
    "legal": [
        "recall", "recalled", "recalls", "class action", "lawsuit", "lawsuits",
        "sued", "suing", "litigation", "settlement", "settled", "consent decree",
        "cpsc", "fda warning", "warning letter", "attorney general", "court",
        "plaintiff", "complaint filed", "prop 65 warning", "proposition 65 warning",
        "injunction", "fined", "penalty", "ftc",
    ],
    "testing": [
        "tested", "testing", "test result", "test results", "lab", "laboratory",
        "screening", "screened", "assay", "third party", "third-party",
        "independent", "independently", "ppm", "ppb", "parts per million",
        "parts per billion", "detected", "detection", "non-detect", "nondetect",
        "below detection", "limit of detection",
        "certified", "certification", "certifies", "verified",
        "greenguard", "made safe", "gots", "oeko-tex", "oekotex", "ewg verified",
        "nsf", "iapmo", "ansi", "usp", "informed sport", "informed choice",
        "clean label project", "detox project", "glyphosate residue free",
        "leaping bunny", "b corp", "cradle to cradle", "ab 1200",
        "organic fluorine", "total fluorine", "heavy metal", "heavy metals",
        "lead", "cadmium", "arsenic", "mercury", "benzene",
        "dioxin", "dioxins", "furan", "furans", "pcb", "pcbs", "glyphosate",
        "anses", "greenpeace", "consumer reports", "mamavation", "ewg",
        "study", "studies", "screened", "flagged", "residue", "residues",
        "contaminant", "contaminants", "trace",
    ],
}

# Words that make a fragment negative for its front.
NEGATIVE = [
    "recall", "recalled", "class action", "lawsuit", "sued", "litigation",
    "settlement", "consent decree", "warning letter", "fined", "penalty",
    "detected", "highest", "elevated", "exceeded", "above the", "failed",
    "fails", "tested positive", "contamination", "contaminated",
    "nonstick", "non-stick", "ptfe", "teflon", "pfoa", "pfas", "forever chemical",
    "phthalate", "paraben", "bpa", "bps", "formaldehyde", "triclosan",
    "avobenzone", "homosalate", "octisalate", "octocrylene", "oxybenzone",
    "chemical sunscreen", "chemical filter", "polyester", "nylon", "acrylic",
    "plastic", "polycarbonate", "single-use", "cracked", "cracking", "leak",
    "leaks", "leaching", "leach", "sheds", "shedding", "wears down", "wear down",
    "undisclosed", "does not disclose", "no third party", "not certified",
    "not tested", "unclear", "concern", "concerns", "risk", "problem",
    "sucralose", "aspartame", "seed oil",
    "flagged", "trace", "residue", "residues", "contaminant", "contaminants",
    "polypropylene", "polyethylene", "polystyrene", "styrene", "pvc", "pla",
    "viscose", "rayon", "latex", "neoprene", "microplastic", "microplastics",
    "leached", "leaches", "migrates", "migration", "dioxin", "dioxins",
    "furan", "furans", "pcb", "pcbs", "glyphosate", "conventional",
]

POSITIVE = [
    "free of", "free from", "fragrance free", "fragrance-free", "phthalate free",
    "phthalate-free", "paraben free", "paraben-free", "plastic free",
    "plastic-free", "polyester-free", "pfas free", "pfas-free", "bpa free",
    "bpa-free", "no added", "no intentionally added", "no fragrance",
    "no quats", "no preservatives", "no dyes", "no flame retardants",
    "no pfas", "no lining", "no coating", "no plastic",
    "certified", "certification", "verified", "greenguard", "made safe",
    "gots", "oeko-tex", "oekotex", "ewg verified", "nsf", "iapmo", "ansi",
    "informed sport", "informed choice", "clean label project", "detox project",
    "glyphosate residue free", "leaping bunny", "cradle to cradle",
    "tested low", "tests low", "tests very low", "non-detect", "nondetect",
    "below detection", "no detect", "passes", "passed", "meets",
    "third party tested", "third-party tested", "independently tested",
    "organic cotton", "100% cotton", "stainless", "bare cast iron",
    "carbon steel", "glass", "tencel", "linen", "hemp", "wool",
    "no recall", "no cpsc recall", "no filed", "closed without",
    "discloses no", "no intentionally",
    "food grade", "food-grade", "medical grade", "inert", "unlined",
    "uncoated", "undyed", "untreated", "bare", "solid wood", "borosilicate",
]

# Cues that are strong enough on their own to claim a front even in a mixed
# fragment, because they are unambiguous about which front they speak to.
ANCHORS = {
    "legal": ["recall", "recalled", "class action", "lawsuit", "sued",
              "litigation", "settlement", "consent decree", "cpsc",
              "warning letter", "consent decree"],
    "testing": ["greenguard", "made safe", "gots", "oeko-tex", "oekotex",
                "ewg verified", "nsf", "iapmo", "ppm", "ppb", "organic fluorine",
                "total fluorine", "third party", "third-party", "independently",
                "clean label project", "detox project", "glyphosate residue free",
                "informed sport", "informed choice"],
    # AB 1200 is a disclosure law, but what gets disclosed is composition, so it
    # belongs to formula. Routing it here keeps both polarities on one front:
    # "discloses no intentionally added PFAS" passes, "discloses intentionally
    # added PFAS" fails.
    "formula": ["ab 1200"],
    "packaging": ["packaging", "bottle", "lining", "liner", "lid", "wrapper",
                  "pouch", "sachet", "stick pack", "housing", "water path",
                  "drink path", "carton", "tetra", "canister"],
}

# A negator anywhere in the short window before a hazard word flips it: the copy
# says the brand avoids the thing, not that it contains it. "no lead detected",
# "phthalate-free", "free of PFAS", "no intentionally added fluorine".
NEGATORS = [
    "no", "not", "never", "without", "zero", "free of", "free from",
    "avoids", "avoid", "removed", "excludes", "non", "nondetect", "non-detect",
]
# ...unless the sentence turns back on itself in between.
CONTRAST = ["but", "however", "though", "although", "while", "still", "yet", "despite"]

# Legal events serious enough to fail the front on a single un-negated mention.
HARD_LEGAL = [
    "recall", "recalled", "recalls", "class action", "lawsuit", "lawsuits",
    "sued", "litigation", "consent decree", "warning letter", "injunction",
]

WORD_RE_CACHE = {}


def has(fragment, term):
    """Word-boundary aware containment for single words and phrases."""
    key = term
    rx = WORD_RE_CACHE.get(key)
    if rx is None:
        rx = re.compile(r"(?<![a-z0-9])" + re.escape(term) + r"(?![a-z0-9])")
        WORD_RE_CACHE[key] = rx
    return rx.search(fragment) is not None


def split_fragments(brand):
    """Break the prose into sentence-sized pieces we can attribute individually."""
    out = []
    reason = brand.get("reason") or ""
    # Sentence split, protecting decimals and common abbreviations.
    protected = re.sub(r"(\d)\.(\d)", r"\1<DOT>\2", reason)
    # Split on clause joins too. A single sentence routinely covers two fronts
    # ("testing flagged dioxins ... and the wipes are polypropylene"), and
    # sentence-level fragments force those to compete when both are true.
    protected = re.sub(r",\s+(and|but|while|though|although|whereas)\s+", ". ", protected)
    for part in re.split(r"(?<=[.;])\s+", protected):
        part = part.replace("<DOT>", ".").strip()
        if len(part) > 12:
            out.append(part)
    evidence = brand.get("evidence") or ""
    for part in re.split(r"[;,]\s*", evidence):
        part = part.strip()
        if len(part) > 8:
            out.append(part)
    for c in brand.get("cautions") or []:
        # strip markdown links, keep the label
        c = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", c or "").strip()
        if len(c) > 12:
            out.append(c)
    return out


def score_fragment(fragment):
    low = fragment.lower()
    scores = {}
    for front, cues in CUES.items():
        n = sum(1 for c in cues if has(low, c))
        if n:
            scores[front] = n
    # An anchor term forces its front to win outright.
    for front, anchors in ANCHORS.items():
        if any(has(low, a) for a in anchors):
            scores[front] = scores.get(front, 0) + 10
    return scores, low


def is_negated(low, start, end):
    """True when a hazard word at [start:end] is being ruled out rather than reported."""
    ahead = low[end:end + 26]
    # Trailing "-free" / " free", including slash-joined lists where one suffix
    # covers several hazards ("BPA/PFAS/azo-free"). No spaces may intervene, so
    # "nonstick coating, free of PFOA" does not wrongly clear the nonstick.
    if re.match(r"^[\w/,-]*[\s-]?free\b", ahead):
        return True
    # Trailing non-detection: "PFAS non detect", "lead not detected"
    if re.match(r"^\W*(non[\s-]?detect\w*|not detected|undetected|below detection)", ahead):
        return True
    window = low[max(0, start - 45):start]
    hit = -1
    for n in NEGATORS:
        m = None
        for m in re.finditer(r"(?<![a-z0-9])" + re.escape(n) + r"(?![a-z0-9])", window):
            pass
        if m:
            hit = max(hit, m.end())
    if hit < 0:
        return False
    # A contrast word between the negator and the hazard flips the meaning back:
    # "no Bluesign commitment, but still polyester" is not a negated polyester.
    tail = window[hit:]
    if any(has(tail, c) for c in CONTRAST):
        return False
    return True


def count_terms(low, terms, respect_negation):
    n = 0
    flipped = 0
    for t in terms:
        rx = re.compile(r"(?<![a-z0-9])" + re.escape(t) + r"(?![a-z0-9])")
        for m in rx.finditer(low):
            if respect_negation and is_negated(low, m.start(), m.end()):
                flipped += 1
            else:
                n += 1
    return n, flipped


# Terms that describe a legal event. They are evidence about the legal front and
# about nothing else, so they must not move any other front's polarity.
LEGAL_ONLY = set(HARD_LEGAL) | {"settlement", "settled", "fined", "penalty", "cpsc"}


def polarity(low, front=None):
    """
    Polarity of a fragment for one front.

    Front-aware because a clause routinely carries good news about one front and
    bad news about another. "Claryum housing leak investigation closed with no
    filed suit and no recall" is a legal pass and a packaging failure in the same
    breath; scoring it once let the legal good news mark the packaging front as
    passing and overwrite a real defect.
    """
    neg_terms = NEGATIVE if front == "legal" or front is None else [
        t for t in NEGATIVE if t not in LEGAL_ONLY
    ]
    neg, negated_away = count_terms(low, neg_terms, respect_negation=True)
    pos, _ = count_terms(low, POSITIVE, respect_negation=False)
    # Every hazard the copy explicitly rules out is itself a positive signal.
    pos += negated_away

    if front == "legal" or front is None:
        # "no recall", "closed without a lawsuit" are legal all-clears.
        if re.search(r"\bno (cpsc )?(recall|lawsuit|class action|filed)", low):
            neg -= 2
            pos += 1
        if re.search(r"\b(closed|ended) without", low):
            neg -= 2
            pos += 1
    else:
        # Strip the same all-clear phrasing from a non-legal front's positives,
        # or the legal good news inflates it.
        for pat in (r"\bno (cpsc )?(recall|lawsuit|class action|filed)",
                    r"\b(closed|ended) without"):
            if re.search(pat, low):
                pos -= 1

    if neg > pos:
        return "neg", neg - pos
    if pos > neg:
        return "pos", pos - neg
    return None, 0


def trim_note(fragment, limit=110):
    f = fragment.strip().rstrip(".")
    if len(f) <= limit:
        return f
    cut = f[:limit].rsplit(" ", 1)[0]
    return cut + "…"


def build_fronts(brand):
    """Return the fronts object plus a per-front confidence tally."""
    fronts = {f: {"status": "unknown", "note": "", "origin": "none"} for f in FRONTS}
    best = {f: 0 for f in FRONTS}

    for frag in split_fragments(brand):
        scores, low = score_fragment(frag)
        if not scores:
            continue
        # Every front with real support in this fragment gets it, not just the
        # highest scorer. A sentence about lab findings AND materials is
        # evidence for both; keeping only the winner discarded the rest and was
        # the single biggest cap on coverage.
        claimed = [f for f, sc in scores.items() if sc >= 10 or sc >= 2]
        if not claimed and len(scores) == 1:
            claimed = [max(scores, key=scores.get)]
        for front in claimed:
            pol, strength = polarity(low, front)
            if pol is None:
                continue
            weight = scores[front] + strength
            if weight <= best[front]:
                continue
            # "caution" rather than "fail" unless the fragment is emphatically
            # negative. A live recall or filed suit is always a fail on its own,
            # however briefly it is worded.
            if pol == "neg":
                hard = any(has(low, t) and not is_negated(low, m.start(), m.end())
                           for t in HARD_LEGAL
                           for m in [re.search(r"(?<![a-z0-9])" + re.escape(t) + r"(?![a-z0-9])", low)]
                           if m)
                # Only the legal front may be failed on a legal event; a hard
                # legal word must not fail an unrelated front in the same clause.
                if front != "legal":
                    hard = False
                status = "fail" if (hard or strength >= 2) else "caution"
            else:
                status = "pass"
            fronts[front] = {"status": status, "note": trim_note(frag),
                             "origin": "extracted"}
            best[front] = weight

    # Keep the scorecard consistent with the headline verdict. A brand we rate
    # good must not carry a hard "fail" chip, and a brand we rate skip must not
    # show an accidental all-clear. In both directions we soften rather than
    # invent: a real nuance on a good brand still surfaces as a caution.
    stance = brand.get("stance")
    for f in FRONTS:
        st = fronts[f]["status"]
        if stance == "good" and st == "fail":
            fronts[f]["status"] = "caution"
        elif stance == "skip" and st == "pass":
            fronts[f] = {"status": "unknown", "note": "", "origin": "none"}
    return fronts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="apply changes to brand-data.json")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    tally = {f: collections.Counter() for f in FRONTS}
    filled_per_brand = collections.Counter()

    authored_kept = 0
    for b in brands:
        # Hand-authored fronts are the source of truth and must never be
        # regenerated. The classifier only ever seeds brands nobody has
        # written fronts for by hand.
        existing = b.get("fronts") or {}
        if existing.get("authored"):
            fronts = existing
            authored_kept += 1
        else:
            fronts = build_fronts(b)
        b["fronts"] = fronts
        filled = sum(1 for f in FRONTS
                     if (fronts.get(f) or {}).get("status", "unknown") != "unknown")
        filled_per_brand[filled] += 1
        for f in FRONTS:
            tally[f][(fronts.get(f) or {}).get("status", "unknown")] += 1

    total = len(brands)
    print(f"{total} brands  ({authored_kept} with hand-authored fronts, left untouched)\n")
    print(f"{'front':<12}{'pass':>7}{'caution':>9}{'fail':>7}{'unknown':>9}{'covered':>9}")
    for f in FRONTS:
        t = tally[f]
        cov = total - t["unknown"]
        print(f"{f:<12}{t['pass']:>7}{t['caution']:>9}{t['fail']:>7}{t['unknown']:>9}{cov*100//total:>8}%")

    print("\nfronts populated per brand:")
    for n in sorted(filled_per_brand):
        c = filled_per_brand[n]
        print(f"  {n} of 4: {c:>4} brands ({c*100//total}%)")

    cells = total * 4
    done = sum(total - tally[f]["unknown"] for f in FRONTS)
    print(f"\nscorecard cells populated: {done}/{cells} ({done*100//cells}%)")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA}")
    else:
        print("\ndry run, nothing written. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
