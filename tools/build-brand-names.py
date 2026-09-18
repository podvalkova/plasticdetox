#!/usr/bin/env python3
"""Build the brand name dictionary the app's Brand field types ahead against.

Why this exists
---------------
The Brand field only knew the 1,061 brands we have rated. Type four letters of
anything else and the dropdown stayed empty, which reads as a broken field
rather than as "we have not checked that one". The dictionary fills the gap: a
name comes up, tapping it fills the brand field, and the product is typed by
hand. It carries no verdict and never implies one. The app marks every
dictionary row "Not checked yet" and offers the free request or the instant
check, exactly as it does for a product it has never seen.

Where the names come from
-------------------------
Public records only, so there is no licence hanging over a file we ship inside
the app and publish on the site:

  1. California Safe Cosmetics Program (CDPH), the reported brand and the
     company behind it. State public record. Personal care, skincare, makeup.
  2. openFDA's National Drug Code directory, OTC labels only. US federal
     public domain. This is where sunscreen, toothpaste, deodorant and diaper
     cream brands live.
  3. CPSC recalls. US federal public domain. Household goods, kitchen, juvenile
     products, the aisles the cosmetics data does not touch.
  4. data/brand-names-seed.txt, names we add by hand because somebody asked us
     to check them.

Open Food Facts would add tens of thousands more and is deliberately not used:
it is ODbL, which puts an attribution and share-alike obligation on the derived
file. That is a decision to take on purpose, not by importing a dump.

What it does not include
------------------------
Anything already in brand-data.json. Those are answered by the database, and a
dictionary row beside a rated brand would offer to research what we have
already researched.

Usage
-----
    python3 tools/build-brand-names.py            # downloads, then writes
    python3 tools/build-brand-names.py --offline  # reuses the cached downloads
"""

import argparse
import collections
import csv
import json
import os
import re
import sys
import unicodedata
import urllib.request
import zipfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "data", "brand-names.json")
SEED = os.path.join(REPO, "data", "brand-names-seed.txt")
LIMIT = 10000

COSMETICS_URL = ("https://data.chhs.ca.gov/dataset/596b5eed-31de-4fd8-a645-249f3f9b19c4/"
                 "resource/57da6c9a-41a7-44b0-ab8d-815ff2cd5913/download/cscpopendata.csv")
NDC_URL = "https://download.open.fda.gov/drug/ndc/drug-ndc-0001-of-0001.json.zip"
CPSC_URL = "https://www.saferproducts.gov/RestWebServices/Recall?format=json"

UA = "PlasticDetox/1.0 (https://plasticdetox.org)"

# ------------------------------------------------------------------ cleaning

# Legal forms only. Words that are part of a company's actual name stay:
# stripping "International" and "Industries" turned American International
# Industries into "American", which is not a brand anybody would type.
LEGAL = re.compile(
    r"[,\s]+(inc|llc|l\.l\.c|ltd|co|corp|corporation|company|companies|"
    r"gmbh|s\.a|sa|sas|s\.r\.l|srl|bv|b\.v|nv|n\.v|ag|plc|pty|pte|kg|limited|"
    r"holdings|holding|group)\.?$", re.I)
OF_PLACE = re.compile(r",\s*(of|d/b/a|dba)\s+.*$", re.I)
PAREN = re.compile(r"\s*\([^)]*\)\s*$")

