#!/usr/bin/env python3
"""
Validate brand-data.json before and after the pipeline touches it.

The file is edited by hand, by a dozen tools, and increasingly by AI research
runs answering a customer's request. None of those can be trusted to get the
shapes right every time, and one malformed field is how the Organyc tampons row
ended up matching every Organyc listing: someone wrote `"matchAll": "tampon"`,
a later tool ran list() over it, and the string exploded into six single
letters that could never match a title. The row's only surviving rule was the
bare brand word, so a skip written about tampons answered for liners we had
tested clean and rated good.

So the shapes are enforced here, once, for every writer. Two stages:

  --stage pre    run before the pipeline, on data a person or a model just
                 edited. Field shapes, id and alias uniqueness, and editorial
                 verdict collisions. Catches a bad edit before any tool can
                 propagate it.

  --stage post   run after the pipeline, on data about to ship. Everything in
                 pre, plus the ext block: every row stamped, vocab respected,
                 no recommendation on inherited evidence, no adverse verdict
                 without a stated reason, and no two rules that would answer
                 for the same listing with different verdicts.

Reports every failure, then exits non-zero if anything failed, so the build
stops rather than shipping the breakage.

    python3 tools/validate-data.py --stage pre
    python3 tools/validate-data.py --stage post
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
FRONTS = ("formula", "packaging", "legal", "testing")

STANCES = {"good", "careful", "skip", "neutral"}
VERDICTS = {"good", "careful", "skip", "neutral", "unrated"}
EXT_VERDICTS = {"good", "careful", "skip", "unrated"}
# "none" is a finding: we looked, and no applicable evidence exists.
# "unassessed" means nobody has looked yet. Only the second blocks a good.
BRAND_FRONT_STATUS = {"pass", "caution", "fail", "unknown", "none"}
EXT_FRONT_STATUS = {"pass", "caution", "fail", "unassessed", "unknown", "none"}
ASIN = re.compile(r"^[A-Z0-9]{10}$")

collapse = lambda s: re.sub(r"[^a-z0-9]+", "", (s or "").lower())
norm = lambda s: re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def word_list(value, field, where, errs, min_len=1):
    """A list of non-empty strings. A bare string here is the exact bug this
    tool exists to catch: Python will happily iterate it into characters."""
    if value is None:
        return
    if isinstance(value, str):
        errs.append(f"{where}: {field} is a bare string {value!r}, must be a list")
        return
    if not isinstance(value, list):
        errs.append(f"{where}: {field} is {type(value).__name__}, must be a list")
        return
    for v in value:
        if not isinstance(v, str) or len(v.strip()) < min_len:
            errs.append(f"{where}: {field} member {v!r} is not a usable word")


def check_product(b, p, where, errs, stage):
    if p.get("verdict") not in VERDICTS and p.get("verdict") is not None:
        errs.append(f"{where}: verdict {p.get('verdict')!r} not in {sorted(VERDICTS)}")

    for a in (p.get("asins") or []):
        if not isinstance(a, str) or not ASIN.match(a):
            errs.append(f"{where}: asin {a!r} is not a 10 character ASIN")

    word_list(p.get("match"), "match", where, errs)
    word_list(p.get("matchNot"), "matchNot", where, errs)

    ma = p.get("matchAll")
    if ma is not None:
        if isinstance(ma, str) or not isinstance(ma, list):
            errs.append(f"{where}: matchAll is {ma!r}, must be a list of word groups")
        else:
            for g in ma:
                if isinstance(g, str) or not isinstance(g, list) or not g:
                    errs.append(f"{where}: matchAll group {g!r} must be a non-empty list")
                    continue
                # Single letters cannot match a title word and are the
                # signature of a string that got iterated into characters.
                if all(isinstance(w, str) and len(w) <= 1 for w in g):
                    errs.append(f"{where}: matchAll group {g!r} is a word split "
                                "into characters; write the words, not the letters")
                    continue
                word_list(g, "matchAll group", where, errs, min_len=1)

    e = p.get("ext")
    if stage == "post":
        if not isinstance(e, dict):
            errs.append(f"{where}: no ext block; run apply-product-rules")
            return
    if not isinstance(e, dict):
        return
    v = e.get("verdict")
    if v not in EXT_VERDICTS:
        errs.append(f"{where}: ext.verdict {v!r} not in {sorted(EXT_VERDICTS)}")
    for k, st in (e.get("fronts") or {}).items():
        if k not in FRONTS:
            errs.append(f"{where}: ext front {k!r} is not one of {FRONTS}")
        elif st not in EXT_FRONT_STATUS:
            errs.append(f"{where}: ext.fronts.{k} = {st!r} not in {sorted(EXT_FRONT_STATUS)}")
    if stage == "post":
        # The asymmetry rule, checked on the shipped artefact rather than
        # trusted to the tool that was supposed to apply it.
        if v == "good":
            if e.get("basis") != "direct":
                errs.append(f"{where}: good on inherited evidence")
            if e.get("scope") not in ("sku", "line"):
                errs.append(f"{where}: good at {e.get('scope')!r} scope")
            bad = [k for k in FRONTS if (e.get("fronts") or {}).get(k) in ("caution", "fail")]
            if bad:
                errs.append(f"{where}: good with adverse fronts {bad}")
        # A warning has to say why. An empty why on a careful or skip is how
        # Earth Mama's balm shipped a Careful badge with no stated reason.
        if v in ("careful", "skip") and not str(e.get("why") or "").strip():
            errs.append(f"{where}: ext.verdict {v} with an empty why")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=("pre", "post"), default="post")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    errs = []

    # ---- brand identity ---------------------------------------------------
    ids = collections.Counter(b.get("id") for b in brands)
    for i, n in ids.items():
        if n > 1:
            errs.append(f"id {i!r} is on {n} brands; ids must be unique")
        if not i:
            errs.append("a brand has no id")

    # One entry per brand. Two entries answering to the same label means the
    # byline lookup silently picks whichever comes first in the file, and the
    # other entry's research is unreachable from a listing page.
    label_owner = {}
    for b in brands:
        if not (b.get("brand") or "").strip():
            errs.append(f"brand with id {b.get('id')!r} has no name")
            continue
        if b.get("stance") not in STANCES and b.get("stance") is not None:
            errs.append(f"[{b['brand']}]: stance {b.get('stance')!r} not in {sorted(STANCES)}")
        for f, fr in (b.get("fronts") or {}).items():
            if f in FRONTS and isinstance(fr, dict) and fr.get("status") not in BRAND_FRONT_STATUS:
                errs.append(f"[{b['brand']}]: fronts.{f}.status {fr.get('status')!r} invalid")
        for label in [b["brand"]] + list(b.get("aliases") or []):
            key = collapse(label)
            if len(key) < 3:
                continue
            other = label_owner.get(key)
            if other is not None and other is not b:
                errs.append(f"label {label!r} is on both [{other['brand']}] and "
                            f"[{b['brand']}]; merge them or drop the alias")
            label_owner.setdefault(key, b)

    # ---- product rows -----------------------------------------------------
    for b in brands:
        rows = b.get("products") or []
        for p in rows:
            where = f"[{b.get('brand')}] {p.get('name')}"
            check_product(b, p, where, errs, args.stage)

        # Two rules that would answer for the same listing with different
        # verdicts. Whichever row sorts first wins, silently, which is how a
        # skip written about Organyc tampons answered for their liners.
        vfield = (lambda p: (p.get("ext") or {}).get("verdict")) if args.stage == "post" \
            else (lambda p: p.get("verdict"))
        by_phrase, by_group, by_asin = {}, {}, {}
        for p in rows:
            for ph in (p.get("match") or []):
                if not isinstance(ph, str):
                    continue
                k = norm(ph)
                o = by_phrase.get(k)
                if o is not None and vfield(o) != vfield(p):
                    errs.append(f"[{b['brand']}]: match {ph!r} is on {o.get('name')!r} "
                                f"({vfield(o)}) and {p.get('name')!r} ({vfield(p)}); "
                                "narrow one so a listing cannot draw both")
                by_phrase.setdefault(k, p)
            for g in (p.get("matchAll") or []):
                if isinstance(g, str) or not isinstance(g, list):
                    continue
                k = tuple(sorted(str(w) for w in g))
                o = by_group.get(k)
                if o is not None and vfield(o) != vfield(p):
                    errs.append(f"[{b['brand']}]: matchAll {sorted(g)} is on "
                                f"{o.get('name')!r} ({vfield(o)}) and {p.get('name')!r} "
                                f"({vfield(p)})")
                by_group.setdefault(k, p)
            for a in (p.get("asins") or []):
                o = by_asin.get(a)
                if o is not None and vfield(o) != vfield(p):
                    errs.append(f"[{b['brand']}]: ASIN {a} is on {o.get('name')!r} "
                                f"({vfield(o)}) and {p.get('name')!r} ({vfield(p)})")
                by_asin.setdefault(a, p)

    n_rows = sum(len(b.get("products") or []) for b in brands)
    print(f"validated {len(brands)} brands, {n_rows} product rows, stage={args.stage}")
    if errs:
        print(f"\n{len(errs)} failures:")
        for e in errs:
            print(f"  !! {e}")
        raise SystemExit(f"validate-data: {len(errs)} failures, refusing to continue")
    print("all checks passed")


if __name__ == "__main__":
    sys.exit(main())
