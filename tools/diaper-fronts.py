#!/usr/bin/env python3
"""
Materials and independent tests for every diaper, from our own published guide.

articles/best-non-toxic-diapers.html already carries the research: the 2023
Mamavation round (65 diapers, 40 brands, EPA certified lab, total organic
fluorine at a 10 ppm threshold) with per brand ppm figures, and a materials
read on each brand built around the TCF versus ECF distinction. None of that
had reached the scorecard, so 35 of 44 diaper rows had no materials answer and
23 had no testing answer.

This transcribes it. Every string below is the article's own finding. Nothing
is written over an existing adverse front, and nothing is written over a pass.

    python3 tools/diaper-fronts.py [--write]
"""
import json, sys, pathlib

DATA = pathlib.Path("brand-data.json")
ROUND = "2023 Mamavation round, EPA certified lab, 10 ppm threshold"

# brand -> {front: (status, note)}. Applied to every diaper row of that brand,
# because the screening and the pulp process are brand-and-line facts.
BRAND = {
 "Coterie": {
   "materials": ("pass", "Totally chlorine free pulp with a full public ingredient list, layer by layer, and no fragrance, lotion, latex, parabens or phthalates"),
   "testing":   ("pass", f"Non detect for organic fluorine inside and outside ({ROUND}). EWG Verified across every size from newborn to size 7 as of June 2026")},
 "HealthyBaby": {
   "materials": ("pass", "Core is 40 percent FSC wood pulp, totally chlorine free with no elemental chlorine or chlorine dioxide; topsheet 50 percent plant derived polyethylene, outer cover 15 percent organic cotton"),
   "testing":   ("pass", "The first EWG Verified diaper, screened against more than 3,900 chemicals of concern, and tested for VOCs, pesticides and heavy metals")},
 "Eco by Naty": {
   "materials": ("pass", "Totally chlorine free pulp with a plant based topsheet, no fragrance or lotion"),
   "testing":   ("pass", f"Non detect for organic fluorine inside and outside ({ROUND})")},
 "Seventh Generation": {
   "materials": ("pass", "Totally chlorine free pulp, no fragrance, lotion or added dyes on the topsheet"),
   "testing":   ("pass", f"Non detect for organic fluorine inside and outside ({ROUND})")},
 "Cloth-eez": {
   "materials": ("pass", "100 percent unbleached organic cotton, OEKO-TEX certified, sold direct by Green Mountain Diapers"),
   "testing":   ("pass", f"Non detect for organic fluorine inside and outside ({ROUND})")},
 "Thirsties": {
   "materials": ("pass", "GOTS certified organic cotton absorbency sewn into the cover, made in the USA"),
   "testing":   ("pass", f"Non detect for organic fluorine inside and outside ({ROUND})")},
 "EcoAble": {
   "testing":   ("pass", f"Four layer hemp and organic cotton doublers, non detect for organic fluorine ({ROUND})")},
 "Kanga Care": {
   "testing":   ("pass", f"The Rumparooz one size tested non detect inside and outside, in the round where waterproof layers were the worst performing category ({ROUND})")},
 "Rumparooz One Size": {
   "testing":   ("pass", f"Tested non detect inside and outside, in the round where waterproof layers were the worst performing category ({ROUND})")},
 "Bambo Nature": {
   "materials": ("pass", "Totally chlorine free pulp with Asthma Allergy Nordic, OEKO-TEX, EU Ecolabel and FSC certification")},
 "Kudos": {
   "materials": ("pass", "Cotton lined topsheet chosen to avoid a plastic surface, OEKO-TEX certified")},
 "The Honest Company": {
   "materials": ("pass", "Fine on materials; the record against this brand is its labelling language, not its construction"),
   "testing":   ("pass", f"The diapers tested non detect for organic fluorine ({ROUND})")},
 "Dyper": {
   "testing":   ("pass", f"Non detect twice, in the {ROUND} and in the brand's own Bureau Veritas testing")},
 "Hello Bello": {
   "testing":   ("pass", f"Tested non detect for organic fluorine ({ROUND}). Treat it as historical: the company changed hands in 2023")},
}

