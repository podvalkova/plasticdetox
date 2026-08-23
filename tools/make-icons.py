#!/usr/bin/env python3
"""
Generate the extension icons.

Two different jobs, two different rules:

  extension/icons/icon{16,48,128}.png   browser UI. Artwork fills the square,
                                        because these render small in a toolbar.

  extension/store/store-icon-128.png    Chrome Web Store listing. Artwork must
                                        sit in a 96x96 safe area centred in a
                                        128x128 canvas, with the surrounding
                                        16px fully TRANSPARENT. The store also
                                        says not to put an edge on the 128x128
                                        image, since the UI adds its own.

The mark is a dark rounded tile so it reads on both light and dark store
backgrounds. At 16px "PD" turns to mush, so that size drops to a single P.

    python3 tools/make-icons.py
"""

import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
INK = (28, 25, 23, 255)          # --text, matches the site
WHITE = (255, 255, 255, 255)
VIOLET = (167, 139, 250, 255)    # the favicon's accent on the D

FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]


def font(size):
    for path in FONTS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_mark(art, letters):
    """Draw the rounded tile and centred letters onto a square RGBA image."""
    size = art.size[0]
    d = ImageDraw.Draw(art)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=INK)

    f = font(int(size * (0.62 if len(letters) == 1 else 0.54)))
    widths = [d.textlength(c, font=f) for c in letters]
    total = sum(widths)
    # Cap height, so the glyphs sit optically centred rather than baseline centred.
    bbox = d.textbbox((0, 0), letters, font=f)
    x = (size - total) / 2
    y = (size - (bbox[3] - bbox[1])) / 2 - bbox[1]
    for c, w in zip(letters, widths):
        d.text((x, y), c, font=f, fill=VIOLET if c == "D" else WHITE)
        x += w
    return art


def browser_icon(size):
    letters = "P" if size <= 16 else "PD"
    return draw_mark(Image.new("RGBA", (size, size), (0, 0, 0, 0)), letters)


def store_icon():
    """96x96 of artwork, centred in 128x128, everything else transparent."""
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    art = draw_mark(Image.new("RGBA", (96, 96), (0, 0, 0, 0)), "PD")
    canvas.alpha_composite(art, (16, 16))
    return canvas


def main():
    icons = ROOT / "extension" / "icons"
    store = ROOT / "extension" / "store"
    icons.mkdir(parents=True, exist_ok=True)
    store.mkdir(parents=True, exist_ok=True)

    for size in (16, 48, 128):
        p = icons / f"icon{size}.png"
        browser_icon(size).save(p)
        print(f"  {p.relative_to(ROOT)}  {size}x{size}, artwork fills the square")

    p = store / "store-icon-128.png"
    img = store_icon()
    img.save(p)

    # Verify the padding really is transparent, since that is the rejection cause.
    px = img.load()
    edge = [px[0, 0], px[127, 0], px[0, 127], px[127, 127], px[15, 64], px[64, 15]]
    assert all(c[3] == 0 for c in edge), "padding is not transparent"
    assert px[64, 64][3] == 255, "artwork missing from the centre"
    print(f"  {p.relative_to(ROOT)}  128x128, 96x96 safe area, transparent padding verified")


if __name__ == "__main__":
    sys.exit(main())
