#!/usr/bin/env python3
"""What happened yesterday that could move a verdict.

`check-source-feeds.py` watches the two independent testers our verdicts lean
on, weekly. That covers the single most likely reason a verdict is wrong and
nothing else. A recall, a class action, a reformulation or a new exposure study
can all put a `good` brand in the wrong place, and none of them arrive through
Lead Safe Mama. This watches the other four doors, every morning.

Five lanes, because they fail and succeed differently:

- Recalls. CPSC through `saferproducts.gov/RestWebServices/Recall`, which is
  the answer to the honest limit `check-recalls.py` records in its docstring:
  the documented cpsc.gov endpoints really are 404, and the CPSC recalls RSS is
  404 too, but saferproducts.gov serves the whole recall record as JSON with
  product names, firm names and the hazard text. That is the only queryable
  source for durable goods, so a crib or a vacuum finally has one. Food, drugs
  and cosmetics come from the FDA recalls feed alongside it.
- Lawsuits. No class action site publishes a usable feed on our beat.
  classaction.org has no feed at all, and topclassactions.com serves a megabyte
  of full text about robocalls and overdraft fees to find one phthalate suit.
  Google News RSS takes our own queries instead, which is both lighter and ours
  to tune.
- Research. Europe PMC, five narrow queries. A broad microplastics search
  returns about eighteen papers a day, most of them zebrafish, so the queries
  are written around human exposure through products and each one is capped.
- Watchdogs. Food Packaging Forum, Toxic-Free Future, Beyond Plastics and
  Environmental Health News.
- The two testers, folded in from `check-source-feeds.py` so they are read
  daily rather than weekly. It shares that script's seen cache, so the weekly
  run and this one can never report the same post twice.

Sources, searches and the beat word list live in `data/news-sources.json`. Add
a source there, not here.

The report is worth reading for one section: the headlines that name a brand or
a category we rate, printed with the stance we currently hold. Everything else
is context. Brand matching is imported from `check-source-feeds.py` rather than
copied, so the two guards that stopped the weekly report filling with noise
(names of three letters or fewer matched case sensitively, and the six brands
named after ordinary English words having to appear beside a word from their
own category) hold here too without being maintained twice.

A source that does not answer is reported as not answering and exits 2. It is
never folded into "nothing new", because a watcher that reports a quiet day
when it is actually blind is worse than no watcher.

The window is eight days rather than a day, on a check that runs daily. A
scheduled task only runs while the app is open, so a long weekend with the
laptop shut would otherwise be a hole nothing ever fills. The seen cache is what
stops an item being reported twice, not the window, so widening it costs one
extra page from each source and closes the hole.

    python3 tools/check-news.py                 # the last 8 days
    python3 tools/check-news.py --days 2
    python3 tools/check-news.py --all           # ignore the seen cache
    python3 tools/check-news.py --lane recall   # one lane only
"""
import argparse
import datetime
import email.utils
import gzip
import html
import importlib.util
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
CONFIG = ROOT / "data" / "news-sources.json"
SEEN = ROOT / "data" / "news-seen.json"
# Shared with check-source-feeds.py on purpose, so the weekly run and this one
# cannot both announce the same Mamavation post.
FEED_SEEN = ROOT / "data" / "source-feed-seen.json"

# How long a seen entry is kept. Long enough that a feed still carrying an old
# item does not read as news, short enough that the file does not grow for the
# life of the project. Both caches are gitignored: they are "have you seen this
# yet", not evidence, and a tracked file rewritten by a daily routine would
# mean an automated commit and a live site rebuild every morning for nothing.
FORGET_AFTER = 60

UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    # gzip only. Mamavation answers an unqualified Accept-Encoding with brotli,
    # urllib does not decode brotli, and the body then reads as an empty feed
    # with a 200 beside it. Same class of trap as --compressed on Amazon.
    "Accept-Encoding": "gzip",
}
# Europe PMC answered the Chrome user agent with a 503 and a plain one with a
# 200, which is the opposite of everywhere else, so it gets its own.
UA_API = {"User-Agent": "plasticdetox research (anya@washos.com)",
          "Accept-Encoding": "gzip"}

LANES = ("recall", "lawsuit", "announcement", "research", "watchdog", "testing")

# The ", of Somewhere" that CPSC appends to every firm name. See cpsc().
WHERE = re.compile(r",\s+of\s+.*$", re.I)

_spec = importlib.util.spec_from_file_location(
    "_sf", pathlib.Path(__file__).resolve().parent / "check-source-feeds.py")
_sf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sf)


