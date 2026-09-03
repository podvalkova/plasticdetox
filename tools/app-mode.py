#!/usr/bin/env python3
"""
Let an article know it was opened from the app.

The Learn tab opens the real article rather than a copy of it, which keeps one
source of truth for content that already reads well on a phone. What it should
not bring with it is the site's own chrome: the app already has a nav, so the
website's nav, footer and newsletter block are a second set of furniture around
the same room, and tapping a guide felt like leaving the app for the website.

So the app appends ?app=1, this marks the page, and the stylesheet hides the
parts the app already provides. Nothing about the article itself changes, and a
normal visitor sees exactly what they saw before.

    python3 tools/app-mode.py
    python3 tools/app-mode.py --write
"""
import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MARK = "pd-app-mode"
SNIPPET = (
    '<script id="' + MARK + '">'
    'if(location.search.indexOf("app=1")>-1)'
    'document.documentElement.classList.add("in-app")'
    "</script>\n"
)

CSS = """
/* Opened from the app (?app=1). The app supplies its own nav and the article
   is the only thing it wants, so the site's furniture stands down. */
html.in-app .nav,
html.in-app .footer,
html.in-app .breadcrumbs,
html.in-app .newsletter,
html.in-app .site-header { display: none !important; }
html.in-app body { padding-top: 0 !important; }
html.in-app .article, html.in-app main { padding-top: 1rem !important; }
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    pages = sorted((ROOT / "articles").glob("*.html"))
    touched, already = 0, 0
    for page in pages:
        text = page.read_text()
        if MARK in text:
            already += 1
            continue
        if "</head>" not in text:
            print(f"  ! {page.name} has no head")
            continue
        if args.write:
            page.write_text(text.replace("</head>", SNIPPET + "</head>", 1))
        touched += 1

    css = ROOT / "css" / "article.css"
    css_done = MARK in css.read_text() if css.exists() else True
    if css.exists() and not css_done and args.write:
        css.write_text(css.read_text() + f"\n/* {MARK} */" + CSS)

    print(f"articles: {len(pages)}   marked now: {touched}   already marked: {already}")
    print(f"article.css: {'already carried the rules' if css_done else 'rules appended'}")
    if not args.write:
        print("\ndry run. re-run with --write")
    return 0


if __name__ == "__main__":
    sys.exit(main())
