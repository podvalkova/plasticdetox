#!/usr/bin/env python3
"""
A recommendation needs its checks done. One gate, at the end, for every path.

Anna asked for this repeatedly and it kept not happening. The reason was not
disagreement, it was structure: five different routes could award a good, and
only one of them looked at the fronts. A store pick went through unchecked, so
did a brand named as a better alternative, so did a lab result, so did anything
hand written. Each bypass was a reasonable local decision and together they meant
the rule was never actually in force anywhere.

So it lives in one place now, and it runs last, after every tool that fills a
front. Position matters: run inside apply-product-rules and the legal front is
always empty, because check-recalls has not run yet, which would have held back
every recommendation on the site for a reason that was about ordering.

Whatever awarded the good, it stays a good only if formula, packaging and the
legal check carry a finding. Otherwise it is held back, and the reason names
the checks still to do. Testing is the exception, per rule 5.6 and by Anna's
call: a product with no third party test available is not held for it, the
gap is disclosed on the card instead. A testing finding, good or bad, still
counts in full.

Two things this has to get right that a first pass got wrong.

It has to be reversible. The first version only looked at rows that were still
"good", so the moment it held one back the row stopped being good and the gate
never looked at it again. Research that landed afterwards could not un-hold it,
which made filling in a front pointless. It now records what the row was held
back from and restores that verdict once the missing checks arrive.

It also has to apply section 6, not just the completeness half of it. A fail on
any front is a skip and a caution anywhere is at best a careful, whatever the
row claims about itself. The ceiling only ever lowers a verdict. Nothing here
raises one except the restore above, and that only returns a row to the verdict
it already had.

The testing front carries a third option. "none" says we checked and there is
nothing to check against, which is the normal state for a durable good. Anna's
rule was that a product should not be marked careful merely because no third
party has tested it, and this is where that rule lives.

On the legal front the distinction that matters is whether anything was actually
decided. An active complaint is an allegation, so it caps at caution; a
settlement, judgment or recall is an outcome, so it fails. A settlement whose own
terms impose corrective action, and where that action is verifiable, is a caution
rather than a fail, because the remedy is part of the record too.

    python3 tools/enforce-scorecard.py            # report only
    python3 tools/enforce-scorecard.py --write
"""

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
FRONTS = ("formula", "materials", "legal", "testing")
# "none" is a finding: we looked, and no applicable evidence exists. A lab does
# not test a toothbrush handle, so holding one back until someone does means
# holding it back forever, for a gap that is not a gap. It differs from
# "unassessed", which means nobody has looked yet. Only the second blocks a
# recommendation. Use it where evidence is genuinely not expected, never on an
# ingestible, where silence is itself informative.
BLANK = (None, "unassessed", "unknown", "")
# The three checks that must carry a finding before a recommendation ships.
# Testing is deliberately not among them: rule 5.6 says an absent third party
# test is a gap to disclose, never a mark against a product that is otherwise
# sound, and almost nothing in these categories is independently tested. So a
# missing test never blocks; the card states "not yet assessed: independent
# tests" instead. A testing FINDING still binds in full: a fail or caution on
# the front caps the verdict exactly like any other front.
# Materials and legal block everything. Formula blocks a consumable only,
# because a durable good has no ingredient list and never will: a kettle's
# formula is not missing, it does not exist, and holding a steel kettle back
# for one is the same mistake rule 5.6 corrects on testing. What a durable is
# made of is a real question and it is the materials front, which does block.
BLOCKING = ("materials", "legal")
CONSUMABLE_ONLY = ("formula",)
RANK = {"skip": 0, "careful": 1, "good": 3}

# The site's own vocabulary, not a new one. A consumable is anything swallowed
# or left on a person, where an ingredient list exists and is the evidence.
CONSUMABLE = re.compile(
    r"cosmetic|personal care|sunscreen|skincare|supplement|bottled water|baby food|"
    r"snack|pantry|formula|electrolyte|oral care|toothpaste|mouthwash|floss|cleaning|"
    r"laundry|dish|coffee|tea|salt|spice|protein|diaper cream|lotion|balm|soap|shampoo|"
    r"conditioner|deodorant|wipe|honey|chocolate|diaper|period", re.I)


def blocking_for(brand, product):
    """Which fronts must carry a finding before this product may be recommended."""
    # A formula front already answered `none` says this is a durable good and
    # the question does not apply. Trust that over the shopping category, which
    # files a glass pour-over cup under Coffee.
    if (((product.get("ext") or {}).get("fronts") or {}).get("formula")) == "none":
        return BLOCKING
    consumable = bool(CONSUMABLE.search(
        f"{product.get('cat') or ''} {brand.get('category') or ''}"))
    return BLOCKING + (CONSUMABLE_ONLY if consumable else ())


