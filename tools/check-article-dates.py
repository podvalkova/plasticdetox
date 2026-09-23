#!/usr/bin/env python3
"""Does an article say the same date in all four places it carries one?

An article's date is written four times: `dateModified` in the JSON-LD, the
`Updated ...` line a reader sees, `<lastmod>` in sitemap.xml, and `data-date`
on the article's card in index.html and resources.html. Keeping them together
was a rule somebody had to remember, and on 23 September 2026 thirty seven
articles had a stale byline and seventy two had a stale sitemap or card entry.
How to avoid BPA and phthalates had been edited that week and told readers it
was last touched on 4 April.

That is the same shape as the problem check.sh exists for: the rule was
written down and nothing ran it. So this runs it. `dateModified` is the
authority, because it is the one that was actually being maintained.

Reader facing dates matter more than the structured one. Google reads the
JSON-LD, a person reads the byline, and for months those two were making
different claims about the same page.

    python3 tools/check-article-dates.py          read only, exits non zero
    python3 tools/check-article-dates.py --fix    align the other three
"""
import argparse
import datetime
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]
INDEX = {m: i + 1 for i, m in enumerate(MONTHS)}
LISTINGS = ("index.html", "resources.html")

CARD = r'href="articles/{}"[^>]*?data-date="(\d{{4}}-\d{{2}}-\d{{2}})"'
LASTMOD = (r'<loc>https://plasticdetox\.org/articles/([^<]+)</loc>(\s*)'
           r'<lastmod>(\d{4}-\d{2}-\d{2})</lastmod>')


def wanted():
    """The authoritative date per article, from its own JSON-LD."""
    out = {}
    for p in sorted((ROOT / "articles").glob("*.html")):
        m = re.search(r'"dateModified":\s*"(\d{4}-\d{2}-\d{2})"',
                      p.read_text(encoding="utf-8", errors="replace"))
        if m:
            out[p.name] = m.group(1)
    return out


def visible(text):
    m = re.search(r"Updated\s+([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})", text)
    if not m or m.group(1) not in INDEX:
        return None, None
    return (datetime.date(int(m.group(3)), INDEX[m.group(1)],
                          int(m.group(2))).isoformat(), m.span(0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true")
    args = ap.parse_args()

    want = wanted()
    today = datetime.date.today().isoformat()
    problems, fixes = [], 0

    # 1. the byline, which is the one a reader believes
    for name, date in want.items():
        p = ROOT / "articles" / name
        s = p.read_text(encoding="utf-8")
        vis, span = visible(s)
        if vis is None or vis == date:
            continue
        d = datetime.date.fromisoformat(date)
        if args.fix:
            p.write_text(s[:span[0]] + f"Updated {MONTHS[d.month - 1]} {d.day}, {d.year}"
                         + s[span[1]:])
            fixes += 1
        else:
            problems.append(f"{name}: byline says {vis}, dateModified says {date}")

    # 2. sitemap lastmod
    sp = ROOT / "sitemap.xml"
    s = sp.read_text(encoding="utf-8")

    def one(m):
        nonlocal fixes
        name, gap, got = m.group(1), m.group(2), m.group(3)
        if name not in want or want[name] == got:
            return m.group(0)
        if args.fix:
            fixes += 1
            return f"<loc>https://plasticdetox.org/articles/{name}</loc>{gap}<lastmod>{want[name]}</lastmod>"
        problems.append(f"{name}: sitemap lastmod {got}, dateModified {want[name]}")
        return m.group(0)

    s2 = re.sub(LASTMOD, one, s)
    if args.fix and s2 != s:
        sp.write_text(s2)

    # 3. the card on each listing page
    for listing in LISTINGS:
        lp = ROOT / listing
        t = lp.read_text(encoding="utf-8")
        changed = t
        for name, date in want.items():
            m = re.search(CARD.format(re.escape(name)), changed)
            if not m or m.group(1) == date:
                continue
            if args.fix:
                changed = (changed[:m.start(1)] + date + changed[m.end(1):])
                fixes += 1
            else:
                problems.append(f"{name}: {listing} card {m.group(1)}, dateModified {date}")
        if args.fix and changed != t:
            lp.write_text(changed)

    ahead = sorted(n for n, d in want.items() if d > today)

    if args.fix:
        print(f"    aligned {fixes} date(s) to dateModified")
    elif problems:
        for line in problems[:12]:
            print(f"      !! {line}")
        if len(problems) > 12:
            print(f"      ... and {len(problems) - 12} more")
        print(f"    ... {len(problems)} date(s) out of step. "
              f"tools/check-article-dates.py --fix")
    else:
        print(f"    {len(want)} articles, every date agrees in all four places.")

    # Not a failure. A date can be set ahead on purpose for something queued,
    # and refusing the commit over it would teach people to pass --no-verify.
    if ahead:
        print(f"    note: dateModified is in the future on {', '.join(ahead)} "
              f"(today is {today})")

    return 1 if problems and not args.fix else 0


if __name__ == "__main__":
    sys.exit(main())
