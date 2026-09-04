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

    Your home is full of plastic you never chose. Plastic Detox shows you
    what is safe, what to swap, and how to clear it out, one source at a time.

    CLEAR YOUR HOME, SOURCE BY SOURCE

    Every plastic source in your daily life sits on one board: hot food in
    plastic, tap water, tea bags, nonstick pans, all 23 of them in the order
    that cuts your exposure fastest. Tap one and you get the why in two
    sentences, the swaps we vetted, and a free option that counts the same.
    Check it off and watch your home get cleaner, room by room. No accounts,
    no questions, no schedule. Skip anything, come back to it whenever.

    CHECK ANYTHING BEFORE YOU BUY IT

    Scan the barcode in the aisle, or search the brand, and you get one
    answer checked four ways: what the product is made of, what it is
    packaged in, whether it has been recalled or sued over, and what
    independent laboratory testing found.

    - 960 brands researched by hand, not guessed by a model
    - Verdicts on individual products, not just the companies that make them
    - A better thing to buy whenever we would not buy the one you scanned
    - The packaging material of anything with a barcode, down to the polymer,
      even for brands we have never researched
    - The whole database on your phone, so it works with no signal in a shop

    HONEST BLANKS

    A product only gets a recommendation when all four checks pass. Where a
    check has not been done, the app says so instead of filling the gap.
    Where we know the brand but not the exact product, it says that too.
    Nothing here is sponsored.

    A SHOP OF THINGS THAT PASSED

    Browse what we would actually buy, room by room. Every product on that
    shelf cleared the same four checks as everything else in the app.

    ALSO IN SAFARI

    Brand Check ships with the app. Turn it on in Settings and the same
    verdicts appear on Amazon listings while you browse.

    Every verdict is the one published at plasticdetox.org, and the app
    updates them in the background, so a recall reaches you without an
    update.

## What to test [TestFlight, 4000]

    Two things I most want to hear about.

    1. Scan something in your kitchen we have almost certainly never
       researched. That is the common case in a real shop. Does the screen feel
       like an answer, or a dead end?

    2. Search a brand you have an opinion about. Is the verdict clear in the
       two seconds you would actually give it in an aisle?

    The Safari extension is optional and takes three taps in Settings, Apps,
    Safari, Extensions. The app shows you where.

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
