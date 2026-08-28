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

## 3. Packaging

**Natural scope:** `format`.

**Rule.** Judge the material that touches the contents, in the format sold in the
listing being viewed. Weight it by exposure: heat, fat, acid and storage time all
increase migration, so a plastic lid on a cold dry good is not the same finding
as the same plastic in contact with hot oil.

**Transfers** across every flavour and variant sold in the same container.
**Never transfers** across formats. The same product in glass and in a pouch are
two different verdicts, and multipacks and value sizes are frequently a different
container from the single unit.

Ranking used site wide, best to worst: glass or stainless with a glass or metal
closure, then glass with a plastic lined lid, then uncoated paper or board, then
HDPE and PP, then PET, then multilayer pouches and laminates, then anything
fluorinated or PFAS treated.

Like formula, this front is cheap. It is usually visible in the listing photo.

---

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
