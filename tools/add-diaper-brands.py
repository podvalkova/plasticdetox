#!/usr/bin/env python3
"""
Add the diaper brands found in Amazon's top listings that we had no verdict on.

Every entry here carries hand-authored `fronts` with "authored": true, so the
classifier will never regenerate them. Each front records what was actually
found during research, and stays "unknown" where nothing was found rather than
being guessed at.

Sourcing note: the organic fluorine figures come from the Mamavation/EHN 2023
screen of 65 diapers across 40 brands, already cited in
articles/best-non-toxic-diapers.html, so the article and Brand Check agree.

    python3 tools/add-diaper-brands.py            # report only
    python3 tools/add-diaper-brands.py --write
"""

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"


def front(status, note):
    return {"status": status, "note": note}


NEW = [
    {
        "id": "pura",
        "brand": "Pura",
        "aliases": ["MyPura", "Pura Baby", "Pura 360"],
        "category": "Diapers & wipes",
        "stance": "good",
        "reason": "British brand whose diapers are totally chlorine free rather than the weaker elemental chlorine free, with no fragrance, parabens, lotion or latex and an organic cotton top sheet. The company is unusually straight about limits: it states plainly that the diapers are not plastic free, because the outer cover is polyethylene and polyester. The wipes are the standout, 99 percent water with organic aloe and genuinely plastic free. We have found no independent PFAS or organic fluorine testing on the diapers, so this rests on materials rather than lab results.",
        "evidence": "Totally chlorine free; no fragrance, parabens, lotion or latex; organic cotton top sheet; PE/PET outer cover; B Corp; Allergy UK certified",
        "alternative": "",
        "fronts": {
            "authored": True,
            "formula": front("pass", "Totally chlorine free, not just elemental chlorine free, with no fragrance, parabens, lotion or latex and an organic cotton top sheet."),
            "packaging": front("caution", "Outer cover is polyethylene and polyester; the company states directly that the diapers are not plastic free. Outer bag is recyclable."),
            "legal": front("unknown", ""),
            "testing": front("caution", "Allergy UK certified and B Corp, but no published PFAS or organic fluorine testing on the diapers."),
        },
        "sources": ["https://us.mypura.com/pages/faqs", "best-non-toxic-diapers.html"],
    },
    {
        "id": "the-honest-company",
        "brand": "The Honest Company",
        "aliases": ["Honest", "Honest Co"],
        "category": "Diapers & wipes",
        "stance": "careful",
        "reason": "The diapers tested non detect for organic fluorine in the 2023 Mamavation and EHN screen, which is a genuine result and puts them among the cleaner disposables on that measure. The caution is the marketing record rather than the material. A 2015 group of class actions over natural labelling, with Honest Diapers named, settled in 2017 for 7.4 million dollars, and a further class action in 2022 alleged the plant based claim on the wipes was misleading because the formula contained numerous synthetic ingredients. Good test result, repeated trouble with its own label claims.",
        "evidence": "Organic fluorine non detect (Mamavation/EHN 2023); $7.4M natural-claims settlement 2017 naming Honest Diapers; 2022 plant-based wipes class action",
        "alternative": "Coterie or Millie Moon, both also non detect",
        "fronts": {
            "authored": True,
            "formula": front("caution", "Wipes were alleged in a 2022 class action to carry numerous non plant ingredients under a plant based claim."),
            "packaging": front("unknown", ""),
            "legal": front("fail", "2017 settlement of $7.4M over natural labelling with Honest Diapers named, plus a 2022 class action over plant based wipes claims."),
            "testing": front("pass", "Non detect for organic fluorine in the 2023 Mamavation and EHN screen of 65 diapers."),
        },
        "sources": ["best-non-toxic-diapers.html",
                    "https://truthinadvertising.org/class-action/honest-companys-natural-claims/",
                    "https://www.classaction.org/news/honest-plant-based-wipes-are-chock-full-of-non-plant-based-ingredients-class-action-alleges"],
    },
    {
        "id": "earth-and-eden",
        "brand": "Earth & Eden",
        "aliases": ["Earth and Eden", "Earth+Eden"],
        "category": "Diapers & wipes",
        "stance": "careful",
        "reason": "Made in the United States by First Quality, with no lotion, fragrance, parabens or latex, and inks made without lead or heavy metals. The reason this is a caution rather than a pick is the bleaching: the fluff is elemental chlorine free, not totally chlorine free, which is the distinction that actually matters for dioxin byproducts. The absorbent layers are conventional polypropylene nonwovens over sodium polyacrylate, and we found no independent PFAS testing.",
        "evidence": "Elemental chlorine free (not TCF); no lotion, fragrance, parabens or latex; polypropylene nonwovens over sodium polyacrylate; made in USA by First Quality",
        "alternative": "Pura or Eco by Naty, both totally chlorine free",
        "fronts": {
            "authored": True,
            "formula": front("caution", "Elemental chlorine free rather than totally chlorine free; conventional polypropylene nonwovens over sodium polyacrylate. No fragrance, lotion, parabens or latex."),
            "packaging": front("unknown", ""),
            "legal": front("unknown", ""),
            "testing": front("unknown", ""),
        },
        "sources": ["https://www.firstquality.com/news/first-quality-launches-earth-and-eden-sensitive-diapers",
                    "best-non-toxic-diapers.html"],
    },
    {
        "id": "mama-bear",
        "brand": "Mama Bear",
        "aliases": ["Amazon Mama Bear", "Mama Bear Gentle Touch"],
        "category": "Diapers & wipes",
        "stance": "careful",
        "reason": "Amazon's own label, manufactured by First Quality, the same maker as Earth & Eden. Free of fragrance, lotion, parabens and phthalates, which is better than most budget diapers. It is elemental chlorine free rather than totally chlorine free, and the disclosed core includes titanium dioxide alongside sodium polyacrylate, cellulose pulp, polyolefin and polyester. No independent PFAS testing that we can find.",
        "evidence": "First Quality made; elemental chlorine free; no fragrance, lotion, parabens or phthalates; core discloses titanium dioxide, sodium polyacrylate, polyolefin, polyester",
        "alternative": "Pura or Eco by Naty, both totally chlorine free",
        "fronts": {
            "authored": True,
            "formula": front("caution", "Elemental chlorine free rather than totally chlorine free, and the disclosed core includes titanium dioxide. No fragrance, lotion, parabens or phthalates."),
            "packaging": front("unknown", ""),
            "legal": front("unknown", ""),
            "testing": front("unknown", ""),
        },
        "sources": ["https://www.diaperdabbler.com/blogs/behind-the-store/amazon-mama-bear",
                    "best-non-toxic-diapers.html"],
    },
    {
        "id": "eco-boom",
        "brand": "ECO BOOM",
        "aliases": ["Eco Boom", "EcoBoom"],
        "category": "Diapers & wipes",
        "stance": "careful",
        "reason": "Came back completely clean in the 2023 Mamavation and EHN organic fluorine screen, which is the strongest thing that can be said for it. The caution is the fibre: the top sheet is viscose from bamboo, which is bamboo dissolved and regenerated through a chemical process, so it is rayon rather than the plant it is marketed as. Clean on the test that matters most, less clean on how the softness is achieved.",
        "evidence": "Non detect in the 2023 Mamavation/EHN organic fluorine screen; viscose from bamboo (regenerated rayon) top sheet",
        "alternative": "Coterie or Pura",
        "fronts": {
            "authored": True,
            "formula": front("caution", "Viscose from bamboo is a chemically regenerated rayon, not the raw plant the marketing implies."),
            "packaging": front("unknown", ""),
            "legal": front("unknown", ""),
            "testing": front("pass", "Tested completely clean in the 2023 Mamavation and EHN organic fluorine screen."),
        },
        "sources": ["best-non-toxic-diapers.html",
                    "https://mamavation.com/motherhood/diapers-pfas-forever-chemicals.html"],
    },
    {
        "id": "luvs",
        "brand": "Luvs",
        "aliases": [],
        "category": "Diapers & wipes",
        "stance": "skip",
        "reason": "Procter & Gamble's budget diaper, and the one place in their range where fragrance and lotion are still used. The company does not disclose its ingredient list or its bleaching method, which on its own is disqualifying against brands that publish both. Fragrance against skin worn around the clock is the single easiest thing to avoid in this category, and every totally chlorine free brand avoids it.",
        "evidence": "Uses fragrance and lotion; no ingredient or bleaching disclosure published",
        "alternative": "Pura or Eco by Naty",
        "fronts": {
            "authored": True,
            "formula": front("fail", "Uses fragrance and lotion, and publishes neither a full ingredient list nor its bleaching method."),
            "packaging": front("unknown", ""),
            "legal": front("unknown", ""),
            "testing": front("caution", "No published independent testing, and no ingredient disclosure to test the claims against."),
        },
        "sources": ["https://www.luvsdiapers.com/en-us/about", "best-non-toxic-diapers.html"],
    },
]