def fetch(url, headers=UA, timeout=45, tries=2):
    """Return the body, or None when the source did not answer.

    None means unknown, never empty. Every caller has to say so out loud.
    """
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return raw.decode("utf-8", "replace")
        except Exception as e:
            if attempt + 1 == tries:
                print(f"    ! {urllib.parse.urlsplit(url).netloc} did not answer: "
                      f"{type(e).__name__}: {e}")
                return None
            time.sleep(2 * (attempt + 1))
    return None


def clean(s):
    """Text out of a feed field, unescaped before the tags come out.

    Order matters and the obvious order is wrong. Europe PMC escapes its own
    markup, so a journal title arrives as `&lt;i&gt;Helicobacter pylori&lt;/i&gt;`
    and stripping tags first leaves a literal `<i>` sitting in the report.
    Unescape, then strip, then unescape again for the feeds that double encode.
    """
    s = re.sub(r"<!\[CDATA\[|\]\]>", "", s or "")
    s = re.sub(r"<[^>]+>", " ", html.unescape(s))
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def when(raw):
    """Best effort date out of whatever a feed calls its date field.

    Feeds put RFC 822 with a named zone, ISO 8601, or nothing at all in here.
    An item with no readable date is kept rather than dropped: the seen cache
    is what stops it being reported twice, and dropping it would silently lose
    whichever source is sloppiest about dates.
    """
    raw = (raw or "").strip()
    if not raw:
        return ""
    try:
        return email.utils.parsedate_to_datetime(raw).date().isoformat()
    except (TypeError, ValueError):
        pass
    m = re.match(r"(\d{4}-\d{2}-\d{2})", raw)
    return m.group(1) if m else ""


def parse_feed(body, label, lane):
    """RSS and Atom, both, because our five feeds are not all one or the other."""
    out = []
    blocks = re.findall(r"<item[\s>].*?</item>|<item>.*?</item>", body, re.S)
    atom = not blocks
    if atom:
        blocks = re.findall(r"<entry[\s>].*?</entry>", body, re.S)
    for b in blocks:
        title = re.search(r"<title[^>]*>(.*?)</title>", b, re.S)
        link = re.search(r"<link[^>]*href=[\"']([^\"']+)", b) if atom else \
            re.search(r"<link[^>]*>(.*?)</link>", b, re.S)
        date = re.search(r"<(?:pubDate|published|updated|dc:date)[^>]*>(.*?)</", b, re.S)
        url = clean(link.group(1)) if link else ""
        if not url:
            continue
        out.append({"source": label, "lane": lane,
                    "title": clean(title.group(1)) if title else "",
                    "url": url,
                    "date": when(date.group(1) if date else "")})
    return out


def cpsc(since):
    """Every CPSC recall since `since`, with its product and firm names.

    The title names the recalling firm, which is often a factory rather than
    the brand on the shelf: "Hefei Hanchan Network Technology Co., Ltd., dba
    Colerinsec" is how a toy brand appears here. So the text we match a brand
    against is the title plus the product names plus the firm names, not the
    title alone, or every white label recall would read as touching nobody.
    """
    url = ("https://www.saferproducts.gov/RestWebServices/Recall"
           f"?format=json&RecallDateStart={since}")
    body = fetch(url, timeout=60)
    if body is None:
        return None
    try:
        rows = json.loads(body)
    except ValueError:
        print("    ! saferproducts.gov answered with something that is not JSON")
        return None
    if not isinstance(rows, list):
        return None
    out = []
    for r in rows:
        names = [p.get("Name") for p in (r.get("Products") or [])]
        firms = [f.get("Name") for f in (r.get("Manufacturers") or [])]
        firms += [f.get("Name") for f in (r.get("Importers") or [])]
        # CPSC writes a firm as "Brand, of City, State", and the town is not
        # part of the name. Left in, the toy recall filed by "Melissa & Doug,
        # of Wilton, Connecticut" reported that it touched Wilton, the cookware
        # brand, which is a different company in a different aisle.
        firms = [WHERE.sub("", f or "") for f in firms]
        haz = [h.get("Name") for h in (r.get("Hazards") or [])]
        out.append({
            "source": "CPSC", "lane": "recall",
            "title": clean(r.get("Title")),
            "url": str(r.get("URL") or ""),
            "date": str(r.get("RecallDate") or "")[:10],
            "extra": " ".join(clean(x) for x in names + firms if x),
            "note": clean(haz[0])[:160] if haz else "",
        })
    return out


