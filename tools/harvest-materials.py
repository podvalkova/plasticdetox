#!/usr/bin/env python3
"""Record what a listing states a durable good is made of.

The materials front had no recorded evidence on 509 rows, 307 of them with an
ASIN. For a durable good the object IS the contact surface (rule 5.4), so what
it is made of is the whole materials question, and the listing states it far
more often than anyone had written down: 24Bottles says "Steel, reusable, non
thermal", Bialetti says "stainless steel", Babyletto says "wood".

This asks Amazon's catalog API for the listing's feature bullets, title and
colour, then reads them with the SAME vocabulary the pipeline already trusts
(INERT and POLYMER in apply-front-evidence.py), so a material this records is
one the rules already know how to judge. Nothing here invents a verdict: the
record goes into data/front-evidence.json as a stated fact with its source
text, and apply-front-evidence turns it into a front on the next build.

Three outcomes per row:
  one inert material, no polymer   -> recorded as that material
  a polymer, or several materials  -> recorded as the full list; assess() then
                                      asks which part is in contact, which is
                                      the honest state for a mixed object
  nothing stated                   -> left alone, reported

Durables only. A consumable's bullets describe its scoop, its lid and its gift
box as readily as its jar, and a stated material for a recipe is its packaging,
which needs the container question asked properly rather than a word match.

Never overwrites a materials record somebody already established.

    python3 tools/harvest-materials.py --limit 40      # dry run
    python3 tools/harvest-materials.py --write
"""
import argparse, datetime, importlib.util, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
EV = ROOT / "data" / "front-evidence.json"
DATA = ROOT / "brand-data.json"
TODAY = datetime.date.today().isoformat()

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec); sys.modules[name] = mod
    spec.loader.exec_module(mod); return mod

afe = load("afe", ROOT / "tools" / "apply-front-evidence.py")
srv = load("srv", pathlib.Path.home() / "Documents" / "creators-api-mcp" / "server.py")

# Every material name the rules understand, longest first so "stainless steel"
# wins over "steel" and "tempered glass" over "glass".
# "other" is the plastic code label (#7) and matches the English word in every
# bullet; "pet" matches pet hair and pet dander far more often than the polymer,
# and "metal" tells us nothing about which metal. None of those may fire on a
# bare word. PET counts only when the listing spells it as the polymer.
VOCAB = sorted((set(afe.INERT) | set(afe.POLYMER)) - {"other", "pet", "metal"},
               key=len, reverse=True)
PET_AS_POLYMER = re.compile(r"\b(#?1\s*pet|pete?\s+plastic|polyethylene terephthalate)\b", re.I)

# A listing that says what a product is NOT made of names the material anyway.
# "plastic-free", "no plastic", "unlike plastic bottles", "instead of PVC":
# every one of those would have read as a polymer. Strip the negated phrase
# before scanning.
NEGATED = re.compile(
    r"\b(no|without|zero|non|not|never|unlike|instead of|free (of|from)|rather than|"
    r"compared (to|with)|versus|vs\.?|alternative to|replace\w*|ditch\w*|swap\w*|"
    r"say goodbye to|goodbye|better than|healthier than|safer than)[\s-]+"
    r"([a-z]+[\s-]+){0,2}(plastic\w*|pvc|vinyl|bpa|bps|silicone|polypropylene|polyester|nylon|alumin(i)?um|"
    r"acrylic|melamine|polycarbonate|tritan|teflon|ptfe|pfas|nonstick)\b"
    r"|\b(plastic|pvc|bpa|bps|silicone|teflon|ptfe|pfas|toxin|chemical|alumin(i)?um|lead|nickel)[\s-]*free\b", re.I)

# Words that are not materials in the sentence they appear in. "pet hair" is
# not PET, "copper zinc media" is a filter cartridge not a housing, "paper
# towel holder" is not paper. Keep this list short and visible.
NOT_MATERIAL = re.compile(
    r"\bpet\s+(hair|friendly|safe|owner|bowl|food|toy|bed|wipe)|"
    r"\bcopper[\s-]+zinc|\bkdf|"
    r"\bpaper\s+towel\s+(holder|rack|dispenser)|"
    r"\b(muffin|cake|baking|loaf|pie|bread|bundt)\s+tins?\b|"      # a muffin tin is not tin
    r"\b\d+\s*-?\s*pcs?\b|"                                        # "2-pc" is a piece count, not polycarbonate
    r"\b(bpa|bps|bpf)[\s-]*free\b", re.I)

# A bottle's body is not its drink path. The lid, the spout and the straw are,
# and a title never names them: six insulated bottles read as stainless steel
# passes, one of them the Owala FreeSip that a standing decision removed for
# plastic in exactly that path. The same for objects made of many parts, where
# the title names one: an IKEA Antilop high chair read as bamboo. For these,
# a person establishes the contact material or nobody does.
NO_TITLE_PASS = re.compile(
    r"\b(bottle|tumbler|cup|flask|canteen|mug|sippy|straw|thermos|"
    r"grinder|kettle|teapot|air fryer|purifier|vacuum|high ?chair|car seat|"
    r"stroller|crib|mattress|pump|blender|machine|maker|brewer)\b", re.I)


