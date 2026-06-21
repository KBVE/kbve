#!/usr/bin/env python3
"""Generate transparent-friendly 9-slice pixel panels for the arpg HUD.

Each variant is a 32x32 RGBA frame built for CSS `border-image` (slice=8): a
1px dark outline, a 2px light highlight band, a 1px inner shade line, and a
LOW-ALPHA center so the iso scene shows through behind HUD panels. The four
corner pixels are punched to transparent for the soft rounded-corner read (the
speech-bubble look). Pure Pillow — no third-party art.

Tight family (frost / slate / gold) instead of the full cryptothrone set; these
read well over the dark scene and stay translucent. Add a palette + rerun.

Usage: python3 scripts/gen-arpg-panel.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

S = 32
OUT_DIR = (
    Path(__file__).resolve().parent.parent
    / "public"
    / "assets"
    / "arcade"
    / "arpg"
    / "ui"
)

# [fill, hi(top-left bevel), lo(bottom-right bevel), shade(inner), outline,
#  stud] as RGBA tuples. hi/lo give the raised bevel; stud caps the corners.
VARIANTS = {
    "frost": [
        (208, 222, 240, 70),
        (238, 246, 255, 255),
        (150, 168, 200, 255),
        (120, 140, 176, 255),
        (40, 50, 72, 255),
        (255, 255, 255, 255),
    ],
    "slate": [
        (20, 26, 38, 96),
        (150, 168, 200, 255),
        (44, 54, 76, 255),
        (74, 88, 116, 255),
        (8, 11, 18, 255),
        (188, 202, 226, 255),
    ],
    "gold": [
        (28, 24, 14, 100),
        (255, 232, 158, 255),
        (150, 110, 44, 255),
        (190, 150, 70, 255),
        (24, 17, 6, 255),
        (255, 244, 196, 255),
    ],
}

CLEAR = (0, 0, 0, 0)


def hline(d, x0, x1, y, color):
    d.line([(x0, y), (x1, y)], fill=color)


def vline(d, x, y0, y1, color):
    d.line([(x, y0), (x, y1)], fill=color)


def draw(name, palette):
    fill, hi, lo, shade, outline, stud = palette
    img = Image.new("RGBA", (S, S), CLEAR)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, S - 1, S - 1], fill=fill)

    # Outer outline frame (rounded by punching the corner pixels later).
    d.rectangle([0, 0, S - 1, S - 1], outline=outline, width=1)

    # Beveled band: light on the top + left, dark on the bottom + right, so the
    # frame reads as raised. Band is 2px thick (rows/cols 1..2).
    for i in (1, 2):
        hline(d, i, S - 1 - i, i, hi)
        vline(d, i, i, S - 1 - i, hi)
        hline(d, i, S - 1 - i, S - 1 - i, lo)
        vline(d, S - 1 - i, i, S - 1 - i, lo)

    # Inner shade line separating the band from the translucent center.
    d.rectangle([3, 3, S - 4, S - 4], outline=shade, width=1)

    # Soft rounded corners: clear the outermost pixel, outline the next.
    for cx, cy in [(0, 0), (S - 1, 0), (0, S - 1), (S - 1, S - 1)]:
        img.putpixel((cx, cy), CLEAR)
    for cx, cy in [(1, 1), (S - 2, 1), (1, S - 2), (S - 2, S - 2)]:
        img.putpixel((cx, cy), outline)

    # Corner studs: a 2x2 highlight just inside each corner.
    for ox, oy in [(2, 2), (S - 4, 2), (2, S - 4), (S - 4, S - 4)]:
        d.rectangle([ox, oy, ox + 1, oy + 1], fill=stud)

    out = OUT_DIR / f"panel-{name}.png"
    img.save(out)
    return out


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, palette in VARIANTS.items():
        print(f"wrote {draw(name, palette).name} ({S}x{S})")


if __name__ == "__main__":
    raise SystemExit(main())
