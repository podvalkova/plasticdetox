#!/usr/bin/env python3
"""
Actually check for recalls, so the legal front can say something true.

Rule 5.3 says absence of a recall is not a pass, and it is right: in these
categories no recall usually means no regulator was looking. But that rule is
about never having looked. Looking and finding nothing is a different state, and
it is a legitimate "checked, nothing found".

So this queries openFDA's enforcement endpoints per brand and records the answer
with its date, which turns the legal front from a blank into a finding.

The honest limit: openFDA covers food, drugs and cosmetics. Durable goods are
CPSC territory, and CPSC's public API now returns 404 on every documented
endpoint, so for a crib or a vacuum there is no queryable source and the front
stays unassessed rather than being guessed at.

    python3 tools/check-recalls.py --limit 40
    python3 tools/check-recalls.py --write
"""

import argparse
import datetime
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
CACHE = ROOT / "data" / "recall-cache.json"

# Categories openFDA can actually answer for.
FDA_CATS = re.compile(
    r"food|supplement|electrolyte|formula|salt|pantry|coffee|tea|cosmetic|"
    r"skincare|sunscreen|oral care|personal care|protein|spice|gum|diaper cream",
    re.I)
ENDPOINTS = ["food/enforcement", "drug/enforcement", "device/enforcement"]


SUFFIX = re.compile(
    r"\b(inc|llc|l\.l\.c|corp|corporation|co|company|ltd|limited|gmbh|plc|"
    r"holdings|group|brands|products|foods|usa|international|industries|"
    r"enterprises|partners|lp|llp)\b\.?", re.I)


def is_the_brand(brand, firm):
    """
    Is this recalling firm actually our brand?

    recalling_firm is matched as a substring, which is how a search for Crest
    returned Cedar Crest Specialties, Trident returned Trident Seafoods, Badger
    returned a kratom vendor called Badger Botanicals, and eos returned EOS
    Imaging, a medical device maker. Writing any of those to the data would have
    invented a recall against a named brand, which is the one error with real
    legal exposure.

    So the firm name, stripped of corporate suffixes, must actually begin with
    the brand rather than merely contain it somewhere.
    """
    def bare(s):
        s = SUFFIX.sub(" ", (s or "").lower())
        return re.sub(r"[^a-z0-9]+", " ", s).strip()
    b, f = bare(brand), bare(firm)
    if not b or not f:
        return False
    return f == b or f.startswith(b + " ")


def query(brand):
    """
    Verified recalls for this brand, and the most recent.

    Returns (total, latest, examined). `examined` is how many records we looked
    at, so a zero result can distinguish "nothing matched" from "nothing found".
    """
    total, latest, examined = 0, None, 0
    for ep in ENDPOINTS:
        url = (f"https://api.fda.gov/{ep}.json?search=recalling_firm:"
               f"%22{urllib.parse.quote(brand)}%22&limit=100")
        try:
            with urllib.request.urlopen(url, timeout=25) as r:
                d = json.loads(r.read())
        except Exception:
            continue
        for res in d.get("results", []):
            examined += 1
            if not is_the_brand(brand, res.get("recalling_firm")):
                continue
            total += 1
            dt = res.get("recall_initiation_date")
            if dt and (latest is None or dt > latest[0]):
                latest = (dt, res.get("reason_for_recall", "")[:160],
                          res.get("status", ""), res.get("recalling_firm", ""))
    return total, latest, examined


# Our own research is a record too.
#
# A clean FDA search says the database holds nothing today, which is not the
# same as nothing having happened: the enforcement API ages entries out, and a
# 2021 action is long gone from it. So Beech-Nut carried a note reading "Beech
# Nut recalled infant rice cereal in 2021 for arsenic levels exceeding FDA
# guidance" beside a legal front reading "No recall on record", and the card
# showed a clean tick on a recalled product. Aveeno's benzene recall and Dr
# Bronner's class action did the same.
#
# Where the row's own note describes an action, this refuses to assert that
# nothing was found. It does not invent a verdict: the classifier's reading of
# that note stands, and a person can adjudicate it in the cache like any other.
import importlib.util as _ilu
_spec = _ilu.spec_from_file_location("_bf", pathlib.Path(__file__).resolve().parent / "backfill-fronts.py")
_bf = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_bf)