# Pull-Ups is Kimberly-Clark's training pant line, same maker and same verdict as
# Huggies, so it becomes an alias rather than a second entry. One entry per brand.
ALIAS_ADDITIONS = {"huggies": ["Pull-Ups", "Pull Ups", "Kimberly-Clark"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    by_id = {b["id"]: b for b in brands}
    collapse = lambda s: re.sub(r"[^a-z0-9]+", "", (s or "").lower())
    known = {collapse(b["brand"]) for b in brands}

    added, skipped = [], []
    for entry in NEW:
        if collapse(entry["brand"]) in known or entry["id"] in by_id:
            skipped.append(entry["brand"])
            continue
        brands.append(entry)
        added.append(entry)

    alias_done = []
    for bid, extra in ALIAS_ADDITIONS.items():
        b = by_id.get(bid)
        if not b:
            continue
        cur = list(b.get("aliases") or [])
        new = [a for a in extra if collapse(a) not in {collapse(x) for x in cur}]
        if new:
            b["aliases"] = cur + new
            alias_done.append(f"{b['brand']} += {', '.join(new)}")

    print(f"added {len(added)} brands:")
    for e in added:
        chips = " ".join(
            f"{f[:4]}:{e['fronts'][f]['status']}"
            for f in ("formula", "packaging", "legal", "testing")
        )
        print(f"  [{e['stance']:7}] {e['brand']:<22} {chips}")
    if skipped:
        print(f"\nalready present, skipped: {', '.join(skipped)}")
    if alias_done:
        print("\naliases: " + "; ".join(alias_done))

    if args.write:
        brands.sort(key=lambda b: collapse(b["brand"]))
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}, now {len(brands)} brands")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