# Words that describe a product rather than name a maker. A name made only of
# these is label copy, and a name that opens or closes on one usually is too.
GENERIC = set("""
sunscreen sunblock sun spf lotion cream creme ointment gel serum spray foam
wipes wipe stick powder bar liquid oil balm mask masque scrub gloss polish
laxative antacid antiseptic antibacterial antimicrobial antifungal anti-itch
antiperspirant deodorant pain relief reliever relieving fever cough cold flu
allergy allergies sinus headache migraine nausea sleep aid nighttime daytime
childrens children child infants infant baby kids adult adults junior
ibuprofen acetaminophen aspirin naproxen loratadine cetirizine famotidine
omeprazole esomeprazole ranitidine miconazole nicotine hydrocortisone
benzocaine lidocaine menthol camphor zinc oxide titanium dioxide aloe
alcohol peroxide iodine glycerin petrolatum witch hazel salicylic benzoyl
acid reducer stool softener diarrhea constipation hemorrhoidal hemorrhoid
mouthwash rinse toothpaste anticavity cavity fluoride whitening white dandruff
shampoo conditioner soap sanitizer cleanser cleansing moisturizer moisturizing
strength regular extra maximum mini max dose low high tablets tablet capsules
capsule softgel suspension drops drop swabs pads pad patch patches kit system
first burn wound care itch rash diaper treatment therapy therapeutic solutions
formula plus advanced daily ultra pro sensitive gentle original natural
mineral tinted broad spectrum protection protectant prep otc generic complete
oral nasal topical rectal ophthalmic eye ear nose throat skin hand hands body
foot feet face facial lip lips hair scalp nail nails tooth teeth gum acne
supplement vitamin vitamins probiotic multivitamin electrolyte homeopathic
cleaner cleaning disinfectant sanitizing wash refill value pack free dye
""".split())

STOP = {"the", "and", "for", "with", "new", "usa", "llc", "inc"}

# One ordinary English word is a coincidence more often than it is a brand.
# Optional: the filter simply does not run where the word list is missing.
try:
    WORDS = {w.strip().lower() for w in open("/usr/share/dict/words") if len(w.strip()) > 3}
except OSError:
    WORDS = set()


def strip_generic_tail(name):
    """Cut a front-of-pack line back to the name that opens it.

    An OTC label puts the whole face of the bottle in one field: "Banana Boat
    Sunscreen Lotion SPF 50". Dropping trailing words that describe rather than
    name leaves "Banana Boat", which is what somebody types.
    """
    words = name.split()
    while words:
        w = re.sub(r"[^a-z0-9]+", "", words[-1].lower())
        if not w or w in GENERIC or re.fullmatch(r"\d+|spf\d*|\d+(mg|ml|oz|g)|x\d+", w):
            words.pop()
            continue
        break
    return " ".join(words)


def fix_caps(n):
    """ALL CAPS is a label convention, not the brand's own styling."""
    letters = re.sub(r"[^A-Za-z]", "", n)
    if not letters or letters != letters.upper():
        return n
    if len(letters) <= 5 and len(n.split()) == 1:
        return n                                   # NYX, IBD, No7
    # Hyphens carry a capital too: COLGATE-PALMOLIVE is Colgate-Palmolive, not
    # Colgate-palmolive.
    return re.sub(r"[A-Za-z][A-Za-z']*",
                  lambda m: m.group(0).capitalize() if len(m.group(0)) > 2 else m.group(0).upper(),
                  n)


def clean(raw):
    n = unicodedata.normalize("NFKC", str(raw or "")).strip().strip("\"'“”")
    n = PAREN.sub("", OF_PLACE.sub("", n))
    stripped = False
    prev = None
    while prev != n:
        prev = n
        cut = LEGAL.sub("", n).strip(" ,.")
        if cut != n:
            stripped = True
        n = cut
    # "The Procter & Gamble Company" loses its suffix and keeps a dangling
    # article. "The Body Shop" never had one, so it keeps its own.
    if stripped and n.lower().startswith("the ") and len(n.split()) > 2:
        n = n[4:]
    # Again, because a legal form can sit behind the bracket: "Bondi Sands
    # (USA), Inc." only shows its bracket once the suffix is gone.
    n = PAREN.sub("", n)
    return fix_caps(re.sub(r"\s+", " ", n).strip(" ,.-–"))


def key_of(n):
    return re.sub(r"[^a-z0-9]+", "", n.lower())


def one_edit(a, b):
    """True when one insertion, deletion or substitution turns a into b."""
    if abs(len(a) - len(b)) > 1:
        return False
    i = j = edits = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if len(a) > len(b):
            i += 1
        elif len(b) > len(a):
            j += 1
        else:
            i += 1
            j += 1
    return edits + (len(a) - i) + (len(b) - j) <= 1


