#!/usr/bin/env python3
"""What did Lead Safe Mama and Mamavation publish, and does it touch us.

These two are tier 2 under rule 4.2 and a large share of our verdicts rest on
them, so a post of theirs naming a brand we rate is the single most likely
reason a verdict is now wrong. Nobody was watching for that. This watches.

It does not read email. The obvious design was to parse the newsletters, and
that fails silently: as of September 2026 the Gmail account is subscribed to
neither, so an inbox watcher would have reported "nothing new" every week
forever, which is the worst way for a check to fail. Both sites publish the
same information openly, so it reads the sites.

Each one needs a different door and neither is the polite one:

- Lead Safe Mama answers `wp-json/wp/v2/posts` with dates, titles and links.
- Mamavation blocks that endpoint (401, Solid Security) and puts its sitemap
  behind a bot check, but serves `/feed` to a browser user agent. The feed
  carries about ten posts, which covers a weekly run with room to spare.

**Do not send an explicit `Accept-Encoding` header.** Mamavation answers it
with brotli, urllib does not decode brotli, and the body reads as an empty feed
with a 200 beside it: zero items, no error, nothing new to report. Ask for gzip
only, and decode it here.

The value is not the list of headlines. It is the second column: this post
names a brand you rate `good`. Titles are matched against brand names and
category names out of brand-data.json, and a match is printed with the brand's
current stance so the reader can see the disagreement without opening anything.

A source that does not answer is reported as not answering. It is never folded
into "no new posts", for the same reason the inbox design was rejected.

    python3 tools/check-source-feeds.py              # the last 8 days
    python3 tools/check-source-feeds.py --days 30
    python3 tools/check-source-feeds.py --all        # ignore the seen cache
"""
import argparse
import datetime
import gzip
import html
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
SEEN = ROOT / "data" / "source-feed-seen.json"

UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    # gzip only, deliberately. See the module docstring.
    "Accept-Encoding": "gzip",
}

# Categories too broad to be a useful signal. "Kitchen" matches half of what
# either site publishes and tells the reader nothing they did not know.
BROAD = {"Kitchen", "Multi-category", "Cleaning", "Food", "Home", "Baby", "Personal care"}

# Words that end a company name without being part of it, so "Jovial Foods"
# still matches a post titled "Testing Jovial Organic Italian Kidney Beans".
SUFFIX = re.compile(r"\s+(foods?|co\.?|inc\.?|llc|ltd\.?|company|brands?|organics?|"
                    r"naturals?|usa|group|labs?)$", re.I)

# Brands whose names are ordinary English words. Matching these on a title alone
# fills the report with noise, so they have to appear beside a word from their
# own category to count. Kept as a list rather than derived, because a word
# frequency test either misses "Native" or throws out "Thrive".
AMBIGUOUS = {"always", "dawn", "extra", "leaf", "method", "native"}


def fetch(url, timeout=45):
    """Return the body, or None when the source did not answer.

    None means unknown, never empty. Every caller has to say so out loud.
    """
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                raw = gzip.decompress(raw)
            return raw.decode("utf-8", "replace")
    except Exception as e:
        print(f"    ! {url.split('/')[2]} did not answer: {type(e).__name__}: {e}")
        return None


def lead_safe_mama(since):
    url = ("https://tamararubin.com/wp-json/wp/v2/posts"
           f"?after={since}T00:00:00&per_page=50&_fields=date,title,link")
    body = fetch(url)
    if body is None:
        return None
    try:
        rows = json.loads(body)
    except ValueError:
        print("    ! tamararubin.com answered with something that is not JSON")
        return None
    if not isinstance(rows, list):
        print(f"    ! tamararubin.com answered {str(rows)[:120]}")
        return None
    return [{"source": "Lead Safe Mama",
             "date": str(r.get("date") or "")[:10],
             "title": html.unescape(str((r.get("title") or {}).get("rendered") or "")),
             "url": str(r.get("link") or "")}
            for r in rows]


def mamavation(since):
    body = fetch("https://www.mamavation.com/feed")
    if body is None:
        return None
    items = re.findall(r"<item>(.*?)</item>", body, re.S)
    if not items:
        # A 200 with no items is the brotli trap, or a bot wall served as HTML.
        # Either way we did not get the feed, and saying "no new posts" here
        # would be a lie with a 200 behind it.
        print("    ! mamavation.com answered without a feed in it (bot wall, or the "
              "body was not decoded). Treating as no answer.")
        return None
    out = []
    for it in items:
        title = re.search(r"<title>(.*?)</title>", it, re.S)
        link = re.search(r"<link>(.*?)</link>", it, re.S)
        pub = re.search(r"<pubDate>(.*?)</pubDate>", it, re.S)
        when = ""
        if pub:
            try:
                when = datetime.datetime.strptime(
                    pub.group(1).strip()[:25], "%a, %d %b %Y %H:%M:%S").date().isoformat()
            except ValueError:
                when = ""
        if when and when < since:
            continue
        out.append({"source": "Mamavation", "date": when,
                    "title": html.unescape(re.sub(r"<!\[CDATA\[|\]\]>", "",
                                                  title.group(1)).strip()) if title else "",
                    "url": (link.group(1).strip() if link else "")})
    return out


