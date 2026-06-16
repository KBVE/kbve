#!/usr/bin/env python3
"""Generate our own 9-slice RPG panel -> public/ui/panel9.png.

A 32x32 bordered frame designed for CSS border-image: ornate corner studs +
a beveled wood/bronze border band + a dark translucent center that tiles as
the content background. PixelPanel uses slice=8 to match. Tweak the palette
here; it's our art, no third-party assets.

Usage: python3 scripts/gen_panel.py   (needs Pillow)
"""

from pathlib import Path

from PIL import Image, ImageDraw

S = 32
OUT = Path(__file__).resolve().parent.parent / "public" / "ui" / "panel9.png"

FILL = (26, 22, 18, 238)       # dark translucent content bg
BAND = (74, 60, 40, 255)       # wood border band
RING = (120, 96, 60, 255)      # bronze inner highlight
OUTLINE = (10, 8, 6, 255)      # near-black outer edge
STUD = (205, 172, 92, 255)     # gold corner studs


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, S - 1, S - 1], fill=FILL)
    d.rectangle([0, 0, S - 1, S - 1], outline=OUTLINE, width=1)
    d.rectangle([1, 1, S - 2, S - 2], outline=BAND, width=2)
    d.rectangle([3, 3, S - 4, S - 4], outline=RING, width=1)
    for cx, cy in [(2, 2), (S - 5, 2), (2, S - 5), (S - 5, S - 5)]:
        d.rectangle([cx, cy, cx + 2, cy + 2], fill=STUD)
    img.save(OUT)
    print(f"wrote {OUT} ({S}x{S})")


if __name__ == "__main__":
    raise SystemExit(main())
