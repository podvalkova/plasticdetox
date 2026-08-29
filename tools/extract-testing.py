#!/usr/bin/env python3
"""
Pull the testing evidence out of the articles and onto the product rows.

Anna's question: we check Lead Safe Mama, Mamavation and the rest for every
article, so why does the testing front sit empty on 192 recommendations?

Because it was never extracted. All 73 articles cite a lab or a certification.
151 of the 192 rows missing a testing pass have a source article that does. But
only 12 of their notes mention one, because the notes were built from store
descriptions and registry blurbs, which describe a product rather than assess it.
The research was done and then left where the extension cannot reach it.

Three attempts to lift the claim out of the prose all misattributed it. A window
around a brand mention routinely holds the NEXT product's certification, so the
extractor gave Henry Rose's EWG verification to Beauty's Sunday and Brita's NSF
rating to Aquasana. Proximity is not attribution, and tightening the window did
not fix it, because "cotton" and "filters" appear in everyone's sentence.

So this uses the one place the evidence is already structured and unambiguous:
the `evidence` column of a ranked article table, which tags each row LAB, MAT,
ING or REG. LAB means that row's verdict rests on lab testing. That is exact,
it cannot attach to the wrong product, and it needs no parsing.

The limit is coverage: only ranked tables carry the tag, so this reaches 100
rows rather than 395. Extending the tag to the other guides would make the rest
exact too, which is a better use of effort than a cleverer scraper.

    python3 tools/extract-testing.py            # report only
    python3 tools/extract-testing.py --write
"""

import argparse
import collections
import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
ARTICLES = ROOT / "articles"

# A named lab, a named certification, or a measured figure. Nothing vaguer.
EVIDENCE = re.compile(
    r"(?:[^.]*?\b("
    r"lead safe mama|mamavation|consumer reports|clean label project|detox project|"
    r"ecology center|anses|greenpeace|plasticlist|nature food|"
    r"ewg verified|made safe|gots|oeko-?tex|greenguard|nsf/?ansi|nsf|iapmo|"
    r"informed sport|informed choice|usp verified|glyphosate residue free|"
    r"third[- ]party tested|independently tested|non[- ]?detect|"
    r"\d+(?:\.\d+)?\s?(?:ppb|ppm)"
    r")\b[^.]*\.)", re.I)

STRIP = re.compile(r"<script.*?</script>|<style.*?</style>", re.S | re.I)
TAGS = re.compile(r"<[^>]+>")


def text_of(path):
    t = STRIP.sub(" ", path.read_text(errors="ignore"))
    return re.sub(r"\s+", " ", html.unescape(TAGS.sub(" ", t)))



def tagged_rows():
    """(asin, verdict, evidence tag) from every ranked article table."""
    for path in sorted(ARTICLES.glob("*.html")):
        src = path.read_text(errors="ignore")
        m = re.search(r"PRODUCTS\s*=\s*\[", src)
        if not m:
            continue
        start, depth, end = m.end() - 1, 0, None
        for i in range(start, len(src)):
            if src[i] == "[":
                depth += 1
            elif src[i] == "]":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if not end:
            continue
        try:
            table = json.loads(src[start:end])
        except json.JSONDecodeError:
            continue
        for r in table:
            if len(r) >= 8 and re.fullmatch(r"[A-Z0-9]{10}", str(r[7] or "")):
                yield path.name, r[7], (r[4] or "").upper(), str(r[6] or "").upper(), r[5]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    lab = {}
    for article, asin, verdict, tag, reason in tagged_rows():
        if tag == "LAB":
            lab[asin] = (article, verdict, reason)
    print(f"rows tagged LAB in a ranked table: {len(lab)}")

    set_pass = set_fail = 0
    examples = []
    for b in brands:
        for p in (b.get("products") or []):
            e = p.get("ext")
            if not e or e.get("authored"):
                continue
            if e["fronts"].get("testing") in ("pass", "fail", "caution"):
                continue
            hit = next((lab[a] for a in (p.get("asins") or []) if a in lab), None)
            if not hit:
                continue
            article, verdict, reason = hit
            # The article's reasoning must not be about a different brand. The
            # Similac row's reason discusses Kabrita, because that ASIN is one of
            # the thirteen article rows carrying another brand's listing. Writing
            # it would move a finding from one infant formula onto another.
            other = [o["brand"] for o in brands
                     if o is not b and len(o["brand"]) > 4
                     and o["brand"].lower() in str(reason).lower()]
            if other and b["brand"].lower() not in str(reason).lower():
                print(f"  !! skipped {b['brand']} / {p.get('name')}: the reasoning "
                      f"is about {other[0]}")
                continue
            if verdict == "GOOD CHOICE":
                e["fronts"]["testing"] = "pass"
                set_pass += 1
            else:
                e["fronts"]["testing"] = "fail" if verdict == "SKIP" else "caution"
                set_fail += 1
            e["testingNote"] = f"Lab tested. From {article}: {str(reason)[:220]}"
            if len(examples) < 10:
                examples.append((b["brand"], p.get("name"), e["fronts"]["testing"],
                                 str(reason)[:74]))

    print(f"testing front set from the LAB tag: {set_pass} pass, {set_fail} adverse\n")
    for brand, name, st, why in examples:
        print(f"  {st:<8} [{brand}] {str(name)[:24]:<24} {why}")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
