# Chrome Web Store submission pack

Everything needed to publish **Plastic Detox Brand Check**. Fields below are
written to be pasted directly into the developer console.

Build the upload file first:

```bash
python3 tools/build-extension.py --zip
# -> dist/plastic-detox-brand-check-1.0.0.zip
```

---

## Step 1. Register the developer account (once, $5)

1. Go to <https://chrome.google.com/webstore/devconsole>
2. Sign in with the Google account that should **own** the extension. Use the
   plasticdetox Google account, not a personal one. Ownership cannot be moved
   later without a support request.
3. Accept the developer agreement.
4. Pay the **one time $5 registration fee**. Card details go to Google Payments.
   Registration is usually usable within a few minutes.
5. Under **Account** in the left sidebar, set the publisher display name to
   `Plastic Detox` and verify the contact email. **An unverified contact email
   blocks publishing**, so do this before anything else.

## Step 1b. The trader / non-trader declaration

Also under **Account**. This is an EU Digital Services Act requirement, not a
Google one, and it is mandatory for every developer.

**Trader** is defined as "any natural person or any legal person, who is acting
for purposes relating to his trade, business, craft or profession in relation to
contracts on this marketplace." Non-trader is anyone acting outside their trade
or business.

**Our read: Trader.** The extension is free and carries no affiliate links, but
it is published by a commercial site in the course of that business and exists
to bring people to it. Trader status turns on acting in a professional capacity,
not on whether money changes hands in this particular transaction. It is a
judgment call and it is yours to make, but trader is the more defensible answer
and it is the one to check with whoever handles the business filings.

**What declaring Trader costs.** Google publishes your **legal name, physical
address and phone number** at the bottom of the public listing, and their own
FAQ advises using "an address you are comfortable having shared publicly." Do
not use a home address here. Given the extension stamps SKIP on named brands at
the point of sale, use a registered agent, an LLC address, or a street-format
mailbox, and a Google Voice number rather than a personal mobile.

**What declaring Non-Trader costs.** The extension is still distributed in the
EEA. EEA users simply see a notice that consumer protection rights do not apply
to contracts with you, which for a free tool that sells nothing is accurate and
harmless.

**Either way, it is reversible.** You can switch by changing from Trader to
Non-Trader and back, which restarts verification.

**If the extension ever charges, Non-Trader is off the table.** Selling to
consumers is the textbook case of acting in your trade or business, and the
declaration describes who you are rather than where you sell, so restricting to
the US would not rescue it. Note also that you cannot charge through the store
at all: Chrome Web Store payments stopped processing on 1 February 2021 and the
licensing API went with them, so any paid tier runs through our own checkout.

**EEA exposure for context**: 912 of 11,054 sessions in the last 90 days, 8.3%.
Restricting distribution to the United States in Step 5 would sidestep the
question entirely, at the cost of that 8.3%.

## Step 2. Create the item and upload

1. Devconsole → **Items** → **Add new item**.
2. Drag in `dist/plastic-detox-brand-check-1.0.0.zip`.
3. Wait for the manifest to parse. The draft opens on the **Store listing** tab.

## Step 3. Store listing tab

| Field | Value |
|---|---|
| Item name | `Plastic Detox Brand Check` |
| Summary (132 char max) | `See our researched verdict on any Amazon listing, scored on formula, packaging, recalls and lawsuits, and independent tests.` |
| Category | **Shopping** |
| Language | English (United States) |

**Description** (paste as is):

```
Plastic Detox Brand Check shows the verdict we have published for a brand while
you are looking at it on Amazon.

Search results get a small coloured chip. Product pages get the full scorecard.
No tab switching, no separate search.

EVERY BRAND, FOUR FRONTS

We vet every brand we write about on the same four fronts, and the extension
shows you all four:

  Formula             what the product is actually made of
  Packaging           what it ships and sits in
  Recalls & lawsuits  the legal and regulatory record
  Independent tests   third party lab results and certifications

Where we have not researched a front yet, it says so rather than pretending.
We would rather show you an honest gap than a confident guess.

793 brands researched and counting, drawn from the same database behind
plasticdetox.org/brand-check.

NO AFFILIATE LINKS

This extension contains no affiliate links. It never adds, alters, or redirects
any link on Amazon, and it cannot change where your purchase is credited. We
earn nothing when you buy something through it.

PRIVATE BY DEFAULT

The brand database is downloaded to your browser and every lookup happens on
your device. We do not receive your searches, the products you view, the pages
you visit, or anything you buy.

One optional setting, off unless you turn it on, sends us the name of a brand we
have not reviewed so we know what to research next. Brand name only. No web
address, no product, no identifier.

Read the research: https://plasticdetox.org/brand-check.html
```

**Graphics**, all in `extension/store/`. **Each slot demands an exact size and
rejects anything else with "The image size is incorrect."** Match them precisely:

| Dashboard slot | Exact size required | Upload this file | Required? |
|---|---|---|---|
| Store icon | 128 x 128 | `store-icon-128.png` | Yes |
| Screenshots (up to 5) | 1280 x 800 | `screenshot-1-search.png`, `screenshot-2-why.png`, `screenshot-3-better.png`, `screenshot-4-good.png`, `screenshot-5-close.png` | Yes, at least 1 |
| Small promo tile | 440 x 280 | `promo-small-440x280.png` | Optional |
| Marquee promo tile | 1400 x 560 | `promo-marquee-1400x560.png` | Optional |

