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

**Graphics**, all in `extension/store/`:

| Asset | Requirement | File |
|---|---|---|
| Store icon | 128x128 PNG | `../icons/icon128.png` |
| Screenshot 1 | 1280x800 | `screenshot-1-product-page.png` |
| Screenshot 2 | 1280x800 | `screenshot-2-search-results.png` |
| Screenshot 3 | 1280x800 | `screenshot-3-full-verdict.png` |

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

**Permission justifications**, one per declared permission:

| Permission | Justification to paste |
|---|---|
| `storage` | `Stores the brand database locally so verdicts render instantly and offline, and stores the user's single on/off preference. No browsing data is stored.` |
| `alarms` | `Schedules a twice daily refresh of the brand database from plasticdetox.org so verdicts stay current without the user reinstalling.` |
| `host_permissions: plasticdetox.org` | `Downloads the brand database and the DOM selector configuration the extension reads. This is a static file download and sends no user data.` |
| `host_permissions: plasticdetox-quiz-email.plasticdetox.workers.dev` | `Receives an optional, off by default brand name request when a user chooses to tell us which unreviewed brand to research next. Sends a brand name only.` |
| Host access to `www.amazon.com` | `The extension's entire function is to read the brand or product identifier on an Amazon listing and display our published verdict beside it. It runs on no other site.` |

**Remote code**: select **No, I am not using remote code**. The extension
downloads JSON data only. It never fetches or executes script.

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
