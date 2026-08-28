# Rating rules

How a product gets a verdict. This is the editorial standard for Brand Check, the
Amazon extension, and the paid API. If a rule here and a published page disagree,
the page is wrong.

Last revised 2026-08-28.

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
formaldehyde releasers, triclosan, lead, cadmium. One of these, un-negated, in
the path that reaches a person, fails the front on its own.

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

Exposure then modulates it, by the same route rule as packaging. A fragrance
left on skin all day is a different finding from one rinsed down a drain, and
our practice already reflects this: no product on the site is a skip for
fragrance alone. Every skip that mentions it carries a second, named finding
beside it, and that is the rule, not a coincidence.

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

## 3. Packaging

**Natural scope:** `format`.

**Rule.** Judge the material that touches the contents, in the format sold in the
listing being viewed.

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
| 0 | Glass, stainless, foil lined, ceramic | Inert |
| 1 | HDPE, LDPE, PP, platinum silicone | Slip agents and antioxidants only |
| 2 | PET, Tritan, copolyester | Antimony trioxide catalyst, acetaldehyde |
| 3 | PVC, polycarbonate, polystyrene, melamine | Phthalates, BPA, styrene, melamine monomer |

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

So the case that prompted this: **water based skincare or makeup in a plastic
bottle passes.** The exceptions are the anhydrous ones, face oils, cleansing
balms and lip products, which are all oil and in the case of lip products also
swallowed, and acidic actives in PET.

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

---

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

For a **durable good** the object is its material. A stainless bowl with no
coating has nothing further to disclose, and formula and packaging are the same
front asked twice. A fully specified inert material is the complete safety case,
so it carries a recommendation on its own.

For a **consumable** the two come apart. The formula is a recipe, the packaging
is a separate object that can migrate into it, and lab testing routinely finds
what an ingredient list cannot show. There a second front is real evidence, not
a formality.

So the second front is required for anything ingested or applied to skin, and
not required for an object whose material we can name.

## 5.5 A lab result outranks a label read

Section 4.2 ranks a published third party lab result above a brand's own
disclosure and far above a marketing claim. The verdict bar has to follow the
same ordering, or it produces the absurd result that two things read off a label
qualify where an independent measurement of the product does not.

> A third party non detect at a stated limit of detection, at sku or line scope,
> carries a recommendation on its own.

Without the limit it carries nothing, per 4.3.

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

```
any front == fail                                    -> skip
any front == caution, none fail                      -> careful

basis is inherited                                   -> unrated
scope is broader than line                           -> unrated

testing is a direct pass at sku or line scope        -> good      (5.5)
formula is a direct pass, and the product is durable -> good      (5.4)
formula is a direct pass plus one other front        -> good
otherwise                                            -> unrated
```

`unassessed` is an absence, not a failure. It never produces a skip. What it
does do is block `good`, because `good` is the only verdict that requires
positive evidence rather than the absence of a problem.

`unrated` is a real, shippable state. It reads "we have not reviewed this one"
with a request a review button. It is always better than a guess.

**The guard, restated:**

- `good` requires **direct evidence at product scope**. Inheritance can never
  produce a recommendation.
- `careful` and `skip` **may** rest on inherited evidence, provided the copy
  names the scope it was inherited from.

---

## 7. Staleness

Every front carries a date and expires. On expiry it drops to `unassessed`
rather than silently asserting something old.

| Front | Time to live | Why |
|---|---|---|
| Formula | 24 months | Reformulations happen quietly and are never announced |
| Packaging | 24 months | Container changes are common and unannounced |
| Testing | 36 months | Results age slowly, but supply chains change |
| Legal | 12 months, rolling | New filings and recalls appear continuously |

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

---

## 9. What this means for the current data

1. **483 brand line rows** carry a brand verdict onto products. Each needs
   re-scoping. Where the category word genuinely constrains it, such as Pampers
   diapers, it survives. Where it does not, it drops to `unrated`.
2. **The 49 cookware brands** rated good on the AB 1200 disclosure fail rule 5.3
   and section 6. A disclosure is not a formula pass. They drop to `unrated`
   pending a per-line review, because a brand selling both PTFE and ceramic lines
   cannot have one cookware verdict.
3. **380 formula unknowns and 723 packaging unknowns** are mostly deskwork, not
   research spend. Sections 2 and 3 resolve them from the label and the listing
   photo, and non-disclosure converts to a `caution` rather than a blank.
4. **Testing and legal gaps stay gaps.** They are the two fronts that genuinely
   need paid research, and per the scorecard rule they simply do not render until
   we have them.
