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


def _engine():
    """The tables as the engine actually holds them, not as the source reads.

    This used to parse tools/audit-product-rules.py with a regular expression,
    and a regular expression cannot see a dict comprehension. CATEGORY_CAUTION
    builds the tampon and pad entries with one and the baby wash entry with
    another, so the generated block published "Baby lotion:" with nothing after
    it and never mentioned Tampons or Period pads at all, while the check
    above reported that the rulebook matched the code. Fourteen of the
    eighteen terms the engine enforces were missing from the standard that
    claims to list them. Importing the module gives the real tables, and a
    commented out line is invisible to an import, which is the property the
    old parser was straining to keep.
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location("apr", CODE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def terms(name):
    return sorted(set(getattr(_engine(), name)), key=str.lower)


def scoped_terms():
    """CATEGORY_CAUTION is a dict of category -> {term: note}."""
    return {cat: sorted(terms, key=str.lower)
            for cat, terms in getattr(_engine(), "CATEGORY_CAUTION", {}).items()}


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
           "> " + ", ".join(f"`{t}`" for t in df), ""]
    ld = terms("LABEL_DISCLOSURE")
    out += [f"**The {len(ld)} label only disclosure terms.** A bare umbrella that is only",
            "an umbrella when it stands on an ingredient panel. Read on a recorded list",
            "they are the same failure as `fragrance`; read in prose they are just words,",
            "so the note classifier never sees them.", "",
            "> " + ", ".join(f"`{t}`" for t in ld), ""]
    sc = scoped_terms()
    if sc:
        out += ["**Category scoped cautions.** Generated from `CATEGORY_CAUTION` in the same",
                "file. A term here is a documented downside in one category and unremarkable",
                "elsewhere, so it cautions only inside the category it names, caps at careful,",
                "and never fails a front alone. The evidence behind each term lives as a",
                "comment on the code entry and as prose in 2.1b.", ""]
        for cat in sorted(sc):
            out.append("> **" + cat + "**: " + ", ".join(f"`{t}`" for t in sc[cat]))
        out.append("")
    out.append(END)
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
