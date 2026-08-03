#!/usr/bin/env python3
"""Generate the 1200x630 Open Graph / Twitter card for kbve.com.

The brand wordmark only exists as a 150x48 raster, so upscaling it to card
size reads blurry. The card is typeset instead, in the site's own palette
(near-black surface, gold accents, red rule) so it matches the shell.

Usage: python3 scripts/gen-og-card.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
OUT = (
    Path(__file__).resolve().parent.parent
    / "public"
    / "assets"
    / "images"
    / "brand"
    / "og-card.png"
)

BG = (11, 12, 11)
BG_TOP = (26, 26, 26)
PARCHMENT = (245, 236, 216)
GOLD = (166, 125, 67)
GOLD_LIGHT = (201, 165, 106)
RED = (173, 0, 19)

WORDMARK = "KBVE"
TAGLINE = "Kilobyte Virtual Enterprise"
BLURB = "Games, tools, applications, infrastructure — built in public."

BOLD_FONTS = [
    "/System/Library/Fonts/Supplemental/Futura.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
REGULAR_FONTS = [
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def load(candidates, size, index=0):
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size, index=index)
            except OSError:
                continue
    return ImageFont.load_default()


def gradient(size, top, bottom):
    band = Image.new("RGB", (1, size[1]))
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        band.putpixel(
            (0, y),
            tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)),
        )
    return band.resize(size, Image.BICUBIC)


def tracked_text(draw, xy, text, font, fill, tracking=0):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x - tracking


def tracked_width(draw, text, font, tracking=0):
    total = sum(draw.textlength(ch, font=font) for ch in text)
    return total + tracking * max(0, len(text) - 1)


def build():
    img = gradient((W, H), BG_TOP, BG).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

    # Gold hairline frame, inset so social crops never clip it.
    draw.rectangle([36, 36, W - 37, H - 37], outline=GOLD + (90,), width=2)

    # Red-to-gold rule anchoring the type block on the left.
    bar_x, bar_top, bar_bottom = 96, 214, 416
    for y in range(bar_top, bar_bottom):
        t = (y - bar_top) / (bar_bottom - bar_top - 1)
        draw.line(
            [(bar_x, y), (bar_x + 7, y)],
            fill=tuple(round(a + (b - a) * t)
                       for a, b in zip(RED, GOLD_LIGHT)),
        )

    text_x = bar_x + 44

    wordmark_font = load(BOLD_FONTS, 148)
    tagline_font = load(REGULAR_FONTS, 46)
    blurb_font = load(REGULAR_FONTS, 29)

    tracked_text(draw, (text_x, 196), WORDMARK,
                 wordmark_font, PARCHMENT, tracking=10)
    draw.text((text_x, 372), TAGLINE, font=tagline_font, fill=GOLD_LIGHT)
    draw.text((text_x, 470), BLURB, font=blurb_font, fill=(150, 143, 130))

    # Domain, bottom-right, tracked out as a quiet counterweight.
    domain_font = load(REGULAR_FONTS, 27)
    domain = "kbve.com"
    dw = tracked_width(draw, domain, domain_font, tracking=4)
    tracked_text(
        draw,
        (W - 96 - dw, 473),
        domain,
        domain_font,
        GOLD,
        tracking=4,
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    return OUT


def main():
    out = build()
    print(
        f"wrote {out.relative_to(Path(__file__).resolve().parent.parent)} ({W}x{H})")


if __name__ == "__main__":
    raise SystemExit(main())
