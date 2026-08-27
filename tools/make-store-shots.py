#!/usr/bin/env python3
"""
Compose the Chrome Web Store screenshots.

A raw screen grab is the weakest thing you can put on a listing. At thumbnail
size nobody can read a product page, so each image needs a headline that lands
in about a second and a crop tight enough that the one thing it is arguing for
is unmistakable.

Source grabs live in extension/store/raw/. Output is exactly 1280x800 PNG,
which is what the dashboard requires.

    python3 tools/make-store-shots.py
"""

import pathlib
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "extension" / "store" / "raw"
OUT = ROOT / "extension" / "store"

W, H = 1280, 800
INK = (28, 25, 23)
CREAM = (250, 250, 249)
MUTED = (120, 113, 108)
VIOLET = (167, 139, 250)
GOOD = (22, 163, 74)
SKIP = (220, 38, 38)

FONT_PATHS = [
    ("/System/Library/Fonts/HelveticaNeue.ttc", 1),   # Bold, not 2 which is Italic
    ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 0),
]
FONT_REG = [
    ("/System/Library/Fonts/HelveticaNeue.ttc", 10),  # Medium reads better than Regular
    ("/System/Library/Fonts/Supplemental/Arial.ttf", 0),
]


def font(size, bold=True):
    for path, idx in (FONT_PATHS if bold else FONT_REG):
        try:
            return ImageFont.truetype(path, size, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()


def rounded(img, radius):
    """Round the corners of an RGB image, returning RGBA."""
    img = img.convert("RGBA")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1],
                                           radius=radius, fill=255)
    img.putalpha(mask)
    return img


def shadow(canvas, box, radius, blur=26, alpha=90, offset=(0, 10)):
    x, y, w, h = box
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rounded_rectangle(
        [x + offset[0], y + offset[1], x + w + offset[0], y + h + offset[1]],
        radius=radius, fill=(0, 0, 0, alpha))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def fit_cover(im, box_w, box_h):
    """Fill the box, cropping the overflow. For wide crops that can lose edges."""
    s = max(box_w / im.width, box_h / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    left = (im.width - box_w) // 2
    top = (im.height - box_h) // 2
    return im.crop((left, top, left + box_w, top + box_h))


def fit_contain(im, box_w, box_h):
    """Scale so the whole crop survives. A card is useless with its badge cut off."""
    s = min(box_w / im.width, box_h / im.height)
    return im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)


def wrap(draw, text, f, max_w):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        trial = (cur + " " + w_).strip()
        if draw.textlength(trial, font=f) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def base(dark=True):
    img = Image.new("RGBA", (W, H), (INK if dark else CREAM) + (255,))
    return img


def draw_headline(img, headline, sub, x, y, max_w, dark=True, accent=None):
    d = ImageDraw.Draw(img)
    fh = font(58)
    fs = font(23, bold=False)
    fg = (255, 255, 255) if dark else INK
    sg = (168, 162, 158) if dark else MUTED

    for line in wrap(d, headline, fh, max_w):
        d.text((x, y), line, font=fh, fill=fg)
        y += 66
    y += 10
    for line in wrap(d, sub, fs, max_w):
        d.text((x, y), line, font=fs, fill=sg)
        y += 32
    if accent:
        d.rounded_rectangle([x, y + 14, x + 54, y + 20], radius=3, fill=accent)
    return y


def wordmark(img, dark=True, x=None, y=34):
    d = ImageDraw.Draw(img)
    f = font(19)
    total = d.textlength("PLASTIC DETOX", font=f)
    if x is None:
        x = W - total - 64
    d.text((x, y), "PLASTIC", font=f, fill=(255, 255, 255) if dark else INK)
    x += d.textlength("PLASTIC ", font=f)
    d.text((x, y), "DETOX", font=f, fill=VIOLET)


# --------------------------------------------------------------- layouts

def layout_stacked(src, crop, headline, sub, accent=None, dark=True):
    """Headline across the top, wide screenshot filling the lower two thirds."""
    img = base(dark)
    draw_headline(img, headline, sub, 64, 54, W - 128, dark, accent)

    im = Image.open(src).convert("RGB").crop(crop)
    box_w, box_h = W - 128, 520
    im = fit_cover(im, box_w, box_h)
    x, y = 64, H - box_h - 34
    shadow(img, (x, y, box_w, box_h), 16)
    img.alpha_composite(rounded(im, 16), (x, y))
    return img


def layout_split(src, crop, headline, sub, accent=None, dark=True, right=True):
    """Headline on one side, a tall card crop on the other."""
    img = base(dark)
    col_w = 470
    text_x = 70 if right else W - col_w - 70
    draw_headline(img, headline, sub, text_x, 178, col_w - 20, dark, accent)

    # Contain, not cover. Covering this crop cut the SKIP badge and the status
    # icons off the left edge, which are the whole point of the image.
    im = Image.open(src).convert("RGB").crop(crop)
    im = fit_contain(im, 620, 690)
    iw, ih = im.size
    x = W - iw - 70 if right else 70
    y = (H - ih) // 2
    shadow(img, (x, y, iw, ih), 18)
    img.alpha_composite(rounded(im, 18), (x, y))
    return img


