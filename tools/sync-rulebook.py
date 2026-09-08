#!/usr/bin/env python3
"""Keep the rulebook and the code that enforces it in one voice.

The rules exist twice: as prose in docs/rating-rules.md, which is what a person
reads, and as tables in tools/audit-product-rules.py, which is what actually
decides a verdict. They drifted. 40 of the 63 hazard terms the engine enforces
were never named in the rulebook, including talc and the antiperspirant
aluminium salts, so reading the rulebook told you the opposite of what the code
does. I read it and told Anya aluminium was not on our hazard list while the
engine had been failing products for it.

A rulebook that disagrees with the code is worse than no rulebook, because it is
trusted. So the list is generated from the code now, between two markers, and
this refuses to pass if they have drifted. The prose around it stays hand
written; only the enumeration is generated, because the enumeration is the part
that has to be exact.

    python3 tools/sync-rulebook.py           # check, non zero if stale
    python3 tools/sync-rulebook.py --write
"""
import argparse, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOC = ROOT / "docs" / "rating-rules.md"
CODE = ROOT / "tools" / "audit-product-rules.py"
START = "<!-- hazard-list:start -->"
END = "<!-- hazard-list:end -->"


def terms(name):
    src = CODE.read_text()
    m = re.search(rf"{name} = \[(.*?)\n\]", src, re.S)
    if not m:
        raise SystemExit(f"could not find {name} in {CODE}")
    # skip commented-out lines so a note never becomes a rule
    body = "\n".join(l for l in m.group(1).splitlines() if not l.strip().startswith("#"))
    return sorted({t for t in re.findall(r'"([^"]+)"', body)}, key=str.lower)


def block():
    hz, df = terms("HAZARD"), terms("DISCLOSURE_FAILURE")
    out = [START, "",
           f"**The {len(hz)} named hazards the engine enforces.** Generated from `HAZARD` in",
           "`tools/audit-product-rules.py` by `tools/sync-rulebook.py`, so this list and the",
           "code cannot say different things. Un-negated, in the path that reaches a person,",
           "any one of these fails the front on its own.", "",
           "> " + ", ".join(f"`{t}`" for t in hz), "",
           f"**The {len(df)} disclosure failures.** These name no harmful substance; they say we",
           "cannot check. Each caps at careful and never fails a front alone.", "",
           "> " + ", ".join(f"`{t}`" for t in df), "",
           END]
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    doc = DOC.read_text()
    want = block()

    if START in doc and END in doc:
        cur = doc[doc.index(START): doc.index(END) + len(END)]
        if cur == want:
            print("rulebook matches the code.")
            return 0
        new = doc.replace(cur, want)
    else:
        anchor = "**Disclosure failures.**"
        if anchor not in doc:
            raise SystemExit("could not find where to put the list")
        new = doc.replace(anchor, want + "\n\n" + anchor, 1)

    if not args.write:
        print("the rulebook is out of date with the code.")
        print("run: python3 tools/sync-rulebook.py --write")
        return 1
    DOC.write_text(new)
    print(f"wrote the generated hazard list into {DOC}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