def _when(value):
    """A year and month from a date we may only know to the year."""
    text = str(value or "").strip()
    if not text:
        return None
    parts = text.split("-")
    try:
        year = int(parts[0])
    except ValueError:
        return None
    month = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    return (year, month)


def superseded_by_testing(ext, fronts):
    """Is a legal caution answered by testing that came after it?

    Both dates have to be known. Without them there is no way to tell which
    piece of evidence is the later one, and guessing in either direction would
    be worse than leaving the ceiling where it is.
    """
    if fronts.get("legal") != "caution" or fronts.get("testing") != "pass":
        return False
    legal = _when(ext.get("legalDate"))
    testing = _when(ext.get("testingDate"))
    if not legal or not testing:
        return False
    return testing > legal


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    gated, kept, restored, capped, released = 0, 0, 0, 0, 0
    awarded = 0
    cleared_stale = 0
    missing = collections.Counter()
    by_cat = collections.Counter()
    examples = []

    for b in brands:
        for p in (b.get("products") or []):
            e = p.get("ext")
            if not e:
                continue
            f = e.get("fronts") or {}
            blank = [k for k in blocking_for(b, p) if f.get(k) in BLANK]

            # A reason has to outlive its cause or die with it.
            #
            # "the note reads adversely on formula, needs a human look" is
            # written when a front reads as a caution. Clear the front and the
            # sentence stays, so a row sits in a review queue over a finding
            # that is no longer there. Anthony's popcorn was held for a note
            # saying it skips the PFAS bag; once the misread was corrected the
            # row still asked for a human to look at nothing.
            if (str(e.get("why") or "").startswith("the note reads adversely")
                    and not [k for k in FRONTS if f.get(k) in ("caution", "fail")]):
                e["why"] = ("a recommendation needs its checks done; still to do: "
                            + ", ".join(blank)) if blank else ""
                cleared_stale += 1

            # Give a held back row its verdict back once the checks arrive.
            if e.get("verdict") == "unrated" and e.get("heldFrom") and not blank:
                e["verdict"] = e.pop("heldFrom")
                e.pop("heldBack", None)
                if str(e.get("why", "")).startswith("a recommendation needs"):
                    e["why"] = e.get("restoreWhy") or ""
                e.pop("restoreWhy", None)
                restored += 1
            # A still held row's outstanding list must track the scorecard:
            # research can fill one check while others stay open, and the card
            # names exactly what is left, not what was left when it was held.
            elif e.get("verdict") == "unrated" and e.get("heldFrom") and blank:
                if e.get("heldBack") != blank:
                    e["heldBack"] = blank
                    e["why"] = ("a recommendation needs its checks done; "
                                "still to do: " + ", ".join(blank))

            # Section 6, as a ceiling. This only ever lowers a verdict, and it
            # lets go again when the front that caused it does. Without the
            # release a verdict capped on evidence later withdrawn stayed
            # capped, which is how Native sat at skip with no finding left.
            # A legal caution answered by newer testing does not set the
            # ceiling.
            #
            # Caboo's wipes carried a Prop 65 notice from August 2025 alleging
            # PFOS, settled. Independent 2026 testing then found PFAS non
            # detect on the same product. Capping on the older allegation while
            # holding the newer lab result meant the weaker, older evidence
            # decided the verdict. A filed or settled allegation is what someone
            # claimed; a lab result is what was measured.
            #
            # The caution still shows. It is a real finding and the card names
            # it. What it no longer does is outrank the measurement that came
            # after it.
            effective = dict(f)
            if superseded_by_testing(e, f):
                effective["legal"] = "pass"
                e["legalSuperseded"] = (
                    f"Independent testing in {e.get('testingDate')} post-dates this "
                    f"{e.get('legalDate')} finding and did not confirm it.")
            else:
                e.pop("legalSuperseded", None)

            vals = [effective.get(k) for k in FRONTS]
            ceiling = "skip" if "fail" in vals else (
                "careful" if "caution" in vals else "good")
            # `unrated` is not on the good/careful/skip scale: it means we are
            # not asserting anything, so there is no cap to lift. Indexing RANK
            # with it raised a KeyError the moment a capped row became unrated,
            # which is what happens when the front that carried its verdict
            # moves, as formula did for every durable good.
            if (e.get("cappedFrom") and e.get("verdict") in RANK
                    and RANK[ceiling] > RANK[e["verdict"]]):
                e["verdict"] = min(e.pop("cappedFrom"), ceiling, key=RANK.get)
                if e.get("capRestoreWhy") is not None:
                    e["why"] = e.pop("capRestoreWhy")
                released += 1
            # Evidence recorded after the verdict was decided can now award one.
            #
            # apply-product-rules reads a product note and decides from that,
            # and it runs before the tools that record real evidence, so a row
            # could answer every front from a published source and stay unrated
            # on the strength of a sentence that said nothing. The Dyson
            # Gen5detect passed the one check that matters for a vacuum, a
            # sealed whole machine HEPA path, and still read "no front is
            # directly evidenced by the note".
            #
            # Deliberately narrow. Nothing adverse anywhere, the carrying front
            # passing from a recorded source rather than a classifier reading,
            # and every blocking front answered. That is the same bar
            # apply-product-rules applies, met with better evidence.
            # A brand stand-in is not something anyone can buy. Coterie's whole
            # range really is totally chlorine free and non detect, so the
            # fronts on that row are true and worth keeping at brand scope, but
            # awarding it "good" puts a recommendation on a row with no product
            # behind it and no ASIN to reach.
            stand_in = (p.get("origin") == "brand-line"
                        or str(p.get("name") or "").strip().lower() == "whole range"
                        or ((e.get("scope") or "") == "brand" and not (p.get("asins") or [])))
            if (not stand_in) and e.get("verdict") == "unrated" and not [
                    k for k in FRONTS if f.get(k) in ("caution", "fail")]:
                carrier = ("formula" if "formula" in blocking_for(b, p)
                           else "materials")
                origin = (e.get("frontOrigin") or {}).get(carrier)
                if (f.get(carrier) == "pass" and origin in ("database", "hand")
                        and not [k for k in blocking_for(b, p) if f.get(k) in BLANK]):
                    e["verdict"] = "good"
                    e["why"] = (f"direct evidence on {carrier}, recorded rather than "
                                "read off a note")
                    awarded += 1

            if e.get("verdict") in ("good", "careful"):
                if RANK[e["verdict"]] > RANK[ceiling]:
                    # A lowered verdict has to say why, or the card shows a
                    # warning with no stated reason. Earth Mama's balm shipped
                    # a Careful badge over a note that still read like a
                    # recommendation, because this branch changed the verdict
                    # and left `why` behind.
                    flagged = [k for k in FRONTS if f.get(k) in ("caution", "fail")]
                    e.setdefault("cappedFrom", e["verdict"])
                    e.setdefault("capRestoreWhy", e.get("why", ""))
                    e["verdict"] = ceiling
                    e["why"] = ("section 6 ceiling: "
                                + ", ".join(f"{k} is {f.get(k)}" for k in flagged))
                    capped += 1

            # Rows capped by an earlier version of this tool, which changed the
            # verdict without writing a reason. Give them the reason now.
            if (e.get("cappedFrom") and e.get("verdict") in ("careful", "skip")
                    and not str(e.get("why") or "").strip()):
                flagged = [k for k in FRONTS if f.get(k) in ("caution", "fail")]
                e["why"] = ("section 6 ceiling: "
                            + ", ".join(f"{k} is {f.get(k)}" for k in flagged)
                            if flagged else "section 6 ceiling")

            if e.get("verdict") != "good":
                continue
            if not blank:
                kept += 1
                continue
            e["heldFrom"] = "good"
            e["restoreWhy"] = e.get("why", "")
            e["verdict"] = "unrated"
            e["why"] = ("a recommendation needs its checks done; still to do: "
                        + ", ".join(blank))
            e["heldBack"] = blank
            gated += 1
            missing.update(blank)
            by_cat[p.get("cat") or b.get("category")] += 1
            if len(examples) < 8:
                examples.append((b["brand"], p.get("name"), blank))

    print(f"recommendations with all four checks, kept: {kept}")
    print(f"held back for an incomplete scorecard:      {gated}")
    print(f"restored once the missing checks arrived:   {restored}")
    print(f"capped by a fail or caution (section 6):    {capped}")
    print(f"released once that finding was withdrawn:   {released}\n")
    if missing:
        print("the check that is missing:")
        for k, n in missing.most_common():
            print(f"  {n:>4}  {k}")
        print("\nworst categories:")
        for c, n in by_cat.most_common(8):
            print(f"  {n:>4}  {c}")
        print()
        for brand, name, blank in examples:
            print(f"  [{brand}] {str(name)[:28]:<28} needs {', '.join(blank)}")

    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA.name}")
    else:
        print("\ndry run. re-run with --write to apply.")


if __name__ == "__main__":
    sys.exit(main())