def materials_in(text):
    text = NEGATED.sub(" ", text)
    if PET_AS_POLYMER.search(text):
        text += " polyethylene terephthalate"
    low = " " + re.sub(r"\s+", " ", NOT_MATERIAL.sub(" ", text.lower())) + " "
    found = []
    for term in VOCAB:
        if re.search(r"(?<![a-z])" + re.escape(term) + r"(?![a-z])", low):
            t, rank = afe.classify(term)
            if t and t not in [f for f, _ in found]:
                found.append((t, rank))
            low = low.replace(term, " ")   # consumed, so "steel" does not re-fire
    return found

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    ev = json.loads(EV.read_text())
    REC = {"database", "hand", "stated", "class", "rollup"}

    jobs = []
    for b in brands:
        for p in b.get("products") or []:
            e = p.get("ext") or {}
            if (e.get("fronts") or {}).get("formula") != "none":
                continue                                   # durables only
            asins = p.get("asins") or []
            if not asins:
                continue
            cur = (ev.get(asins[0]) or {}).get("materials") or {}
            own = "listing states" in str(cur.get("source") or "")
            # A record this tool wrote is re-examined on every run, whatever
            # origin the pipeline has since stamped on the row, so a guard
            # added later can withdraw what an earlier run recorded. Anything
            # else recorded is somebody's answer and is left alone.
            if not own and (e.get("frontOrigin") or {}).get("materials") in REC:
                continue
            if (cur.get("material") or "").strip() and not own:
                continue                                   # a person got here first
            jobs.append((b, p, asins[0], own))
    if args.limit:
        jobs = jobs[:args.limit]
    print(f"durable rows with an ASIN and no recorded material: {len(jobs)}")

    # Paced, and resilient. Amazon's catalog API rate limits, and a single
    # 429 in a run that fetched everything before writing anything threw away
    # the whole pass. Back off and retry; if a batch never answers, keep what
    # the others returned and say how many rows went unfetched.
    import time
    asins = [a for _, _, a, _ in jobs]
    found = {}
    unfetched = 0
    for i in range(0, len(asins), 10):
        batch = asins[i:i+10]
        for attempt in range(6):
            try:
                got, _ = srv.get_items(batch, resources=[
                    "itemInfo.title", "itemInfo.features", "itemInfo.productInfo"])
                found.update(got)
                break
            except RuntimeError as e:
                if "429" in str(e) and attempt < 5:
                    time.sleep(8 * (attempt + 1))
                    continue
                unfetched += len(batch)
                print(f"  ! batch at {i} not fetched: {str(e)[:80]}")
                break
        time.sleep(1.5)
    if unfetched:
        print(f"  rows not fetched this run (re-run later): {unfetched}")

    single = mixed = nothing = 0
    for b, p, asin, own in jobs:
        it = found.get(asin) or {}
        info = it.get("itemInfo") or {}
        bullets = ((info.get("features") or {}).get("displayValues")) or []
        title = (info.get("title") or {}).get("displayValue") or ""
        colour = (((info.get("productInfo") or {}).get("color")) or {}).get("displayValue") or ""
        # Rule 1.1, applied to where a fact may come from. A favourable
        # reading (one inert material, so a pass) is taken from the title
        # alone, which names the object rather than its parts; a car seat's
        # bullets say "steel frame" and a mattress's say "steel springs", and
        # neither is the surface anyone touches. An adverse reading (a polymer)
        # may come from the bullets too, because a polymer named anywhere in
        # the contact path is a finding worth asking about.
        own_name = str(p.get("name") or "")
        in_title = materials_in(" ".join([title, colour, own_name]))
        in_all = materials_in(" ".join([title, colour, own_name] + bullets))
        poly_title = [m for m, r in in_title if r > 0]
        poly_bullets = [m for m, r in in_all if r > 0 and m not in poly_title]
        inert_title = [m for m, r in in_title if r == 0]
        guarded = bool(NO_TITLE_PASS.search(own_name + " " + title))
        if poly_title:
            names = list(dict.fromkeys(poly_title + inert_title))
            mixed += 1; tag = "mixed"
        elif len(inert_title) == 1 and not guarded and not poly_bullets:
            names = inert_title
            single += 1; tag = "inert"
        else:
            nothing += 1
            why = ("polymer in bullets only: " + ", ".join(poly_bullets) if poly_bullets
                   else "bottle, cup or many-part object" if guarded and inert_title
                   else "bullets only, title silent" if in_all else "nothing stated")
            if in_all:
                print(f"  skip  {asin}  {own_name[:36]:<36} {why[:44]}")
            if own and args.write:
                # `asins` is the batching list by now; this row's key is `asin`.
                ev[asin].pop("materials", None)          # withdraw what an earlier run wrote
            continue
        print(f"  {tag:<5} {asin}  {str(p.get('name'))[:36]:<36} {', '.join(names)[:40]}")
        if args.write:
            entry = ev.setdefault(asin, {})
            entry.setdefault("_product", f"{b['brand']} {p.get('name')}")
            entry["materials"] = {
                "material": ", ".join(names),
                "contact": "yes",
                "contactFrom": "listing",
                "source": f"amazon:{asin} listing states: " + " | ".join(bullets[:3])[:300],
                "checkedListing": TODAY,
            }
    print(f"\n  single inert material stated: {single}")
    print(f"  polymer or several materials: {mixed}")
    print(f"  nothing stated:               {nothing}")
    if not args.write:
        print("\ndry run. re-run with --write to record.")
        return 0
    EV.write_text(json.dumps(ev, indent=1, ensure_ascii=False) + "\n")
    print(f"\nwrote {EV}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
