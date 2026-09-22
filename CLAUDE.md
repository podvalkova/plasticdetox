# Plastic Detox

plasticdetox.org: does this product put plastic or its chemistry into you, and
what should you buy instead. Four things ship from this one repo, and they must
never disagree with each other about a verdict:

- **the site**, static HTML at the repo root, served by GitHub Pages from `main`
  at `/`, domain in `CNAME`. No build step: a push is a publish.
- **the iOS app**, `app/`, see `app/README.md`
- **the Chrome extension**, `extension/`, built by `tools/build-extension.py`
- **the worker**, `worker/`, a Cloudflare Worker behind everything the static
  site cannot do itself: the quiz and free plan emails, `/subscribe` and
  `/contact`, brand reports and requests from Brand Check, the Stripe webhook,
  and the kids room claim and verify. It has its own `worker/wrangler.toml` and
  deploys separately. Deploy from inside `worker/` with an explicit
  `--config wrangler.toml`, because without it wrangler walks up to the root
  `wrangler.jsonc` and tries to upload the entire multi gigabyte repo. The root
  `wrangler.jsonc` is not what serves the site. Pages is.

## The one rule

`brand-data.json` at the repo root is the single source of truth. Roughly 1,071
brands and 1,085 product rows: everything the site, the app, the extension and
the worker know about any verdict. Every other copy is generated. `app/www/data/`
is synced from it and gitignored, so the app can never drift into disagreeing
with the site.

Before touching it, read:

- `docs/rating-rules.md`, the editorial standard. Evidence attaches at a scope
  (`lot`, `sku`, `line`, `formula`, `format`, `brand`, `class`) and a verdict is
  the union of the evidence whose scope contains the product. **Adverse evidence
  may propagate; favourable evidence never does.** If a rule here and a published
  page disagree, the page is wrong.
- `docs/product-schema.md`, the shape, and which fields a rebuild overwrites. Do
  not hand edit generated fields (`rollup`, `rollupApplied`, `rollupNote`).

## Changing product data without breaking 60 other rows

The tools are not safe to run individually. Each of these has actually happened:

- `tools/brand-rollup.py --write` on its own flipped about 60 unrelated store
  picks from good to unrated, from a clean tree.
- `tools/apply-front-evidence.py --write` on its own dropped 22 inferred fronts,
  moving tea bags, crayons, lotions and cutting boards from caution or fail back
  to unassessed.
- `tools/build-extension.py` **mutates the root `brand-data.json` in place**, and
  when it fails partway it leaves the file half written, which then fails
  `validate-data` with about ten manufactured duplicate ASIN errors. Do not debug
  those as data bugs. Recover with `git checkout HEAD -- brand-data.json`, reapply,
  rerun `tools/validate-data.py --stage pre`. It also runs the whole pipeline with
  `--write` and can sweep up a parallel session's uncommitted edits, so check
  `git status` before and after.

The only safe sequence for a product change:

    python3 tools/apply-front-evidence.py --write
    python3 tools/check-recalls.py --apply --write
    bash tools/check.sh --fix

Then diff `ext.verdict` and brand `stance` against `git show HEAD:brand-data.json`
and expect only your own rows to have moved. A `--fix` pass also bumps
`products[].ext.dated` on roughly 220 rows. That is expected, not drift.

Two more traps. Hand edits do not stick for seeded rows: `tools/add-article-top5.py`
and `tools/add-category-top5.py` carry hardcoded seed tables that re-add rows on
every build, and a seed name that differs from the hand row by so much as a
capital letter breaks the duplicate collapse. And the JSON indent width is not
uniform: `brand-data.json` is `indent=2`, while `data/front-evidence.json` and
`data/recall-cache.json` are `indent=1`. Getting that wrong once shipped a
111,000 line whitespace diff that took another 223,000 lines to undo. Always read
`git diff --stat` before committing a data file.

## Checking your work

    tools/check.sh          read only, exits non-zero on a problem
    tools/check.sh --fix    run the rules and the ceiling, then re-check

It asks two different questions: does the stored data break a rule, and would
running the rules change any verdict. The second is the one that catches drift. A
database can be internally valid and still be out of date with the evidence
sitting beside it. It also checks that the store only sells what Product Check
stands behind, and that every app swap pick carries a photo, pros, cons and its
guide.

There is no CI. A pre-commit hook (`tools/hooks/pre-commit`, wired via
`core.hooksPath`) runs `check.sh` whenever `brand-data.json` is staged. Do not
reach for `--no-verify` unless you can say why.

## Shipping

A push to `origin` (github.com/podvalkova/plasticdetox) publishes the live site.
There is no staging. Treat every push as going straight to plasticdetox.org.

There is a standing approval to commit and push ordinary site edits without
asking. Pinterest assets override it: never commit or push anything under
`Pinterest/`.

The app has two paths and the difference matters. An over the air bundle is also
just a push: `node app/scripts/sync-data.mjs`, then `python3 tools/app-picks.py`,
then `cd app && node scripts/bundle.mjs <next version>`, then commit
`app/bundles/` and `app/updates.json` and push. Installs take it on the next cold
start with no review. Read `app/updates.json` fresh before bundling, because
parallel sessions race it. A store build is the other path, `npm run archive` and
`npm run testflight`, and it is not reversible the same way. An over the air
bundle can never answer an App Store rejection, because a reviewer runs the
binary, and a payment change must never ship over the air at all: both stores
treat that as hiding functionality from review.

**The repo is public.** Credentials, scraped candidate files, social channel ids
and session handoff notes are gitignored for that reason. Never commit anything
that belongs in `.env`, `~/.appstoreconnect/`, or a `*credentials*.csv`, and
check what a `git add -A` is about to sweep up before you run one.

