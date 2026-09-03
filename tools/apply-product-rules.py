#!/usr/bin/env python3
"""
Stamp the strict per-product verdict onto every product row.

Two surfaces, two verdicts, one database. This writes the extension's answer
into `ext` and never touches `verdict`, which stays the editorial call that
Brand Check shows.

    product.verdict   what we say about this product on the site
    product.ext = {
        verdict     what the extension is allowed to assert on a listing page
        why         the rule that produced it, shown in the card
        fronts      the four front statuses after the rules corrections
        scope       sku | line | brand | none
        basis       direct | inherited
        disclose    true when the copy must name the scope it was inherited from
    }

They differ on purpose. The site can carry a hedge and a paragraph of context.
The extension gets one line at the moment of purchase, so it holds the stricter
line: a recommendation needs direct evidence about the exact product on screen.

    python3 tools/apply-product-rules.py            # report only
    python3 tools/apply-product-rules.py --write
"""

import argparse
import collections
import datetime
import importlib.util
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TODAY = datetime.date.today().isoformat()
DATA = ROOT / "brand-data.json"

_spec = importlib.util.spec_from_file_location(
    "audit_product_rules", ROOT / "tools" / "audit-product-rules.py")
_a = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_a)
FRONTS = _a.FRONTS


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    dist = collections.Counter()
    diverge = 0
    dedup = 0
    hand_kept = 0
    filled_54 = 0

    for b in brands:
        rows = b.get("products") or []

        # brand-lines.py tested for `match` before adding a row but writes
        # `matchAll`, so the guard never fired and every build appended another
        # copy. Wet Ones carried seven identical rows. Collapse them here.
        # Keyed on the name alone, not the match rules. Keying on the rules let
        # the same product survive several times over: the cross-brand ASIN guard
        # strips an ASIN off a row and a later tool recreates the row, and the two
        # differ only in a field the reader never sees. Rows that agree on the
        # verdict are merged, taking the union of their ASINs and match rules, so
        # nothing loses a way to fire. Rows that disagree are both kept for the
        # collision check below to raise.
        seen, keep = {}, []
        for p in rows:
            key = (p.get("name"), (p.get("ext") or {}).get("verdict") or p.get("verdict"))
            first = seen.get(key)
            if first is not None:
                for field in ("asins", "match", "matchAll", "matchNot"):
                    # list() over a bare string iterates its characters, which
                    # is how "tampon" once became ['t','a','m','p','o','n'] and
                    # a skip about tampons answered for every Organyc listing.
                    # validate-data.py rejects the shape upstream; this raises
                    # rather than propagating it if something slips through.
                    for row in (first, p):
                        if isinstance(row.get(field), str):
                            raise SystemExit(
                                f"{b['brand']} / {row.get('name')}: {field} is a "
                                f"bare string {row[field]!r}, must be a list")
                    merged = list(first.get(field) or [])
                    for v in (p.get(field) or []):
                        if v not in merged:
                            merged.append(v)
                    if merged:
                        first[field] = merged
                if not first.get("note") and p.get("note"):
                    first["note"] = p["note"]
                dedup += 1
                continue
            seen[key] = p
            keep.append(p)
        if len(keep) != len(rows):
            b["products"] = keep
        rows = keep

        consumable = _a.is_consumable(b.get("category"), "")
        for p in rows:
            # A hand-written verdict is the point of the whole exercise: the
            # generated one is a first pass over a 150 character note, and a
            # person who has read the actual listing knows more. Anything
            # carrying authored: true is left exactly as written, on every
            # rebuild, forever. This is what makes the file editable.
            if (p.get("ext") or {}).get("authored"):
                # Rule 5.4 is a rule, not a guess: for a durable good the object
                # IS the surface that touches the contents, so a clean material
                # read answers the packaging question with the same fact. Asking
                # it twice and leaving one blank made recommendations look like
                # they rested on a single observation. This does not overwrite a
                # human's answer, it only fills a front they left blank.
                fr = p["ext"].get("fronts") or {}
                if (not _a.is_consumable(b.get("category"), p.get("name"))
                        and fr.get("formula") == "pass"
                        and fr.get("materials") in (None, "unassessed", "unknown")
                        and not _a.GENERIC_PLASTIC.search(
                            " " + _a.evidence_text(p).lower() + " ")):
                    fr["materials"] = "pass"
                    filled_54 += 1
                # The same principle for research that lands in the note after
                # the row was authored: a blank front is not a judgement, so
                # the deterministic reads, the packaging matrix of rule 3 and
                # the material read of rule 2, may fill it. Only those two:
                # they act on stated materials and containers, never on the
                # prose classifier's guesswork, and they never touch a front
                # the author actually set.
                cleaned = _a.evidence_text(p)
                ctx = f"{p.get('name') or ''} {b.get('category') or ''}"
                if fr.get("materials") in (None, "unassessed", "unknown"):
                    pk, pk_why = _a.packaging_severity(cleaned, ctx)
                    if pk:
                        fr["materials"] = pk
                        p["ext"].setdefault("frontNotes", {})["materials"] = \
                            pk_why.capitalize() + "."
                # A material read names what the object is made of, so on a
                # durable good it answers MATERIALS, not formula. It used to
                # answer formula because formula was where a durable's material
                # lived, and rule 5.4 then copied that answer across. Now that
                # materials is its own front and a durable's formula is `none`,
                # the read has to land where the fact actually belongs, or the
                # 5.4 copy has nothing to copy and the front stays blank.
                durable = not _a.is_consumable(b.get("category"), p.get("name"))
                target = "materials" if durable else "formula"
                if fr.get(target) in (None, "unassessed", "unknown"):
                    read, read_why = _a.formula_from_materials(cleaned + " " + ctx)
                    if read is None:
                        read, read_why = _a.formula_from_materials(_a.formula_evidence(p))
                    if read == "pass":
                        fr[target] = "pass"
                        p["ext"].setdefault("frontNotes", {})[target] = read_why
                p["ext"].setdefault("dated", TODAY)
                dist[p["ext"].get("verdict")] += 1
                hand_kept += 1
                continue
            scope, basis = _a.scope_of(p), _a.basis_of(p)
            raw, authored = _a.fronts_for(p, b)
            f, fired = _a.apply_rules(raw, _a.evidence_text(p), scope, basis,
                                      f"{p.get('name') or ''} {b.get('category') or ''}",
                                      formula_text=_a.formula_evidence(p))
            if authored:
                v, why, disclose = p.get("verdict"), "hand authored scorecard", False
            else:
                # The same cleaned text apply_rules read. The raw note carries
                # caveat lists and contrast clauses that are not claims about
                # this product, and correct() must not trip on them either.
                v, why, disclose = _a.correct(p.get("verdict"), f,
                                              _a.evidence_text(p),
                                              scope, basis, consumable=consumable,
                                              origin=p.get("origin"))
            prev = (p.get("ext") or {})
            # Track when a verdict last CHANGED, not when the build last ran.
            # A date that moves on every rebuild tells you nothing; one that moves
            # only when the answer moved tells you how stale the answer is.
            # A held back row stores "unrated" with heldFrom naming the verdict
            # the gate is sitting on. Re-awarding that same verdict is not a
            # change, so the date must survive it; without this, every rebuild
            # reset the date on all held rows.
            dated = prev.get("dated") if v in (prev.get("verdict"), prev.get("heldFrom")) else None

            # This used to replace ext wholesale, which threw away everything
            # another tool owns: the legal findings check-recalls got from the
            # actual databases, the dates the ceiling weighs, the notes saying
            # why a front holds its value. One run wiped 455 rows of that and
            # moved fifteen verdicts as a side effect.
            #
            # A front derived from note text is the weakest evidence we have, so
            # it may fill a blank and may correct another inference, but it does
            # not get to overwrite a database answer or a person's judgement.
            RANK = {"inferred": 0, "stated": 1, "database": 2, "hand": 3}
            origin = dict(prev.get("frontOrigin") or {})
            merged = {}
            for k in FRONTS:
                held = prev.get("fronts", {}).get(k)
                if held not in (None, "unassessed", "unknown") and RANK.get(origin.get(k, "inferred"), 0) > 0:
                    merged[k] = held          # better evidence already stands
                else:
                    merged[k] = f[k]["status"]
                    if merged[k] not in (None, "unassessed", "unknown"):
                        origin[k] = "inferred"
                    else:
                        origin.pop(k, None)

            p["ext"] = {
                **{key: val for key, val in prev.items()
                   if key in ("legalNote", "legalDate", "testingNote", "testingDate",
                              "frontNotes", "cappedFrom", "capRestoreWhy", "heldFrom",
                              "restoreWhy", "legalSuperseded", "authored", "inheritedFronts")},
                "verdict": v,
                "dated": dated or TODAY,
                "why": why,
                "fronts": merged,
                "frontOrigin": origin,
                "scope": scope,
                "basis": basis,
                "disclose": disclose,
                "rules": fired,
            }
            dist[v] += 1
            if v != p.get("verdict"):
                diverge += 1

    # A registry or store row infers "good" from the product being listed; it is
    # a default, not a judgement. An article row states a researched verdict.
    # Where both describe one product, the researched one wins. Sophie la Girafe
    # carried a researched skip for documented mould in its sealed cavity and a
    # registry default of good, and splitting the difference at careful invented
    # a verdict neither source held.
    DERIVED = {"registry", "store"}
    overruled = 0
    for b in brands:
        by_name = {}
        for p in (b.get("products") or []):
            by_name.setdefault(p.get("name"), []).append(p)
        for name, group in by_name.items():
            if len(group) < 2:
                continue
            researched = [p for p in group if p.get("origin") not in DERIVED
                          and (p.get("ext") or {}).get("verdict") in ("skip", "careful")]
            defaults = [p for p in group if p.get("origin") in DERIVED
                        and (p.get("ext") or {}).get("verdict") == "good"]
            if researched and defaults:
                for p in defaults:
                    p["verdict"] = researched[0]["verdict"]
                    p["ext"] = dict(researched[0]["ext"])
                    overruled += 1
                    print(f"  researched verdict overrules a {p.get('origin')} default: "
                          f"{b['brand']} / {name}")
    if overruled:
        print(f"  {overruled} derived defaults overruled by a researched verdict")

    # An ASIN identifies exactly one product, so it cannot sit on two brands.
    # Article tables mis-attribute them: B07FVX9Z9H is Seventh Generation's
    # detergent and was also filed under All Free Clear as a careful, so one
    # store pick carried a recommendation and a warning at once. The row whose
    # brand actually appears in the ASIN map's product name is the right one.
    amap = {}
    map_path = ROOT / "extension" / "data" / "asin-map.json"
    if map_path.exists():
        amap = json.loads(map_path.read_text())
    owner = {}
    for b in brands:
        for p in (b.get("products") or []):
            for a in (p.get("asins") or []):
                owner.setdefault(a, []).append((b, p))
    stolen = 0
    for a, rows in owner.items():
        if len(rows) < 2:
            continue
        truth = (amap.get(a) or {}).get("brand")
        if not truth:
            continue
        for b, p in rows:
            if b["brand"] != truth:
                p["asins"] = [x for x in (p.get("asins") or []) if x != a]
                stolen += 1
                print(f"  !! {a} sat on {b['brand']} and {truth}; pulled it off "
                      f"{b['brand']} ({p.get('name')})")
    if stolen:
        print(f"  pulled {stolen} ASINs off brands that do not own them")

    # Two rows under one brand resolving to the same rule is a silent
    # mis-verdict: whichever sorts first answers for both, and a stale row can
    # outrank the corrected one that replaced it. Levoit carried a good row and
    # a skip row on the identical match, and the good one won. The same trap
    # exists for `match` phrases and for a shared ASIN: Organyc's skip and good
    # rows both carried the bare phrase "organyc", tied on every tiebreak, and
    # file order showed the tampons' skip on the liners we rate good. All three
    # rule kinds are checked, because a listing only ever sees the winner.
    clash = 0
    for b in brands:
        seen = {}
        phrases = {}
        by_asin = {}
        for p in (b.get("products") or []):
            for g in (p.get("matchAll") or []):
                k = tuple(sorted(g))
                other = seen.get(k)
                if other is not None and other["ext"]["verdict"] != p["ext"]["verdict"]:
                    print(f"  !! COLLISION under {b['brand']}: {other.get('name')!r} "
                          f"({other['ext']['verdict']}) vs {p.get('name')!r} "
                          f"({p['ext']['verdict']}) both need {sorted(g)}")
                    clash += 1
                seen[k] = p
            for ph in (p.get("match") or []):
                k = " ".join(str(ph).lower().split())
                other = phrases.get(k)
                if other is not None and other["ext"]["verdict"] != p["ext"]["verdict"]:
                    print(f"  !! PHRASE COLLISION under {b['brand']}: {other.get('name')!r} "
                          f"({other['ext']['verdict']}) vs {p.get('name')!r} "
                          f"({p['ext']['verdict']}) both fire on {k!r}")
                    clash += 1
                phrases[k] = p
            for a in (p.get("asins") or []):
                other = by_asin.get(a)
                if other is not None and other["ext"]["verdict"] != p["ext"]["verdict"]:
                    print(f"  !! ASIN COLLISION under {b['brand']}: {a} sits on "
                          f"{other.get('name')!r} ({other['ext']['verdict']}) and "
                          f"{p.get('name')!r} ({p['ext']['verdict']})")
                    clash += 1
                by_asin[a] = p

    print(f"stamped ext onto {sum(dist.values())} product rows")
    print(f"  rule collisions with different verdicts: {clash}")
    print(f"  hand-authored, left untouched: {hand_kept}")
    print(f"  rule 5.4 filled the packaging front on: {filled_54}")
    print(f"  collapsed duplicate rows: {dedup}")
    print(f"  extension verdict differs from the site verdict: {diverge}")
    print("\nextension verdict distribution:")
    for k, v in dist.most_common():
        print(f"  {str(k):<8} {v:>4}")

    # Same brand, same product name, opposite verdicts. The rules cannot tell
    # these apart and neither can a reader: whichever row a listing happens to
    # match answers for both. Sophie la Girafe carried a skip for mould in the
    # sealed cavity and a good for its natural rubber, describing one product.
    named = {}
    for b in brands:
        for p in (b.get("products") or []):
            v = (p.get("ext") or {}).get("verdict")
            k = (b["brand"], p.get("name"))
            if k in named and named[k] != v:
                print(f"  !! SAME NAME, DIFFERENT VERDICT: {b['brand']} / {p.get('name')} "
                      f"is both {named[k]} and {v}")
                clash += 1
            named[k] = v

    if clash:
        raise SystemExit("refusing to write: two rows would answer for the same listing")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
