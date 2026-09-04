# App Store listing

Draft copy for the App Store Connect record. Character limits in brackets are
Apple's, and every field below is inside them.

## Identity

- **Name** [30]: `Plastic Detox` (13)
- **Subtitle** [30]: `Check, swap, live plastic free` (30)
- **Bundle ID**: `org.plasticdetox.app`
- **Primary category**: Health & Fitness. **Secondary**: Shopping.
- **Age rating**: 4+
- **Price**: Free, no in app purchases

Health & Fitness rather than Shopping as primary, because the question the app
answers is what a product is made of, not where to buy it. Shopping second so
it still surfaces for people who think of it as a shopping tool.

## Keywords [100]

    microplastics,pfas,bpa,phthalates,toxin,scanner,barcode,nontoxic,ingredients,packaging,lead,recalls

## Promotional text [170]

    Scan a barcode in the aisle and see what we found: what it is made of, what
    it ships in, whether it has been recalled, and what independent labs tested.

## Description

    Plastic Detox helps you find and remove the plastic in your daily life.
    Check any product before you buy it, then clear your home one swap at a
    time.

    - Scan a barcode or search any brand for an instant verdict
    - Four checks behind every verdict: formula, packaging, recalls,
      independent lab tests
    - 960 brands researched by hand, with verdicts on exact products
    - A step by step home detox: 23 plastic sources, in the order that cuts
      exposure fastest
    - Vetted swaps for every step, always with a free option that counts the
      same
    - A shop of products that passed, organized room by room
    - Plain word guides on the science behind every recommendation
    - Works offline, the whole database lives on your phone
    - No account, no ads, nothing sponsored

    Every verdict is the one published at plasticdetox.org, updated in the
    background, so a recall reaches you without waiting for an app update.

## What to test [TestFlight, 4000]

    Two things I most want to hear about.

    1. Scan something in your kitchen we have almost certainly never
       researched. That is the common case in a real shop. Does the screen feel
       like an answer, or a dead end?

    2. Search a brand you have an opinion about. Is the verdict clear in the
       two seconds you would actually give it in an aisle?

    Known: the camera needs a real device, and the barcode databases we fall
    back to are strongest on food and personal care, thinner on cookware and
    textiles.

## Privacy answers

The manifest is at `ios/App/App/PrivacyInfo.xcprivacy`. The questionnaire in
App Store Connect should match it:

- **Email address**, linked to the user, app functionality, not used for
  tracking. Collected only when someone types one to request a brand.
- **Search history**, not linked, app functionality, not used for tracking.
  Only the brand name behind a search that found nothing, sent with no
  identifier, which is how the research queue is ranked.
- Nothing else. No advertising identifier, no analytics SDK, no tracking.

## Export compliance

`ITSAppUsesNonExemptEncryption` is already `false` in Info.plist. The app uses
HTTPS and nothing else, so the TestFlight question answers itself.
