# Optimization log

A record of deliberate changes made to improve revenue or search performance, with
the data that motivated each one and the baseline to measure it against.

The point of this file is not history for its own sake. It is so that when a number
moves in a later review, we can tell whether we moved it. Every entry carries a
**baseline** and a **how to verify**, so the next review has something to compare to
rather than a vague memory that "we did some SEO."

Add a new dated section per batch of work. Do not edit old baselines after the fact.

---

## 2026-08-31 — August review actions

Triggered by the August performance review. Context: search clicks grew 25.6% and
organic users 18.2%, but Amazon commission **fell** from $275 in July to $258, so
earnings per organic user dropped 21% ($0.139 to $0.111). The mix-shift explanation
was tested and rejected (clicks gained landed on pages converting at a weighted 27%,
clicks lost came from pages converting at 30%), so these changes address the
monetization surface directly rather than a theory about traffic composition.

Commits: `5a774ec`, `15f6525`, `6bf87ec`, `da095a6`.

### Action 1 — Merchandising: product grids on six under-converting pages

**Why.** Prenatal vitamins converts 57% of readers into an affiliate click. Six high
traffic pages were converting at a weighted 14%. Those six drew 1,305 pageviews in
26 days and produced 179 clicks where roughly 700 was achievable. At the measured
$0.16 per affiliate click that gap is about $100 a month.

**Root causes found**, which were not what the review assumed:

* `sustainable-fabrics-that-arent` had **zero Amazon products** in 10,405 words.
* `glyphosate-detox-guide` used Amazon **search links** (`/s?k=`) in its shopping
  list rather than product links.
* `microplastics-in-clothing-and-laundry` had 10 cards but 4 pointed at search results.
* `toxic-kitchen-appliances-ranked` and `non-toxic-baby-toddler-products-guide` had
  their picks as inline text links buried in 12,000+ words, with no card CSS at all.

| Page | Pageviews (Aug 6-31) | Affiliate rate **before** | Cards after |
|---|---|---|---|
| microplastics-in-clothing-and-laundry | 334 | **11%** | 10 (4 search links converted) |
| glyphosate-detox-guide | 258 | **13%** | 5 new |
| sustainable-fabrics-that-arent | 229 | **8%** | 4 new |
| toxic-kitchen-appliances-ranked | 181 | **20%** | 6 new |
| non-toxic-baby-toddler-products-guide | 141 | **13%** | 5 new |
| supplements-and-microplastics | 162 | 21% | 16, already fine, untouched |

**Judgment call worth remembering:** sustainable fabrics deliberately does **not**
recommend activewear on Amazon. Listing-level certification claims cannot be
verified, which is that article's own argument, so recommending them would
contradict the piece. It leads with the Guppyfriend and picks the laundry and
bedding items that reduce shedding from synthetics already owned.

**How to verify.** Re-run affiliate rate per page (`affiliate_click` events divided
by `screenPageViews`, GA4 property 530024910) on a window starting at least a week
after 2026-08-31. Sustainable fabrics is the cleanest test, because it went from
zero products to four. If the merchandising thesis is right, it should move furthest.

### Action 2 — Search intent fixes on the two biggest impression wasters

**Why.** `toxic-kitchen-appliances-ranked` (9,790 impressions, 0.47% CTR, position
13.5) and `non-toxic-baby-toddler-products-guide` (7,992 impressions, 0.41% CTR,
position 13.3) held 17,782 impressions between them and sent 79 visitors.

**What the query data actually showed**, which changed the plan: both pages are
flooded with AI-assistant fragments ("es danino?", "fuente?", "are you 100% sure
about it"), each with 1 or 2 impressions. That is what destroys CTR at scale, not
weak titles, and it is not fixable. But each page had one real signal being missed:

* Appliances ranked **position 44 for "do toasters have teflon"** (14 impressions)
  despite having two toaster sections, because neither the title nor the meta
  description mentioned toasters at all.
* Baby guide ranked **15.5 for "baby safe materials"** (13 impressions) with 55
  silicone and 39 glass mentions but no direct answer to the question.

**Changes.** Appliances title now reads "Air Fryers, Toasters and Kettles"; meta
description rewritten around the specific questions asked; two toaster FAQs added in
both visible markup and FAQPage schema. Baby guide gained a materials FAQ ranking
glass, stainless, silicone and polypropylene, with its description rewritten to match.

**Baselines to beat:** "do toasters have teflon" position 44; "baby safe materials"
position 15.5; page CTR 0.47% and 0.41%.

### Action 3 — Internal linking to the diapers article

**Why.** The site's first ever digital product sale came from
`best-non-toxic-diapers`, which sits at **position 26.7** and earns 8 clicks a
month. The buyer arrived from Google, hit the package banner and paid within eight
minutes, so the offer converts when it reaches the right reader. The constraint is
reach.

**What was actually wrong.** Not content. **None of the five strongest baby cluster
pages linked to it**, including `cleanest-prenatal-vitamins`, which ranks at 8.3 and
is the natural pregnancy-to-newborn referrer.

Contextual links added from: cleanest-prenatal-vitamins, non-toxic-nursery-setup,
microplastics-in-baby-food, non-toxic-baby-toddler-products-guide,
microplastics-and-fertility.

**Baselines to beat:** position 26.7 overall; "best non toxic diapers" position 21.6
on 50 impressions. Note it already ranks 11 to 12 for several variants, so the head
term is the specific gap.

### Link health fixed along the way

Found while verifying picks, none of it planned:

* **`B0GTR2L9FX` (Magnifique glass air fryer) was dead** and linked from seven files:
  `store.html`, `data/store-products.js`, and four articles. Purged everywhere; the
  `docs/verdict-standard.html` row was kept with a null ASIN rather than deleted.
* **`B000P4D5HG` (Hario V60) was down to one unit.** Swapped site-wide across ten
  files to `B0BWH3K9Z9`, the same dripper properly in stock.
* **`B002KEMABQ` (Filtrol)** had gone unavailable and was linked from the homepage.
  Converted to a brand search link.
* **Seventh Generation diapers and Rumparooz** both unavailable; converted to brand
  search links inside the diapers article.

**Lesson:** run a full ASIN sweep periodically, not only when writing. Four dead or
dying links accumulated across the site without anyone noticing, and one of them was
on seven pages.

---

## Open items

* **Amazon Associates export for July and August** (items ordered, conversion rate,
  average order value). This is the missing piece for the commission decline. Site
  analytics shows what we send Amazon; only Amazon shows what happened after the
  click. If ordered items held steady while earnings fell, the cause is on their side
  and none of the above will fix it.
* **Split `?addon=1`.** The Stripe success URL and the buyer access-email links use
  the same parameter, and that parameter fires the GA `purchase` event. Opening the
  access email on a second device books a phantom $9.99. GA logged 2 purchases and
  $19.98 in August for one real sale. Trust Stripe for revenue until this is split.
* **Suppress the welcome email for buyers.** "So glad you're here" fires six seconds
  after the access email because the buyer is added to a list. Now suppressible,
  since `PLAN_PURCHASED` exists as a Brevo attribute as of 2026-08-26.
* **Prenatal H2 rewrite.** Six H2s read "Part One", "Part Two" and so on, which spends
  the strongest on-page signals on filler. Targets: "clean label prenatal" (position
  30.7), "best prenatal vitamins without heavy metals" (35.8), "best non toxic
  prenatal vitamins" (72). The title already ranks at 8.3 and should not be touched.
