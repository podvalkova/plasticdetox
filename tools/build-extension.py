#!/usr/bin/env python3
"""
Build the Chrome extension payload.

Runs the whole data pipeline and stages everything the extension ships with, so
the bundled snapshot never drifts from the live site:

  1. backfill-fronts.py --write   four-front scorecard onto every brand
  2. harvest-asins.py             ASIN to brand map from the store and articles
  3. copy brand-data.json         into extension/data/ as the offline snapshot
  4. zip                          extension/ into dist/ ready for upload

The extension also refreshes brand-data.json, asin-map.json and selectors.json
from plasticdetox.org every 12 hours, so shipping a stale snapshot only affects
the first few seconds after install.

    python3 tools/build-extension.py            # stage only
    python3 tools/build-extension.py --zip      # stage and package
"""

import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
DIST = ROOT / "dist"


def run(script, *args):
    print(f"\n$ python3 tools/{script} {' '.join(args)}")
    r = subprocess.run(
        [sys.executable, str(ROOT / "tools" / script), *args],
        cwd=ROOT, capture_output=True, text=True,
    )
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        raise SystemExit(f"{script} failed")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", action="store_true", help="package into dist/")
    args = ap.parse_args()

    run("backfill-fronts.py", "--write")
    run("harvest-asins.py")

    src = ROOT / "brand-data.json"
    dst = EXT / "data" / "brand-data.json"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    print(f"\ncopied brand-data.json -> {dst.relative_to(ROOT)} "
          f"({dst.stat().st_size // 1024} KB)")

    manifest = json.loads((EXT / "manifest.json").read_text())
    version = manifest["version"]

    # Sanity: every file the manifest names must actually exist.
    referenced = [
        EXT / manifest["background"]["service_worker"],
        EXT / manifest["action"]["default_popup"],
        *[EXT / p for p in manifest["icons"].values()],
        *[EXT / p for p in manifest["content_scripts"][0]["js"]],
        *[EXT / p for p in manifest["content_scripts"][0]["css"]],
        EXT / "data" / "asin-map.json",
        EXT / "data" / "selectors.json",
        EXT / "data" / "brand-data.json",
    ]
    missing = [p.relative_to(ROOT) for p in referenced if not p.exists()]
    if missing:
        raise SystemExit("missing files: " + ", ".join(str(m) for m in missing))
    print(f"manifest v{version}: all {len(referenced)} referenced files present")

    brands = json.loads(dst.read_text())
    asins = json.loads((EXT / "data" / "asin-map.json").read_text())
    cells = sum(
        1 for b in brands for f in ("formula", "packaging", "legal", "testing")
        if b.get("fronts", {}).get(f, {}).get("status", "unknown") != "unknown"
    )
    print(f"payload: {len(brands)} brands, {len(asins)} mapped ASINs, "
          f"{cells}/{len(brands) * 4} scorecard cells populated "
          f"({cells * 100 // (len(brands) * 4)}%)")

    if args.zip:
        DIST.mkdir(exist_ok=True)
        out = DIST / f"plastic-detox-brand-check-{version}.zip"
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            for p in sorted(EXT.rglob("*")):
                # store/ holds listing assets for the dashboard, not runtime files.
                if p.is_file() and ".DS_Store" not in p.name and "store" not in p.relative_to(EXT).parts:
                    z.write(p, p.relative_to(EXT))
        print(f"\npackaged {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
        print("upload at https://chrome.google.com/webstore/devconsole")


if __name__ == "__main__":
    sys.exit(main())
