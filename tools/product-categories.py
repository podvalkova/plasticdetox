#!/usr/bin/env python3
"""
Put the category on the product, because that is where search intent lives.

The category was a field on the brand, and brands sell more than one thing.
AmazonBasics carries a prenatal gummy, a yoga mat, dog bowls and a vacuum.
Gerber carries baby food and polyester pyjamas. Graco carries a car seat and a
crib mattress. No single label on the brand can serve someone searching "diaper
cream", which is what people actually type.

That is also where the slash-categories came from: "Car seats / sleep" exists
because Graco sells both and the brand needed one field. Nobody searches for it.

So each product row gets its own category, read from what the product is. The
brand keeps its own for Brand Check, which answers a different question.

    python3 tools/product-categories.py            # report only
    python3 tools/product-categories.py --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"

# Ordered: the first match wins, so put the specific before the general.
# Every key is something a person would actually type into a search box.
RULES = [
    # Period care leads, for two reasons. "Pads" and "liners" collide with the
    # bedding, wipes and diaper rules further down, which is how Always Ultra
    # Thin Pads was filed under Bedding (the note says "backsheet", and the
    # bedding pattern matched "sheet" mid word) and Rael under Baby wipes (its
    # note mentions the wipes lawsuit). And one "Menstrual products" bucket is
    # not a category anyone searches: pads, tampons, liners, cups and period
    # underwear are five separate intents, the way diapers and diaper cream are.
    # "\bpads?\b" alone put a coconut dish scrubber in here, so each pattern
    # needs a period care word next to it.
    ("Period underwear",    r"period (underwear|brief|panty|panties)|leakproof (underwear|brief)|"
                            r"\b(thinx|knix)\b"),
    ("Menstrual cups",      r"menstrual (cup|disc)|period (cup|disc)|\bdivacup\b|organicup|allmatters"),
    ("Reusable cloth pads", r"cloth pad|reusable pad|washable pad|gladrags"),
    ("Tampons",             r"tampon"),
    ("Panty liners",        r"panty ?liner|pantiliner|(organic cotton|cotton cover) liners?\b"),
    ("Period pads",         r"(period|sanitary|menstrual|maxi|ultra thin|overnight|day|night) pads?\b|"
                            r"sanitary (napkin|towel)|pads? with wings|pads and liners"),
    ("Diaper cream",        r"diaper (rash )?(cream|paste|balm|ointment)|butt paste|nappy cream"),
    ("Baby wipes",          r"\bwipes?\b"),
    ("Diapers",             r"\bdiapers?\b|nappy|nappies|pull[- ]ups?|training pant"),
    ("Baby bottles",        r"baby bottle|infant bottle|sippy|straw cup|training cup|"
                            r"(glass|plastic|polypropylene) bottles?\b|anti[- ]colic|feel good"),
    ("Pacifiers",           r"pacifier|soothie|dummy\b"),
    ("Teethers",            r"teether|teething"),
    ("Breast milk storage", r"breast milk|milk storage|milk collect"),
    ("Baby formula",        r"\bformula\b"),
    ("Baby food",           r"baby food|puree|pouch|puffs|teething wafer|infant cereal|oatmeal"),
    ("Prenatal vitamins",   r"prenatal"),
    # There was no skincare category at all, so a serum matched nothing by name
    # and fell through to its note, where food words live: MARA's Universal Face
    # Oil was filed under Pantry and True Botanicals' Pure Radiance Oil under
    # Clothing. A face oil is not a cooking oil and a toner is not a vitamin.
    ("Skincare",            r"serum|face oil|facial oil|body oil|moisturi[sz]er|eye cream|"
                            r"\btoner\b|face cream|moisture cream|night cream|day cream|retinol|hyaluronic|ampoule|"
                            r"cleansing (oil|balm|mousse|cream)|face mask|facial"),
    ("Supplements",         r"creatine|omega|cod liver|vitamin|magnesium|probiotic|collagen|protein powder|whey"),
    ("Electrolytes",        r"electrolyte|hydration|rehydration"),
    ("Sunscreen",           r"sunscreen|\bspf\b|sunblock"),
    ("Baby lotion",         r"baby (lotion|oil|balm|wash|shampoo)|calendula|healing ointment"),
    ("Body lotion",         r"\blotion\b|body butter|moisturiz|moisturis|body oil"),
    ("Deodorant",           r"deodorant|antiperspirant"),
    ("Toothpaste",          r"toothpaste|tooth gel|tooth powder|earthpaste|ela mint|hydroxyapatite|"
                            r"\bpastes?\b|whitening|3d white|optic white|repair and protect"),
    ("Toothbrushes",        r"toothbrush"),
    ("Dental floss",        r"\bfloss\b"),
    ("Cutting boards",      r"butcher block|board (oil|conditioner|cream)"),
    ("Conditioner",         r"conditioner"),
    ("Shampoo",             r"shampoo"),
    ("Razors",              r"razor|safety razor|shaving|shave"),
    # Before Cleaning products, whose "scrub" was catching a body scrub.
    ("Bath accessories",    r"loofah|loofa|bath sponge|body scrub|bath brush|washcloth|"
                            r"body brush|dry brush|shower steamer"),
    ("Soap",                r"castile|bar soap|hand soap|body wash|face wash|cleanser"),
    ("Makeup",              r"mascara|lipstick|foundation|eyeliner|eye shadow|blush|lip balm|nail polish|concealer"),
    ("Chewing gum",         r"\bgum\b"),
    ("Sea salt",            r"\bsalt\b"),
    ("Coffee",              r"coffee|espresso|french press|pour over|kettle|grinder|drip"),
    ("Tea",                 r"\btea\b|infuser|teapot"),
    ("Bottled water",       r"bottled water|spring water|purified water"),
    ("Water filters",       r"water filter|reverse osmosis|filtration|pitcher filter|\bro\b|"
                            r"shower filter|carafe|replacement filter|under sink|whole house|"
                            r"longlast|claryum|aq-\d"),
    ("Water bottles",       r"water bottle|tumbler|travel mug|thermos|canteen"),
    ("Cookware",            r"pan\b|skillet|cookware|frying|dutch oven|saucepan|bakeware|"
                            r"baking sheet|nonstick|non-stick"),
    ("Air fryers",          r"air fryer|airfryer"),
    ("Kitchen appliances",  r"blender|mixer|rice cooker|slow cooker|pressure cooker|toaster|popcorn|frother"),
    ("Cutting boards",      r"cutting board|chopping board|butcher block"),
    ("Food storage",        r"food storage|storage container|mason jar|jar lid|beeswax wrap|"
                            r"food container|bento|lunch|bread box|produce bag|cheese"),
    ("Tableware",           r"plate|bowl|utensil|spoon|fork|cup set|dinnerware|bib\b"),
    ("Laundry detergent",   r"laundry|detergent|dryer ball|fabric softener|stain remover"),
    ("Cleaning products",   r"cleaner|cleaning|dish soap|dish block|dish brush|scrub|sponge|disinfect"),
    ("Air purifiers",       r"air purifier|hepa|air filter"),
    ("Vacuums",             r"vacuum"),
    ("Crib mattresses",     r"crib mattress|toddler mattress|changing pad|mattress"),
    ("Cribs & nursery",     r"\bcrib\b|bassinet|glider|nursery|high chair|play ?mat|playard"),
    ("Car seats",           r"car seat"),
    ("Strollers",           r"stroller|pram|carrier|babywearing|wrap\b"),
    ("Baby sleep",          r"swaddle|sleep sack|sleeping bag|white noise|night light"),
    ("Shower curtains",     r"shower curtain|curtain liner"),
    ("Bedding",             r"\bsheets?\b|bed sheet|pillow|duvet|blanket|towel|bath mat|curtain|rug\b"),
    ("Clothing",            r"clothing|pajama|pyjama|onesie|romper|hat\b|swimsuit|swim|sock|bodysuit"),
    ("Yoga mats",           r"yoga|exercise mat|pilates"),
    ("Toys",                r"\btoys?\b|teether|rattle|blocks|magnetic tile|doll|ball\b"),
    ("Pet supplies",        r"\bdog\b|\bcat\b|\bpet\b|chew toy"),
    ("Pantry",              r"olive oil|almond|bean|rice|flour|oats|sugar|spice|turmeric|cumin|pasta|sauce|honey|popcorn kernel"),
]


# A brand's own label is the fallback for a whole-range row, and some of those
# labels are not search terms. Nobody types "Coffee & kitchen" or "Basics", and
# a slash-category exists only because the brand field had to hold two things.
FALLBACK = {
    "Coffee & kitchen": "Coffee", "Coffee beans": "Coffee", "Coffee brewer": "Coffee",
    "Coffee grinder": "Coffee", "Espresso machine": "Coffee", "Reusable coffee cup": "Coffee",
    "Tea accessory": "Tea",
    "Sunscreen / baby skincare": "Sunscreen",
    "Basics": "Bedding", "Bedding / basics": "Bedding", "Bath textiles": "Bedding",
    "Baby textiles": "Bedding", "Rugs": "Bedding", "Bedroom": "Bedding",
    "Beach toys": "Toys", "Beach shade": "Toys", "Play mats": "Toys",
    "Tableware / toys": "Tableware", "Tableware / bibs": "Tableware",
    "Baby textiles / teethers": "Teethers",
    "Activewear": "Clothing", "Activewear / basics": "Clothing",
    "Bedding / sleepwear": "Bedding", "Swimwear": "Clothing", "Kids clothing": "Clothing",
    "Baby clothing": "Clothing", "Sun hats": "Clothing", "Baby sun hats": "Clothing",
    "High chairs": "Cribs & nursery", "Nursery furniture": "Cribs & nursery",
    "Nursery": "Cribs & nursery", "Mattress": "Crib mattresses",
    "Car seats / sleep": "Car seats", "Car seats / strollers": "Car seats",
    "Vacuum": "Vacuums", "Appliances": "Kitchen appliances", "Bakeware": "Cookware",
    "Bath accessories": "Personal care", "Skincare": "Personal care",
    "Salt / electrolytes": "Sea salt", "Salt": "Sea salt",
    "Grains": "Pantry", "Legumes": "Pantry",
    "Baby food / formula": "Baby food", "Baby food prep": "Baby food",
    "Baby food storage": "Food storage", "Coolers": "Food storage",
    "Gum": "Chewing gum", "Fitness": "Yoga mats", "Drinkware": "Water bottles",
    "Toddler drinkware": "Water bottles", "Kids oral care": "Toothpaste",
    "Oral care": "Toothpaste", "Period care": "Menstrual products",
    "Baby & kids": "Toys", "Pets": "Pet supplies", "Water filter": "Water filters",
    "Baby sleep": "Baby sleep", "Cleaning": "Cleaning products",
    "Laundry": "Laundry detergent", "Cosmetics": "Makeup",
    "Air purifier": "Air purifiers", "Wipes": "Baby wipes",
    "Cloth diapers": "Diapers", "Diapers & wipes": "Diapers",
    "Baby skincare": "Baby lotion", "Diaper cream": "Diaper cream",
    "Chewing gum": "Chewing gum", "Strollers": "Strollers", "Baby carriers": "Strollers",
}


# Words that name a container, not a product kind. In a name they identify the
# thing; in a note they are nearly always describing what something is packaged
# in. Reading them off a note filed three Earth Harbor serums, a MARA face oil,
# an Ogee lip oil, a True Botanicals oil and a prenatal under Baby bottles,
# because each note mentions a glass bottle.
PACKAGING_WORDS = re.compile(
    r"(glass|plastic|polypropylene|amber|pump) bottles?\b|glass jars?\b")


def categorise(name, note, brand_cat):
    """
    The product's own name decides. The note is only consulted when the name
    says nothing, because a note routinely uses a category word about something
    else: "the formula is clean" put two dozen unrelated products into Baby
    formula, and "no plastic in the drink path" would pull a pan into Drinkware.
    """
    n = (name or "").lower()
    for cat, pat in RULES:
        if re.search(pat, n):
            return cat
    hay = PACKAGING_WORDS.sub(" ", (note or "").lower())
    for cat, pat in RULES:
        if re.search(pat, hay):
            return cat
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    per = collections.Counter()
    unmatched = []
    set_count = 0

    for b in brands:
        bc = b.get("category")
        for p in (b.get("products") or []):
            if not p.get("ext"):
                continue
            # A category set by hand outranks the patterns. Research knows what
            # a product is; the classifier is guessing from words. It read
            # "LIVLIT Organic Cotton Pads" as Pantry, because nothing in that
            # name says period care and the fallback took over.
            if p.get("catAuthored") and p.get("cat"):
                per[p["cat"]] += 1
                set_count += 1
                continue
            c = categorise(p.get("name") or "", (p.get("note") or "")[:220], bc)
            if not c:
                # fall back to the brand's own label rather than inventing one
                c = FALLBACK.get(bc, bc) or "Uncategorised"
                unmatched.append((b["brand"], p.get("name"), bc))
            p["cat"] = c
            per[c] += 1
            set_count += 1

    thin = sorted(((c, n) for c, n in per.items() if n < 5), key=lambda t: t[1])
    print(f"product rows categorised: {set_count}")
    print(f"categories: {len(per)}   holding fewer than 5: {len(thin)}")
    print(f"rows no rule matched, kept on the brand's label: {len(unmatched)}\n")
    for c, n in sorted(per.items(), key=lambda t: (-t[1], t[0])):
        print(f"  {n:>3}  {c}")
    if thin:
        print("\nstill under five:")
        for c, n in thin:
            print(f"  {n}  {c}")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
