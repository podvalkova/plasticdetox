#!/usr/bin/env python3
"""
Move the diaper category's stated reasons onto the scorecard.

40 careful/skip rows in Diapers, Diaper cream and Baby wipes carry no adverse
finding on any front, so the app renders the verdict badge over an empty
"why we flag it". None of them is unjustified: every one already states its
reason in prose. This transcribes those reasons onto the front they belong to,
which is what the card actually reads.

Nothing here is new research and no verdict changes. Each note below is an
extraction of wording already in the row, so the card says what the article
says. Two rows are deliberately left alone, recorded at the bottom.

    python3 tools/encode-diaper-reasons.py [--write]
"""
import json, sys, pathlib

DATA = pathlib.Path("brand-data.json")

# (brand, product) -> [(front, status, note), ...]
MAP = {
 ("Aquaphor","Baby diaper rash paste with zinc oxide"):[
   ("testing","fail","Lead returned in the 2025 to 2026 diaper cream series, with cadmium in most samples (Lead Safe Mama). The brand disputes these results"),
   ("formula","caution","Lanolin, a wool derived allergen for some children, on already broken skin")],
 ("ATTITUDE","Eco diapers"):[
   ("testing","caution","60 ppm organic fluorine inside in 2023 independent screening, the highest among eco positioned disposable brands")],
 ("BabyCozy","Whole range"):[
   ("testing","caution","The Bouncy Soft diaper returned organic fluorine in 2023 independent screening")],
 ("Babyganics","Whole range"):[
   ("testing","caution","The Skin Love diaper returned a low level organic fluorine detection in 2023 independent screening")],
 ("Bambino Mio","Whole range"):[
   ("testing","caution","The Miosolo all in one returned high organic fluorine on the waterproof layer in 2023 independent screening")],
 ("Bambo Nature","Whole range"):[
   ("testing","caution","The Dream diaper returned organic fluorine in 2023 independent screening, despite the Nordic Swan Ecolabel")],
 ("Boudreaux's Butt Paste","Butt Paste, including the Natural line"):[
   ("formula","fail","Balsam of Peru, one of the top five pediatric contact allergens, in a product for already irritated skin. The Natural line carries it too")],
 ("Burt's Bees Baby","Diaper ointment"):[
   ("testing","fail","The 40% zinc ointment reported over 2,500 ppb lead plus cadmium in 2025 testing (Lead Safe Mama)")],
 ("Charlie Banana","Whole range"):[
   ("testing","caution","Both the swim diaper and the one size diaper returned organic fluorine in 2023 screening, despite OEKO-TEX certification")],
 ("Desitin","Diaper Rash Cream"):[
   ("testing","fail","About 3,300 ppb lead reported in 2025 independent testing"),
   ("formula","fail","The drug label lists talc and undisclosed fragrance among the inactives, over a petrolatum carrier")],
 ("Desitin","Daily Defense diaper rash cream"):[
   ("formula","caution","The drug label lists talc and undisclosed fragrance among the inactives"),
   ("testing","caution","The Maximum Strength version from the same range measured about 3,300 ppb lead")],
 ("Dyper","Bamboo Disposable Diapers"):[
   ("materials","caution","Marketed chlorine free but never totally chlorine free; the core is described as elemental chlorine free pulp")],
 ("Dyper","Whole range"):[
   ("materials","caution","Markets itself as chlorine free without claiming totally chlorine free; the core is elemental chlorine free pulp")],
 ("Earth & Eden","Whole range"):[
   ("materials","caution","The fluff is elemental chlorine free rather than totally chlorine free, which is the distinction that matters")],
 ("ECO BOOM","Whole range"):[
   ("materials","caution","The top sheet is viscose from bamboo, dissolved and regenerated through a chemical process, so rayon rather than mechanical bamboo")],
 ("Eco Pea Co","Whole range"):[
   ("formula","caution","The published list includes polyhexamethylene biguanide, a synthetic antimicrobial polymer, and a silicone antifoam emulsion")],
 ("GroVia","Whole range"):[
   ("testing","caution","The hybrid waterproof cover returned the single highest organic fluorine result in the 2023 diaper screening")],
 ("Happy Little Camper","Whole range"):[
   ("testing","caution","Marketed as a natural diaper but returned organic fluorine in 2023 independent screening")],
 ("Huggies","Little Snugglers"):[
   ("testing","fail","ANSES 2020 testing flagged Huggies alongside Pampers for trace dioxins, furans, PCBs and glyphosate")],
 ("Huggies","Little Snugglers diapers"):[
   ("testing","fail","ANSES 2020 and Greenpeace testing flagged trace dioxins, furans, PCBs and glyphosate across the major disposables. Kimberly-Clark disputes the concentrations")],
 ("Huggies","Snug & Dry diapers"):[
   ("testing","fail","The same ANSES 2020 finding as the rest of the mainstream disposable category. Kimberly-Clark disputes the concentrations")],
 ("Huggies","Natural Care Sensitive wipes"):[
   ("materials","caution","70 percent or more plant based by weight, which leaves up to about 30 percent plastic fibre. The cloth is the exposure, not the liquid")],
 ("Huggies","Simply Clean wipes"):[
   ("materials","caution","The same partly synthetic substrate as the Natural Care line, up to about 30 percent plastic fibre")],
 ("Huggies","Natural Care Wipes"):[
   ("materials","caution","Still up to about 30% polypropylene plastic fibre by the brand's own plant based math"),
   ("legal","caution","A class action challenged the natural labeling, and a 2024 suit alleges trace PFAS in the Simply Clean line")],
 ("Kudos","Whole range"):[
   ("testing","caution","Two labs disagree: 2023 screening returned the highest disposable organic fluorine result on size 4, while size 5 was non detect")],
 ("Luvs","Whole range"):[
   ("formula","fail","The one place in the range where fragrance and lotion are still used, with no disclosed ingredient list or bleaching method")],
 ("Mama Bear","Whole range"):[
   ("materials","caution","Elemental chlorine free rather than totally chlorine free, and the disclosed core includes titanium dioxide")],
 ("Mama Bear","Mama Bear baby wipes"):[
   ("materials","caution","The substrate is not disclosed as plant based and the category norm is a partly synthetic cloth. The wipe is the exposure, not the liquid")],
 ("OsoCozy","Whole range"):[
   ("testing","caution","Returned a low level organic fluorine detection in 2023 independent screening")],
 ("Pampers","Whole range"):[
   ("testing","fail","ANSES 2020 and Greenpeace testing flagged trace dioxins, furans, PCBs and glyphosate in diapers worn against skin around the clock"),
   ("materials","caution","The Sensitive wipes are a conventional polypropylene substrate")],
 ("Rascal & Friends","Whole range"):[
   ("testing","caution","Returned a low level organic fluorine detection in 2023 independent screening")],
 ("The Honest Company","Diapers"):[
   ("legal","caution","A long marketing litigation record and unresolved diaper irritation claims")],
 ("The Honest Company","Wipes"):[
   ("legal","caution","A 2017 nationwide mold recall, a 2022 class action over plant based claims, and $7.35M and $1.55M greenwashing settlements in 2017")],
 ("The Honest Company","Sensitive diaper rash cream"):[
   ("testing","fail","Reported over 1,600 ppb lead plus cadmium in 2025 independent testing (Lead Safe Mama)")],
 ("The Honest Company","Clean Conscious Diapers"):[
   ("legal","caution","Multiple class actions alleged that natural, naturally derived and plant based labeling was misleading")],
 ("Triple Paste","Triple Paste zinc oxide ointment"):[
   ("testing","fail","Over 4,000 ppb lead in the 40 percent zinc formula, the highest result found in the diaper cream category. The brand disputes these results")],
 ("WaterWipes","Whole range"):[
   ("legal","caution","Two active 2025 lawsuits allege microplastics in wipes marketed as plastic free, and NAD twice ruled against the claims"),
   ("formula","caution","The grapefruit seed extract carries a disclosed trace of benzalkonium chloride")],
 ("Wet Ones","Whole range"):[
   ("legal","caution","An active class action alleges methylisothiazolinone and other allergens in a product labeled hypoallergenic")],
}

