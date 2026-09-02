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

# Question 3, the material of the parts actually in contact. Inert means the
# answer does not depend on what it holds, which is the point of asking.
INERT = {"glass", "borosilicate", "tempered glass", "stainless", "stainless steel",
         "steel", "tin", "ceramic", "porcelain", "enamel", "bamboo", "wood",
         "maple wood", "beeswax", "paper-uncoated", "silicone", "cotton", "metal",
         "rubber", "cast iron", "carbon steel", "titanium"}

# How much of a problem the polymer is before the contents are considered. PVC
# carries phthalate plasticisers, polystyrene leaches styrene, 7 is the catch all
# that includes polycarbonate. PET is its own case: antimony from the
# polymerisation catalyst, and it sheds. PP and the polyethylenes are steadier.
POLYMER = {
    "pvc": 2, "ps": 2, "polystyrene": 2, "pc": 2, "polycarbonate": 2, "other": 2,
    "melamine": 2, "non stick": 2, "nonstick": 2, "ptfe": 2,
    "pet": 1.5, "pete": 1.5, "tritan": 1.5, "acrylic": 1.5, "nylon": 1.5,
    "pp": 1, "polypropylene": 1, "hdpe": 1, "ldpe": 1, "polyethylene": 1,
    "aluminum": 1, "aluminium": 1,
    "paper-coated": 1, "paperboard": 1, "carton": 1, "cardboard": 1,
    "plastic": 1.5,      # named as plastic and no more
}

ACRONYMS = {"pet", "pete", "pvc", "ps", "pc", "pp", "hdpe", "ldpe", "ptfe"}
OILY = {"anhydrous", "oil", "oily", "fatty", "balm", "alcohol"}
DRY = {"dry", "solid", "powder"}


def pretty(m):
    return m.upper() if m in ACRONYMS else m


def classify(name):
    """Which rule a material name falls under, matched on the words in it.

    Listings write "Borosilicate Glass", "Medical-Grade Tritan", "Aluminum, Non
    Stick Granite". Exact matching missed all three.
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


def assess(pack):
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

    if contact in ("no", "false", "none"):
        return "pass", "Nothing the product touches is plastic"
    if contact not in ("yes", "true"):
        return None, "We have not established what the product actually touches"

    raw = str(pack.get("material") or "")
    parts = [m.strip() for m in re.split(r"[,^/;+&]|\band\b", raw) if m.strip()]
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
    if term is None:
        return None, "The contact material is not recorded"
    if rank == 0:
        return "pass", f"In contact with {pretty(term)}, which puts nothing into what it holds"

    base = str(pack.get("base") or "").strip().lower()
    heated = bool(pack.get("heated"))
    mouthed = bool(pack.get("mouthed"))
    repeated = str(pack.get("reuse") or "").strip().lower() in ("repeated", "reused", "daily", "years")

    # Weighted, not counted. Fat and heat are the two that actually drive
    # migration, and counting every driver alike left a warmed plastic baby
    # bottle at caution, which is the exact case our own research is loudest
    # about: 16.2 million particles per litre in the Nature Food work.
    drivers, weight = [], 0.0
    if base in OILY:
        drivers.append("an oil based formula, which is the strongest extractant there is")
        weight += 2
    if heated:
        drivers.append("heat")
        weight += 2
    if mouthed:
        drivers.append("being mouthed or chewed")
        weight += 1.5
    if repeated:
        drivers.append("repeated contact over time")
        weight += 1

    if not drivers and base in DRY:
        return "pass", (f"{pretty(term)} in contact, but dry contents at room temperature "
                        "give it little to migrate into")
    if not drivers and base:
        return "caution", f"{pretty(term)} in contact with {base} contents"
    if not drivers:
        return "caution", f"{pretty(term)} in contact, and we have not recorded what it holds"

    score = rank + weight
    reason = f"{pretty(term)} in contact, with " + ", ".join(drivers)
    return ("fail" if score >= 4 else "caution"), reason


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
            if not pack:
                continue
            status, reason = assess(pack)
            filled += 1
            if status is None:
                applied["unassessed"] += 1
                # Not knowing is a state worth recording, so the view can show
                # what still needs answering rather than an empty cell that
                # looks the same as a pass.
                e = p.setdefault("ext", {})
                # An unanswered question has to clear the old answer too, or a
                # stale caution sits under a note saying we do not know.
                e.setdefault("fronts", {})["packaging"] = "unassessed"
                e.setdefault("frontOrigin", {}).pop("packaging", None)
                e.setdefault("frontNotes", {})["packaging"] = reason + "."
                e.pop("packagingMaterial", None)
                e["packagingAnswers"] = {
                    "contact": pack.get("contact") or "",
                    "contactFrom": pack.get("contactFrom") or "",
                    "base": pack.get("base") or "",
                    "heated": bool(pack.get("heated")),
                    "mouthed": bool(pack.get("mouthed")),
                    "reuse": pack.get("reuse") or "",
                    "material": pack.get("material") or "",
                    "source": pack.get("source") or "",
                    "checked": pack.get("checked") or pack.get("checkedListing") or "",
                    "open": reason,
                }
                continue
            e = p.setdefault("ext", {})
            e.setdefault("fronts", {})["packaging"] = status
            e.setdefault("frontNotes", {})["packaging"] = reason + "."
            e.setdefault("frontOrigin", {})["packaging"] = "database"
            mat = worst(pack.get("material"))
            if mat:
                e["packagingMaterial"] = ", ".join(
                    x.strip() for x in re.split(r"[,^/;+&]", str(pack.get("material"))) if x.strip())
            # Keep the answers, not just the conclusion. A mark with no working
            # is the same problem as a status with no note: you have to take it
            # on trust, and you cannot tell a researched answer from a default.
            e["packagingAnswers"] = {
                "contact": pack.get("contact"),
                "contactFrom": pack.get("contactFrom") or "recorded",
                "base": pack.get("base") or "",
                "heated": bool(pack.get("heated")),
                "mouthed": bool(pack.get("mouthed")),
                "reuse": pack.get("reuse") or "",
                "material": pack.get("material") or "",
                "source": pack.get("source") or "",
                "checked": pack.get("checked") or pack.get("checkedListing") or "",
            }
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