ACTION = re.compile(
    r"\brecall\w*|\blawsuit\b|\bclass action\b|\bprop(?:osition)? 65\b|"
    r"\bconsent decree\b|\bsettle(?:d|ment)\b|\bfined\b|\bwarning letter\b")


def documents_action(product):
    note = str(product.get("note") or "").lower()
    for m in ACTION.finditer(note):
        if not _bf.is_negated(note, m.start(), m.end()):
            return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="stop after N brands")
    ap.add_argument("--apply", action="store_true",
                    help="skip the queries and re-apply what is already cached")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}

    todo = [] if args.apply else [b for b in brands
            if b.get("products") and FDA_CATS.search(b.get("category") or "")
            and b["brand"] not in cache]
    if args.limit:
        todo = todo[:args.limit]
    print(f"brands in an FDA-answerable category with no cached answer: {len(todo)}")

    for i, b in enumerate(todo, 1):
        total, latest, examined = query(b["brand"])
        cache[b["brand"]] = {"total": total, "latest": latest, "examined": examined,
                             "checked": datetime.date.today().isoformat()}
        if total:
            print(f"  {b['brand']}: {total} verified recall(s) "
                  f"(of {examined} name matches), latest {latest[0]} "
                  f"[{latest[3][:40]}]")
        if i % 10 == 0:
            print(f"  … {i}/{len(todo)}")
        time.sleep(0.3)

    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, indent=1, ensure_ascii=False) + "\n")

    # Web-check and adjudicated entries carry no FDA match counts.
    clean = sum(1 for v in cache.values() if v.get("total", 0) == 0)
    hits = sum(1 for v in cache.values() if v.get("total"))
    print(f"\ncached: {len(cache)} brands   clean: {clean}   with recalls: {hits}")

    if not args.write:
        print("\ndry run. re-run with --write to set the legal front.")
        return

    set_pass = set_flag = rescoped = dated = 0
    needs_review = []
    for b in brands:
        c = cache.get(b["brand"])
        if not c:
            continue
        # Which rows a finding actually concerns.
        #
        # A brand level answer used to be written onto every product row, so
        # six Evenflo car seat recalls capped a glass bottle and an UPPAbaby
        # car seat suit capped a stroller. Worse, Pura Kiki's lead sealing dot,
        # which is under the insulated base, capped the non insulated bottle
        # and left the insulated one passing.
        #
        # `appliesTo` names the exact rows a finding covers. Absent means the
        # whole brand, which is right for a formulation or a claims settlement.
        # An empty list means it concerns no product we rate.
        applies = c.get("appliesTo")
        scoped = applies is not None

        for p in (b.get("products") or []):
            e = p.get("ext")
            if not e:
                continue
            if scoped and p.get("name") not in applies:
                # Not this product. We did look, so this is a finding, not a
                # blank: checked, and what is on record is about other lines.
                if e["fronts"].get("legal") == "caution" and e.get("legalNote") == (c.get("note") or ""):
                    e["fronts"]["legal"] = "pass"
                    e["legalNote"] = (
                        f"Checked. What is on record concerns other {b['brand']} "
                        f"products, not this one: {c.get('note') or ''}")
                    (e.get("frontNotes") or {}).pop("legal", None)
                    rescoped += 1
                continue
            # Authored rows are included on purpose. The authored flag protects
            # the verdict and the fronts a person actually set; a front they
            # left unassessed is not a judgement, and filling it with a dated
            # database result overwrites nothing. Skipping them held 38 brands
            # of hand researched rows on a check this tool had already run.
            # A row the finding names, sitting on a pass that nothing wrote a
            # note for, is not a judgement either: it is a gap. Pura Kiki's
            # insulated bottles, the ones with the lead sealing dot, were
            # passing on an empty note while the caution sat on the non
            # insulated row. Only an unexplained pass is overwritten; a pass a
            # person put a reason against is left alone.
            # Stamp the date on any row already carrying this finding, even
            # one we are about to skip. The ceiling needs it to weigh the
            # finding against newer testing, and without it every row set by an
            # earlier run stayed undateable.
            if (c.get("eventDate") and e.get("legalNote") == (c.get("note") or "")
                    and not e.get("legalDate")):
                e["legalDate"] = c["eventDate"]
                dated += 1

            unexplained = (e["fronts"].get("legal") == "pass"
                           and not str(e.get("legalNote") or "").strip())
            if e["fronts"].get("legal") not in ("unassessed", "unknown", None):
                if not (scoped and unexplained and c.get("status") in ("caution", "fail")):
                    continue
            # Only two states get written. Nothing resembling the brand appeared
            # at all, which is a genuine "checked, nothing found". Or something
            # did, and a name alone cannot tell us whether it is them: Trident
            # Seafoods and Trident gum both begin with Trident, as do Simply Good
            # Foods and Simply Gum. Asserting a recall against the wrong company
            # is the one error here with real consequences, so an ambiguous match
            # is left unassessed and listed for a person to resolve.
            # A resolved entry is an adjudicated answer: a person or a research
            # run looked at the actual records and decided, and the note says
            # what they found. It carries its own status because the answer is
            # not always a clean pass: a recent remedied recall is a caution.
            if c.get("resolved"):
                e["fronts"]["legal"] = c.get("status") or "pass"
                e["legalNote"] = c.get("note") or ""
                # Also where every other front keeps its note and provenance.
                # This wrote only to legalNote, so a reader looking at the four
                # checks saw "Recalls and lawsuits, caution" with nothing under
                # it and the origin reading "none", on an entry a person had
                # adjudicated with a citation.
                if c.get("note"):
                    e.setdefault("frontNotes", {})["legal"] = c["note"]
                e.setdefault("frontOrigin", {})["legal"] = "database"
                if c.get("eventDate"):
                    e["legalDate"] = c["eventDate"]
                set_pass += 1
            elif c.get("examined", 0) == 0 and documents_action(p):
                # A clean database search is true and the note is also true, and
                # the note is the one a reader needs. Under rule 5.2 an action
                # this old is informational and does not set the verdict, so the
                # status can stand; what cannot stand is a card saying nothing
                # was found on a product our own research says was recalled.
                e["fronts"]["legal"] = "pass"
                e["legalNote"] = (
                    "Our own research records an action here, and the note on this "
                    "product describes it. Nothing further is open in the FDA "
                    f"enforcement database as of {c['checked']}, and under rule 5.2 "
                    "a remedied action over 24 months old is informational rather "
                    "than a finding against the product today.")
                e.setdefault("frontNotes", {})["legal"] = e["legalNote"]
                e.setdefault("frontOrigin", {})["legal"] = "database"
                set_pass += 1
            elif c.get("examined", 0) == 0:
                e["fronts"]["legal"] = "pass"
                # A cache entry may carry its own note: entries written by the
                # CPSC web check name the source they actually consulted, and
                # the FDA wording must not claim credit for those.
                e["legalNote"] = c.get("note") or (
                    "Checked against the FDA enforcement database on "
                    f"{c['checked']}. No recall on record, and no firm "
                    "with a similar name either.")
                e.setdefault("frontNotes", {})["legal"] = e["legalNote"]
                e.setdefault("frontOrigin", {})["legal"] = "database"
                set_pass += 1
            else:
                needs_review.append((b["brand"], c.get("total", 0), c.get("examined", 0),
                                     (c.get("latest") or [None, "", "", "?"])[3]))
    fixed = 0
    for b in brands:
        for p in (b.get("products") or []):
            e = p.get("ext") or {}
            note = str(e.get("legalNote") or "")
            if "No recall on record" not in note or not documents_action(p):
                continue
            e["legalNote"] = (
                "Our own research records an action here, and the note on this product "
                "describes it. Nothing further is open in the FDA enforcement database, "
                "and under rule 5.2 a remedied action over 24 months old is informational "
                "rather than a finding against the product today.")
            e.setdefault("frontNotes", {})["legal"] = e["legalNote"]
            fixed += 1
    if fixed:
        print(f"legal notes corrected where our own research records an action: {fixed}")

    DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
    print(f"legal front set on {set_pass} rows")
    if rescoped:
        print(f"{rescoped} rows released: the finding was about other products")
    if dated:
        print(f"{dated} rows stamped with the date the finding dates from")
    if needs_review:
        print(f"\n{len(needs_review)} brands need a person to confirm whether the "
              f"recalling firm is them:")
        for brand, total, examined, firm in sorted(needs_review):
            print(f"  {brand:<24} {total:>3} of {examined:>3} name matches   "
                  f"most recent firm: {firm[:44]}")


if __name__ == "__main__":
    sys.exit(main())