def europe_pmc(query, since, cap):
    params = urllib.parse.urlencode({
        "query": f"({query}) AND (FIRST_PDATE:[{since} TO "
                 f"{datetime.date.today().isoformat()}])",
        "format": "json", "resultType": "lite",
        "pageSize": str(max(cap * 6, 25)), "sort": "P_PDATE_D desc",
    })
    # Five queries fired back to back drew a 503 from Europe PMC on the first
    # one while the rest answered fine, so it is rate limiting rather than
    # down. Space the calls out and give it more attempts than the feeds get.
    time.sleep(1.5)
    body = fetch("https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + params,
                 headers=UA_API, tries=4)
    if body is None:
        return None
    try:
        rows = (json.loads(body).get("resultList") or {}).get("result") or []
    except ValueError:
        print("    ! europepmc did not answer with JSON")
        return None
    out = []
    for r in rows:
        pmid = r.get("pmid") or r.get("id") or ""
        out.append({"source": "Europe PMC", "lane": "research",
                    "title": clean(r.get("title")),
                    "url": f"https://europepmc.org/article/{r.get('source', 'MED')}/{r.get('id')}",
                    "date": str(r.get("firstPublicationDate") or "")[:10],
                    "note": clean(r.get("journalTitle"))})
    return out


def google_news(query, label, lane):
    """Our own searches, because no class action site publishes a usable feed.

    Titles come back as "Headline - Publisher". The publisher is kept: knowing
    a phthalate suit was reported by Reuters rather than by a firm's own press
    release is most of what tells you whether to open it.
    """
    url = ("https://news.google.com/rss/search?q=" + urllib.parse.quote(query)
           + "&hl=en-US&gl=US&ceid=US:en")
    body = fetch(url)
    if body is None:
        return None
    items = parse_feed(body, "Google News", lane)
    for i in items:
        i["note"] = label
    return items


