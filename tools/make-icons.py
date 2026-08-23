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


def promo_tile(w, h):
    """
    Promotional tiles for the listing. Exact sizes only: the dashboard rejects
    anything else with "The image size is incorrect".
        small tile    440x280
        marquee tile  1400x560
    These are designed graphics, not screenshots. Bleed to the edges, no
    transparency, because the store composites them as solid cards.
    """
    img = Image.new("RGB", (w, h), INK[:3])
    d = ImageDraw.Draw(img)
    s = h / 280.0                       # scale everything off the small tile

    def fit(text, target_w, start):
        """Largest font size at which `text` still fits `target_w`."""
        size = start
        while size > 8 and d.textlength(text, font=font(size)) > target_w:
            size -= 1
        return font(size)

    pad = int(28 * s)
    mark = int(84 * s)
    gap_x = int(22 * s)

    # Size the text column to what the content actually needs, then centre the
    # whole group. Filling the width off `pad` alone leaves the 2.5:1 marquee
    # badly left-weighted with an empty right half.
    natural = max(
        d.textlength("Brand Check", font=font(int(40 * s))),
        d.textlength("Free. No affiliate links.", font=font(int(15 * s))),
        2 * (d.textlength("Packaging", font=font(int(15 * s))) + int(34 * s)),
    )
    col = int(min(natural, w - pad * 2 - mark - gap_x))
    x = int((w - (mark + gap_x + col)) / 2)
    img.paste(art := draw_mark(Image.new("RGBA", (mark, mark), (0, 0, 0, 0)), "PD"),
              (x, int(h / 2 - mark / 2)), art)
    x += mark + gap_x

    f_kicker = fit("PLASTIC DETOX", col, int(14 * s))
    f_title = fit("Brand Check", col, int(40 * s))
    tagline = "Free. No affiliate links."
    f_sub = fit(tagline, col, int(15 * s))

    # The four fronts, colour coded the way the extension renders them. Laid out
    # as a 2x2 grid so the labels survive the narrow 440px tile.
    fronts = [("Formula", (22, 163, 74)), ("Packaging", (180, 83, 9)),
              ("Recalls", (220, 38, 38)), ("Tests", (22, 163, 74))]
    f_front = f_sub
    half = col / 2
    widest = max(d.textlength(l, font=f_front) for l, _ in fronts)
    r = max(2, int(4 * s))
    gap = r * 2 + int(6 * s)
    while widest + gap > half and f_front.size > 8:
        f_front = font(f_front.size - 1)
        widest = max(d.textlength(l, font=f_front) for l, _ in fronts)

    line = int(19 * s)
    block = int(22 * s) + int(44 * s) + line * 2 + int(20 * s)
    y = int(h / 2 - block / 2)

    d.text((x, y), "PLASTIC DETOX", font=f_kicker, fill=VIOLET[:3])
    y += int(22 * s)
    d.text((x, y), "Brand Check", font=f_title, fill=WHITE[:3])
    y += int(46 * s)

    for i, (label, colour) in enumerate(fronts):
        cx = x + (i % 2) * half
        cy = y + (i // 2) * line
        d.ellipse([cx, cy + int(5 * s), cx + r * 2, cy + int(5 * s) + r * 2], fill=colour)
        d.text((cx + gap, cy), label, font=f_front, fill=(168, 162, 158))
    y += line * 2 + int(8 * s)

    d.text((x, y), tagline, font=f_sub, fill=(120, 113, 108))
    return img


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

    for w, h, name in ((440, 280, "promo-small-440x280"), (1400, 560, "promo-marquee-1400x560")):
        p = store / f"{name}.png"
        img = promo_tile(w, h)
        assert img.size == (w, h), f"{name} came out {img.size}"
        img.save(p)
        print(f"  {p.relative_to(ROOT)}  {w}x{h} exactly, no transparency")


if __name__ == "__main__":
    sys.exit(main())
