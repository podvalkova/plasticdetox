#!/usr/bin/env python3
"""Take the `authored` flag off every row the engine can now work out itself.

`authored` means a person set this scorecard, do not recalculate it. It exists
because the row's evidence is a sentence the engine cannot read, and without it
the next pipeline run replaces real research with four unknowns. It is also the
reason a rule change does not reach a third of the database: adding the cyclic
siloxanes to the hazard list changed no verdicts, because every affected row was
flagged.

So the flag is not removed by deleting it. It is removed by making it
unnecessary, one row at a time, and proving it:

  1. the row must have structured evidence, ingredients or a recorded material,
     in data/front-evidence.json, which is what the engine reads
  2. drop the flag, run the rules, and compare
  3. if the verdict survives, the engine can derive it and the flag goes
  4. if it does not, put the flag back. The research was right and the engine
     still cannot see it, which means evidence is still missing, not that the
     row was wrong

Nothing is decided by hand here. The engine either reproduces the answer or it
does not, and the number that comes out is how far the database is from needing
no human overwrite at all.

    python3 tools/retire-authored.py
    python3 tools/retire-authored.py --write
"""
import argparse, json, pathlib, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "brand-data.json"
EV = ROOT / "data" / "front-evidence.json"


def verdicts(path):
    d = json.loads(pathlib.Path(path).read_text())
    return {f"{b['brand']}|{p.get('name')}": (p.get("ext") or {}).get("verdict")
            for b in d for p in (b.get("products") or [])}


def run(script, *args):
    r = subprocess.run([sys.executable, str(ROOT / "tools" / script), *args],
                       cwd=ROOT, capture_output=True, text=True)
    return r.returncode == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    ev = json.loads(EV.read_text()) if EV.exists() else {}
    backup = pathlib.Path(tempfile.mkdtemp()) / "brand-data.json"
    shutil.copy(DATA, backup)
    before = verdicts(DATA)

    d = json.loads(DATA.read_text())
    candidates = []
    for b in d:
        for p in (b.get("products") or []):
            e = p.get("ext") or {}
            if not e.get("authored"):
                continue
            asin = (p.get("asins") or [None])[0]
            entry = ev.get(asin) or {}
            has = ((entry.get("formula") or {}).get("ingredients") or "").strip() or \
                  ((entry.get("materials") or {}).get("material") or "").strip()
            if has:
                candidates.append(f"{b['brand']}|{p.get('name')}")
                e.pop("authored", None)
    DATA.write_text(json.dumps(d, indent=1, ensure_ascii=False) + "\n")

    ok = run("apply-product-rules.py", "--write") and run("enforce-scorecard.py", "--write")
    after = verdicts(DATA) if ok else {}

    kept, lost = [], []
    for k in candidates:
        (kept if ok and after.get(k) == before.get(k) else lost).append(k)

    # put the flag back wherever the engine could not reproduce the answer
    d = json.loads(DATA.read_text())
    for b in d:
        for p in (b.get("products") or []):
            if f"{b['brand']}|{p.get('name')}" in lost:
                p.setdefault("ext", {})["authored"] = True

    print(f"authored rows with structured evidence to try: {len(candidates)}")
    print(f"  engine reproduced the verdict, flag retired : {len(kept)}")
    print(f"  engine could not, flag kept                 : {len(lost)}")
    for k in lost[:8]:
        brand, _, name = k.partition("|")
        print(f"     {brand[:20]:<20} {name[:34]:<34} {before.get(k)} -> {after.get(k)}")

    if args.write and kept:
        DATA.write_text(json.dumps(d, indent=1, ensure_ascii=False) + "\n")
        print(f"\nwrote {DATA}")
    else:
        shutil.copy(backup, DATA)
        print("\ndry run, brand-data.json restored." if not args.write else "\nnothing to write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