def on_beat(title, beat):
    return any(re.search(r"(?<![A-Za-z])" + re.escape(w) + r"(?![A-Za-z])", title, re.I)
               for w in beat)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=8,
                    help="how far back to look; 8 so a week of missed runs leaves no gap")
    ap.add_argument("--all", action="store_true", help="ignore the seen cache")
    ap.add_argument("--lane", choices=LANES, action="append",
                    help="only these lanes; repeatable")
    ap.add_argument("--cap", type=int, default=4,
                    help="most items to keep per research query and per search")
    ap.add_argument("--dry-run", action="store_true",
                    help="do not write the seen caches")
    args = ap.parse_args()

    lanes = set(args.lane) if args.lane else set(LANES)
    since = (datetime.date.today() - datetime.timedelta(days=args.days)).isoformat()
    cfg = json.loads(CONFIG.read_text())
    brands = json.loads(DATA.read_text())
    by_name = {b["brand"]: b for b in brands}
    needle_map = _sf.needles(brands)
    cats = {}
    for b in brands:
        c = (b.get("category") or "").strip()
        if c and c not in _sf.BROAD:
            cats.setdefault(c, []).append(b["brand"])

    seen = json.loads(SEEN.read_text()) if SEEN.exists() else {}
    feed_seen = json.loads(FEED_SEEN.read_text()) if FEED_SEEN.exists() else {}
    today = datetime.date.today().isoformat()
    print(f"Plastic Detox news, {today}. Anything published since {since}.\n")

    items, unreachable = [], []

    def take(got, label):
        if got is None:
            unreachable.append(label)
            return []
        return got

    if "recall" in lanes:
        print("  recalls")
        items += take(cpsc(since), "CPSC (saferproducts.gov)")

    for f in cfg["feeds"]:
        if f["lane"] not in lanes:
            continue
        body = fetch(f["url"])
        if body is None:
            unreachable.append(f["label"])
            continue
        got = parse_feed(body, f["label"], f["lane"])
        if not got:
            # A 200 with nothing parseable in it is a bot wall or an undecoded
            # body, not a quiet day at the source. Say so.
            print(f"    ! {f['label']} answered without a feed in it. Treating as no answer.")
            unreachable.append(f["label"])
            continue
        if f.get("filter"):
            got = [g for g in got if on_beat(g["title"], cfg["beat"])]
        items += got

    for q in cfg["queries"]:
        if q["lane"] not in lanes:
            continue
        got = google_news(q["q"], q["label"], q["lane"])
        items += take(got, f"Google News: {q['label']}")[:args.cap]

    if "research" in lanes:
        print("  research")
        for r in cfg["research"]:
            got = europe_pmc(r["q"], since, args.cap)
            kept = 0
            for g in take(got, f"Europe PMC: {r['label']}"):
                if kept >= args.cap:
                    break
                # Europe PMC searches the full text, so "lead" catches "leads
                # to" and a picosecond laser paper arrived under metals in
                # consumer goods. A paper earns its line by naming something
                # from the beat in its own title.
                if not on_beat(g["title"], cfg["beat"]):
                    continue
                g["note"] = f"{r['label']} | {g.get('note', '')}".strip(" |")
                items.append(g)
                kept += 1

    if "testing" in lanes:
        print("  independent testers")
        for label, fn in (("Lead Safe Mama", _sf.lead_safe_mama),
                          ("Mamavation", _sf.mamavation)):
            got = fn(since)
            if got is None:
                unreachable.append(label)
                continue
            for g in got:
                g["lane"] = "testing"
            items += got

    # Anything older than the window that a feed still carries is not news.
    items = [i for i in items if not i["date"] or i["date"] >= since]

    # One line per thing, not one line per search that found it. The infant
    # formula scoping review answers both the microplastics query and the food
    # contact query, and printing it twice makes the reader check whether they
    # are two different papers.
    merged = {}
    for i in items:
        prev = merged.get(i["url"])
        if prev is None:
            merged[i["url"]] = i
            continue
        for part in (i.get("note") or "").split(" | "):
            if part and part not in (prev.get("note") or ""):
                prev["note"] = f"{prev.get('note', '')} | {part}".strip(" |")
    items = list(merged.values())

    fresh = [i for i in items
             if args.all or (i["url"] not in seen and i["url"] not in feed_seen)]
    print(f"\n  {len(items)} item(s) in range, {len(fresh)} not seen before")

    if unreachable:
        print(f"\n  !! no answer from: {', '.join(unreachable)}. "
              f"This is not a quiet day, it is a failed check. Run it again.")

    matched, rest = [], []
    for p in fresh:
        hay = p["title"] + " " + p.get("extra", "")
        brand_hits = _sf.hits(hay, needle_map, by_name)
        cat_hits = [c for c in cats
                    if re.search(r"(?<![A-Za-z])" + re.escape(c) + r"(?![A-Za-z])",
                                 hay, re.I)]
        if brand_hits or cat_hits:
            matched.append((p, brand_hits, cat_hits))
        else:
            rest.append(p)

    if matched:
        print(f"\n{'=' * 74}\nTOUCHES SOMETHING WE RATE ({len(matched)})\n{'=' * 74}")
        for p, brand_hits, cat_hits in sorted(matched, key=lambda x: x[0]["date"],
                                              reverse=True):
            print(f"\n  {p['date']}  [{p['lane']}] {p['source']}\n  {p['title']}\n  {p['url']}")
            if p.get("note"):
                print(f"      {p['note'][:150]}")
            for name in brand_hits:
                b = by_name[name]
                front = (b.get("fronts") or {}).get("legal", {}).get("status", "?")
                print(f"      brand: {name} ({b.get('category')}) is {b['stance']}, "
                      f"legal front {front}")
            for c in cat_hits:
                print(f"      category: {c}, {len(cats[c])} brands rated")
    else:
        print("\n  Nothing published names a brand or a category we carry.")

    for lane in LANES:
        rows = [p for p in rest if p["lane"] == lane]
        if not rows:
            continue
        print(f"\n{'-' * 74}\n{lane.upper()} ({len(rows)})\n{'-' * 74}")
        for p in sorted(rows, key=lambda x: x["date"], reverse=True):
            print(f"  {p['date'] or '          '}  {p['source'][:20]:<20} {p['title'][:76]}")
            print(f"                                    {p['url'][:100]}")

    if not args.dry_run:
        for p in fresh:
            (feed_seen if p["lane"] == "testing" else seen)[p["url"]] = {
                "first_seen": today, "date": p["date"],
                "source": p["source"], "title": p["title"]}
        cutoff = (datetime.date.today()
                  - datetime.timedelta(days=FORGET_AFTER)).isoformat()
        seen = {k: v for k, v in seen.items()
                if str(v.get("first_seen") or "") >= cutoff}
        SEEN.parent.mkdir(exist_ok=True)
        SEEN.write_text(json.dumps(seen, indent=1, ensure_ascii=False,
                                   sort_keys=True) + "\n")
        FEED_SEEN.write_text(json.dumps(feed_seen, indent=1, ensure_ascii=False,
                                        sort_keys=True) + "\n")
        print(f"\nremembered {len(seen)} item(s) in {SEEN.relative_to(ROOT)}, "
              f"{len(feed_seen)} in {FEED_SEEN.relative_to(ROOT)}")

    if matched:
        print("\nA match is a lead, not a finding. Read the source itself before "
              "touching a verdict: rule 4.7 on what an adverse result means, rule 5.3 "
              "on what a recall does and does not settle, and the safe sequence in "
              "CLAUDE.md for applying one.")
    return 2 if unreachable else 0


if __name__ == "__main__":
    sys.exit(main())
