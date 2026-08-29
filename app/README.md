# Plastic Detox, iOS

Two things ship in one binary:

1. **The app.** Scan a barcode or search, get the four front verdict.
2. **Brand Check for Safari.** The same verdict on Amazon listings, built from
   the same `extension/` folder the Chrome build ships.

## Why this shape

The site answers "is this safe" for someone at a desk. The app answers it for
someone in a shop holding the thing. Everything else follows from that:

- The database ships in the binary and works with no signal.
- A scan resolves offline first, through our own mappings, before it asks
  anything on the network.
- A product we have never researched still gets an answer, because the open
  barcode databases carry the packaging material down to the polymer.

## Layout

    www/            the app, plain files, no build step
      js/match.js   brand and product matching, ported from the extension
      js/upc.js     barcode to brand, and packaging to plain English
      js/scan.js    camera, native and browser
      js/screens.js every screen
      js/main.js    navigation and the three things a person can do
      data/         generated, never committed, see sync-data
    ios/App/        the Xcode project
      App/Plugins/  our AVFoundation barcode scanner
      BrandCheck/   the Safari extension target, resources point at ../extension
    scripts/        sync-data, bundle
    bundles/        published over the air bundles, served from the site
    updates.json    which bundle each install should be running

`www/` has no bundler on purpose. Native plugins are reached through
`window.Capacitor.Plugins`, not imports, which keeps the bundle as plain files,
which is what makes an over the air update a file copy.

## Working on it

    npm install
    npm run sync-data     # copy brand-data.json in from the repo root
    npm run serve         # http://localhost:4321, scanning works in Chrome
    npm run ios           # sync and open Xcode

`brand-data.json` has one home, at the repo root, where the research tools
write it. `www/data/` is generated from it and is gitignored, so the app can
never drift into disagreeing with the site about a verdict.

## Shipping a change

Two paths, and the difference matters.

**Over the air**, no review, live on the next cold start:

    npm run bundle 1.0.1
    git add app/bundles app/updates.json && git commit && git push

That covers screens, copy, matching logic, and the verdict data. Bump
`MARKETING_VERSION` in Xcode to match, or every fresh install downloads a copy
of what it already has.

**Through the App Store**, needed for:

- anything in `ios/App/App/Plugins/`
- a new permission
- the Safari extension, whose code lives in the app bundle

The Safari extension's *data* still refreshes on its own, from
`plasticdetox.org`, on the twelve hour cycle in `extension/src/background.js`.
So a recall reaches Amazon listings without a release either way.

## The Safari extension

`ios/App/BrandCheck/` is a thin native shell. Its resources are folder
references into `../../../../extension/`, the same directory the Chrome build
ships, so a fix to a verdict or a selector lands in both browsers from one
edit. There is no copy to keep in step.

Regenerating the shell, if the manifest ever changes shape:

    xcrun safari-web-extension-converter extension --ios-only --no-prompt

Enabling it is three taps in Settings, Apps, Safari, Extensions. iOS gives an
app no way to ask whether its own extension is on, so the app shows
instructions and lets the person say they are done.

## Amazon

Nothing in the app or the extension carries an affiliate link. The Associates
agreement bans them in "client side software" without written approval, which
is why the extension has only ever linked back to the site. Links here open in
the system browser, where Safari already has the person's session.

Putting Amazon links *in the app* is allowed, but only once the app is
registered as an Approved Mobile Application with Associates. Worth applying
for before that is wanted, since approval is not instant.