**Nothing about Plastic Detox may share an account, org, analytics property,
repo, domain, billing method or API key with WashOS**, even when reusing one
would be free and faster.

## What not to do without asking

- Do not sweep a rule change site wide when it collides with a recent deliberate
  decision. Ask for scope instead.
- Never remove a store product for lacking a Product Check record. Add it,
  analyse it, remove it only if it fails good, and report what went and why.
- Do not change the rulebook to fix a data problem.
- Never recolour, greyscale or convert an illustration Anya supplied.
- Never publish an affiliate tagged Amazon **search** URL.
- Never reschedule a pin image that may already have been published.

## Verdicts

Every verdict names a rule in `docs/rating-rules.md`. If no rule covers the
finding, there is no finding, and the honest verdict is `good` or `neutral`, not
a downgrade. `skip` is the harshest thing we have, and spending it on a labelling
imprecision devalues it where there is real evidence. `unrated` is not a valid
brand stance; the set is good, careful, skip, neutral. Manual `override` fields
are not used.

One entry per brand, always. When products within a brand conflict, the brand is
`careful`, the reason opens "The verdict depends on the product", and each
product gets its own row in `products[]`. It is a brand check, not a product
check.

A gap is not a finding. `unassessed` means nobody looked, and blocks good.
`none` means we looked and no applicable evidence exists, and counts as assessed.
Never use `none` on an ingestible. A pass inferred from our own marketing prose
reads as unassessed.

Safety screens are the gate, and owner reviews decide the top pick among what
passes. The purist option gets a labelled slot, not the crown. Zero reviews
disqualifies outright, and so does a weak rating on a thin sample.

Never recommended, and each will get proposed again by someone who has not read
the article behind it: Pyrex in any form, Thinkbaby and Earth Mama sunscreen,
anything a person drinks through plastic, plastic bodied appliances where a
stovetop or manual version exists, glass storage with plastic snap lids, and
grains chosen on "organic" alone rather than a Detox Project Glyphosate Residue
Free certification. Nothing Brand Check calls careful or skip appears in the
store, a picks grid or an email, except under rule 5.7 with a written `tradeoff`
and a `careful:` caveat on the card. Amazon availability is never a selection
criterion in either direction, and "does not sell on Amazon" is never written as
a drawback.

## Research method

Every recommendation runs five fronts, in this order: formula, packaging,
independent tests, lawsuits, recalls. Before rating anything good, run a
dedicated adversarial pass whose only job is to disqualify it, searching the
brand against lawsuit, class action, recall, CPSC complaint, FDA warning letter,
rash, chemical burn, and attorney investigating.

A statement is marketing and a test is proof. Independent watchdog beats
independent certifier beats a brand commissioned COA, and a self published lab
report does not by itself meet the bar to feature something. Before crediting a
"tested clean" result, read the lab's own data table for which samples were
actually run for that analyte. Adverse results never expire until a newer clean
test of the same thing replaces them.

Read the primary source. Search summaries have attributed other companies'
recalls to a brand more than once.

## Fetching and tooling, what actually works

Amazon blocks `WebFetch` and a fresh Puppeteer script both. What works is
`curl -sL --compressed` with a realistic Chrome user agent plus `Accept-Language`
and `Accept`. **`--compressed` is the piece everyone misses**: Amazon gzips, and
without it curl writes raw gzip bytes that read as a stripped page. It is
intermittent rather than solved.

The Creators API MCP is not reliable for review counts or availability. It has
reported "no reviews" for ASINs with thousands, and called picks unavailable that
were in stock. Verify a dead link by opening the page. `get_product_images` is
the one call in that set that reliably does its job.

When an Amazon listing's structured text and its own photos disagree, the photo
wins. Listing fields go stale after a reformulation; the photographed label does
not.

## Copy

No dashes, anywhere, including chat replies and drafts. No "low tox". No dollar
prices in copy, tier symbols only. No fixed counts in store listings or release
notes ("1000+" is fine, a precise brand count is not). No "Available on Amazon"
in a card description. Never refer to plasticdetox.org in the third person in
body prose. The CTA is "View →".

Paragraphs near 100 words, 120 at the ceiling, one idea each. Cut the sentences
that comment on our own reasoning. Card descriptions read as spec sheets at 25 to
35 words, materials first, certifications second. The TL;DR names only
recommendations, never a brand we did not pick, and carries no sponsored link to
anything held at careful or skip. A non pick gets exactly two appearances in an
article, its caution card and its scorecard row, and no more.

Consumer copy states reader benefits and never describes app screens or
navigation.

Broadcast emails are plain personal notes from Anya: white background, no images,
no buttons, 260 to 330 words, signed "Anya / plasticdetox.org", "we" for a list
send and "I" for a one to one founder note. Subject at or under 35 characters,
stating a concrete physical claim rather than a topic. Preview text at or under
60 characters, set as a field, never also as an inline preheader div. Never tell
a customer who has already paid that they are first or early.

## House style

Prose, not bullet point telegraphese, in the docs and the comments as well as the
commit messages. A comment says why the code is the way it is, usually by naming
the thing that went wrong before it. A commit subject is a sentence about what
actually changed ("Deodorants: stop over-featuring Each & Every"), never a
conventional commits prefix. Match what is already there.

## Local notes

`HANDOFF.md` at the repo root is gitignored and stays that way. It holds the
account ids, credential file locations, in flight threads, blocked items and open
policy questions that must not go in a public repo. Read it when you need the
specifics this file summarises.