# Detections, with the figure the article publishes. These rows are already
# caution; this replaces a generic sentence with the measured number.
DETECT = {
 "ATTITUDE":            "60 ppm organic fluorine inside, the highest disposable result of the round",
 "Happy Little Camper": "30 ppm organic fluorine inside",
 "BabyCozy":            "28 ppm organic fluorine outside on the Bouncy Soft diaper",
 "Bambo Nature":        "18 ppm inside and 22 ppm outside on the Dream diaper. Low numbers, and an ecolabel covers environmental criteria rather than fluorine",
 "Babyganics":          "12 ppm organic fluorine outside on the Skin Love diaper",
 "Rascal & Friends":    "10 ppm organic fluorine outside, at the detection threshold",
 "OsoCozy":             "20 ppm organic fluorine, which is why Cloth-eez is the better prefold",
 "Kudos":               "Size 4 returned up to 53 ppm, the highest disposable result of the round, while size 5 in the same materials was non detect. Kudos retested at Vartest in December 2023 with no PFAS detected, so two labs disagree",
 "GroVia":              "The hybrid waterproof cover returned 323 ppm, the highest single figure in the whole round",
}

ASIN = {
 ("ATTITUDE","Eco diapers"): (["B0D74W5R23"], "Attitude Eco-Conscious Disposable Diapers, EWG Verified"),
 # The row named Swaddlers carried B0CMVJXXZ2, which is Pampers Sensitive baby
 # WIPES. A diaper row pointing at a pack of wipes is the wrong product.
 ("Pampers","Swaddlers"):    (["B07HCVBB1C"], "Pampers Swaddlers Disposable Baby Diapers Size 1"),
}


def main():
    write = "--write" in sys.argv
    brands = json.loads(DATA.read_text())
    mat, tst, det, asin, skipped = [], [], [], [], []

    for b in brands:
        bn = b.get("brand")
        for p in b.get("products") or []:
            if (p.get("cat") or b.get("category") or "") != "Diapers":
                continue
            e = p.setdefault("ext", {})
            fr = e.setdefault("fronts", {})
            notes = e.setdefault("frontNotes", {})
            orig = e.setdefault("frontOrigin", {})

            key = (bn, p.get("name"))
            if key in ASIN and not (p.get("asins") or []):
                p["asins"], label = ASIN[key][0], ASIN[key][1]
                asin.append((bn, p.get("name"), p["asins"][0], label))
            elif key in ASIN:
                p["asins"] = ASIN[key][0]
                asin.append((bn, p.get("name"), p["asins"][0], ASIN[key][1] + " (replaced)"))

            for front, (status, note) in (BRAND.get(bn) or {}).items():
                cur = fr.get(front)
                if cur in ("caution", "fail"):
                    skipped.append((bn, p.get("name"), front, cur)); continue
                if cur == "pass" and front in notes:
                    continue
                fr[front] = status; notes[front] = note; orig[front] = "hand"
                (mat if front == "materials" else tst).append((bn, p.get("name"), front, status))

            if bn in DETECT and fr.get("testing") in ("caution", "fail"):
                notes["testing"] = DETECT[bn] + f" ({ROUND})"
                orig["testing"] = "hand"
                det.append((bn, p.get("name")))

    print(f"ASINs set or corrected : {len(asin)}")
    for bn, nm, a, label in asin:
        print(f"    {bn} / {nm} -> {a}  {label}")
    print(f"\nmaterials answered     : {len(mat)}")
    print(f"testing answered       : {len(tst)}")
    print(f"detections given their measured figure: {len(det)}")
    if skipped:
        print(f"\nleft alone, already adverse: {len(skipped)}")
        for bn, nm, f, cur in skipped[:8]:
            print(f"    {bn} / {nm} [{f}={cur}]")

    if write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA}")
    else:
        print("\ndry run. re-run with --write")


if __name__ == "__main__":
    main()
