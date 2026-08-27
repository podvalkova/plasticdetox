#!/usr/bin/env python3
"""
Render the Chrome Web Store screenshots.

Superseded the hand-drawn PIL version. Composing these pixel by pixel capped
what was achievable and produced something that looked nothing like the site;
the frames are now HTML and CSS in tools/store-shots/frames.html, rendered by
headless Chrome, which gets real Inter, real gradients, real shadows and
browser chrome for free.

Two things drive the design:
  - The store displays every screenshot at 640x400, half the uploaded size, so
    each frame crops hard to one element that survives being halved.
  - Palette and type come from brand-check.html, not invented. Violet accent on
    warm off-white, Inter throughout.

Frames render at 2x and downsample to 1280x800 so the type stays crisp.

    python3 tools/make-store-shots.py
"""

import pathlib
import subprocess
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
HERE = ROOT / "tools" / "store-shots"
RAW = ROOT / "extension" / "store" / "raw"
OUT = ROOT / "extension" / "store"

# Each frame's crop of the source grab, sized so it lands inside the window the
# layout gives it. A narrow crop blown up to full width goes soft.
CROPS = {
    "search.png":    ("search.png", (40, 495, 1300, 1010)),
    "why.png":       ("skip.png",   (1152, 636, 1985, 925)),
    "better.png":    ("skip.png",   (1152, 236, 1985, 620)),
    "good-card.png": ("good.png",   (1148, 262, 1990, 660)),
}

FRAMES = {
    "f1": "screenshot-1-checks.png",
    "f2": "screenshot-2-search.png",
    "f3": "screenshot-3-why.png",
    "f4": "screenshot-4-better.png",
    "f5": "screenshot-5-good.png",
}

RENDERER = """
const puppeteer = require("puppeteer-core");
const NAMES = %s;
(async () => {
  const b = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN, headless: "new",
    args: ["--no-first-run", "--force-device-scale-factor=1"],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
  const p = await b.newPage();
  await p.goto("file://%s", { waitUntil: "networkidle0", timeout: 40000 });
  await p.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 1200));
  for (const [id, name] of Object.entries(NAMES)) {
    const el = await p.$("#" + id);
    if (el) await el.screenshot({ path: "%s/" + name });
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
"""


def main():
    import json
    import os

    chrome = os.environ.get("CHROME_BIN")
    if not chrome or not pathlib.Path(chrome).exists():
        raise SystemExit(
            "set CHROME_BIN to a Chrome for Testing binary.\n"
            "  npx @puppeteer/browsers install chrome@stable")

    (HERE / "raw").mkdir(parents=True, exist_ok=True)
    for dest, (name, box) in CROPS.items():
        Image.open(RAW / name).convert("RGB").crop(box).save(HERE / "raw" / dest)
    print(f"prepared {len(CROPS)} crops")

    script = HERE / ".render.js"
    script.write_text(RENDERER % (json.dumps(FRAMES), HERE / "frames.html", OUT))
    r = subprocess.run(["node", str(script)], capture_output=True, text=True,
                       cwd=os.environ.get("PUPPETEER_DIR", str(HERE)))
    script.unlink(missing_ok=True)
    if r.returncode != 0:
        raise SystemExit(f"render failed: {r.stderr.strip()[:400]}")

    for name in FRAMES.values():
        p = OUT / name
        im = Image.open(p)
        if im.size != (1280, 800):
            im.resize((1280, 800), Image.LANCZOS).save(p)
        assert Image.open(p).size == (1280, 800)
        print(f"  {name}  1280x800")


if __name__ == "__main__":
    sys.exit(main())
