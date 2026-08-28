#!/usr/bin/env python3
"""
Cover the five bestselling Amazon products for every article that reviews a
product category.

Companion to add-category-top5.py, which did the first eight. Same rule: every
verdict and every figure comes from an article already published on the site.
The job is moving research into the one place the extension can reach, not
generating new opinions.

Most findings here are category level rather than brand level, and that is not a
shortcut. A plastic cutting board sheds polyethylene because it is polyethylene,
a PVC shower curtain off gasses because it is PVC, and a nylon tea bag sheds
because it is nylon. Under docs/rating-rules.md section 4 that is an ingredient
borne mechanism, whose natural scope is `class`: it transfers to every product
containing the material, across brands. So the note names the material and the
study, and the verdict follows the material.

    python3 tools/add-article-top5.py            # report only
    python3 tools/add-article-top5.py --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

F = lambda fo="unassessed", pk="unassessed", lg="unassessed", te="unassessed": {
    "formula": fo, "packaging": pk, "legal": lg, "testing": te}

# Category level findings, each straight out of the named article.
CUT = ("A plastic cutting board sheds 14 to 71 million microplastic particles a year, "
       "with knife grooves releasing polyethylene fragments straight into food "
       "(Environmental Science & Technology, 2023). Wood is also more sanitary: UC Davis "
       "found bacteria die off in wood fibre while knife scarred plastic traps them.")
PVC_CURTAIN = ("A PVC shower curtain released 108 volatile organic compounds into the air, "
               "more than 16 times the indoor air guideline in its first week (CHEJ, 2008), "
               "and it hangs by your face in a warm humid room that drives off gassing.")
PEVA_CURTAIN = ("PEVA and EVA are less bad than PVC, not non toxic. They drop the chlorine "
                "and phthalates but are still plastic and still off gas in a hot shower. "
                "A fabric curtain skips the liner entirely.")
MAT = ("Most mats are PVC, TPE, NBR or EVA foam. PVC is made from a known carcinogen, EVA "
       "can off gas formamide, and eco labels like PER are usually PVC in disguise "
       "(Ecology Center testing, 2019). You press skin into a mat for an hour while "
       "breathing directly above it.")
TAMPON = ("Independent 2024 to 2025 testing found lead and arsenic in 30 of 30 tampons. Most "
          "US tampons also ship with a single use plastic applicator, and the withdrawal cord "
          "and overwrap are usually polyester.")
TEA = ("One plastic tea bag releases 11.6 billion microplastic particles per cup, and heat is "
       "the trigger. Silky and pyramid bags are nylon or PET, and even most paper bags carry a "
       "heat sealed polypropylene seam that sheds into the water.")
FLOSS = ("The glide is usually PTFE, the same polymer as Teflon and a member of the PFAS "
         "family. A 2019 study tied Oral-B Glide use to higher PFAS blood levels, and 2024 lab "
         "testing measured Glide at 248,900 ppm organic fluorine, a record high for a consumer "
         "product.")
NYLON_BRUSH = ("The bamboo handle is honest, the bristles usually are not. Nylon bristles are "
               "plastic, and castor bean or bio nylon is still a synthetic polymer that sheds "
               "microplastics while you brush. Only animal hair is genuinely plastic free.")
PLASTIC_LID = ("Glass body with a plastic lid. Hot steam rises and contacts the lid, and plastic "
               "lids degrade and shed over time, so the glass only solves half the problem. "
               "Containers with glass or bamboo lids close the other half.")
PET_WATER = ("Single use PET, which is a major microplastic source rather than a neutral "
             "container. Bottled water carries far more particles than filtered tap, and heat "
             "and storage time both increase what migrates out of the bottle.")
STRAW_LID = ("Stainless body, but the lid puts a plastic straw and spout directly in the drink "
             "path. Our drinkware standard is no plastic touching the drink at all, and the lid "
             "is where almost every insulated bottle fails it.")
# The category finding for every polypropylene baby bottle. The site already
# rates these skip; softer per-brand rows contradicted that and, because they
# overlapped the same listings, whichever won a tiebreak answered for all of them.
PP = ("Polypropylene bottles heated for formula. A 2020 Nature Food study (Li et al.) measured "
      "polypropylene infant bottles releasing 1 to 16 million microplastic particles per litre at "
      "70C formula preparation temperature, and milk is an emulsion, so it pulls more out of "
      "plastic than water does. The same bottle is sold in glass.")
PTFE_PAN = ("Nonstick coating in the food path. Granite, marble and ceramic finishes on a "
            "budget pan are PTFE based unless the maker names the coating and shows third "
            "party testing, and PFOA free does not mean PFAS free.")

NEW_BRANDS = [
    # (id, brand, category, stance, reason, evidence, alternative, article, aliases)
    ("vivago", "VIVAGO", "Oral care", "careful", NYLON_BRUSH, "Nylon bristles on a bamboo handle", "PRIMALS boar bristle, or SeaTurtle for a vegan compromise", "bamboo-toothbrush-plastic-bristles.html", []),
    ("genkent", "GENKENT", "Oral care", "careful", NYLON_BRUSH, "Nylon bristles on a bamboo handle", "PRIMALS boar bristle bamboo toothbrush", "bamboo-toothbrush-plastic-bristles.html", []),
    ("mooka", "MOOKA", "Air purifier", "careful", "Marketed on coverage area rather than on a verified True HEPA rating. For airborne microplastic fibre the filter grade is the whole product, so an unverified HEPA claim is the thing to check before the square footage.", "HEPA grade not independently verified", "Coway Airmega, our best overall True HEPA pick", "best-air-purifiers-for-microplastics.html", []),
    ("voopnu", "VOOPNU", "Air purifier", "careful", "A high efficiency filter claim without a stated True HEPA rating or third party verification. Coverage figures are the manufacturer's own.", "HEPA grade not independently verified", "Coway Airmega, our best overall True HEPA pick", "best-air-purifiers-for-microplastics.html", []),
    ("germguardian", "GermGuardian", "Air purifier", "careful", "True HEPA on the main filter, which is the part that matters for fibre, but several models pair it with a UV-C lamp and an ioniser. Ionisers can generate ozone, which is a respiratory irritant, so run the unit with that function off.", "True HEPA filter, but ioniser and UV-C on several models", "Coway Airmega, which ships with its ioniser off by default", "best-air-purifiers-for-microplastics.html", []),
    ("blue-lizard", "Blue Lizard", "Sunscreen", "good", "A genuine 100 percent zinc oxide mineral filter on the Sensitive line, with no chemical UV filters. Sold in a plastic bottle, which for an emulsion is a caution rather than a fail.", "100% zinc oxide mineral filter, no chemical filters", None, "best-mineral-sunscreen-guide.html", []),
    ("cetaphil", "Cetaphil", "Sunscreen", "careful", "The Sheer Mineral face line is zinc oxide based, which is the right filter. The rest of the Cetaphil range is conventional, so this verdict covers the mineral SPF only.", "Zinc oxide filter on the Sheer Mineral line", "Blue Lizard Sensitive, or California Baby for kids", "best-mineral-sunscreen-guide.html", []),
    ("astercook", "Astercook", "Cutting boards", "good", "Bamboo rather than plastic, which is the point. Bamboo is a grass and is harder on knife edges than end grain wood, but it sheds no polyethylene into food.", "Bamboo, not plastic", None, "best-non-toxic-cutting-boards.html", []),
    ("gorilla-grip", "Gorilla Grip", "Cutting boards", "skip", CUT, "Plastic board; sheds polyethylene into food", "A wood or bamboo board", "best-non-toxic-cutting-boards.html", []),
    ("kitsure", "Kitsure", "Cutting boards", "good", "Bamboo rather than plastic. Harder on knives than end grain wood, but it sheds no polyethylene into food.", "Bamboo, not plastic", None, "best-non-toxic-cutting-boards.html", []),
    ("nutricost", "Nutricost", "Supplements", "careful", "Third party tested and sold in a plastic tub, which for a dry powder is low migration. The caution is that the heavy metal testing is not published per lot, so there is no number to check against.", "Dry powder in HDPE; no published per lot metal testing", "Klean Athlete or Thorne, both third party certified", "supplements-and-microplastics.html", []),
    ("tampax", "Tampax", "Period care", "skip", TAMPON, "Lead and arsenic in 30/30 tampons tested; plastic applicator", "Natracare organic cotton tampons, or a medical grade silicone cup", "best-non-toxic-period-products.html", []),
    ("playtex", "Playtex", "Period care", "skip", TAMPON, "Lead and arsenic in 30/30 tampons tested; plastic applicator", "Natracare organic cotton tampons, or a medical grade silicone cup", "best-non-toxic-period-products.html", []),
    ("barossa-design", "Barossa Design", "Shower curtains", "careful", "OEKO-TEX certified fabric, which is a real certification and better than a vinyl liner. Still a synthetic fabric, so it is the better plastic rather than no plastic.", "OEKO-TEX certified, but synthetic fabric", "A hemp or OEKO-TEX cotton curtain with no liner", "best-non-toxic-shower-curtains.html", []),
    ("gaiam", "Gaiam", "Yoga mats", "skip", MAT, "PVC mat", "Manduka eKO natural tree rubber, or Öko Living organic cotton", "best-non-toxic-yoga-mats.html", []),
    ("cap-barbell", "CAP", "Yoga mats", "skip", MAT, "PVC or EVA foam mat", "Manduka eKO natural tree rubber", "best-non-toxic-yoga-mats.html", ["CAP Barbell"]),
    ("retrospec", "Retrospec", "Yoga mats", "skip", MAT, "TPE and EVA foam mat", "Manduka eKO natural tree rubber", "best-non-toxic-yoga-mats.html", []),
    ("vtopmart", "Vtopmart", "Food storage", "careful", PLASTIC_LID, "Glass body, plastic lid", "Urban Green or EcoEvo glass containers with glass lids", "best-plastic-free-food-storage-containers.html", []),
    ("utopia-kitchen", "Utopia Kitchen", "Cookware", "skip", PTFE_PAN, "Nonstick coating in the food path", "Bare cast iron, carbon steel, or uncoated stainless", "pfas-in-cookware-brands.html", []),
    ("optimum-nutrition", "Optimum Nutrition", "Supplements", "careful", "Gold Standard is Informed Choice certified on most lots, which covers banned substances rather than heavy metals or plastic. Sold in a plastic tub, which for a dry powder is low migration.", "Informed Choice certified; no published heavy metal numbers", "ProMix Grass Fed Whey Isolate, or Transparent Labs", "cleanest-protein-powder-tested.html", []),
    ("body-fortress", "Body Fortress", "Supplements", "skip", "A budget mass market whey with artificial sweeteners and colours and no third party certification for heavy metals or banned substances. Protein powders are one of the categories where independent testing has repeatedly found lead and cadmium, so an uncertified product is an unknown you are drinking daily.", "No third party certification; artificial sweeteners and colours", "ProMix Grass Fed Whey Isolate, or Transparent Labs", "cleanest-protein-powder-tested.html", []),
    ("plackers", "Plackers", "Oral care", "skip", "A floss pick is a moulded plastic handle thrown away after one use, with a nylon or polyester strand. The picks are single use plastic by design, and the strand is not silk.", "Single use plastic handle; synthetic strand", "Dental Lace, Hemli Home or TreeBird silk floss", "pfas-free-dental-floss.html", []),
    ("serenity-kids", "Serenity Kids", "Baby food", "careful", "A better ingredient deck than the mainstream pouches, with real protein and fat rather than fruit puree fillers. Still sold in a multilayer plastic pouch, and pouch packaging with acidic purees is where Consumer Reports found phthalates in 2023.", "Multilayer plastic pouch", "Homemade purees in glass, or Serenity Kids' own jarred range", "microplastics-in-baby-food.html", []),
    ("eos", "eos", "Cosmetics", "careful", "Fragranced body lotion in a plastic bottle. An emulsion carries an oil phase, which extracts more from a container than a water based product does, and the fragrance is an undisclosed mixture.", "Undisclosed fragrance; emulsion in plastic", "An unscented lotion in glass, or a simple body oil", "microplastics-in-cosmetics-and-personal-care.html", []),
    ("olay", "Olay", "Cosmetics", "careful", "Fragranced lotions and creams in plastic. An emulsion pulls more out of a container than a water based product, and fragrance on a leave on product is an undisclosed mixture sitting on skin all day.", "Undisclosed fragrance; emulsion in plastic", "An unscented lotion in glass", "microplastics-in-cosmetics-and-personal-care.html", []),
    ("jergens", "Jergens", "Cosmetics", "careful", "Fragranced body lotion in a plastic bottle, with the fragrance an undisclosed mixture. A leave on emulsion is the higher exposure half of personal care.", "Undisclosed fragrance; emulsion in plastic", "An unscented lotion in glass", "microplastics-in-cosmetics-and-personal-care.html", []),
    ("baja-gold", "Baja Gold", "Salt", "careful", "An unrefined sea salt marketed on mineral content. Unrefined is not the same as tested: sea salt is one of the categories where microplastics and heavy metals turn up, and there is no published third party metal or particle testing to check.", "No published third party metal or microplastic testing", "A salt with published third party testing", "microplastics-in-salt-and-pantry-staples.html", []),
    ("mrs-meyers", "Mrs. Meyer's", "Cleaning", "careful", "Plant derived surfactants, but a heavy undisclosed fragrance load in a plastic spray bottle. Fragrance is the single most common undisclosed mixture in cleaning products, and this is a leave on residue on kitchen surfaces.", "Undisclosed fragrance", "Blueland tablets, or Attitude fragrance free", "reduce-microplastics-in-cleaning-products.html", []),
    ("method", "Method", "Cleaning", "careful", "Better ingredient disclosure than the disinfectant brands, but fragranced and sold in single use plastic spray bottles. A refill tablet system removes the bottle from the equation entirely.", "Undisclosed fragrance; single use plastic bottle", "Blueland refill tablets, or Attitude fragrance free", "reduce-microplastics-in-cleaning-products.html", []),
    ("dream-on-me", "Dream On Me", "Nursery", "careful", "GREENGUARD Gold certified, which tests for VOC emissions and is a real certification. The fill is still polyurethane foam, so the certification covers what comes off it rather than what it is made of.", "GREENGUARD Gold certified; polyurethane foam core", "Naturepedic or Avocado organic crib mattress", "non-toxic-nursery-setup.html", []),
    ("serta-baby", "Serta", "Nursery", "careful", "A polyurethane foam core with a waterproof layer, which on crib mattresses is usually a vinyl or polyurethane film. No GREENGUARD or organic certification on the mainstream models.", "Polyurethane foam; waterproof film layer", "Naturepedic or Avocado organic crib mattress", "non-toxic-nursery-setup.html", []),
    ("pure-life", "Pure Life", "Bottled water", "skip", PET_WATER, "Single use PET bottled water", "Filtered tap water in a stainless bottle", "how-to-remove-microplastics-from-bottled-water.html", ["Nestle Pure Life"]),
    ("amazon-grocery", "Amazon Grocery", "Multi-category", "careful", "Amazon's own grocery label across many categories, so a finding on one product says nothing about another. The bottled water is single use PET; the sea salt has no published third party metal testing.", "Verdicts here are per product", None, "plastic-in-groceries-what-really-matters.html", ["Amazon Saver", "Amazon Elements"]),
    ("thetchry", "THETCHRY", "Cutting boards", "skip", CUT, "Plastic board; sheds polyethylene into food", "A wood or bamboo board", "best-non-toxic-cutting-boards.html", []),
    ("venture-pal", "Venture Pal", "Electrolytes", "careful", "Sugar free with a high sodium profile. Sold in single serve stick packs, the highest plastic surface area per dose in the category, with no published PFAS or heavy metal testing. Electrolyte powders are a category where independent testing has found PFAS.", "Stick pack format; no published testing", "GOODONYA Organic Hydration, or Skratch Labs for sport", "best-non-toxic-electrolytes.html", []),
    ("mrs-awesome", "Mrs Awesome", "Shower curtains", "careful", PEVA_CURTAIN, "Plastic shower curtain liner", "A hemp or OEKO-TEX cotton curtain with no liner", "best-non-toxic-shower-curtains.html", []),
    ("bigfoot-curtain", "BigFoot", "Shower curtains", "careful", PEVA_CURTAIN, "Plastic shower curtain liner", "A hemp or OEKO-TEX cotton curtain with no liner", "best-non-toxic-shower-curtains.html", []),
    ("ehznzie", "EHZNZIE", "Shower curtains", "careful", PEVA_CURTAIN, "PEVA shower curtain liner", "A hemp or OEKO-TEX cotton curtain with no liner", "best-non-toxic-shower-curtains.html", []),
    ("powcan", "POWCAN", "Water bottles", "careful", STRAW_LID, "Plastic straw and spout in the drink path", "A stainless bottle with a plain steel or bamboo cap", "best-non-toxic-water-bottles.html", []),
    ("triple-tree", "Triple Tree", "Water bottles", "careful", STRAW_LID, "Plastic lid components in the drink path", "A stainless bottle with a plain steel or bamboo cap", "best-non-toxic-water-bottles.html", []),
    ("dysanky", "DYSANKY", "Water bottles", "careful", STRAW_LID, "Plastic straw lid in the drink path", "A stainless bottle with a plain steel or bamboo cap", "best-non-toxic-water-bottles.html", []),
    ("fijinhom", "Fijinhom", "Water bottles", "careful", STRAW_LID, "Plastic lid components in the drink path", "A stainless bottle with a plain steel or bamboo cap", "best-non-toxic-water-bottles.html", []),
    ("dealusy", "Dealusy", "Food storage", "careful", PLASTIC_LID, "Glass body, plastic lid", "Urban Green or EcoEvo glass containers with glass lids", "best-plastic-free-food-storage-containers.html", []),
    ("liuruiyu", "Liuruiyu", "Food storage", "careful", PLASTIC_LID, "Glass body, plastic lid", "Urban Green or EcoEvo glass containers with glass lids", "best-plastic-free-food-storage-containers.html", []),
    ("letmxiu", "Letmxiu", "Nursery", "careful", "A foam core crib mattress with a knitted synthetic cover and no GREENGUARD or organic certification. A baby sleeps on this twelve hours a day, which makes it one of the longest contact times in the house.", "Foam core; no emissions certification", "Naturepedic or Avocado organic crib mattress", "non-toxic-nursery-setup.html", []),
    ("hearthy-foods", "HEARTHY FOODS", "Supplements", "careful", "A dry creatine powder in a plastic tub, which is the low migration end of packaging. No third party certification and no published heavy metal testing, which is what this category needs.", "No third party certification or published testing", "Klean Athlete or Thorne creatine", "supplements-and-microplastics.html", []),
    ("whole-foods-365", "365 by Whole Foods Market", "Multi-category", "careful", "A store label spanning many categories, so a verdict on one product does not carry to another. The sea salt carries no published third party heavy metal or microplastic testing.", "Verdicts here are per product", None, "microplastics-in-salt-and-pantry-staples.html", ["365 Whole Foods"]),
]

ROWS = {
    # ------------------------------------------------------- bamboo toothbrush
    "VIVAGO": [("VIVAGO bamboo toothbrushes", [["vivago", "bamboo"]], [], ["B08172V3Y5", "B0DWX22LPN", "B0BHX1VPFH", "B0GF1JC7DD"], "careful", NYLON_BRUSH, F(fo="caution"))],
    "GENKENT": [("GENKENT bamboo toothbrushes", [["genkent", "bamboo"]], [], ["B0D13T3XWX"], "careful", NYLON_BRUSH, F(fo="caution"))],
    "PRIMALS": [("PRIMALS boar bristle bamboo toothbrush", [["primals", "bamboo"], ["primals", "boar"]], [], ["B0D2587QXX"], "good",
                 "Bamboo handle with real boar bristles and no nylon, which makes it the one commercially available brush that is genuinely plastic free and fully compostable.", F(fo="pass"))],
    # ----------------------------------------------------------- air purifiers
    "LEVOIT": [("Core and Vital purifiers", [["levoit", "air", "purifier"]], [], ["B07VVK39F7", "B0BGPF71Q6"], "skip",
                "Removed from every pick on the site in August 2026. Levoit is named in consumer class action litigation alleging its purifiers are misrepresented as meeting the True HEPA standard they advertise. On a purifier the filtration number is the entire product, so an unverified filtration claim is not a detail.", F(te="fail", lg="caution"))],
    "MOOKA": [("MOOKA home air purifiers", [["mooka", "air", "purifier"]], [], ["B0CXJ97TV1"], "careful",
               "Marketed on coverage area rather than on a verified True HEPA rating. For fibre the filter grade is the whole product, so that is the number to check before the square footage.", F(fo="caution"))],
    "VOOPNU": [("VOOPNU air purifiers", [["voopnu", "air", "purifier"]], [], ["B0DY4S3HP2"], "careful",
                "A high efficiency filter claim with no stated True HEPA rating or third party verification, and coverage figures that are the manufacturer's own.", F(fo="caution"))],
    "GermGuardian": [("GermGuardian HEPA purifiers", [["germguardian"]], [], ["B004VGIGVY"], "careful",
                      "True HEPA on the main filter, which is the part that matters for fibre. Several models pair it with a UV-C lamp and an ioniser, and ionisers can generate ozone, a respiratory irritant. Run it with that function off.", F(fo="caution", te="pass"))],
    # --------------------------------------------------------- mineral sunscreen
    "Blue Lizard": [("Sensitive Mineral Sunscreen SPF 50+", [["blue", "lizard"]], [], ["B0862Q6BV9", "B084ZP848Y"], "good",
                     "A genuine 100 percent zinc oxide filter with no chemical UV filters, which is the specification the guide asks for.", F(fo="pass"))],
    "Cetaphil": [("Sheer Mineral Face Sunscreen SPF 50", [["cetaphil", "mineral"], ["cetaphil", "sunscreen"]], [], ["B08HJKQP7X"], "good",
                  "Zinc oxide mineral filter with no chemical UV filters. This verdict covers the Sheer Mineral line only; the rest of the Cetaphil range is conventional.", F(fo="pass"))],
    "Thinkbaby": [("Thinksport mineral sunscreen SPF 50+", [["thinksport", "sunscreen"], ["thinksport", "spf"]], [], ["B00K3JQO9Y"], "skip",
                   "Same manufacturer as Thinkbaby, where independent third party testing by Lead Safe Mama in June 2025 found the highest lead level of any baby sunscreen tested to date. The mineral filter is the right chemistry, but the contamination result is the deciding fact.", F(te="fail"))],
    "Coppertone": [("Sport Mineral Sunscreen SPF 50", [["coppertone", "mineral"]], [], ["B08PCCWLZS"], "careful",
                    "The Sport Mineral line uses a zinc filter, which is the right chemistry, but the wider Coppertone range is chemical filter based and the brand has no published contamination testing.", F(fo="caution"))],
    # ------------------------------------------------------------ baby bottles
    "Evenflo": [("Classic tinted plastic bottles", [["evenflo", "tinted"], ["evenflo", "plastic", "bottle"], ["evenflo", "classic", "tinted"]], [], ["B07G4KBQJ7"], "skip",
                 "Polypropylene bottles filled with warm milk. Milk is an emulsion, so it carries an oil phase that extracts more from plastic than water does, and bottles are heated and sterilised repeatedly, which drives migration harder than any other variable.", F(fo="fail", pk="fail"))],
    "Philips": [("Avent plastic baby bottles", [["philips", "avent", "bottle"], ["avent", "natural", "baby", "bottles"]], ["glass"], ["B0964CHD65"], "skip",
                 PP + " Philips is also named in a June 2024 class action over microplastic release from the polypropylene bottles.",
                 F(fo="fail", pk="fail", lg="caution"))],
    "Dr. Brown's": [("Options+ plastic baby bottles", [["dr brown", "options"], ["dr browns", "options"]], ["glass"], ["B01845QGKK", "B07TXM6K2T"], "skip",
                     PP + " Dr. Brown's is also named in a June 2024 class action alleging microplastic release when heated.",
                     F(fo="fail", pk="fail", lg="caution"))],
    "Tommee Tippee": [("Natural Start plastic bottles", [["tommee", "tippee"]], ["glass"], ["B0CQMHBV3R"], "skip",
                       PP, F(fo="fail", pk="fail"))],
    # ---------------------------------------------------------- cutting boards
    "Gorilla Grip": [("Reversible plastic cutting boards", [["gorilla", "grip", "cutting"]], [], ["B01GP2MTXW"], "skip", CUT, F(fo="fail"))],
    "Farberware": [("Plastic chopping boards", [["farberware", "cutting"], ["farberware", "chopping"]], [], ["B000W4OC80"], "skip", CUT, F(fo="fail"))],
    "Astercook": [("Bamboo cutting boards", [["astercook", "cutting"]], [], ["B0FH6YL3XC"], "good",
                   "Bamboo rather than plastic, which is the whole point in this category. Harder on knife edges than end grain wood, but it sheds no polyethylene into food.", F(fo="pass"))],
    "Kitsure": [("Bamboo cutting board", [["kitsure", "cutting"]], [], ["B0DXPWTSG1"], "good",
                 "Bamboo rather than plastic. Sheds no polyethylene into food, and unlike a plastic board the knife grooves do not become a particle source.", F(fo="pass"))],
    # ------------------------------------------------------------ electrolytes
    "Ultima Replenisher": [("Ultima Replenisher electrolyte powder", [["ultima", "replenisher"]], [], ["B01IIGQ5KG", "B08XQZX9K3"], "careful",
                            "Sugar free with a reasonable mineral profile. The caution is the format: single serve stick packs are the highest plastic surface area per dose in the category, and the brand publishes no PFAS or heavy metal testing.", F(pk="caution"))],
    "Nutricost": [("Nutricost electrolyte and creatine powders", [["nutricost", "electrolyte"], ["nutricost", "creatine"]], [], ["B0D6JFYVHW", "B00GL2HMES", "B01EVVQX9U"], "careful",
                   "Third party tested for identity and sold as a dry powder in a plastic tub, which is the low migration end of packaging. The gap is that heavy metal results are not published per lot, so there is no number to check.", F(pk="pass"))],
    "Nectar": [("Nectar hydration packets", [["nectar", "hydration"], ["nectar", "electrolyte"]], [], ["B09BD8GZ8L"], "careful",
                "Sugar free and simple, but sold in single serve stick packs, which carry the most plastic surface area per dose of any format in the category. No published PFAS testing, and electrolyte powders are a category where independent testing has found it.", F(pk="caution"))],
    # ------------------------------------------------------- laundry detergent
    "Tide": [("Tide liquid detergent and PODS", [["tide", "detergent"], ["tide", "pods"], ["tide", "liquid"]], [], ["B0BNWCTNYN", "B0BJMV9BXJ", "B085V5PPP8"], "careful",
              "Heavy undisclosed fragrance load and a large single use plastic jug. PODS add a polyvinyl alcohol film that dissolves into the wash and the waterway rather than disappearing. Detergent is rinsed and diluted, so the exposure is lower than a leave on product.", F(fo="caution"))],
    "Arm & Hammer": [("Arm & Hammer liquid laundry detergent", [["arm", "hammer", "detergent"], ["arm", "hammer", "liquid"]], [], ["B0GSPD9FZ6", "B0G4KCCQN2", "B0GQKJ8L9C"], "careful",
                      "4.28 ppm 1,4-dioxane in 2022 testing, the highest figure among the mainstream detergents tested, plus an undisclosed fragrance and a single use plastic jug.", F(fo="caution", te="caution"))],
    # ---------------------------------------------------------- period products
    "Tampax": [("Tampax Pearl tampons", [["tampax"]], [], ["B0B33LJX6N", "B093LVS21D", "B0BPBB21N3", "B01NCUIII2", "B093LV6X3Q"], "skip", TAMPON, F(te="fail", fo="caution"))],
    "Playtex": [("Playtex Sport tampons", [["playtex", "tampon"], ["playtex", "sport"]], [], ["B08L4Q75QP"], "skip", TAMPON, F(te="fail", fo="caution"))],
    # ---------------------------------------------------------- shower curtains
    "Barossa Design": [("OEKO-TEX fabric shower curtain liner", [["barossa"]], [], ["B08QRFZ6TH"], "careful",
                        "OEKO-TEX certified fabric, which is a real certification and a clear step up from a vinyl liner. Still a synthetic fabric, so it is the better plastic rather than no plastic.", F(fo="caution", te="pass"))],
    "LiBa": [("PEVA shower curtain liner", [["liba", "shower"], ["liba", "curtain"]], [], ["B00LS9UD2M"], "careful", PEVA_CURTAIN, F(fo="caution"))],
    # --------------------------------------------------------------- toothpaste
    "Crest": [("Crest whitening and 3D White pastes", [["crest", "toothpaste"], ["crest", "3d", "white"], ["crest", "scope"]], [], ["B005PLQIQ4", "B09F8FZ18G"], "skip",
               "Lead at about 399 ppb, with titanium dioxide and artificial dyes. Independent lab testing published by Lead Safe Mama in 2025. The brands dispute these results.", F(te="fail", fo="caution"))],
    "Colgate": [("Colgate Optic White and Cavity Protection", [["colgate", "optic", "white"], ["colgate", "cavity"], ["colgate", "toothpaste"]], [], ["B082F1QH7S", "B01BNEWDFQ"], "skip",
                 "Lead at about 539 ppb, the highest of the mainstream pastes, alongside titanium dioxide and SLS. Independent lab testing published by Lead Safe Mama in 2025. Colgate disputes these results.", F(te="fail", fo="caution"))],
    "Sensodyne": [("Sensodyne Repair and Protect Whitening", [["sensodyne", "repair"], ["sensodyne", "whitening"]], [], ["B07C1ZQ5ZY"], "careful",
                   "Lead at about 116 ppb in the whitening version. An effective active for sensitivity, but not a clean result. Independent lab testing published by Lead Safe Mama in 2025. The brands dispute these results.", F(te="caution"))],
    # ------------------------------------------------------------ water bottles
    "Owala": [("FreeSip bottles", [["owala"]], [], ["B0BZYCJK89"], "careful",
               "Stainless body, but the FreeSip lid puts a plastic spout and an internal straw directly in the drink path. Our drinkware standard is no plastic in the drink path at all, and the lid is where these bottles fail it.", F(pk="fail"))],
    # ---------------------------------------------------------------- yoga mats
    "Gaiam": [("Gaiam Premium PVC mats", [["gaiam", "yoga", "mat"], ["gaiam", "premium"]], [], ["B087F16GKW"], "skip", MAT, F(fo="fail"))],
    "CAP": [("CAP thick exercise mats", [["cap", "yoga", "mat"]], [], ["B0C7SFV8RH"], "skip", MAT, F(fo="fail"))],
    "Retrospec": [("Solana foam mats", [["retrospec", "yoga"], ["retrospec", "solana"]], [], ["B092XTMNCC"], "skip", MAT, F(fo="fail"))],
    # -------------------------------------------------------------- food storage
    "Vtopmart": [("Glass containers with plastic lids", [["vtopmart", "glass"], ["vtopmart", "storage"]], [], ["B0B9S5HZ26", "B0D7P6XKNP"], "careful", PLASTIC_LID, F(pk="caution"))],
    "Rubbermaid": [("Brilliance glass containers with plastic lids", [["rubbermaid", "brilliance", "glass"], ["rubbermaid", "glass"]], [], ["B08BR9HBZ3", "B08B7GLYZC"], "careful", PLASTIC_LID, F(pk="caution"))],
    # ------------------------------------------------------------------ cookware
    "CAROTE": [("CAROTE granite nonstick pans", [["carote"]], [], ["B0732NXYNS", "B0DS8Y8RY4", "B0DPHCFCRX"], "skip", PTFE_PAN, F(fo="fail"))],
    "Utopia Kitchen": [("Utopia Kitchen nonstick pan set", [["utopia", "kitchen", "nonstick"], ["utopia", "kitchen", "frying"]], [], ["B073WFLD35"], "skip", PTFE_PAN, F(fo="fail"))],
    "Tramontina": [("Professional nonstick frying pans", [["tramontina", "non", "stick"], ["tramontina", "nonstick"]], [], ["B009HBKQ16"], "skip", PTFE_PAN, F(fo="fail"))],
    "Sensarte": [("SENSARTE Swiss Granite nonstick pans", [["sensarte", "nonstick"], ["sensarte", "granite"], ["sensarte", "frying"]], [], ["B086PHS2V8"], "skip",
                  "The Swiss Granite line is a PTFE based coating despite the stone imagery, and it is in the food path. Sensarte also sells a genuinely PTFE free ceramic line, so the verdict depends which one you are looking at.", F(fo="fail"))],
    # ------------------------------------------------------------ protein powder
    "Optimum Nutrition": [("Gold Standard whey and creatine", [["optimum", "nutrition"]], [], ["B000GISTZ4", "B000QSTBNS", "B002DYIZHG", "B000QSNYGI", "B002DYIZEO", "B002DYIZEE"], "careful",
                           "Informed Choice certified on most lots, which covers banned substances rather than heavy metals or plastic. Protein powder is a category where independent testing has repeatedly found lead and cadmium, and there are no published metal numbers here to check.", F(te="caution"))],
    "Body Fortress": [("Super Advanced whey protein", [["body", "fortress"]], [], ["B0BJLBD427"], "skip",
                       "No third party certification for heavy metals or banned substances, with artificial sweeteners and colours. Protein powders are one of the categories where independent testing has repeatedly found lead and cadmium, so an uncertified daily powder is an unknown.", F(fo="fail"))],
    # ------------------------------------------------------------- dental floss
    "Oral-B": [("Glide and Essential floss", [["oral b", "glide"], ["oral b", "floss"], ["glide", "dental", "floss"]], [], ["B07FLBBWJR", "B01NBRH9TF", "B01KZOTTSO", "B074F5NNCP", "B0DJH7VTL9"], "skip", FLOSS, F(te="fail", fo="fail"))],
    "Plackers": [("Micro Line floss picks", [["plackers"]], [], ["B085YL4HR7"], "skip",
                  "A moulded plastic handle thrown away after a single use, with a nylon or polyester strand. Single use plastic by design, and the strand is not silk.", F(fo="fail"))],
    # ---------------------------------------------------------------- baby food
    "Beech-Nut": [("Baby food pouches", [["beech", "nut", "pouch"], ["beechnut", "pouch"]], ["jar"], ["B0BQJTVQS3", "B0BQJYCLKW"], "skip",
                   "A multilayer plastic pouch with an acidic puree inside, the combination Consumer Reports found phthalates in across the category in 2023, on a brand named in the 2021 Congressional heavy metals report with ingredients up to 913 ppb arsenic and 887 ppb lead. Beech-Nut's own glass jar line is the better half of the range.", F(pk="fail", te="fail"))],
    "Happy Baby": [("Clearly Crafted pouches", [["happy", "baby", "pouch"], ["happy", "baby", "clearly"]], [], ["B08B2QD558", "B07WJ9D3G2"], "skip",
                    "Multilayer plastic pouch plus acidic puree plus phthalate findings (Consumer Reports 2023), and the brand was named in the congressional heavy metals report on baby food.", F(pk="fail", te="fail"))],
    "Gerber": [("Gerber pouches and puffs", [["gerber", "pouch"], ["gerber", "puree"], ["gerber", "puffs"]], [], ["B0090DXWXA"], "skip",
                "Multilayer plastic pouch with an acidic puree, the combination behind the 2023 phthalate findings, and Gerber was among the brands named in the congressional report on heavy metals in baby food.", F(pk="fail", te="fail"))],
    "Serenity Kids": [("Serenity Kids pouches", [["serenity", "kids"]], [], ["B07TFBCDRC"], "careful",
                       "A better ingredient deck than the mainstream pouches, with real protein and fat rather than fruit puree filler. Still a multilayer plastic pouch, which is where the 2023 phthalate findings came from.", F(pk="caution", fo="pass"))],
    # -------------------------------------------------------------- body lotion
    "eos": [("eos Shea Better body lotion", [["eos", "lotion"], ["eos", "shea"]], [], ["B08KT2Z93D", "B0BZGRCBY4"], "careful",
             "A fragranced emulsion in a plastic bottle. An emulsion carries an oil phase, which pulls more out of a container than a water based product, and the fragrance is an undisclosed mixture left on skin all day.", F(fo="caution", pk="caution"))],
    "Aveeno": [("Daily Moisturizing body lotion", [["aveeno", "lotion"], ["aveeno", "moisturizing"]], [], ["B001459IEE"], "careful",
                "A fragranced leave on emulsion in a plastic bottle. Aveeno's sunscreens are a separate and worse problem; this verdict covers the lotion.", F(fo="caution"))],
    "CeraVe": [("Invisible Mineral Sunscreen SPF 50", [["cerave", "mineral", "sunscreen"]], [], ["B0FXNHDWM7"], "good",
                "A 100 percent mineral filter, zinc oxide and titanium dioxide, with no chemical UV filters. Sold in a plastic tube, which for an emulsion is worth knowing but not disqualifying.", F(fo="pass")),
               ("Daily Moisturizing Lotion", [["cerave", "moisturizing", "lotion"], ["cerave", "daily"]], ["sunscreen", "mineral"], ["B07RK4HST7"], "good",
                "Fragrance free with ceramides and no undisclosed scent mixture, which is the main thing that goes wrong in a leave on lotion. Sold in a plastic bottle, a caution for an emulsion rather than a fail.", F(fo="pass"))],
    "Olay": [("Olay body lotion", [["olay", "lotion"], ["olay", "body"]], [], ["B0D7XXQYNH"], "careful",
              "A fragranced leave on emulsion in plastic. Fragrance is an undisclosed mixture, and a body lotion sits on the largest organ you have for the rest of the day.", F(fo="caution"))],
    "Jergens": [("Jergens body lotion", [["jergens"]], [], ["B0FKC23886"], "careful",
                 "A fragranced leave on emulsion in a plastic bottle, with the fragrance an undisclosed mixture.", F(fo="caution"))],
    # --------------------------------------------------------------------- salt
    "Maldon": [("Maldon sea salt flakes", [["maldon"]], [], ["B086XGH24W"], "careful",
                "A clean flake salt with no additives, but sea salt is one of the categories where independent testing finds microplastics and heavy metals, and there is no published third party testing on this one to check against.", F(te="caution"))],
    "Celtic Sea Salt": [("Celtic light grey sea salt", [["celtic", "sea", "salt"]], [], ["B000SWVPV8"], "careful",
                         "Unrefined and mineral rich, which is the selling point, but unrefined also means whatever the sea carried is still in it. Sea salt is a known microplastic and heavy metal category and there is no published third party testing here.", F(te="caution"))],
    "Baja Gold": [("Baja Gold mineral sea salt", [["baja", "gold"]], [], ["B0CB4X5TDP"], "careful",
                   "Marketed on mineral content, but unrefined is not the same as tested. Sea salt is a category where microplastics and heavy metals turn up, and there is no published third party metal or particle testing.", F(te="caution"))],
    "365 by Whole Foods Market": [("365 sea salt", [["365", "sea", "salt"], ["365", "whole", "foods", "salt"]], [], ["B074J7X1DW"], "careful",
                                   "No published third party heavy metal or microplastic testing, which is what this category needs rather than an organic label. Organic does not lower metals in salt.", F(te="caution"))],
    "Amazon Grocery": [("Amazon Grocery sea salt", [["amazon", "grocery", "salt"]], [], ["B07QW1G8MW"], "careful",
                        "No published third party heavy metal or microplastic testing. Sea salt is a category where independent testing finds both, so the absence of a number is the finding.", F(te="caution")),
                       ("Amazon Saver black tea", [["amazon", "saver", "tea"]], [], ["B07X1HW96F"], "careful", TEA, F(pk="caution")),
                       ("Amazon Grocery spring water", [["amazon", "grocery", "water"], ["amazon", "grocery", "spring"]], [], ["B0CRF7TG4K"], "skip", PET_WATER, F(pk="fail"))],
    # -------------------------------------------------------- cleaning products
    "Lysol": [("All Purpose Cleaner spray", [["lysol", "all", "purpose"], ["lysol", "cleaner"]], [], ["B0BNP5QQ53", "B00QIT9NDW", "B0G3CJ33QG"], "skip",
               "A quaternary ammonium disinfectant with an undisclosed fragrance, sprayed onto kitchen surfaces and left to dry. Quats are respiratory irritants and are linked to asthma in regular users, and a disinfectant is the wrong default for daily cleaning.", F(fo="fail"))],
    "Mrs. Meyer's": [("Clean Day cleaner sprays", [["mrs", "meyer"]], [], ["B01IQ9R37E"], "careful",
                      "Plant derived surfactants, which is the better half, but a heavy undisclosed fragrance load in a single use plastic spray bottle. It is rinsed and diluted rather than left on skin, so the exposure is lower than personal care.", F(fo="caution"))],
    "Method": [("Method all purpose cleaner sprays", [["method", "all", "purpose"], ["method", "cleaner"]], [], ["B007AHO6CO", "B0BGQTZB4T"], "careful",
                "Better ingredient disclosure than the disinfectant brands, but fragranced and sold in a single use plastic spray bottle. A refill tablet system removes the bottle entirely.", F(fo="caution"))],
    # ------------------------------------------------------------ crib mattress
    "Graco": [("Premium foam crib mattress", [["graco", "mattress"], ["graco", "crib"]], [], ["B010S7VZI0"], "careful",
               "A polyurethane foam core, which is the standard budget construction and the thing organic crib mattresses exist to avoid. No GREENGUARD or organic certification on this model, and a baby sleeps on it for twelve hours a day.", F(fo="caution"))],
    "Dream On Me": [("Nap Nest crib mattress", [["dream", "on", "me", "mattress"], ["dream", "on", "me", "crib"]], [], ["B0FHBBTK6W", "B0FJ2XG7QB"], "careful",
                     "GREENGUARD Gold certified, which tests VOC emissions and is a real certification. The fill is still polyurethane foam, so the certification covers what comes off it rather than what it is made of.", F(te="pass", fo="caution"))],
    "Serta": [("Perfect Slumber and Perfect Start crib mattresses", [["serta", "crib"], ["serta", "mattress"]], [], ["B08KRD7LNX", "B0FHXLNXXY"], "careful",
               "A polyurethane foam core with a waterproof layer, which on crib mattresses is usually a vinyl or polyurethane film. No GREENGUARD or organic certification on the mainstream models.", F(fo="caution"))],
    # ---------------------------------------------------------------------- tea
    "Lipton": [("Lipton tea bags", [["lipton", "tea"]], [], ["B0DX5XQNRH"], "careful", TEA, F(pk="caution"))],
    "Twinings": [("Twinings tea bags", [["twinings"]], [], ["B001GM60LE", "B0DYK97R27"], "careful", TEA, F(pk="caution"))],
    "Bigelow": [("Bigelow tea bags", [["bigelow"]], [], ["B001A3OADO"], "careful", TEA, F(pk="caution"))],
    "THETCHRY": [("THETCHRY plastic cutting boards", [["thetchry"]], [], ["B0CXPR165S"], "skip", CUT, F(fo="fail"))],
    "Venture Pal": [("Venture Pal electrolyte stick packs", [["venture", "pal"]], [], ["B0FKN3ZTBJ"], "careful",
                     "Sugar free with a high sodium profile, sold in single serve stick packs, which carry the most plastic surface area per dose in the category. No published PFAS or heavy metal testing.", F(pk="caution"))],
    "Mrs Awesome": [("Mrs Awesome shower curtain liner", [["mrs", "awesome"]], [], ["B08NJ6VF9T"], "careful", PEVA_CURTAIN, F(fo="caution"))],
    "BigFoot": [("BigFoot clear shower curtain", [["bigfoot", "shower"], ["bigfoot", "curtain"]], [], ["B08CRPWQHB"], "careful", PEVA_CURTAIN, F(fo="caution"))],
    "EHZNZIE": [("EHZNZIE PEVA shower curtain liner", [["ehznzie"]], [], ["B093D7Y3F2"], "careful", PEVA_CURTAIN, F(fo="caution"))],
    "POWCAN": [("POWCAN insulated bottle with straw lid", [["powcan"]], [], ["B0D8J2ZB8P"], "careful", STRAW_LID, F(pk="fail"))],
    "Triple Tree": [("Triple Tree insulated bottle", [["triple", "tree", "bottle"], ["triple", "tree", "insulated"]], [], ["B07Z4L57XQ"], "careful", STRAW_LID, F(pk="caution"))],
    "DYSANKY": [("DYSANKY insulated bottle with straw lid", [["dysanky"]], [], ["B0DLCG65B5"], "careful", STRAW_LID, F(pk="fail"))],
    "Fijinhom": [("Fijinhom insulated bottle", [["fijinhom"]], [], ["B0D2W136D1"], "careful", STRAW_LID, F(pk="caution"))],
    "Dealusy": [("Dealusy glass containers with plastic lids", [["dealusy"]], [], ["B0GRTKQBCN"], "careful", PLASTIC_LID, F(pk="caution"))],
    "Liuruiyu": [("Liuruiyu glass containers with plastic lids", [["liuruiyu"]], [], ["B0F9K2KXZV"], "careful", PLASTIC_LID, F(pk="caution"))],
    "Letmxiu": [("Letmxiu foam crib mattress", [["letmxiu"]], [], ["B0BLK39GTG"], "careful",
                 "A foam core with a knitted synthetic cover and no GREENGUARD or organic certification. A baby sleeps on this twelve hours a day, one of the longest contact times in the house.", F(fo="caution"))],
    "HEARTHY FOODS": [("HEARTHY FOODS creatine", [["hearthy", "foods"]], [], ["B0DX7846R5"], "careful",
                       "A dry powder in a plastic tub, which is low migration packaging. No third party certification and no published heavy metal testing, which is what this category needs.", F(pk="pass"))],
    "BulkSupplements": [("BulkSupplements creatine monohydrate", [["bulksupplements"]], [], ["B00E9M4XEE"], "careful",
                         "Sold as a plain dry powder with a certificate of analysis available on request, which is better than nothing but is the brand's own testing rather than third party certification.", F(pk="pass"))],
    "AmazonBasics": [("Amazon Basics exercise and yoga mats", [["amazon", "basics", "yoga"], ["amazon", "basics", "exercise"]], [], ["B01LP0U5X0", "B01LP0UX9G"], "skip",
                      MAT, F(fo="fail"))],
    # ------------------------------------------------------------- bottled water
    "Pure Life": [("Pure Life purified bottled water", [["pure", "life", "water"], ["pure", "life", "purified"]], [], ["B00LXMD998", "B0D17X879B", "B00C9RNQ8K", "B076Z14K59"], "skip", PET_WATER, F(pk="fail"))],
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
    for bid, name, cat, stance, reason, evidence, alt, article, aliases in NEW_BRANDS:
        if collapse(name) in by_name:
            continue
        entry = {"id": bid, "brand": name, "category": cat, "stance": stance,
                 "reason": reason, "evidence": evidence, "sources": [article],
                 "article": article, "reviewed": True, "generalises": False}
        if alt:
            entry["alternative"] = alt
        if aliases:
            entry["aliases"] = aliases
        brands.append(entry)
        by_name[collapse(name)] = entry
        created += 1

    # Thinksport is Thinkbaby's sibling label from the same manufacturer, so it
    # resolves to the entry that already carries the testing result.
    tb = by_name.get("thinkbaby")
    if tb:
        al = set(tb.get("aliases") or []) | {"Thinksport"}
        tb["aliases"] = sorted(al)

    added = replaced = 0
    tally = collections.Counter()
    for brand_name, rows in ROWS.items():
        b = by_name.get(collapse(brand_name))
        if not b:
            print(f"  !! {brand_name} not found")
            continue
        prods = b.setdefault("products", [])
        for pname, match_all, match_not, asins, verdict, note, fronts in rows:
            for other in brands:
                for op in (other.get("products") or []):
                    shared = set(op.get("asins") or []) & set(asins)
                    if shared and not (other is b and op.get("name") == pname):
                        op["asins"] = [a for a in (op.get("asins") or []) if a not in shared]
                        replaced += 1
            row = {"name": pname, "matchAll": match_all, "asins": asins,
                   "verdict": verdict, "note": note, "origin": "hand",
                   "source": b.get("article"),
                   "ext": {"verdict": verdict,
                           "why": "Reviewed by hand from our published research on this category.",
                           "fronts": fronts, "scope": "line", "basis": "direct",
                           "disclose": False, "authored": True}}
            if match_not:
                row["matchNot"] = match_not
            hit = next((p for p in prods if p.get("name") == pname), None)
            if hit:
                prods[prods.index(hit)] = row
            else:
                prods.append(row)
            added += 1
            tally[verdict] += 1

    brands.sort(key=lambda b: collapse(b["brand"]))
    print(f"created {created} brands")
    print(f"added   {added} product rows  {dict(tally)}")
    print(f"pulled  {replaced} ASINs off rows that wrongly claimed them")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}, now {len(brands)} brands")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