If you hit the size error, you are almost certainly in the wrong slot. The store
icon is the only 128 x 128 asset; everything else is larger. The two promo tiles
are optional and can be skipped entirely without affecting review.

> Use `store-icon-128.png`, **not** `icons/icon128.png`. The manifest icons
> deliberately fill the whole square because they render in the toolbar. The
> store icon needs the artwork inside a 96 x 96 safe area with genuinely
> transparent padding, and no edge on the 128 x 128 canvas, since the store UI
> draws its own.

Regenerate the icons and promo tiles with `python3 tools/make-icons.py`, and the
five screenshots with `python3 tools/make-store-shots.py`. Both assert exact
dimensions before writing.

Upload the screenshots in numbered order. They are built to be read as a
sequence: what it does, why it flags something, what to buy instead, how it
handles gaps, and what the project is.

**Support URL**: `https://plasticdetox.org/about.html`
**Homepage URL**: `https://plasticdetox.org/brand-check.html`

## Step 4. Privacy practices tab

This is the tab that gets extensions rejected. Every field below is required.

**Single purpose description**:

```
Displays Plastic Detox's published research verdict for a brand on Amazon
product and search pages, so a shopper can see how that brand scores on
formula, packaging, recalls and lawsuits, and independent testing without
leaving the page they are on.
```

**Permission justifications.** The manifest was cut down specifically to
survive this field. It now declares **one** API permission and **zero** default
host permissions, so there are only three boxes to fill:

| Permission | Justification to paste |
|---|---|
| `storage` | `Caches the brand verdict database locally so the extension can render a verdict instantly and offline, and stores the single on/off preference for optional brand requests. No browsing data is stored.` |
| Host access to `www.amazon.com` | `The extension's entire function is to read the brand or product identifier on an Amazon listing and display our published verdict beside it. Amazon is the only site it runs on.` |
| Optional host access to `plasticdetox-quiz-email.plasticdetox.workers.dev` | `Optional and off by default. Requested at the moment a user switches on "Help us cover more brands", which sends us the name of a brand we have not reviewed so we know what to research next. It sends a brand name and nothing else. Users who leave the setting off are never asked for this permission.` |

Three permissions were deliberately removed to satisfy "remove any permission
that is not needed", and it is worth knowing why in case a reviewer asks:

- **`alarms`** dropped. Refresh is now triggered by the content script noticing
  its copy is stale, so no periodic timer permission is needed. Refreshing while
  the user is not on Amazon has no value anyway.
- **`host_permissions` for `plasticdetox.org`** dropped. The data files are
  served with `Access-Control-Allow-Origin: *`, so ordinary CORS covers the
  fetch. Verified: the service worker pulls all 793 brands with the permission
  absent.
- **`smile.amazon.com`** dropped from the content script matches. Amazon shut
  Smile down in February 2023, so it was permission for a service that no longer
  exists.

**Data collection checkboxes**. Tick exactly one:

- [x] **Website content** — the brand name read from an Amazon product page,
      only when the user has switched the optional setting on.

Leave every other category unticked. The extension collects no personally
identifiable information, no location, no web history, no user activity, no
authentication data, no financial data, no health data, and no communications.

**Certifications**. All three are true here, tick all three:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**: `https://plasticdetox.org/privacy.html`

> The privacy page now carries a section titled **"The Brand Check Browser
> Extension"** covering exactly this. Confirm it is live before submitting,
> because a reviewer will open the URL and look for it.

## Step 5. Distribution tab

- Visibility: **Public**
- Distribution: **All regions** (or United States only, since that is where the
  Amazon domain and the research apply)
- Not a paid item, no in app purchases.

## Step 6. Submit

**Submit for review** in the top right. Then:

- Review typically takes **one to three business days**. Extensions requesting
  broad host permissions can take longer.
- Rejections arrive by email with a policy code. The two that would apply here
  are a permission justification a reviewer finds thin, or a privacy policy that
  does not visibly cover the disclosed collection.
- Every resubmission needs a **bumped `version` in `manifest.json`**. Chrome
  rejects a re-upload at the same version number.

---

## Before you submit, verify

- [ ] `https://plasticdetox.org/privacy.html` is live and contains the Brand
      Check extension section
- [ ] `https://plasticdetox.org/extension/data/brand-data.json` returns 793
      brands with a `fronts` object on each
- [ ] The zip was rebuilt after the most recent data change
- [ ] Loading `extension/` unpacked still renders a chip on an Amazon search

## Notes on things that are deliberate

**The miss log is off by default.** Since 1 August 2026 the Chrome Web Store
requires data collection be limited to what is strictly necessary to the
declared single purpose. Sending a brand name is not necessary to display a
verdict, so it has to be something a user switches on rather than off. Turning
it on by default would be the single most likely cause of a rejection here, and
would also be the harder position to defend publicly.

**No affiliate links.** Google tightened the affiliate rules in June 2025 after
the Honey affair: any affiliate program must be disclosed on the listing, in the
extension UI, and before install, and no affiliate link, code, or cookie may be
applied without explicit user action. Shipping with none avoids that surface
entirely, and keeps the verdict independent of what we earn.
