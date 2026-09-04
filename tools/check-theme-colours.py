#!/usr/bin/env python3
"""
Catch the light-text-on-light-ground bug before a person has to.

A rule that hardcodes a colour AND takes another colour from a theme token is
the bug: the literal stays put when the theme flips and the token does not.
That is exactly how the caution box in db.html rendered near-white text on
#FFFBEB in dark mode, unreadable, and shipped.

Flags any rule that mixes a hex literal with a var(--token) on colour
properties. Pure-literal rules are fine (a deliberate single-theme component)
and pure-token rules are fine. It is the mix that breaks.

    python3 tools/check-theme-colours.py
"""
import re, sys, pathlib

COLOUR_PROP = re.compile(r"(?<![-\w])(background|background-color|color|border|"
                         r"border-color|border-top|border-bottom|border-left|"
                         r"border-right|box-shadow|outline)\s*:", re.I)
HEX = re.compile(r"#[0-9A-Fa-f]{3,8}\b")
TOKEN = re.compile(r"var\(--[\w-]+\)")
# Inside these, a literal is the point: the block only applies to one theme.
THEMED_BLOCK = re.compile(r"prefers-color-scheme|\[data-theme")


def rules(css):
    """Crude but sufficient: split on braces, keep selector + body pairs."""
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
        yield m.start(), m.group(1).strip(), m.group(2)


def check(path, css, allow=()):
    bad = []
    for pos, sel, body in rules(css):
        decls = [d for d in body.split(";") if COLOUR_PROP.search(d)]
        if not decls:
            continue
        text = ";".join(decls)
        has_hex, has_tok = bool(HEX.search(text)), bool(TOKEN.search(text))
        if not (has_hex and has_tok):
            continue
        before = css[max(0, pos - 400):pos]
        if THEMED_BLOCK.search(before.split("}")[-1] or ""):
            continue
        if any(a in sel for a in allow):
            continue
        line = css[:pos].count("\n") + 1
        bad.append((line, sel[:64], HEX.findall(text)[:3], TOKEN.findall(text)[:3]))
    return bad


def main():
    targets = [
        ("db.html", ()),
        ("brand-check.html", ()),
        # The phone mockup inside the app is deliberately one theme: it draws a
        # device screen, and a device screen does not follow the reader's OS.
        ("app/www/css/app.css", (".frame", ".phone", ".ph-", ".pcard-img")),
    ]
    total = 0
    for rel, allow in targets:
        p = pathlib.Path(rel)
        if not p.exists():
            continue
        css = p.read_text()
        if rel.endswith(".html"):
            css = "\n".join(m.group(1) for m in re.finditer(r"<style>(.*?)</style>", css, re.S))
        bad = check(rel, css, allow)
        total += len(bad)
        print(f"{rel}: {len(bad)} rule(s) mixing a literal with a theme token")
        for line, sel, hexes, toks in bad:
            print(f"    line {line}: {sel}")
            print(f"        literal {', '.join(hexes)}   token {', '.join(toks)}")
    print(f"\n{total} to fix" if total else "\nclean: every themed rule uses tokens throughout")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