def layout_close(headline, sub, bullets):
    """Three big stat tiles. Numbers do the work, so they get the space."""
    img = base(True)
    d = ImageDraw.Draw(img)
    draw_headline(img, headline, sub, 70, 86, W - 300, True)

    pad, gap = 70, 26
    tile_w = (W - pad * 2 - gap * 2) // 3
    top, tile_h = 268, 268
    f_val = font(88)
    f_lab = font(21, bold=False)

    for i, (label, value, colour) in enumerate(bullets):
        x = pad + i * (tile_w + gap)
        d.rounded_rectangle([x, top, x + tile_w, top + tile_h], radius=18,
                            fill=(38, 34, 32), outline=(58, 53, 50), width=1)
        d.rounded_rectangle([x, top, x + tile_w, top + 6], radius=3, fill=colour)

        # Shrink the value until it fits, so a longer word never overflows.
        fv = f_val
        while d.textlength(value, font=fv) > tile_w - 64 and fv.size > 30:
            fv = font(fv.size - 4)
        d.text((x + 34, top + 56), value, font=fv, fill=(255, 255, 255))

        ly = top + 56 + fv.size + 26
        for line in wrap(d, label, f_lab, tile_w - 68):
            d.text((x + 34, ly), line, font=f_lab, fill=(168, 162, 158))
            ly += 30

    # The four fronts along the base, so the last frame restates the method
    # rather than leaving the lower third empty.
    fy = top + tile_h + 78
    d.text((pad, fy), "EVERY BRAND VETTED ON", font=font(15),
           fill=(120, 113, 108))
    fy += 40
    fr = font(25)
    fx = pad
    for i, name in enumerate(["Formula", "Packaging", "Recalls & lawsuits",
                              "Independent tests"]):
        d.ellipse([fx, fy + 9, fx + 11, fy + 20], fill=(214, 211, 209))
        d.text((fx + 24, fy), name, font=fr, fill=(231, 229, 228))
        fx += 24 + d.textlength(name, font=fr) + 46
    return img


def main():
    if not RAW.exists():
        raise SystemExit(f"put the raw grabs in {RAW.relative_to(ROOT)} first")

    search = RAW / "search.png"
    good = RAW / "good.png"
    skip = RAW / "skip.png"
    for p in (search, good, skip):
        if not p.exists():
            raise SystemExit(f"missing {p.name} in {RAW.relative_to(ROOT)}")

    jobs = [
        ("screenshot-1-search.png", layout_stacked(
            search, (30, 60, 2184, 1160),
            "Every result, rated",
            "Skip, careful or good choice on each listing, before you click into anything.",
            accent=GOOD)),
        ("screenshot-2-why.png", layout_split(
            skip, (1140, 230, 2010, 1000),
            "See exactly why",
            "Not a score out of ten. The specific thing that is wrong, with the source and the year.",
            accent=SKIP)),
        # A landscape crop wastes half a split layout, so this one goes stacked.
        ("screenshot-3-better.png", layout_stacked(
            skip, (1150, 245, 2005, 645),
            "And what to buy instead",
            "Every skip carries a researched alternative, linked straight to the full guide.",
            accent=GOOD)),
        ("screenshot-4-good.png", layout_split(
            good, (1140, 260, 2000, 880),
            "Honest about the gaps",
            "Where a front has not been researched yet, the card says so. No invented confidence.",
            accent=GOOD)),
        ("screenshot-5-close.png", layout_close(
            "Researched, not scraped",
            "Every verdict written by a person, with the evidence attached.",
            [("brands researched", "809", GOOD),
             ("affiliate links in the extension", "Zero", VIOLET),
             ("collected about your browsing", "Nothing", (180, 83, 9))])),
    ]

    marks = {"screenshot-2-why.png": (70, 92),
             "screenshot-4-good.png": (70, 92)}
    for name, img in jobs:
        mx, my = marks.get(name, (None, 34))
        wordmark(img, dark=True, x=mx, y=my)
        assert img.size == (W, H), f"{name} is {img.size}"
        img.convert("RGB").save(OUT / name, "PNG")
        print(f"  {name}  {W}x{H}")

    # Retire the old raw-screenshot versions so the wrong ones cannot be uploaded.
    for old in ("screenshot-1-product-page.png", "screenshot-2-search-results.png",
                "screenshot-3-full-verdict.png"):
        p = OUT / old
        if p.exists():
            p.unlink()
            print(f"  removed old {old}")


if __name__ == "__main__":
    sys.exit(main())