def acceptable(n):
    if not n or not 3 <= len(n) <= 28 or len(n.split()) > 4:
        return False
    if not re.search(r"[A-Za-z]{2}", n) or re.match(r"^\d", n):
        return False
    if re.search(r"[<>{}\[\]|\\/@#$%^*_=+~`]", n) or "�" in n or "?" in n:
        return False
    words = [w for w in (re.sub(r"[^a-z0-9]+", "", x.lower()) for x in n.split()) if w]
    if not words or all(w in GENERIC or w in STOP for w in words):
        return False
    if words[0] in GENERIC or words[-1] in GENERIC or words[-1] in STOP:
        return False
    # Letters a brand could be said out loud from. "fhjf" reached the cosmetics
    # register as somebody's test row.
    if len(words) == 1 and not re.search(r"[aeiouy]", n, re.I) and n != n.upper():
        return False
    return True


# ------------------------------------------------------------------ sources

def fetch(url, path, offline):
    if offline or os.path.exists(path):
        if not os.path.exists(path):
            sys.exit(f"missing cached download: {path}")
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print(f"downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=600) as r, open(path, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="/tmp/plasticdetox-brand-sources")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--limit", type=int, default=LIMIT)
    args = ap.parse_args()

    counts = collections.Counter()
    casing = collections.defaultdict(collections.Counter)
    origin = collections.defaultdict(set)

    def add(raw, src, weight=1):
        n = clean(raw)
        if not acceptable(n):
            return
        k = key_of(n)
        if len(k) < 3:
            return
        counts[k] += weight
        casing[k][n] += weight
        origin[k].add(src)

    # 1. California Safe Cosmetics -----------------------------------------
    path = fetch(COSMETICS_URL, os.path.join(args.cache, "cscp.csv"), args.offline)
    seen = set()
    with open(path, encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            sig = (row.get("CompanyName", ""), row.get("BrandName", ""), row.get("ProductName", ""))
            if sig in seen:
                continue
            seen.add(sig)
            add(row.get("BrandName"), "cosmetics", 5)
            add(row.get("CompanyName"), "cosmetics", 3)
    print(f"cosmetics      {len(counts):>6} names")

    # 2. openFDA OTC labels -------------------------------------------------
    zpath = fetch(NDC_URL, os.path.join(args.cache, "drug-ndc.json.zip"), args.offline)
    with zipfile.ZipFile(zpath) as z:
        with z.open(z.namelist()[0]) as fh:
            ndc = json.load(fh)["results"]
    generics = {(r.get("generic_name") or "").strip().lower() for r in ndc}
    generics.discard("")
    # The brand field on a drug label is a product line, not a brand, so it has
    # to be attested across several products before it counts. Homeopathic
    # listings are excluded outright: their brand field holds Latin ingredient
    # names, which is how Galphimia Glauca and Folliculinum turned up in a
    # dropdown of shops.
    otc = collections.Counter()
    otc_case = collections.defaultdict(collections.Counter)

    def hold(n):
        if not acceptable(n):
            return
        otc[key_of(n)] += 1
        otc_case[key_of(n)][n] += 1

    for r in ndc:
        if "OTC" not in (r.get("product_type") or ""):
            continue
        if "HOMEOPATHIC" in (r.get("marketing_category") or "").upper():
            continue
        b = (r.get("brand_name") or "").strip()
        if b and b.lower() not in generics:
            n = strip_generic_tail(clean(b))
            if len(n.split()) <= 3:
                hold(n)
        hold(clean(r.get("labeler_name")))
    for k, v in otc.items():
        if v < 3:
            continue
        counts[k] += min(v, 20)
        for n, c in otc_case[k].items():
            casing[k][n] += c
        origin[k].add("otc")
    print(f"+ otc labels   {len(counts):>6} names")

    # 3. CPSC recalls -------------------------------------------------------
    cpath = fetch(CPSC_URL, os.path.join(args.cache, "cpsc.json"), args.offline)
    blocked = re.compile(
        r"atv|all terrain|snowmobile|motorcycle|bicycle|bike|lawn mower|tractor|boat|"
        r"firearm|ammunition|off-highway|utility vehicle|golf car|moped|scooter|"
        r"trailer|engine|generator", re.I)
    with open(cpath, encoding="utf-8") as fh:
        recalls = json.load(fh)
    for r in recalls:
        types = [t for t in ((p.get("Type") or "") for p in (r.get("Products") or [])) if t]
        if types and all(blocked.search(t) for t in types):
            continue
        for m in (r.get("Manufacturers") or []):
            add(m.get("Name"), "cpsc", 2)
    print(f"+ cpsc recalls {len(counts):>6} names")

    # 4. Names we added by hand --------------------------------------------
    if os.path.exists(SEED):
        for line in open(SEED, encoding="utf-8"):
            line = line.split("#")[0].strip()
            if line:
                add(line, "seed", 1000)
        print(f"+ seed list    {len(counts):>6} names")

    # Anything we rate is the database's answer, not a suggestion to research.
    ours = set()
    for b in json.load(open(os.path.join(REPO, "brand-data.json"), encoding="utf-8")):
        for label in [b.get("brand")] + list(b.get("aliases") or []):
            if label:
                ours.add(key_of(str(label)))
    # A product line under a brand we rate belongs to the database too.
    # Coppertone is rated, so Coppertone Sport must not appear as a name we
    # have never heard of: the brand answers, and its own picker lists what we
    # hold. Dropping only the exact name left the line behind and hid the
    # brand, which is the worst of both.
    for k in list(counts):
        name = casing[k].most_common(1)[0][0]
        # Hyphens divide a name the way a space does: Colgate-Palmolive opens
        # on a brand we rate just as plainly as Colgate Total does.
        words = [w for w in re.split(r"[\s\-–]+", name) if w]
        if any(key_of(" ".join(words[:i])) in ours for i in range(1, len(words) + 1)):
            del counts[k]
    print(f"- rated brands {len(counts):>6} names")

    for k in list(counts):
        n = casing[k].most_common(1)[0][0]
        if len(n.split()) == 1 and n.lower() in WORDS and counts[k] < 8:
            del counts[k]
    print(f"- plain words  {len(counts):>6} names")

    # Registers carry typos, and a typo one letter from a real name is worse
    # than no suggestion at all: "Anastasia Beverly Ills" was offered above
    # "Anastasia Beverly Hills" because it is a character shorter. Two names
    # within one edit share a delete-one variant, so bucketing on those finds
    # every such pair without comparing all 28 million.
    neighbours = collections.defaultdict(set)
    for k in counts:
        # Under itself as well, or a name that is exactly another with one
        # letter missing never meets it: "Ills" sits in no bucket "Hills" makes.
        neighbours[k].add(k)
        for i in range(len(k)):
            neighbours[k[:i] + k[i + 1:]].add(k)
    for bucket in neighbours.values():
        # Sharing a delete-one variant only puts two names within TWO edits, so
        # each pair is measured before either is dropped.
        live = sorted((k for k in bucket if k in counts),
                      key=lambda k: (-counts[k], -len(origin[k]), -len(k)))
        if len(live) < 2:
            continue
        keep = live[0]
        for k in live[1:]:
            # A name attested on its own account is a brand, not a slip of the
            # keyboard. Only the barely seen spelling gives way.
            if counts[k] < 10 and one_edit(keep, k):
                del counts[k]
    print(f"- near spellings {len(counts):>4} names")

    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:args.limit]
    names = sorted({casing[k].most_common(1)[0][0] for k, _ in ranked}, key=str.lower)

    payload = {
        "generated": __import__("datetime").date.today().isoformat(),
        "count": len(names),
        "note": ("Brand names only. Nothing here carries a verdict: these are the names "
                 "the app's Brand field suggests so a product can be named and checked."),
        "sources": [
            "California Safe Cosmetics Program, CDPH (state public record)",
            "openFDA National Drug Code directory, OTC labels (US public domain)",
            "CPSC recalls (US public domain)",
            "data/brand-names-seed.txt",
        ],
        "names": names,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"wrote {OUT} with {len(names)} names "
           f"({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
