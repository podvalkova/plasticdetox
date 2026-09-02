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
        "packaging": {"material": "pet", "source": "earthmama.com/faq"},
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
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
EVIDENCE = ROOT / "data" / "front-evidence.json"
TODAY = datetime.date.today().isoformat()

# Materials that put nothing into what they hold. The answer does not depend on
# the contents, which is the whole point of recording a material rather than a
# judgement.
INERT = {"glass", "borosilicate", "tempered glass", "stainless", "stainless steel",
         "steel", "tin", "ceramic", "porcelain", "enamel", "bamboo", "wood",
         "maple wood", "beeswax", "paper-uncoated", "silicone", "cotton", "metal"}

# Everything else in the contact path, and how much of a problem the polymer is
# before the contents are considered. PVC carries phthalate plasticisers,
# polystyrene leaches styrene, and 7 is the catch all that includes
# polycarbonate. PET is its own case: antimony from the polymerisation catalyst,
# and it sheds. PP and the polyethylenes are the more stable ones.
POLYMER = {
    "pvc": 3, "ps": 3, "polystyrene": 3, "pc": 3, "polycarbonate": 3, "other": 3,
    "pet": 2, "pete": 2,
    "pp": 1, "polypropylene": 1, "hdpe": 1, "ldpe": 1, "polyethylene": 1,
    "acrylic": 2, "nylon": 2, "melamine": 3,
    # Paper and card on the food side are usually coated, and the coating is the
    # part that matters.
    "paper-coated": 2, "paperboard": 2, "carton": 2,
    "plastic": 2,        # unnamed polymer: we know it is plastic and no more
    "tritan": 2,         # BPA free copolyester, still a plastic contact surface
    "aluminum": 1, "aluminium": 1,   # nearly always lined, and the lining decides
    "non stick": 3, "nonstick": 3, "ptfe": 3,
}


def classify(name):
    """Which rule a material name falls under, matched on the words in it.

    Listings write "Borosilicate Glass", "Medical-Grade Tritan", "Aluminum, Non
    Stick Granite". Exact matching missed all three, so the longest known term
    appearing anywhere in the name decides.
    """
    n = (name or "").strip().lower()
    if not n:
        return None, None
    best = None
    for term, rank in POLYMER.items():
        if term in n and (best is None or len(term) > len(best[0])):
            best = (term, rank)
    for term in INERT:
        if term in n and (best is None or len(term) > len(best[0])):
            best = (term, 0)
    return best if best else (None, None)


def worst(materials):
    """The material that decides, from a listing naming several.

    A listing gives the whole object: "Glass, Silicone" is a jar and its gasket,
    "Metal, Plastic" is a housing and its fittings. The one that decides is the
    worst non inert part, because that is the one that can migrate. An object
    whose parts are all inert is inert.
    """
    parts = [m.strip() for m in re.split(r"[,^/;+&]|\band\b", str(materials or "")) if m.strip()]
    scored = [(classify(m), m) for m in parts]
    bad = [(r, term) for (term, r), _ in scored if r]
    if bad:
        return max(bad)[1]
    inert = [term for (term, r), _ in scored if term and r == 0]
    return inert[0] if inert else ""


# What is inside. Fat is the strongest extractant there is, alcohol close
# behind; water is the mild case; a dry solid barely migrates at all.
BASE = {"anhydrous": 3, "oil": 3, "fatty": 3, "alcohol": 3,
        "aqueous": 2, "water": 2, "wet": 2,
        "dry": 0, "solid": 0, "powder": 0}

# What the product is for. Swallowed or left on skin is the full exposure;
# rinsed off is brief; nothing that never touches the contents counts at all.
USE = {"ingested": 2, "food": 2, "drink": 2, "leave-on": 2, "oral": 2,
       "rinse-off": 1, "topical-rinse": 1,
       "non-contact": 0, "external": 0}

# Polymer names are acronyms, and "Pet against anhydrous contents" reads like
# an animal.
ACRONYMS = {"pet", "pete", "pvc", "ps", "pc", "pp", "hdpe", "ldpe"}


def pretty(m):
    return m.upper() if m in ACRONYMS else m


def packaging_status(material, base, use):
    """How bad is this container, given what is in it and what it is for.

    Returns (status, reason). An unknown material is not a pass and not a
    failure: it is a thing we have not looked up.
    """
    m = (material or "").strip().lower()
    if not m or m in ("na", "n/a", "unknown"):
        return None, "material not recorded"
    term, rank = classify(m)
    if term is None:
        return None, f"material '{m}' is not one we have a rule for"
    m = term
    if rank == 0:
        return "pass", f"{pretty(m)}, which puts nothing into what it holds"

    b = BASE.get((base or "").strip().lower())
    u = USE.get((use or "").strip().lower())
    if b is None or u is None:
        # Plastic in the contact path is a caution on its own. Saying more than
        # that needs to know what is inside it.
        return "caution", f"{pretty(m)} in the contact path, and we have not recorded what it holds"
    if u == 0:
        return "pass", f"{pretty(m)}, but it does not touch the contents"

    score = rank + b + u
    what = f"{pretty(m)} against {base} contents, {use}"
    if score >= 7:
        return "fail", what
    if score >= 4:
        return "caution", what
    # A dry solid in a card box is the plastic free option, not a caution.
    # Migration needs something to migrate into, and nothing much moves out of
    # a carton into a bar of soap.
    return "pass", f"{pretty(m)}, but {base} contents {use} give it little to migrate into"


def keys_for(brand, product):
    out = list(product.get("asins") or [])
    out.append(f"{brand}::{product.get('name')}")
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
                           "packaging": {"material": ""},
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
    filled = 0
    for b in brands:
        for p in (b.get("products") or []):
            entry = next((ev[k] for k in keys_for(b["brand"], p) if k in ev), None)
            if not entry:
                continue
            pack = entry.get("packaging") or {}
            form = entry.get("formula") or {}
            material = pack.get("material")
            if not material:
                continue
            filled += 1
            status, reason = packaging_status(material, form.get("base"), form.get("use"))
            if status is None:
                applied["skipped"] += 1
                continue
            e = p.setdefault("ext", {})
            e.setdefault("fronts", {})["packaging"] = status
            e.setdefault("frontNotes", {})["packaging"] = reason[0].upper() + reason[1:] + "."
            e.setdefault("frontOrigin", {})["packaging"] = "database"
            e["packagingMaterial"] = material
            applied[status] += 1

    total = sum(v for k, v in applied.items() if k != "skipped")
    print(f"entries in {EVIDENCE.relative_to(ROOT)}: {len(ev)}")
    print(f"  with a material recorded: {filled}")
    print(f"  packaging derived from it: {total}   "
          + "  ".join(f"{k} {n}" for k, n in applied.items()))
    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print("\nwrote brand-data.json")
    else:
        print("\ndry run. re-run with --write to apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