def needles(brands):
    """Every phrase worth looking for, mapped to the brands it belongs to."""
    out = {}
    for b in brands:
        name = b["brand"]
        for n in {name, SUFFIX.sub("", name)}:
            n = n.strip()
            if len(n) < 3:
                continue
            out.setdefault(n, set()).add(name)
    return out


def hits(title, needle_map, brands_by_name):
    """Brand names this title actually names.

    Two ways this goes wrong, and both make the report unreadable rather than
    wrong in an interesting way. A short name matched loosely turns "CAP" into
    the word cap and "BAM" into bam, so anything of three letters or fewer is
    matched case sensitively. And six brands here are named after ordinary
    English words, so "Extra" claimed a Lead Safe Mama post about anchovies in
    extra virgin olive oil. Those six have to earn the match by appearing beside
    something from their own category.
    """
    found = set()
    for needle, owners in needle_map.items():
        flags = 0 if len(needle) <= 3 else re.I
        if not re.search(r"(?<![A-Za-z0-9])" + re.escape(needle) + r"(?![A-Za-z0-9])",
                         title, flags):
            continue
        for owner in owners:
            if needle.lower() in AMBIGUOUS:
                cat = (brands_by_name[owner].get("category") or "")
                words = [w for w in re.split(r"[^A-Za-z]+", cat) if len(w) > 3]
                if not any(re.search(r"(?<![A-Za-z])" + re.escape(w) + r"(?![A-Za-z])",
                                     title, re.I) for w in words):
                    continue
            found.add(owner)
    return sorted(found, key=lambda n: (brands_by_name[n].get("stance") != "good", n))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=8,
                    help="how far back to look; 8 so a weekly run overlaps itself")
    ap.add_argument("--all", action="store_true", help="ignore the seen cache")
    args = ap.parse_args()

    since = (datetime.date.today() - datetime.timedelta(days=args.days)).isoformat()
    brands = json.loads(DATA.read_text())
    by_name = {b["brand"]: b for b in brands}
    needle_map = needles(brands)
    cats = {}
    for b in brands:
        c = (b.get("category") or "").strip()
        if c and c not in BROAD:
            cats.setdefault(c, []).append(b["brand"])

    seen = json.loads(SEEN.read_text()) if SEEN.exists() else {}
    print(f"Lead Safe Mama and Mamavation, posts since {since}\n")

    posts, unreachable = [], []
    for label, fn in (("Lead Safe Mama", lead_safe_mama), ("Mamavation", mamavation)):
        got = fn(since)
        if got is None:
            unreachable.append(label)
            continue
        fresh = [p for p in got if args.all or p["url"] not in seen]
        print(f"  {label}: {len(got)} post(s) in range, {len(fresh)} not seen before")
        posts += fresh

    if unreachable:
        print(f"\n  !! no answer from: {', '.join(unreachable)}. "
              f"This is not a quiet week, it is a failed check. Run it again.")

    matched, rest = [], []
    for p in posts:
        brand_hits = hits(p["title"], needle_map, by_name)
        cat_hits = [c for c in cats
                    if re.search(r"(?<![A-Za-z])" + re.escape(c) + r"(?![A-Za-z])",
                                 p["title"], re.I)]
        if brand_hits or cat_hits:
            matched.append((p, brand_hits, cat_hits))
        else:
            rest.append(p)

    if matched:
        print(f"\n{'=' * 70}\nTOUCHES SOMETHING WE RATE ({len(matched)})\n{'=' * 70}")
        for p, brand_hits, cat_hits in sorted(matched, key=lambda x: x[0]["date"], reverse=True):
            print(f"\n  {p['date']}  {p['source']}\n  {p['title']}\n  {p['url']}")
            for name in brand_hits:
                b = by_name[name]
                front = (b.get("fronts") or {}).get("testing", {}).get("status", "?")
                print(f"      brand: {name} ({b.get('category')}) is {b['stance']}, "
                      f"testing front {front}")
            for c in cat_hits:
                print(f"      category: {c}, {len(cats[c])} brands rated")
    else:
        print("\n  Nothing published this week names a brand or a category we carry.")

    if rest:
        print(f"\n{'-' * 70}\nEVERYTHING ELSE ({len(rest)})\n{'-' * 70}")
        for p in sorted(rest, key=lambda x: x["date"], reverse=True):
            print(f"  {p['date']}  {p['source']:<15} {p['title'][:78]}")
            print(f"                              {p['url']}")

    # Only remember what we actually saw. A source that did not answer leaves no
    # trace, so the next run picks its posts up rather than skipping them.
    for p in posts:
        seen[p["url"]] = {"first_seen": datetime.date.today().isoformat(),
                          "date": p["date"], "source": p["source"], "title": p["title"]}
    SEEN.parent.mkdir(exist_ok=True)
    SEEN.write_text(json.dumps(seen, indent=1, ensure_ascii=False, sort_keys=True) + "\n")

    print(f"\nremembered {len(seen)} post(s) in {SEEN.relative_to(ROOT)}")
    if matched:
        print("\nA match is a lead, not a finding. Read the post itself before "
              "touching a verdict: rule 4.7 on what a level means, and the safe "
              "sequence in CLAUDE.md for applying one.")
    return 2 if unreachable else 0


if __name__ == "__main__":
    sys.exit(main())