# Cautioned for brand continuity, which the four fronts have no place for.
# Forcing them onto a front would state a safety finding we do not have.
LEFT_ALONE = {
 ("Andy Pandy","Whole range"): "no longer in business, remaining stock is old",
 ("Hello Bello","Whole range"): "Chapter 11 in 2023, so formulation continuity is not guaranteed",
}


def main():
    write = "--write" in sys.argv
    brands = json.loads(DATA.read_text())
    hit, changes, missing, conflicts = set(), [], [], []
    for b in brands:
        for p in b.get("products") or []:
            key = (b.get("brand"), p.get("name"))
            if key not in MAP:
                continue
            hit.add(key)
            ext = p.setdefault("ext", {})
            fronts = ext.setdefault("fronts", {})
            notes = ext.setdefault("frontNotes", {})
            origin = ext.setdefault("frontOrigin", {})
            for front, status, note in MAP[key]:
                cur = fronts.get(front)
                # Never soften something already adverse.
                if cur in ("caution", "fail"):
                    continue
                # Never silently flip a considered pass. Aquaphor's formula was
                # assessed as a pass and its note still names lanolin on broken
                # skin; that disagreement is for a person to settle, not for a
                # transcription script to overwrite.
                if cur == "pass":
                    conflicts.append((key[0], key[1], front, note))
                    continue
                fronts[front] = status
                notes[front] = note
                origin[front] = "hand"
                changes.append((key[0], key[1], front, status))
    missing = [k for k in MAP if k not in hit]

    print(f"rows matched : {len(hit)} of {len(MAP)}")
    print(f"fronts filled: {len(changes)}")
    for bn, nm, front, st in changes:
        print(f"    {bn[:20]:<21} {nm[:32]:<34} {front:<10} {st}")
    if missing:
        print("\n  NOT FOUND:")
        for k in missing:
            print("   ", k)
    if conflicts:
        print(f"\nNOT written, the front already says pass and the note disagrees ({len(conflicts)}):")
        for bn, nm, front, note in conflicts:
            print(f"    {bn} / {nm}  [{front}]")
            print(f"        note says: {note[:96]}")
    print("\nleft alone on purpose (brand continuity, not a safety finding):")
    for k, v in LEFT_ALONE.items():
        print(f"    {k[0]} / {k[1]} — {v}")

    if write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA}")
    else:
        print("\ndry run. re-run with --write")


if __name__ == "__main__":
    main()
