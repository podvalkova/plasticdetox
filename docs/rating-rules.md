# Rating rules

How a product gets a verdict. This is the editorial standard for Brand Check, the
Amazon extension, and the paid API. If a rule here and a published page disagree,
the page is wrong.

Last revised 2026-09-03.

---

## 1. The core idea: evidence has a scope

The old model asked "what is our verdict on this brand?" That is the wrong
question, and it produced two failures in opposite directions. Sensarte was rated
good, so a PTFE pan inherited a pass. Cuisinart was rated on appliances, so a
stainless skillet inherited a caution.

The right question is "what evidence do we hold, and does its scope contain the
thing in front of the shopper?"

Every piece of evidence attaches at one of these scopes, narrow to broad:

| Scope | Means | Example |
|---|---|---|
| `lot` | One batch or production run | A single contaminated lot of a botanical |
| `sku` | One ASIN, size or flavour | Boka Ela Mint 4oz |
| `line` | A named product line | Colgate Total |
| `formula` | A shared recipe base across variants | A brand's whole hydroxyapatite range |
| `format` | A packaging format or construction | Their 12oz glass jar. Their PTFE coated line |
| `brand` | The company and its conduct | Litigation over labelling claims |
| `class` | A material or ingredient across the industry | All bentonite clay oral products |

A product's verdict is the union of the evidence whose scope contains it. Nothing
else.

### 1.1 The asymmetry rule

**Adverse evidence may propagate. Favourable evidence never does.**

A detection on one SKU is a reason to look harder at its siblings. A clean result
on one SKU says nothing whatsoever about its siblings, because we did not test
them. Treating a pass as transferable is how you end up recommending something
you never looked at.

This asymmetry is safe in both directions. We never wrongly recommend, and when
we warn we always disclose what the warning rests on.

### 1.2 The disclosure rule

Inherited adverse evidence must name its scope in the copy shown to the shopper.
Not "Skip this." Instead "Lead was found in this brand's kids paste. This SKU was
not tested." The user can then judge the inference themselves.

---

## 2. Formula

**Natural scope:** `sku`, sometimes `formula`.

**Rule.** Judge the published ingredient list for the specific SKU. Transfers
freely across sizes and multipacks of the same product, because they are the same
recipe. Never transfers across flavours or variants without checking, because
whitening, kids and sensitive versions routinely differ in exactly the ingredient
that matters.

**This front is always resolvable.** It is on the label. That has a consequence:

> An ingredient list we cannot obtain is itself a finding, not an absence of one.
> If the manufacturer does not publish a full list, the formula front is
> `caution`, with the note "the manufacturer does not publish a complete
> ingredient list", never `unknown`.

Non-disclosure is a legitimate mark against a product, and it costs nothing to
determine. Most of the 380 brands currently sitting at `formula: unknown` are
unworked, not unknowable.

**The formula verdict is mechanical once the full list is on the table.**
That is what this section has always said, and the tooling now applies it the
way the sunscreen and deodorant research did by hand: scan the list against
the hazard vocabulary (which names the individual chemical UV filters,
parabens, formaldehyde releasers and aluminum salts a label would use), a
named hazard in the exposure path fails the front, a disclosure umbrella like
fragrance caps it at caution, and a list carrying neither is a pass.

