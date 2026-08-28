#!/usr/bin/env python3
"""
Add the five bestselling Amazon products in eight categories.

Every verdict and every number here comes from an article we have already
published. Nothing is invented: the job was to move research that exists on the
site into the one place the extension can reach it, because a shopper looking at
Desitin on Amazon got no answer while our diaper cream guide had a lead figure
for that exact product.

Each row is written with `ext.authored` so a rebuild never regenerates it. The
notes are the claims we will be standing behind at the moment of purchase, so
they name the lab and the year, and they carry the brands' disputes.

    python3 tools/add-category-top5.py            # report only
    python3 tools/add-category-top5.py --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

LSM = "Independent testing published by Lead Safe Mama, 2025 to 2026. The brands dispute these results."

# Brands the categories need that Brand Check does not have yet.
# (id, brand, category, stance, reason, evidence, alternative, article)
NEW_BRANDS = [
    ("bissell", "Bissell", "Vacuum", "careful",
     "The CleanView uprights are bagless with a washable filter rather than a sealed True HEPA system, so the finest dust, which is where settled microplastic fibre concentrates, can pass back through the exhaust. Fine for crumbs, not the tool for reducing airborne fibre.",
     "No sealed HEPA system on the CleanView line",
     "Shark Navigator Lift-Away for budget True HEPA, or Miele Classic C1 for a sealed bagged system",
     "bedroom-air-101.html"),
    ("eureka", "Eureka", "Vacuum", "careful",
     "The Airspeed lightweight uprights are bagless and not sealed HEPA, so the smallest particles are recirculated rather than captured. Our guidance is a True HEPA bagged or sealed vacuum for settled fibre.",
     "Not a sealed True HEPA system",
     "Shark Navigator Lift-Away, or Miele Classic C1",
     "bedroom-air-101.html"),
    ("chefman", "Chefman", "Appliances", "skip",
     "The TurboFry and compact fryers cook on a coated basket and crisper plate. A nonstick air fryer coating is PFAS, it is blasted with hot air, and it degrades in one to three years of normal use.",
     "Coated basket in the food path",
     "Fritaire glass air fryer, or the Magnifique glass combo",
     "best-non-toxic-air-fryers.html"),
    ("nature-made", "Nature Made", "Supplements", "careful",
     "The Prenatal + DHA softgel is the SKU named in a 2025 Pharmavite class action over phthalates and BPA, following PlasticList's December 2024 testing, and it returned positive for lead, cadmium and arsenic in February 2025 independent testing. A softgel shell is the worst format in our form ranking for plastic contact.",
     "Named in a 2025 class action over phthalates and BPA; positive for lead, cadmium and arsenic",
     "FullWell or Needed, both hard shell capsules",
     "cleanest-prenatal-vitamins.html"),
    ("ritual", "Ritual", "Supplements", "careful",
     "Capsule form, which is the better half of the category, but the single day packet format carries the highest surface area to dose ratio of plastic contact of any prenatal we ranked. Convenience costs the most plastic contact per dose.",
     "Single day packets are the most plastic contact per dose in the category",
     "FullWell or Needed in a bottle rather than daily packets",
     "cleanest-prenatal-vitamins.html"),
    ("one-a-day", "One A Day", "Supplements", "skip",
     "The Prenatal Advanced is a softgel, the phthalate plasticised format, and in Lead Safe Mama's 25 product prenatal comparison its lead was higher than 22 of the 25.",
     "Lead higher than 22 of 25 prenatals compared (Lead Safe Mama)",
     "FullWell or Needed, both hard shell capsules",
     "cleanest-prenatal-vitamins.html"),
    ("olly", "OLLY", "Supplements", "skip",
     "Softgel and gummy formats, the worst forms in our ranking for plastic exposure, with minimal published heavy metal testing to offset it.",
     "Softgel and gummy formats; minimal public heavy metal testing",
     "FullWell or Needed, both hard shell capsules",
     "cleanest-prenatal-vitamins.html"),
    ("extra-gum", "Extra", "Chewing gum", "skip",
     "Synthetic gum base. The label word covers polyethylene, polyvinyl acetate and polyisobutylene, the polymer families used in bags, wood glue and inner tubes. A 2025 UCLA pilot study measured a single piece shedding up to 3,000 microplastic particles into saliva.",
     "Undisclosed synthetic gum base; up to 3,000 particles per piece (UCLA 2025)",
     "Simply Gum on a chicle base, or Milliways for sugar free",
     "best-plastic-free-chewing-gum.html"),
    ("trident-gum", "Trident", "Chewing gum", "skip",
     "Synthetic gum base with nothing named on the label, which per our own label rule means assume petroleum polymer. A 2025 UCLA pilot study measured up to 3,000 microplastic particles released from one piece.",
     "Undisclosed synthetic gum base; aspartame and sorbitol",
     "Milliways for sugar free chicle, or True Gum",
     "best-plastic-free-chewing-gum.html"),
    ("wrigleys", "Wrigley's", "Chewing gum", "skip",
     "Doublemint and the rest of the range run on a synthetic gum base. The 2025 UCLA study put a single piece at up to 3,000 microplastic particles into saliva, and a regular habit at roughly 30,000 a year.",
     "Undisclosed synthetic gum base",
     "Simply Gum on a chicle base",
     "best-plastic-free-chewing-gum.html"),
    ("ice-breakers", "Ice Breakers", "Chewing gum", "skip",
     "Ice Cubes and the gum range use a synthetic base the label does not specify, alongside aspartame. Our label rule is that an unnamed gum base is a petroleum polymer until proven otherwise.",
     "Undisclosed synthetic gum base; aspartame",
     "Milliways for sugar free chicle",
     "best-plastic-free-chewing-gum.html"),
    ("pur-gum", "PUR Gum", "Chewing gum", "careful",
     "Aspartame free and sweetened with xylitol, which is the better half of the label, but the base is listed only as gum base with no plant source named. Per our own label rule an unnamed base is synthetic until the maker says otherwise. Not the same company as PUR water filters.",
     "Xylitol sweetened, but the gum base is not named as chicle",
     "Simply Gum or Milliways, both on a named chicle base",
     "best-plastic-free-chewing-gum.html"),
]

# brand -> rows. Each row: (name, matchAll, matchNot, asins, verdict, note, fronts)
F = lambda fo="unassessed", pk="unassessed", lg="unassessed", te="unassessed": {
    "formula": fo, "packaging": pk, "legal": lg, "testing": te}

ROWS = {
    # ---------------------------------------------------------------- diapers
    "Huggies": [
        ("Little Snugglers diapers", [["huggies", "little", "snugglers"]], [], ["B07MB5PZBF", "B07MYW85VT", "B07M6FL57T"], "skip",
         "ANSES 2020 and Greenpeace testing flagged trace dioxins, furans, PCBs and glyphosate across the major disposables. Kimberly-Clark disputes the concentrations. The relevant fact is a recurring lab record on a product worn against skin around the clock for two to three years.",
         F(te="fail")),
        ("Snug & Dry diapers", [["huggies", "snug", "dry"]], [], ["B0DFNRLHVY"], "skip",
         "Same ANSES 2020 finding as the rest of the mainstream disposable category, on the cheaper of the two Huggies lines. Kimberly-Clark disputes the concentrations.",
         F(te="fail")),
        ("Natural Care Sensitive wipes", [["huggies", "natural", "care"]], [], ["B07SCL613T", "B08QRT84WJ", "B00LSCGZMQ", "B0DJ3W24MV"], "careful",
         "Huggies describes its wipes as 70 percent or more plant based by weight, which is a precise way of saying up to about 30 percent plastic fibre. The cloth is the exposure, not the liquid, and it crosses a baby's skin roughly sixteen times a day.",
         F(fo="caution")),
        ("Simply Clean wipes", [["huggies", "simply", "clean"]], [], ["B08QRKY3NJ", "B0795VNC6Z"], "careful",
         "Same partly synthetic substrate as the Natural Care line, described by the manufacturer as 70 percent or more plant based by weight, which leaves up to about 30 percent plastic fibre.",
         F(fo="caution")),
    ],
    # ----------------------------------------------------------- diaper cream
    "Desitin": [
        ("Maximum Strength diaper rash paste", [["desitin", "maximum", "strength"]], [], ["B00ZQXT4EY"], "skip",
         f"About 3,300 ppb lead in the 40 percent zinc paste. The lead arrives with the zinc: zinc ore naturally contains lead and pharmaceutical grade zinc oxide may legally carry roughly 10,000 ppb. {LSM}",
         F(te="fail", fo="caution")),
        ("Daily Defense diaper rash cream", [["desitin", "daily", "defense"]], [], ["B00M0N9J20"], "careful",
         f"The lighter zinc formula from the same range. The Maximum Strength version measured about 3,300 ppb lead, and the current drug label lists talc and undisclosed fragrance among the inactives. {LSM}",
         F(fo="caution")),
    ],
    "Triple Paste": [
        ("Triple Paste zinc oxide ointment", [["triple", "paste"]], [], ["B000GCL2B8", "B0B4PNGXFS"], "skip",
         f"Over 4,000 ppb lead in the 40 percent zinc formula, the highest result the project has found in the diaper cream category. Most zinc pastes tested also carried cadmium. {LSM}",
         F(te="fail", fo="caution")),
    ],
    "Aquaphor": [
        ("Baby diaper rash paste with zinc oxide", [["aquaphor", "diaper", "rash"]], [], ["B082QBB8KQ", "B00Q2MYU9W"], "skip",
         f"Aquaphor's zinc paste was among those returning lead in the 2025 to 2026 diaper cream series, alongside cadmium in most samples. The base also carries lanolin, a wool derived allergen for some children, on already broken skin. {LSM}",
         F(te="fail", fo="caution")),
    ],
    "Boudreaux's Butt Paste": [
        ("Butt Paste, including the Natural line", [["boudreaux", "butt", "paste"]], [], ["B00569GU18"], "skip",
         "Contains Balsam of Peru, one of the top five pediatric contact allergens, in a product designed for already irritated skin. The Natural line carries it too. Zinc oxide creams as a category returned lead in independent 2025 to 2026 testing.",
         F(fo="fail")),
    ],
    "A+D": [
        ("Original diaper rash ointment", [["a d", "original", "ointment"], ["a d", "diaper", "rash"]], [], ["B01D2NTLZG"], "careful",
         "A petrolatum and lanolin ointment rather than a zinc paste, so it sidesteps the lead that arrives with zinc oxide. The trade offs are lanolin, a wool derived allergen for some children, and petrolatum whose degree of refinement is neither required nor disclosed in US cosmetics.",
         F(fo="caution")),
    ],
    # ---------------------------------------------------------------- vacuums
    "Shark": [
        ("Navigator Lift-Away uprights", [["shark", "navigator", "lift"]], [], ["B00JH98GR4", "B005KMDV9A", "B08TT4YHG1"], "good",
         "True HEPA filtration in an upright at the budget end of the category. Settled microplastic fibre is what a vacuum is for in this context, and a True HEPA unit traps down to 0.3 microns rather than recirculating the finest particles.",
         F(fo="pass", te="pass")),
    ],
    "Miele": [
        ("Classic C1 canister", [["miele", "classic", "c1"]], [], ["B07P97CD5T"], "good",
         "A sealed bagged system, which is the gold standard for this job: the bag and the seal together mean the fine fraction leaves the room rather than passing back through the exhaust. Captures down to 0.3 microns.",
         F(fo="pass", te="pass")),
    ],
    "Bissell": [
        ("CleanView uprights", [["bissell", "cleanview"]], [], ["B09V5NPHP3", "B07F6N3RT6", "B0B1RVNNN7"], "careful",
         "Bagless with a washable filter rather than a sealed True HEPA system, so the finest dust, which is where settled microplastic fibre concentrates, can pass back through the exhaust into the room you just cleaned.",
         F(fo="caution")),
    ],
    "Eureka": [
        ("Airspeed lightweight uprights", [["eureka", "airspeed"]], [], ["B0923VNPNP", "B083JBZXYS"], "careful",
         "Lightweight bagless uprights without a sealed HEPA system. For settled fibre our guidance is a True HEPA bagged or sealed vacuum, because anything less recirculates the smallest particles.",
         F(fo="caution")),
    ],
    # ---------------------------------------------------------- water filters
    "Brita": [
        ("Pitchers and dispensers on the standard filter",
         [["brita", "pitcher"], ["brita", "dispenser"], ["brita", "cup"]],
         ["elite", "longlast"],
         ["B09W4PLVQP", "B0DG62Y3DM", "B09WBL9HCS", "B01FXN3E74", "B0DG63TFC3", "B0DG63C2M5", "B0B3GK9RW6"], "skip",
         "No Brita filter, on any line, carries NSF/ANSI 401 certification for microplastics or the emerging contaminants people buy a pitcher to remove. On top of that the standard filter is not certified under NSF/ANSI 53 for lead either, which only the Elite and Longlast filters are.",
         F(te="fail")),
    ],
    "Waterdrop": [
        ("Pitcher filters", [["waterdrop", "pitcher"]], ["g3p800", "tankless", "reverse osmosis"],
         ["B07C3P2RZP", "B0CRDSZ9JG"], "careful",
         "NSF certified, but a pitcher carbon filter is a different class of product from the tankless reverse osmosis system we recommend. For microplastics and PFAS the certification that matters is NSF/ANSI 401 and 58, not 42.",
         F(te="caution")),
    ],
    "ZeroWater": [
        ("Pitchers and dispensers", [["zerowater", "pitcher"], ["zerowater", "dispenser"], ["zerowater", "cup"]], [],
         ["B0BTFXPZK4"], "careful",
         "A real step above a standard granular carbon pitcher: the five stage ion exchange reduces total dissolved solids further than carbon does, and it is certified for PFAS reduction. It is certified for taste and PFAS, not for particles, so it is not the answer for microplastics.",
         F(te="caution")),
    ],
    # ------------------------------------------------------------- air fryers
    "Ninja": [
        ("Air Fryer Pro, Max and DualZone baskets",
         [["ninja", "air", "fryer"], ["ninja", "foodi", "air"], ["ninja", "dualzone"]],
         ["crispi", "glass"],
         ["B0CSZ7WBYW", "B089TQWJKK", "B0CS3V8M9H"], "skip",
         "The basket and crisper plate are coated, and an air fryer coating is PFAS blasted with hot air. Coatings degrade in one to three years of normal use, and a scratched one can shed particles and fumes straight into the food.",
         F(fo="fail")),
    ],
    "Cosori": [
        ("TurboBlaze and Iconic air fryers", [["cosori", "air", "fryer"], ["cosori", "turboblaze"], ["cosori", "iconic"]], [],
         ["B0C33CHG99"], "careful",
         "Better than a Teflon basket, but the PFAS free claim on the ceramic coating is the manufacturer's own, with no third party verification, and the coating still wears out in one to three years. PFOA free, PTFE free and FDA approved do not mean PFAS free.",
         F(fo="caution")),
    ],
    "Chefman": [
        ("TurboFry and compact air fryers", [["chefman", "air", "fryer"], ["chefman", "turbofry"], ["chefman", "airfryer"]], [],
         ["B0CNY1F31S", "B0DC11YH4J", "B08DKYBTPH", "B08DL8WH9V"], "skip",
         "Coated basket and crisper plate in the food path. A nonstick air fryer coating is PFAS, and hot air over a worn coating is the exposure route the category is worst for.",
         F(fo="fail")),
    ],
    # ------------------------------------------------------ prenatal vitamins
    "Nature Made": [
        ("Prenatal + DHA softgel", [["nature", "made", "prenatal"]], [], ["B07BXVFC32", "B005DEK9KE"], "careful",
         "The SKU named in a 2025 Pharmavite class action over phthalates and BPA, following PlasticList's December 2024 testing, and positive for lead, cadmium and arsenic in February 2025 independent testing. Pharmavite disputes the claims. A softgel shell is also the worst format in our ranking for plastic contact.",
         F(te="fail", lg="caution")),
    ],
    "Ritual": [
        ("Essential Prenatal", [["ritual", "prenatal"]], [], ["B09W363MVD", "B0BFGZ8NS2"], "careful",
         "Capsule form, which is the better half of this category. The caution is the single day packet format, which carries the highest surface area to dose ratio of plastic contact of any prenatal we ranked. Buy the bottle rather than the daily packets.",
         F(pk="caution")),
    ],
    "One A Day": [
        ("Prenatal Advanced softgel", [["one a day", "prenatal"]], [], ["B084PHB9WZ", "B00I97GQV8"], "skip",
         f"A softgel, which is the phthalate plasticised format, and in a 25 product prenatal comparison its lead was higher than 22 of the 25. {LSM}",
         F(te="fail", pk="caution")),
    ],
    "OLLY": [
        ("Prenatal gummies and softgels", [["olly", "prenatal"]], [], ["B0CN7FZG3M", "B014G3ZY5W", "B08LQYMV9D"], "skip",
         "Softgel and gummy formats, the two worst forms in our ranking for plastic exposure, with minimal published heavy metal testing to offset the format. Switching a softgel or gummy prenatal to a hard shell capsule is the single best move in this category.",
         F(pk="fail")),
    ],
    # ----------------------------------------------------------- chewing gum
    "Extra": [
        ("Extra sugarfree gum", [["extra", "gum"], ["extra", "chewing", "gum"]], [], ["B001NI0MQ0", "B00N74QZBO", "B002DQ2F9S", "B001GM60J6"], "skip",
         "Synthetic gum base. The label term covers polyethylene, polyvinyl acetate and polyisobutylene, the same polymer families used in shopping bags, wood glue and inner tubes. A 2025 UCLA pilot study measured a single piece shedding up to 3,000 microplastic particles into saliva.",
         F(fo="fail")),
    ],
    "Trident": [
        ("Trident sugar free gum", [["trident", "gum"], ["trident", "sugar", "free"]], [], ["B0711V757H", "B00IO29CI2", "B071FC8VPH"], "skip",
         "Synthetic gum base with no polymer named on the label, which by our own label rule means assume petroleum plastic. The 2025 UCLA study put one piece at up to 3,000 microplastic particles released into saliva.",
         F(fo="fail")),
    ],
    "Wrigley's": [
        ("Doublemint and the Wrigley's range", [["wrigley", "gum"], ["wrigley", "doublemint"], ["doublemint", "chewing", "gum"]], [], ["B004OZDJW8"], "skip",
         "Synthetic gum base. The 2025 UCLA pilot study measured up to 3,000 microplastic particles from a single piece, and a regular habit works out at roughly 30,000 particles a year.",
         F(fo="fail")),
    ],
    "Ice Breakers": [
        ("Ice Cubes and Ice Breakers gum", [["ice", "breakers", "gum"], ["ice", "breakers", "cubes"]], [], ["B01J26RZVO"], "skip",
         "Synthetic gum base the label does not specify, alongside aspartame. Our label rule is that an unnamed gum base is a petroleum polymer until the maker names a plant source.",
         F(fo="fail")),
    ],
    "Mama Bear": [
        ("Mama Bear baby wipes", [["mama", "bear", "wipe"]], [], ["B07XMFVN95", "B0G4W6H1F4"], "careful",
         "Amazon's own label wipes. Fragrance free, which is the right call, but the substrate is not disclosed as plant based and the category norm is a partly synthetic cloth. The wipe itself is the exposure, not the liquid.",
         F(fo="caution")),
    ],
    # Amazon Basics spans every category, so a verdict on one of its lines says
    # nothing about another. These are scoped to the exact product.
    "AmazonBasics": [
        ("Amazon Basics upright bagless vacuum", [["amazon", "basics", "vacuum"], ["amazon", "basics", "upright"]], [],
         ["B0BN5F6MJY"], "careful",
         "Bagless with a washable filter rather than a sealed True HEPA system. For settled microplastic fibre the finest fraction is the point, and an unsealed vacuum recirculates it back into the room.",
         F(fo="caution")),
        ("Amazon Basics Prenatal & DHA gummy", [["amazon", "basics", "prenatal"]], [],
         ["B08P7QMWTW"], "skip",
         "A gummy, which with softgels is the worst form in our ranking for plastic exposure, and there is no published heavy metal testing on it to offset the format. Switching a gummy prenatal to a hard shell capsule is the single best move in this category.",
         F(pk="fail")),
    ],
    "PUR Gum": [
        ("PUR xylitol gum", [["pur", "gum"]], [], ["B00ARABK20"], "careful",
         "Aspartame free and sweetened with xylitol, which is the better half of the label. The base is listed only as gum base with no plant source named, and by our own label rule an unnamed base is synthetic until the maker says otherwise.",
         F(fo="caution")),
    ],
}


# Older rows that the consolidated ones above replace. Leaving them produced
# four overlapping Philips rows for one product line, disagreeing on the verdict,
# with whichever won a tiebreak answering for all of them.
SUPERSEDED = {
    "Philips": ["Avent baby bottles", "Natural Baby Bottle (polypropylene)"],
    "Dr. Brown's": ["Polypropylene baby bottles"],
}


def collapse(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    by_name = {collapse(b["brand"]): b for b in brands}
    for b in brands:
        for a in (b.get("aliases") or []):
            by_name.setdefault(collapse(a), b)

    created = 0
    for bid, name, cat, stance, reason, evidence, alt, article in NEW_BRANDS:
        if collapse(name) in by_name:
            continue
        entry = {"id": bid, "brand": name, "category": cat, "stance": stance,
                 "reason": reason, "evidence": evidence, "alternative": alt,
                 "sources": [article], "article": article, "reviewed": True,
                 "generalises": False}
        brands.append(entry)
        by_name[collapse(name)] = entry
        created += 1

    added = replaced = 0
    tally = collections.Counter()
    for brand_name, rows in ROWS.items():
        b = by_name.get(collapse(brand_name))
        if not b:
            print(f"  !! {brand_name} not found")
            continue
        prods = b.setdefault("products", [])
        for pname, match_all, match_not, asins, verdict, note, fronts in rows:
            # An ASIN can only ever belong to one product. Pull it off any row
            # that wrongly claims it: B000GCL2B8 is Triple Paste and was filed
            # under Desitin, so a shopper looking at Triple Paste got Desitin's
            # verdict and Desitin's reasoning.
            for other in brands:
                for op in (other.get("products") or []):
                    if op is None:
                        continue
                    shared = set(op.get("asins") or []) & set(asins)
                    if shared and not (other is b and op.get("name") == pname):
                        op["asins"] = [a for a in (op.get("asins") or []) if a not in shared]
                        replaced += 1
            hit = next((p for p in prods if p.get("name") == pname), None)
            row = {
                "name": pname,
                "matchAll": match_all,
                "asins": asins,
                "verdict": verdict,
                "note": note,
                "origin": "hand",
                "source": b.get("article"),
                "ext": {
                    "verdict": verdict,
                    "why": "Reviewed by hand from our published research on this category.",
                    "fronts": fronts,
                    "scope": "line", "basis": "direct", "disclose": False,
                    "authored": True,
                },
            }
            if match_not:
                row["matchNot"] = match_not
            if hit:
                prods[prods.index(hit)] = row
            else:
                prods.append(row)
            added += 1
            tally[verdict] += 1

    dropped = 0
    for brand_name, names in SUPERSEDED.items():
        b = by_name.get(collapse(brand_name))
        if not b:
            continue
        before = len(b.get("products") or [])
        b["products"] = [p for p in b["products"] if p.get("name") not in names]
        dropped += before - len(b["products"])

    brands.sort(key=lambda b: collapse(b["brand"]))
    print(f"dropped  {dropped} superseded rows")
    print(f"created {created} brands the categories needed")
    print(f"added   {added} product rows  {dict(tally)}")
    print(f"pulled  {replaced} ASINs off rows that wrongly claimed them")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}, now {len(brands)} brands")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
