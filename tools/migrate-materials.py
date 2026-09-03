#!/usr/bin/env python3
"""
Packaging becomes materials.

The word was always wrong for most of what it held. A yoga mat has no
packaging, a kettle has no packaging, and the Amazon field the listing scraper
reads is Material, which describes the product rather than its box. So 377
durable goods had the object's material filed under a key that claimed to be
about a container.

The new front asks one question of everything: what is this made of. For a
durable that is the object and its contact parts, the teat on a bottle and the
pump on a cleanser included. For a consumable it is the container, which is
what packaging always meant, so nothing about those rows changes.

That asymmetry decides what may carry over. Rule 1.1: adverse evidence may
propagate, favourable evidence never does. A consumable's finding answers the
same question it always did and carries over whole. A durable's inferred PASS
was read off prose about a box and would become a claim about the object, so it
drops to unassessed. A durable's adverse finding names a material and stands.

    python3 tools/migrate-materials.py
    python3 tools/migrate-materials.py --write
"""
import argparse, collections, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
EVIDENCE = ROOT / "data" / "front-evidence.json"

CONSUMABLE = re.compile(
    r"cosmetic|personal care|sunscreen|skincare|supplement|bottled water|baby food|"
    r"snack|pantry|formula|electrolyte|oral care|toothpaste|mouthwash|floss|cleaning|"
    r"laundry|dish|coffee|tea|salt|spice|protein|diaper cream|lotion|balm|soap|shampoo|"
    r"conditioner|deodorant|wipe|honey|chocolate|diaper|period|food storage", re.I)

RENAME = [("packagingAnswers", "materialAnswers"), ("packagingMaterial", "materialsList")]


def is_consumable(brand, product):
    return bool(CONSUMABLE.search(f"{product.get('cat') or ''} {brand.get('category') or ''}"))


def move(d, old, new):
    """Rename a key in place, keeping position stable enough for a readable diff."""
    if isinstance(d, dict) and old in d:
        d[new] = d.pop(old)
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    brands = json.loads(DATA.read_text())
    n = collections.Counter()

    for b in brands:
        move(b.get("fronts") or {}, "packaging", "materials") and n.update(["brand front"])
        for p in (b.get("products") or []):
            e = p.get("ext") or {}
            for holder in ("fronts", "frontOrigin", "frontNotes"):
                if move(e.get(holder) or {}, "packaging", "materials"):
                    n.update([f"product {holder}"])
            for old, new in RENAME:
                move(e, old, new) and n.update([new])

            fr = e.get("fronts") or {}
            og = e.get("frontOrigin") or {}
            if not is_consumable(b, p) and fr.get("materials") == "pass" and og.get("materials") == "inferred":
                # Read off prose about a box, now claiming to describe the object.
                fr["materials"] = "unassessed"
                og.pop("materials", None)
                (e.setdefault("frontNotes", {}))["materials"] = (
                    "What this is made of has not been established. The earlier reading "
                    "described its packaging, which is a different question.")
                n.update(["durable inferred pass demoted"])

    ev = json.loads(EVIDENCE.read_text()) if EVIDENCE.exists() else {}
    for entry in ev.values():
        move(entry, "packaging", "materials") and n.update(["evidence block"])

    for k, v in n.most_common():
        print(f"  {v:5}  {k}")
    if args.write:
        DATA.write_text(json.dumps(brands, indent=2, ensure_ascii=False) + "\n")
        EVIDENCE.write_text(json.dumps(ev, indent=1, ensure_ascii=False) + "\n")
        print("\nwrote brand-data.json and data/front-evidence.json")
    else:
        print("\ndry run. re-run with --write")
    return 0


if __name__ == "__main__":
    sys.exit(main())