Two shapes of text qualify for the pass. A stated single ingredient ("sole
ingredient: creatine monohydrate"), which is a complete list by definition.
And a list explicitly recorded as the list, behind "Ingredients:" or "full
ingredient list". What never qualifies is a prose summary ("an aloe base with
oils and extracts"): it may omit exactly the ingredient that matters, so it
can warn but not clear. Research runs should therefore copy the complete
label list verbatim behind an "Ingredients:" marker whenever they can get it.

---

### 2.1 What is on the hazard list, and why

A substance earns a place only when all three hold:

1. **Route.** There is a documented path from this product into a person:
   migration, shedding, dermal absorption, inhalation, ingestion.
2. **Evidence.** Independent published evidence of harm, or a restriction by a
   serious regulator.
3. **Determinable.** We can tell it is there from the label, the material, or a
   published test. A rule we cannot apply is not a rule.

The list then has **two kinds of entry**, and they behave differently.

**Named hazards.** A specific substance with evidence behind it: PTFE and the
other PFAS, PVC, polycarbonate and BPA, polystyrene, melamine, phthalates,
formaldehyde releasers, triclosan, lead, cadmium, talc, the aluminium salts that make an
antiperspirant, and the cyclic siloxanes D4, D5 and D6. One of these, un-negated, in
the path that reaches a person, fails the front on its own.

> Talc joined the list in July 2024, when IARC reclassified it Group 2A,
> probably carcinogenic to humans. The cyclic siloxanes joined in June 2026,
> when the EU restriction on D5 and D6 in leave-on cosmetics took effect at 0.1
> percent, D4 having been banned in cosmetics since 2022. Both entered by the
> three tests above rather than by anybody's preference, and the second is the
> reason most mainstream antiperspirants are a skip: cyclopentasiloxane is
> usually their first inactive ingredient, at far above that limit.
>
> Note what is NOT here. Bare "aluminium" is not a named hazard, and neither is
> potassium alum. The list names aluminium chlorohydrate and aluminium
> zirconium, the salts that plug a sweat duct, because those are what the
> evidence is about. A crystal deodorant is alum, a different chemistry with no
> regulator restriction and no published evidence of harm behind it, and
> skipping one for containing "aluminium" would be reading the periodic table
> rather than the research.

<!-- hazard-list:start -->

**The 64 named hazards the engine enforces.** Generated from `HAZARD` in
`tools/audit-product-rules.py` by `tools/sync-rulebook.py`, so this list and the
code cannot say different things. Un-negated, in the path that reaches a person,
any one of these fails the front on its own.

> `acrylic`, `aluminium chlorohydrate`, `aluminium zirconium`, `aluminum chlorohydrate`, `aluminum zirconium`, `avobenzone`, `azo`, `benzalkonium chloride`, `benzene`, `benzethonium chloride`, `bpa`, `bpf`, `bps`, `bronopol`, `butylparaben`, `cadmium`, `chemical filter`, `chemical sunscreen`, `cyclohexasiloxane`, `cyclomethicone`, `cyclopentasiloxane`, `cyclotetrasiloxane`, `diazolidinyl urea`, `didecyldimethylammonium chloride`, `dimethyl benzyl ammonium chloride`, `dmdm hydantoin`, `elastane`, `ethylparaben`, `flame retardant`, `formaldehyde`, `homosalate`, `imidazolidinyl urea`, `isobutylparaben`, `lead`, `melamine`, `methylparaben`, `neoprene`, `non-stick`, `nonstick`, `nylon`, `octinoxate`, `octisalate`, `octocrylene`, `oxybenzone`, `paraben`, `pfas`, `pfoa`, `phthalate`, `plastic`, `polycarbonate`, `polyester`, `polyethylene`, `polypropylene`, `polystyrene`, `propylparaben`, `ptfe`, `pvc`, `quaternary ammonium`, `quaternium-15`, `spandex`, `styrene`, `talc`, `teflon`, `triclosan`

**The 10 disclosure failures.** These name no harmful substance; they say we
cannot check. Each caps at careful and never fails a front alone.

> `artificial flavor`, `artificial flavors`, `fragrance`, `gum base`, `natural flavor`, `natural flavors`, `natural flavour`, `parfum`, `proprietary blend`, `undisclosed`

**Category scoped cautions.** Generated from `CATEGORY_CAUTION` in the same
file. A term here is a documented downside in one category and unremarkable
elsewhere, so it cautions only inside the category it names, caps at careful,
and never fails a front alone. The evidence behind each term lives as a
comment on the code entry and as prose in 2.1b.

> **Baby formula**: `palm`
> **Baby lotion**: 

<!-- hazard-list:end -->

**Disclosure failures.** A legal umbrella that hides composition: "fragrance"
and "parfum", "gum base", "proprietary blend", "natural flavors". These name no
harmful substance. What they say is that we cannot check.

> A disclosure failure caps at **careful** on its own. It is not evidence of
> harm. It is the absence of the evidence we would need, and the maker controls
> that absence, which is why it counts against them where a missing third party
> test does not.

That distinction is the whole difference between this and rule 5.6. We do not
penalise a product for the absence of independent testing, because the maker
does not control whether a lab has looked at it. We do count concealment,
because they chose it. "Fragrance" is a single word standing in for a mixture
that may run to hundreds of ingredients and has historically carried phthalates;
the objection is to the standing in, not to scent.

Exposure then modulates it, by the same route rule as materials. A fragrance
left on skin all day is a different finding from one rinsed down a drain, and
our practice already reflects this: no product on the site is a skip for
fragrance alone. Every skip that mentions it carries a second, named finding
beside it, and that is the rule, not a coincidence.

### 2.1a-i What counts as disclosed

"Undisclosed" has to mean something checkable, and until September 2026 our
check was narrower than the rule it enforced. It exempted a fragrance only when
the umbrella named its own contents inside a bracket immediately after itself,
`Parfum (Citrus Dulcis Extract, Amyris Balsamifera Bark Oil, ...)`, which is
how Natracare writes it and how almost nobody else does.

The convention nearly every brand follows is the EU one: the 26 regulated
fragrance allergens are listed as their own INCI entries after the umbrella,
with a footnote naming the source. Weleda's Salt Toothpaste ends `Flavor
(Aroma)*, Limonene*, Linalool*` over `*From natural essential oils`. Nothing
the reader could act on is hidden, and it sat at careful for a bracket it
never used.

> **A fragrance is disclosed when at least one of the EU regulated allergens is
> named AND the source is stated.** Both halves are required. Named allergens
> with no source still leaves the mixture unexplained. A claimed natural source
> with nothing named is marketing, which is what Wild does: `Parfum
> (Fragrance)` plus a sentence on the website saying it is natural. That stays
> a disclosure failure.

Enforced by `allergens_named` in `tools/apply-front-evidence.py`.

### 2.1a Fragrance is not promotable

A disclosure failure caps at careful, and careful is not a recommendation. So the
rule that follows from it, set by Anya in September 2026:

> **We do not promote a product whose scent is undisclosed.** It leaves the store
> and every article pick. Brand Check keeps it with an accurate status, as it
> keeps anything else we do not recommend.

Two things escape it, and both are disclosure rather than exceptions:

**The umbrella names its own contents.** "Parfum (Citrus Dulcis Extract, Amyris
Balsamifera Bark Oil, Coriandrum Sativum Fruit Oil, Juniperus Virginiana)" hides
nothing. Every component is on the label, which is the whole thing rule 2.1 asks
for, and reading the word alone had held Natracare's baby wipes at careful for a
list that spells itself out. The test is mechanical: the term is followed by a
bracket naming two or more components. "Fragrance (natural)" does not pass it.

**The maker states the composition elsewhere, specifically.** Milliways' INCI
line says "natural gum base", and the company publishes that the base is chicle,
the sap of the sapodilla tree. That is disclosed, just not on the ingredient
line, so the fact is recorded as evidence and the rule reads it there. Marketing
adjectives are not composition: "naturally derived" or "clean scent" names
nothing and does not qualify.

And the practical consequence, which is the point of the rule:

> Where a brand sells an unscented version of the same product, that is the pick.
> Where it does not, the product leaves and we recommend somebody who does.

### 2.1b Category scoped cautions: palm oil in infant formula

Some ingredients are a documented problem in exactly one category and
unremarkable everywhere else. Palm oil is the type specimen: in a bar of soap
it is saponified stock, in a pantry item it is a quality question, and in
infant formula it is the subject of randomized trials and an EU contaminant
regulation. A site wide rule would convict the soap to catch the formula, so
these terms live in `CATEGORY_CAUTION`, scoped to the category they name.

The palm evidence, both lines category specific. First, absorption: palm
olein puts palmitic acid at the sn-1/3 positions where breast milk carries it
at sn-2, the freed palmitic acid forms insoluble calcium soaps in the infant
gut, and randomized trials plus the Koo 2006 systematic review measured the
result: fat absorption of 90.4 percent on a palm olein formula against 97.6
percent on an sn-2 blend, lower calcium absorption, lower bone
mineralization, harder stools. Second, process contaminants: refining palm
oil at high heat creates 3-MCPD and glycidyl esters, palm carries 6 to 10
times more of them than other oils, EFSA names formula fed infants the
maximally exposed group, glycidol is IARC group 2A, and the EU set infant
formula specific limits in Regulation 2018/290 while the US has none.

Why caution and not fail: palm olein is permitted by every regulator,
deliberately used to match breast milk's palmitic acid content, and fed to
healthy babies by the billion. The findings are a measured disadvantage and
an elevated contaminant load, not a named toxin in the 2.1 sense. A caution
caps the product at careful, which is the verdict the evidence supports.

The boundary, stated so this rule does not grow by vibes: soy, sunflower and
coconut oils are not on the list, because no comparable body of evidence
exists for them in formula and a rule needs a finding, not a food trend.
sn-2 structured palm (the Kabrita style beta palmitate) still cautions: it
answers the absorption objection but not the refining contaminants.

**Ethoxylated ingredients in baby wash, shampoo and lotion (September 2026).**
The second entry, scoped to the category the classifier files every baby wash
and shampoo under. Ethoxylation, the step that reacts a surfactant or
emulsifier with ethylene oxide to make it milder, leaves 1,4-dioxane behind,
a Prop 65 carcinogen that never appears on a label. The evidence is category
specific and measured, not modelled: the 2009 Campaign for Safe Cosmetics
round found it in 32 of 48 children's bath products (0.27 to 35 ppm); the
FDA's own 2018 survey found it in 47 of 82 children's bath and hair products,
two above 10 ppm; New York caps it at 1 ppm in any product that cleans skin
or hair from the end of 2023, and Galderma disclosed 1.1 ppm in Cetaphil Baby
Wash under that law. Why caution and not fail: it is a manufacturing residue
that vacuum stripping removes, the FDA treats trace levels as acceptable, and
no label read can tell a stripped batch from an unstripped one, so the
ingredient is a risk marker rather than a named toxin. The terms are the label
tells for ethoxylation and propoxylation: `peg`, `ppg`, the `-eth` family
(`laureth`, `myreth`, `trideceth`, `ceteareth`, `steareth`, `oleth`,
`gluceth`), `polysorbate` and `sorbeth`. The boundary: plain sulfates (sodium
coco-sulfate, SLS) and betaines are made without ethylene oxide and stay off
the list, because the finding is about the process, not about lather. Baby
wipes are deliberately not in scope: Consumer Reports' 2026 round lab tested
the category and the featured wipes carry clean results, which under 5.5
outrank a label read.

### 2.2 Conditional failures

Some failures are not a property of the product as sold. They depend on how it is
used, they are avoidable by stated care, and nothing about the object tells you
whether they have happened.

Sophie la Girafe is the case. The rubber and the food grade paint are fine. The
sealed interior cavity is the problem: water enters during washing and cannot be
dried, and mould colonies inside the toy are documented from 2017 onward. But
mould is not guaranteed. It depends entirely on whether water gets in.

Run that against 2.1 and the third test fails outright. **Determinable** asks
whether we can tell it is there from the label, the material, or a published
test, and we cannot. What is determinable is the design that permits it, which is
a real finding. Whether any given unit has mould is not.

> A failure inherent to the design, avoidable by stated care, and not detectable
> in the product as sold caps at **careful**, with the mitigation stated.

Not good, because the failure is unrecoverable once it happens, invisible from
the outside, and in a product an infant mouths. Not skip, because "skip" when
"do not submerge it" solves the problem overstates what we know, and gives the
reader worse information than the caveat would.

This sits with 5.1, 5.2 and 5.6, which all say the same thing in different
words: do not convict on what might be true.

**The boundary.** A conditional failure alongside a named hazard is still a skip,
carried by the named hazard rather than the condition. Munchkin's bath toys also
harbour mould, and they are a skip because they are soft PVC with phthalate
exposure when chewed. That is determinable from the material. Sophie's materials
are sound, which is exactly why the conditional finding has to stand on its own,
and on its own it is a caution.

### 2.3 An object immersed in what you consume is not its container

The materials matrix in section 3 judges a container holding contents at rest. A
tea bag is not that. It is an object put inside the drink, at near boiling
temperature, and then squeezed. The matrix is the wrong instrument, and reaching
for it produced a caution where the standard's own rules give a skip.

Run a supermarket tea bag through them properly:

- **Named hazard.** Polypropylene, from the heat sealed seam. Section 2.1.
- **In the ingested path.** You drink the water it steeped in.
- **At heat**, which section 3.2 says moves everything one step worse.
- **Measured, not inferred.** 11.6 billion microplastic particles per cup.
- **The drinkware standard**, which the site already applies: no plastic in the
  drink path, ever. It is what removed the Owala picks and every straw tumbler.

Five rules, one answer. Where a product is put into the thing a person swallows,
read it as formula and ingestion, never as a container.

This is also the mirror of 2.2, and the pair is worth holding together. Sophie la
Girafe caps at careful because whether a given unit has mould is **not
determinable** from the product. A tea bag's seam is determinable: it is a
property of the bag as sold, the article publishes a burn test for it, and
supermarket brands are documented as using it. Determinable and in the ingested
path is a skip. Conditional and undetectable is a caution.

## 3. Materials

**Natural scope:** `format`.

**Rule.** Judge what the product is physically made of, at every surface that
reaches a person or the contents.

This front was called packaging, and the word was wrong for most of what it
held. A yoga mat has no packaging. A kettle has no packaging. The field the
listing scraper reads is Material, which on a listing describes the product and
not its box, so 377 durable goods had the object's own material filed under a
key claiming to be about a container.

One question now covers everything:

- For a **consumable**, the material is the container that holds the contents,
  which is exactly what packaging always meant. Nothing about these rows
  changes and the matrix below is unaltered.
- For a **durable**, it is the object and every part of it that touches a
  person or what they consume. A part counts even when it is small. Evenflo's
  glass bottle was rated on the glass while the thing in the baby's mouth is
  the silicone teat, which fell through because the teat was not packaging in
  any natural sense and so had no front to land on. A dispenser on a container
  is the one exception, in 3.10.

The retail box is not this front and is not rated. A wrapper a dry product
comes in extracts nothing and is recorded as `none`, which is a finding.

### 3.1 Plastic contact is not a verdict

If it were, we would skip nearly every cosmetic, supplement and cleaning product
on the market, and the flag would stop carrying information precisely because it
fires on everything. A water based toner and a cleansing balm in the same PET
bottle are not the same exposure.

What governs migration is the pairing. Almost everything that leaches out of a
plastic is lipophilic, so oil pulls it out and water largely does not.

> **Packaging fails only where an extracting formula meets a polymer that has
> something to give.**

**How hard the contents pull**, lowest first:

| | Contents | Why |
|---|---|---|
| 0 | Dry solids: powders, tablets, bars | Nothing to dissolve into |
| 1 | Aqueous, neutral, no surfactant: toners, hydrosols, gels | Water is a poor solvent for what plastics shed |
| 2 | Surfactants: shampoo, body wash, cleansers | Surfactants solubilise the lipophilic additives water cannot |
| 2 | Alcohol: sprays, toners, sanitiser | A strong extractant |
| 2 | Acidic: vitamin C, AHA, BHA, vinegar | Hydrolyses PET, releasing antimony |
| 3 | Emulsions: lotions, creams, conditioners | Carries an oil phase |
| 4 | Anhydrous: face oils, balms, butters, lip products | The strongest extractant there is |

**What the polymer has to give:**

| | Polymer | Concern |
|---|---|---|
| 0 | Glass, stainless, foil lined, ceramic, food grade silicone | Inert, silicone by decision (below) |
| 1 | HDPE, LDPE, PP, aluminium | Slip agents and antioxidants; aluminium is scored as its resin lining |
| 2 | PET, Tritan, copolyester | Antimony trioxide catalyst, acetaldehyde |
| 3 | PVC, polycarbonate, polystyrene, melamine | Phthalates, BPA, styrene, melamine monomer |

**Aluminium is scored as its lining.** Bare aluminium corrodes and reacts with
what it holds, so aluminium bottles, cans and tubes are coated inside with a
resin, for decades usually a BPA based epoxy, and the contents touch that
coating rather than the metal. It sits in the polyolefin column: dry, water
based and surfactant contents pass, emulsions and oils are a caution. Where
the maker states the container is unlined, it is bare metal and inert.
Recorded as `lining` on the materials record. Set by Anya in September 2026.

**The matrix:**

|            | inert | polyolefin | PET | PVC/PC/PS |
|------------|-------|-----------|-----|-----------|
| dry        | pass | pass | pass | caution |
| aqueous    | pass | pass | pass | caution |
| surfactant | pass | pass | caution | caution |
| alcohol    | pass | pass | caution | **fail** |
| acidic     | pass | pass | caution | **fail** |
| emulsion   | pass | caution | caution | **fail** |
| anhydrous  | pass | caution | **fail** | **fail** |

Since September 2026 the evidence applier (`tools/apply-front-evidence.py`) reads this
exact grid from the recorded `base` (dry, aqueous, surfactant, alcohol, acidic,
emulsion, anhydrous) and the recorded material, then applies 3.2 and 3.3 below;
before that it scored by adding weights and cautioned aqueous contents in a
polyolefin bottle that this table passes.

So the case that prompted this: **water based skincare or makeup in a plastic
bottle passes.** The exceptions are the anhydrous ones, face oils, cleansing
balms and lip products, which are all oil and in the case of lip products also
swallowed, and acidic actives in PET.

**Silicone is scored with the inert column, by decision (September 2026).** What
silicone can give up is leftover cyclic siloxanes (D4, D5, D6). They move into fat
and with heat, and barely at all into water or at fridge and freezer temperatures;
one study found none in milk after six hours of contact. That makes food grade
silicone far closer to glass than to a polyolefin for how it is actually used:
snacks, cold storage, frozen breast milk. Where a use is hot and fatty (baking,
cooking in the bag) the card says so, rather than the verdict. Glass stays the
first choice in copy, named honestly as more expensive and bulkier to store.

### 3.2 Heat moves everything one step worse

Temperature drives migration harder than any other single variable. Hot fill,
microwaving, sterilising, dishwashing, storage in a hot car, a shower shelf. A
polypropylene baby bottle is a pass for dry contents and a caution for warm milk.

### 3.3 Exposure route gives relief

A laundry detergent and a face oil can sit in the same bottle and extract the
same compounds, and then one is diluted ten thousand fold and rinsed down a
drain while the other is spread on skin and left there.

- **Left on the body**, or ingested: no relief. The matrix stands.
- **Rinsed off**: one step better. Shampoo, body wash, cleanser, toothpaste.
- **Never touches a person**: two steps better. Laundry, dish soap, surface
  cleaners.

In the evidence file the route is a recorded fact, `use`, on the materials
record: `"rinse-off"` for the one step, `"never-on-body"` for the two. The
applier reads it there rather than guessing it from a name, so a body wash
whose PET bottle was recorded as a fact scores the same as one described in a
note, which until September 2026 it did not.

### 3.4 What does not count

- A polymer the copy rules out. "BPA free", "no PVC", "plastic free".
- A plastic named as the thing avoided. "All steel housing rather than plastic",
  "glass jar skips the multilayer plastic concern".
- A plastic that never contacts the contents. An outer shell, a structural
  sleeve, an appliance housing outside the food path.
- "Plastic neutral certified", which is a carbon offset claim, not a material.

### 3.5 Transfers

**Across** every flavour and variant sold in the same container. **Never across
formats**: the same product in glass and in a pouch are two verdicts, and
multipacks are frequently a different container from the single unit.

Like formula, this front is cheap. It is usually visible in the listing photo.

### 3.6 A caution needs a shelf to point at

The matrix in 3.1 answers what migrates. It does not ask whether the shopper
could have done anything about it, and for some formats the honest answer is no.

Every stick foundation, cream blush, mineral bronzer and lip balm on the market
is an anhydrous formula in a plastic twist up tube, because that is the only way
the format exists. Rule 3.1 opens by refusing a flag that fires on everything,
and then the matrix fires on all of them anyway, which caps a certified organic
brand at the same grade as an uncertified one and tells a shopper nothing about
either.

So: **where a format has no non plastic version on the market, the polymer is a
note, not a cap.** Enforced by `no_alternative` and `NO_PLASTIC_ALTERNATIVE` in
`tools/apply-front-evidence.py`. This rule was written in June 2026 and
implemented in none of the three rule files until September, which is why the
APEC reverse osmosis system sat at careful for the only way an undersink RO is
built. Formula and independent testing carry the verdict, and the
packaging is recorded in the caveats where a shopper can still read it.

This is narrow on purpose, and it turns on availability rather than on
inconvenience. Face oils, serums and toners are sold in glass by most of the
brands we rate, so the matrix stands for those. Lip products stay under the
ingestion logic in 2.3 regardless of what the tube is made of, because they are
swallowed. The test is whether a shopper following our advice could buy a
better package, not whether a better package would be nicer to have.

The reverse case is the same principle: a plastic that never touches the
contents is already excluded by 3.4, and a blank contents field is a gap under
5.6. Neither is a caution.

### 3.7 A composite is held together by something

Bamboo, cork and plywood boards are sold on the material in their name, and that
material is real: bamboo puts nothing into what it touches. But a board built
from strips is a composite, and the strips are held together with an adhesive
sitting in the same contact path as the wood. The stated material answers for
the strips and says nothing about the glue.

> **Where a composite's binder is undisclosed, the materials front is `caution`,
> under rule 2.1. It is a disclosure failure, not a hazard finding.**

Naming it clears it. A food grade or formaldehyde free adhesive the maker states
is a stated material like any other, and the row then reads pass on the whole
object rather than on the half of it anyone bothered to mention.

### 3.8 Plastic in the drink path is a fail

The drinkware standard has stood since the Owala picks and every straw tumbler
were removed for it: no plastic in the drink path, ever. It applies to the part
that is in the mouth or that the drink passes through on its way there, a
spout, a straw, a mouthpiece, a bite valve. It does not apply to a cap on a
bottle you drink from the rim of.

> **On drinkware, a plastic spout, straw or mouthpiece is a `fail` on
> materials.** A stainless body does not offset it; the body is not the part
> in the mouth.

This was a standard in prose and an inference in the data, which is how the
FreeSip softened from skip to careful the moment a rebuild touched its row. It
is a rule now, and it reads the note sentence by sentence, so a note that
states the standard is not mistaken for a note that denies the finding.

### 3.9 A treatment the maker states is part of the material

A fibre name cannot tell two car seat covers apart when one had a flame
retardant added and the other did not: both read polyester. What separates them
is what the maker says about the treatment, and a maker's own statement about
its own product is a primary source.

> **Where the maker states that the part touching a person carries a named
> hazard as an added treatment, flame retardants for example, the materials
> front is `fail`, under rule 2.1.** The statement is recorded as `treatment`,
> with `treatmentSource` quoting where the maker says it.

A denial is not a treatment. "Flame retardant free" and "no added flame
retardants" name the chemistry and assert its absence, so only an unnegated
statement fails the front. A treatment on a part that never touches a person is
excluded by 3.4. A laboratory finding of the same chemistry belongs to section 4,
and a maker who will not say what a part is made of is a disclosure failure, a
`caution`, as in 3.7. The statement ages like other materials evidence, 24 months
under section 7.

Set in September 2026, when three car seat makers answered the question in their
own words. Doona's safety FAQ says its materials "do have flame retardants",
Joie's FAQ says all its US car seat covers contain them, and Diono says its
fabrics do, though none brominated or chlorinated. All three had sat at careful
or unrated, because the fibre alone could not carry what the maker had already
said.

### 3.10 A dispenser is noted, not counted

A pump, its dip tube, a dropper bulb or a spray head touches the contents, and
a dip tube sits in them the whole time. But its surface is a small fraction of
the container's, and no pump sold on the products we rate is made without
plastic, so counting it marked down every glass bottle with a pump for a part
no shopper can avoid.

> **Where the container itself passes, a plastic dispenser is recorded on the
> card and does not lower the materials front.** Where the container is
> plastic, the container decides.

A spout, straw or mouthpiece on drinkware is not a dispenser: it is the drink
path, and 3.8 governs it. Recorded as `dispenser` on the materials record,
apart from `material`. Set by Anya in September 2026, replacing the reading
that scored Osea's glass bottles on their plastic pumps.

### 3.11 Viscose against the skin needs a tested finished product

Viscose, rayon and modal are made by dissolving wood or bamboo pulp with carbon
disulfide and spinning it back into fibre. What comes out is cellulose, the
same molecule as cotton, and it sheds no plastic. The documented harm is to
factory workers and waterways. For the wearer the evidence is a gap, not a
finding: no published study has measured the carbon disulfide or finish left
in finished fabric or how much reaches skin, US and Canadian regulators require
no test for it, and FDA's 2024 review of tampons, the closest intimate use,
found no clear risk but major gaps.

> **A viscose process fibre worn or held against the skin for hours, in
> underwear, sleepwear, swaddles, carriers, wipes, pads or tampons, is a
> `caution` unless a certification that tests the finished product is
> recorded: OEKO-TEX Standard 100, MADE SAFE, GOTS or the EU Ecolabel.** Off
> the body, as a cleaning cloth, it is plant fibre and passes.

Lyocell (TENCEL Lyocell) is made in a closed solvent loop without carbon
disulfide and scores with the inert fibres. A bare "TENCEL" names Lenzing's
brand, which covers both lyocell and modal, so it is read as undisclosed and
this rule applies until the maker says lyocell. Spandex and elastane are
polyurethane and score in that row of the table. "Bamboo" on a textile is rayon
under US labelling rules and is recorded as bamboo viscose. On a tampon or pad
ingredient list the same fibres are a category caution. Rayon and viscose left
the named hazard list in September 2026, because the list requires a documented
route into a person and the finished fibre has none on record. Recorded as
`certification` with `certificationSource` on the materials record. Set by Anya
in September 2026.

### 3.12 A car seat's fabric is judged like clothing

A clothed child sits on a car seat and nothing is eaten, which is the clothing
question, not the container question. The testing agrees. In the Ecology
Center's 2022 round all 10 seats sold flame retardant free tested clean, most of
them polyester, and all 12 conventional seats carried flame retardants. What
separated them was treatment, not fibre, and scoring the fibre left every seat
but one at careful for polyester.

> **On a car seat the fibre is disclosed, not scored. The materials front
> passes only when the maker states that the fabric and the foam carry no added
> flame retardants and that the seat is PFAS free, and either a certificate that
> tests the finished fabric (OEKO-TEX Standard 100, GOTS, MADE SAFE or bluesign,
> with its number) or an independent test under 36 months old verifies it.
> Otherwise it is `caution`.**

GREENGUARD Gold measures emissions and does not verify content, and a screen the
brand commissioned is a certificate of analysis under 4.2. A maker admitting
flame retardants still fails first, under 3.9. The polymer table and 3.11 do not
run on a car seat, so a bare TENCEL passes on a qualifying certificate like any
other fibre. The plastic shell, crash foam and harness are in every seat sold
and are noted, not scored, under 3.6. Heat in a parked car stays a caveat in the
copy. Keyed on the row's own category, and recorded as `frFree`, `frFreeSource`,
`pfasFree`, `pfasFreeSource` and `certificateNumber` beside `certification` and
`certificationSource` on the materials record. Set by Anya in September 2026,
when every car seat on the market read careful for its fibre.

## 4. Independent tests

The hard one. Here is the governing principle:

> **A test result's scope is set by the contamination mechanism, not by the brand.**

Ask how the contaminant got in, and the answer tells you exactly how far the
finding travels.

| Mechanism | Scope | Transfers to |
|---|---|---|
| **Ingredient borne**. Heavy metals riding in on clay, cocoa, rice, kaolin, hydroxyapatite, calcium carbonate, mineral colourants | `class` | Every SKU containing that ingredient, including other brands |
| **Process or packaging borne**. PFAS from fluorinated HDPE, phthalates from tubing, ink migration | `format` | Same container or line, any flavour |
| **Formulation choice**. A specific preservative, fragrance or additive | `formula` | SKUs sharing that base |
| **Lot or supplier failure**. One bad batch | `lot` | Nothing. This is a recall signal, not a product verdict |
| **Unknown mechanism** | one rung up, capped | Same line only, as `caution`, never `skip` |

### 4.1 The baby toothpaste question

If the baby version tested positive for lead, does the adult version inherit it?

**Yes, as `caution`, never as `skip`, and only if they share the implicated
ingredient.**

Lead in toothpaste is almost always ingredient borne. It rides in on the abrasive
or the mineral active: hydroxyapatite, calcium carbonate, bentonite, kaolin. That
is a raw material the brand buys once and puts in the whole range, which is why
the finding travels. If the adult paste uses silica instead of the implicated
mineral, the finding does not transfer at all.

There is a direction asymmetry worth stating, because it is not obvious:

- **Adult positive implies kids caution, high confidence.** The plain adult paste
  is mostly the shared base. A detection there implicates the base, and the kids
  version contains that base plus extras.
- **Kids positive implies adult caution, medium confidence.** Kids formulas carry
  additional flavour, colour and often more mineral filler. Part of the result
  may be explained by ingredients the adult version does not contain.

So a positive on the plain version is stronger evidence about the range than a
positive on the kids version. Never issue a `skip` on an untested adult SKU from
a kids result alone.

### 4.2 Source tiering

Record which tier the result came from. It sets the confidence.

1. Peer reviewed, or a regulator's own testing, with published method
2. A consumer organisation naming the lab and the method. Mamavation, Lead Safe
   Mama, Consumer Reports
3. A brand's own certificate of analysis
4. A marketing claim with no document behind it. This is not evidence and cannot
   set a front

### 4.3 Detection limits

A non detect is meaningless without the limit of detection. Non detect at 100ppb
and non detect at 5ppb are not the same claim. Record the LOD or the result is
not comparable and cannot be cited as a pass.

### 4.4 Disputed results

When a brand publicly disputes a result, the note says so, every time. This is
both accurate and legally necessary, since thirteen states have food
disparagement statutes and we are asserting a negative about a named product at
the moment of purchase.

### 4.6 A certification is scoped to what it certifies

A filter is bought to remove something. A vacuum is bought to keep hold of what
it picks up. Where the certification on the box covers a different thing from
the one the category exists for, the product is not certified for its own job,
and the honest rendering is that the job is unverified.

> **A certification covering something other than what the category is bought to
> remove leaves the testing front at `caution`, never `pass`.**

"Certified for taste, odour and lead reduction, not for sub micron particles" is
a pass and the finding in the same sentence. Read as a keyword it clears the row;
read as a claim it says this is not a microplastics filter. A vacuum with no
sealed path is the same shape: it cleans, and it returns a share of what it
lifts to the room.

This does not contradict 5.6. An *absent* test is a gap and stays `unassessed`.
A *present* certification for the wrong contaminant is a finding about scope, and
the product carries it.

A certification named inside a denial is not a certification. "No Brita filter
carries NSF/ANSI 401" contains the string and asserts its opposite, so only an
unnegated sentence may clear the rule. Sentence, not clause: splitting that one
on its commas leaves "carries NSF/ANSI 401 certification" standing alone, which
reads as proof of the thing the sentence denies.

---

### 4.7 What a measured level means

A lab result is a number. What the number means depends on how the product
reaches the body, so the bar is set by exposure route, and every bar below is a
published figure rather than one we drew. Before this section each adverse
testing record was judged one at a time, and the judgements drifted: a
toothpaste at 32 ppb lead read caution while a sunscreen at 77 ppb read pass.

**Eaten or swallowed**: food, drink, supplements, infant formula, and
toothpaste, which children swallow. The levels proposed in the Baby Food Safety
Act of 2021, which the independent testers our verdicts cite apply to
everything ingested:

| Metal | Bar |
|---|---|
| Lead | 5 ppb |
| Cadmium | 5 ppb |
| Arsenic (total, unless the lab speciated it) | 10 ppb |
| Mercury | 2 ppb |

> **At or above any bar: `caution`.** The Act never passed, so none of these is
> a legal limit, and a proposed level cannot make a `fail` on its own.

- Above a limit a regulator applies to that product type: `fail`. For food
  intended for babies and young children that is FDA's lead action level
  (January 2025): 10 ppb, and 20 ppb for single ingredient root vegetables and
  dry infant cereals.
- Non-detect for lead, cadmium and arsenic at limits at or below their bars:
  `pass`. Commercial metals panels rarely report mercury below 5 ppb, so a
  mercury non-detect at up to 5 ppb counts, and the card says its limit sat
  above 2 ppb. A mercury limit above 5 ppb leaves mercury unjudged.
- Detected, but below every bar: `pass`, with the numbers on the card.

**Left on the skin**: sunscreen, lotion, balm, diaper cream. Looser than
eaten, because skin takes in far less than a gut does, and stricter for
products made for babies than for adults, because a baby's hands, and whatever
is on them, go to the mouth. Both columns are published figures for the heavy
metal levels good manufacturing can avoid in cosmetics. The baby column is
Germany's (BVL, 2017, as tabulated by the UK Office for Product Safety and
Standards), taking its stricter toothpaste figure for lead because toothpaste is
the one cosmetic BVL treats as reaching the mouth. The adult column is Health
Canada's guidance on heavy metal impurities in cosmetics (2017):

| Metal | Made for babies and children | Adults |
|---|---|---|
| Lead | 500 ppb | 10,000 ppb |
| Cadmium | 100 ppb | 3,000 ppb |
| Arsenic | 500 ppb | 3,000 ppb |
| Mercury | 100 ppb | 1,000 ppb |

- At or above a bar: `caution`.
- Lead above 10 ppm (10,000 ppb), FDA's recommended maximum for externally
  applied cosmetics: `fail`, in either column.
- A product that clears the adult column but not the baby column is not a pick
  for babies, and the card says so.
- Below every bar, or non-detect at those limits: `pass`, with the numbers on
  the card. A tester that applies its food levels to sunscreen may still call
  such a product unsafe for babies, and where it does, the card says so.

**Durable goods measured by XRF**, in ppm, on the material or the surface:

- Lead at or above 90 ppm in paint, glaze or coating, or 100 ppm in the
  substrate: on a product for children `fail` (CPSIA); on any other product
  that touches food, the mouth or the skin, `caution`.
- Cadmium at or above 40 ppm, the strictest limit in force (Washington State):
  `caution`.
- Below those it is trace, recorded and not a finding. A non-detect is a
  `pass`; the instrument's limit is single digit ppm, as the tester states it.

**Who paid.** A result the brand funded keeps its tier when the tester chose
the lab, bought the product at retail, sent it blind and published regardless
of the outcome; the card names the funder. Where the brand chose the samples it
is a certificate of analysis, tier 3 under 4.2. A tester's affiliate or
advertising relationship with the brand is named the same way.

**Age.** A clean result expires after section 7's 36 months, because it
describes older production, and a maker can change a material or add a finish
without saying so. A bad result does not expire. It stands however old it is,
until a newer independent test of the same product, under 36 months old, finds
it clean. Set in September 2026, when a regular Chicco KeyFit 30 that read 118
ppm organic fluorine in 2022 rated the same as a seat nobody had tested.

The exception is a durable good measured by XRF. That reading is of what the
object is made of, the glass, glaze, enamel or metal, which is a property of
the product line rather than of a batch or a harvest. It stands for that line
until a newer reading of the same line replaces it, and the card gives its
date. Set in September 2026, when Weck's jars had read 142 ppm lead in the
glass in 2017 and up to 159 ppm in a newer jar in 2019, with nothing since
measuring the line lower.

**Flame retardants and PFAS in a textile or foam**, in a part that touches the
child: for a car seat, the seat pad, the harness covers and the fabric around
them. An internal component that never touches skin or mouth, such as crash
foam, is left out, as California's law leaves it out (Health and Safety Code
108945(c)(2)(C)).

- Total organic fluorine at or above 100 ppm: `fail`. That is California's
  limit for regulated PFAS in juvenile products, car seats included (Health and
  Safety Code 108945).
- A flame retardant compound the lab names: `fail`, the same finding rule 3.9
  fails when a maker states it. Where the lab measured it, the level must reach
  1,000 ppm, the level Washington's limit on flame retardants in car seats uses
  (RCW 70A.430.030); a named compound measured below that is `caution`.
- Element readings alone, phosphorus, bromine, chlorine or antimony by XRF
  with no compound named: `caution`, because the lab could not say what they
  came from. A non detect for an element does not clear a part: in 2018 a
  KeyFit 30 fabric showed no phosphorus by XRF and 3,590 ppm of a phosphonate
  flame retardant by mass spectrometry.

**Transfer.** A result on one product reaches another only under 4.1: as a
caution, never a skip, and only through an ingredient the two share. Rice
carries arsenic and cadmium in from the soil, so one rice from a grower speaks
for the grower's other rice. A clean result never transfers. For a textile or foam the shared ingredient is
the material: a finding on one model reaches another model of the same brand
only when both are sold in the same kind of fabric, so Graco's flagged seats in
regular fabric reach the 4Ever DLX but not the GoMax, whose PureProtect fabric
none of them used.

### 4.8 Ceramic that touches food or drink needs a lead result

Lead in kitchenware lives in glaze, enamel and the pigments that colour or
decorate them, which is why most of Lead Safe Mama's XRF archive is ceramic: a
gold Starbucks mug at 15,700 ppm, a souvenir mug at 6,151 ppm on the drinking
surface, a Lodge enameled pot at 1,693 ppm inside, beside Japanese Hasami
porcelain that read non detect. The risk belongs to the material class, and
whether one piece carries it cannot be seen.

> **A ceramic, porcelain, stoneware, earthenware or enamel surface, or a
> ceramic coating, that touches food or drink needs a lead result on record
> before it can be recommended.** Without one it is held at `unrated`, whatever
> else it passes.

What counts: an XRF reading of the food or drink surface, or a laboratory total
content or leach result naming the lab, the method and the limit of detection.
A tester's result keeps its tier under 4.2; a brand's own lab report is tier 3
and the card says it is the brand's. The number is then judged by 4.7.

What does not count: "lead free" or "lead safe" on a label or listing,
Proposition 65 or FDA compliance, the country or region of manufacture, or that
country's law. Those are a claim or a legal floor, not a measurement (4.2, tier
4).

Rule 5.6 does not apply. Elsewhere "nobody has tested it" is a gap we disclose
and do not count against a product; for ceramic in the food path it is the gap
this rule closes, so a testing `none` does not satisfy it.

Outside the rule: engineering ceramics with no glaze or pigment, such as a
grinder's ceramic burrs or a ceramic knife blade, and plain clear glass.

Enforced by `lead_check_required` in `tools/enforce-scorecard.py`.

## 5. Lawsuits and recalls

These behave completely differently and should never have shared a front's logic.

### 5.1 Lawsuits, two kinds

**Product harm suits.** "This product contained X" or "this product injured me."
Scope is `line` at most, never brand. A suit about lead in one paste says nothing
about the mouthwash.

> A filed suit is an allegation. On its own it caps at `caution`. Only a
> settlement, judgment or consent decree can produce a `skip`.

**Representation suits.** Greenwashing, a "PFAS free" claim that was not, false
"natural" or "non toxic" labelling. Scope is genuinely `brand`, and the effect is
specific:

> A brand with an adverse finding on its own representations can no longer earn a
> `pass` on self reported evidence on any front. It needs third party proof.

That is the honest brand level consequence. The suit is not about the product, it
is about whether we can believe what they tell us, so it changes how we weigh
every claim they make.

### 5.2 Recalls

A recall is bounded in time and in lots, so it decays.

| Situation | Effect |
|---|---|
| Open or active recall covering this product | `skip`. No judgement required |
| Closed, remedied, under 24 months | `caution`, with the date and the defect |
| Closed, remedied, over 24 months | Informational. Shown in the scorecard, does not set the verdict |

Notes usually carry a year rather than a date, so the tools decay a recall only
when it is provably older than 24 months, which with year granularity means
three calendar years back. A recall that may be 20 or may be 32 months old
stays active. Conservative by construction.
| Recall on a sibling product | Does not transfer, **unless** the mechanism is shared, such as a plant contamination or a common component. Then `caution` on the products sharing it |

**The pattern rule.** Three or more distinct recalls in five years across
different products is brand scoped, because at that point it is evidence about the
quality system rather than about any one product. This is the only legitimate
route from recalls to a brand level verdict.

### 5.3 Absence of a recall is not a pass

This is the most important rule on this front. Cosmetics, cookware and most of
our categories are barely regulated. No recall usually means no regulator was
looking, not that the product is clean.

> "No recall found" renders as **checked, nothing found**. It can never be the
> reason a product is rated `good`.

This is exactly the current cookware problem. Forty nine brands are rated good
because an AB 1200 disclosure exists. A disclosure existing is a legal front
nothing. It is not a formula front pass.

---

## 5.4 Durable goods and consumables are not the same problem

For a **durable good** the object is its material, and it has no ingredient
list at all. Its formula is `none`, which is a finding and not a gap: a
kettle's recipe is not missing, it does not exist. What the kettle is made of
is a real question and it is the materials front, which does apply. A fully
specified inert material is the complete safety case, so it carries a
recommendation on its own.

This is what retired the old wording, which had to say that for a durable good
formula and packaging were "the same front asked twice". They were the same
front asked twice because the fronts were named wrongly. Renaming packaging to
materials removes the special case instead of documenting it.

For a **consumable** the two come apart. The formula is a recipe, the container
is a separate object that can migrate into it, and lab testing routinely finds
what an ingredient list cannot show. There a second front is real evidence, not
a formality.

So formula is required for anything ingested or applied to skin, and is `none`
for an object whose material we can name. Materials is required for both.

## 5.5 A lab result outranks a label read

Section 4.2 ranks a published third party lab result above a brand's own
disclosure and far above a marketing claim. The verdict bar has to follow the
same ordering, or it produces the absurd result that two things read off a label
qualify where an independent measurement of the product does not.

> A third party non detect at a stated limit of detection, at sku or line scope,
> carries a recommendation on its own.

Without the limit it carries nothing, per 4.3.

### 4.5 What is known about the kind of product

Section 4 scopes a result by its mechanism, and the widest scope in the table
is `class`: a material or ingredient across the industry, which transfers to
every SKU sharing it, including across brands. We held no class findings as
data, only as article prose, and the consequence was that the testing front
asked one question where it should ask two.

> **Has anyone tested this product, and has anyone tested this kind of
> product?** The first answer wins wherever it exists, because it is about the
> actual thing. The second fills the gap, which is most rows.

Without it, `unassessed` reads identically for a tea bag and a wooden spoon.
Nobody will ever lab test a wooden spoon. Tea bags have been measured at 11.6
billion particles per cup, a number this site cites in thirteen places while
showing its own tea rows as unassessed.

Three constraints, all of them consequences of rules already written:

- **A class finding warns and never clears** (1.1). Its status is `caution` or
  `fail`. Only a test of the product itself carries a recommendation, and a
  product with its own result is not subject to the inference at all.
- **The copy names the scope** (1.2): "This is about bottled water generally.
  We have not confirmed it for this product."
- **Weight follows determinability** (2.2). Where the product's own name or
  recorded material puts it in the class, the finding lands at full weight.
  Where only the category matches, it caps at `caution`.

Membership is read from the product's name and recorded material, never from
our note about it. Every supermarket tea row mentions loose leaf, because that
is what we tell people to buy instead, and matching on prose let Lipton and
Twinings escape a finding about exactly their kind of bag.

**A finding must name what escapes it.** Usually that is a sibling in the same
category: loose leaf has no seam, glass is not the polymer that was measured, a
published non detect answers the question directly. Where a whole category
carries it, the finding must instead name an alternative outside the category,
as bottled water does with a filter. A finding nothing escapes is a fact about
the world rather than a way to tell two products apart, and it belongs in an
article. This is rule 5.3's mistake in another costume, and the one that rated
Sonicare a skip for bristles every electric brush has.

The findings live in `data/class-evidence.json`, recorded once and re-read on
every build, the same treatment as recalls and materials.

## 5.6 An absent test is a gap, not a finding

A product with no published third party result has not failed anything. We do not
know, and the honest rendering of that is `unassessed` on the testing front with
the gap stated in the copy, not a caution on the product.

> Missing evidence is disclosed. It is never counted against a product that is
> otherwise sound.

Six products were rated careful purely for want of a lab result. Two of them,
Maldon and Charlie's Soap, had evidence in our own store records that the caution
had ignored. Downgrading on absence also makes the flag meaningless: almost
nothing in these categories is independently tested, so the caution stops
distinguishing anything.

The reverse still holds, from 4.3: a clean result cannot be *cited* without its
limit of detection. Not citable and not a failing are different states.

What "looked" means, so that `none` is a claim and not a shrug: a dated search
of the independent testers our verdicts already cite, Lead Safe Mama and
Mamavation, with nothing returned at either. That is recorded on the row with
the date and both names. A hit at either is never a front: a full text search
cannot tell a mercury result from a coffee guide that mentions the brand in
passing, so a hit is a lead for a person to read, and only what they record
sets the front.

## 5.7 A trade-off pick may stay

Some categories have no clean option. The only genuinely plastic free toothbrush
bristle is boar, which is not vegan, so a nylon brush is the best available
choice for anyone who needs one and is honestly labelled as such.

> A `careful` product may remain a published pick when it is the best available
> option under a stated constraint, and the caveat is stated with it.

This is not a loophole for a product that simply fails. It requires the
constraint to be real, the product to be the best under it, and the caveat to be
visible at the point of recommendation. In the data it is the `tradeoff` field,
which must carry the reason.

## 6. Turning four fronts into one verdict

Two stages. First, what the evidence supports:

```
any front == fail                                    -> skip
any front == caution, none fail                      -> careful

basis is inherited                                   -> unrated
scope is broader than line                           -> unrated

testing is a direct pass at sku or line scope        -> good      (5.5)
formula is a direct pass, and the product is durable -> good      (5.4)
formula is a direct pass plus one other front        -> good
a store pick, chosen by a person at product scope    -> good
otherwise                                            -> unrated
```

The table binds a verdict typed by hand as much as one the rules derive. A
`skip` needs a failed check and a `careful` needs a caution. Until September
2026 a hand written verdict stood whatever its checks said, and 112 rows read
skip over checks that reached only caution. They now read what the checks
carry, and a warning with nothing recorded behind it is `unrated` until the
check that justifies it is recorded; it is never promoted to `good` on the way.

Then the completeness gate, `tools/enforce-scorecard.py`, which runs last and
closes every route at once:

> **A recommendation ships only when materials and the legal check carry a
> finding, and formula too where the product is a consumable.** Whatever
> awarded the good, it is held back while any of those is `unassessed`, the
> missing checks are named on the card, and the verdict returns on its own the
> moment the research lands. The gate also
> enforces the ceiling above on every row, whatever the row claims about
> itself, and a lowered verdict always states which front lowered it.

Testing is deliberately outside the gate, per rule 5.6: a product with no
third party test available is not held for one, because almost nothing in
these categories is independently tested and the maker does not control
whether a lab has looked. The gap is disclosed on the card ("not yet
assessed: independent tests") rather than blocking the verdict. A testing
FINDING binds in full, in both directions: a fail or caution caps the verdict
like any other front, and a clean result at a stated limit of detection is
the strongest single credential a recommendation can carry.

Front vocabulary, because two of these look alike and are not:

- `unassessed`: nobody has looked yet. Blocks `good`. Never produces a skip.
- `none`: we looked, and no evidence of that kind exists for this product.
  No lab tests a toothbrush handle. This is a finding, and it satisfies the
  gate. Never use it on an ingestible, where silence is itself informative.

`unrated` is a real, shippable state, and the extension distinguishes its two
flavours: a product we never researched reads "not reviewed" with a request a
review button, and a held back product reads "checks in progress" naming what
is done and what is still open.

**The guard, restated:**

- `good` requires **direct evidence at product scope**, with formula,
  materials and legal each carrying a finding, and formula on a consumable.
  Inheritance can never produce
  a recommendation.
- `careful` and `skip` **may** rest on inherited evidence, provided the copy
  names the scope it was inherited from.
- A classifier reading of a note may flag a published good for review. It may
  never convict it: the ceiling for an inferred adverse reading is `unrated`
  and a person looks at it.
- It may never clear one either. A check passes only on a recorded source: a
  record in the evidence file, research a person recorded, or a class finding.
  A pass read off our own description is stored as `unassessed`, and a
  recommendation resting on it is held until the source is recorded. Set in
  September 2026, when 140 recommendations were found resting on such readings,
  among them Naturepedic's Serenade, whose materials pass sat over a note saying
  the material had not been established.

---

## 7. Staleness

Every front carries a date and expires. On expiry it drops to `unassessed`
rather than silently asserting something old.

| Front | Time to live | Why |
|---|---|---|
| Formula | 24 months | Reformulations happen quietly and are never announced |
| Packaging | 24 months | Container changes are common and unannounced |
| Testing | 36 months for a clean result; a bad result stands until a newer test clears it (4.7) | Results age slowly, but supply chains change |
| Legal | 12 months, rolling | New filings and recalls appear continuously |

**Implementation status.** What ships today: `ext.dated` records when a
verdict last changed, and it moves only when the answer moves, never on a
rebuild. Per-front dates and automatic TTL expiry are not yet enforced; until
they are, the legal front's freshness rides on `check-recalls.py` stamping its
check date into the note on every build, and the rest of this table is the
standard the tooling is being built toward, not a description of it.

---

## 8. The record shape

What every front stores. This is also the API response shape, because provenance
is the product. A buyer paying for this needs to know why, not just what colour.

```jsonc
{
  "status":     "pass | caution | fail | unassessed",
  "scope":      "lot | sku | line | formula | format | brand | class",
  "basis":      "direct | inherited",
  "confidence": "high | medium | low",
  "mechanism":  "ingredient | process | formulation | lot | unknown",  // testing only
  "source":     "citation",
  "date":       "2026-08-28",
  "lod":        "5 ppb",     // testing only, required for any pass
  "disputed":   false
}
```

`basis: "inherited"` must always be accompanied by a note naming the scope it came
from, because that is what gets shown to the shopper.

**Implementation status.** This is the target record for AI-assisted research
and the paid API, not what the file stores today. Today a front stores a flat
status plus `frontNotes` prose, and scope, basis and the rule trail live on
`ext`. New research should already be written with every field above stated in
the note (source, date, LOD, mechanism), so the migration is a re-parse rather
than a re-research.

---

## 9. What this means for the current data

The completeness gate is live, and the honest consequence is a backlog: rows
the site rates good sit at "checks in progress" in the extension until their
materials and legal checks carry findings. That is the standard
working, not the standard failing. Two implications:

1. **Filling a front releases verdicts by itself.** The gate restores a held
   verdict the moment the missing checks land, so a batch legal sweep or a
   testing citation run pays out immediately, with no verdict re-adjudication.
2. **The `none` state is how durable goods clear.** A toothbrush or a steel
   bowl is never going to have a lab dossier, and marking testing `none` after
   actually checking is the legitimate way such a product reaches good.

## 10. Vetting a product on request

The end state this file is building toward: a customer asks about a product,
a research run answers, and the shopper sees the verdict on the listing. The
contract for that run, human or AI, lives in `docs/product-schema.md` section
7 and boils down to three rules:

1. **The model records evidence; the pipeline decides the verdict.** A research
   run writes the brand entry and the product row with the findings in the
   note: source, year, limit of detection, mechanism. `apply-product-rules`
   and the gate turn that into the verdict under this standard. `authored`
   blocks are reserved for rows a person signed off.
2. **Nothing enters the file without validation.** `validate-data.py --stage
   pre` rejects malformed shapes, duplicate brands, and rules that would
   answer one listing two ways, before any tool can propagate them. The build
   runs it again, with the full invariant set, on the file about to ship.
3. **An unreviewed machine verdict never wears our badge.** `reviewed: false`
   on the brand renders as "Research, not yet reviewed" in every surface.
   Publishing an unchecked machine claim against a named brand at the moment
   of purchase is the one mistake this system is designed to make impossible.
