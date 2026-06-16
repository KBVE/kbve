#!/usr/bin/env python3
"""Generate our own 9-slice RPG panels -> public/ui/panel-<name>.png.

Each variant is a 32x32 bordered frame built for CSS border-image: ornate
corner studs + a beveled border band + a dark translucent center that tiles as
the content background. PixelPanel slices at 8 to match. One draw fn, many
palettes -> a whole panel family, all our own art (no third-party assets).

Add a palette to VARIANTS and rerun. Usage: python3 scripts/gen_panel.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

S = 32
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "ui"

VARIANTS = {
    "wood": [(26, 22, 18, 238), (74, 60, 40, 255), (120, 96, 60, 255), (10, 8, 6, 255), (205, 172, 92, 255)],
    "stone": [(32, 33, 38, 238), (88, 90, 98, 255), (140, 143, 150, 255), (14, 15, 18, 255), (184, 188, 196, 255)],
    "iron": [(18, 20, 26, 240), (52, 56, 66, 255), (96, 102, 116, 255), (6, 7, 10, 255), (152, 160, 174, 255)],
    "parchment": [(222, 202, 160, 240), (150, 120, 70, 255), (120, 92, 50, 255),
                  (70, 52, 28, 255), (186, 146, 84, 255)],
    "arcane": [(20, 18, 40, 236), (60, 46, 110, 255), (120, 90, 200, 255), (10, 8, 24, 255), (160, 130, 245, 255)],
    "emerald": [(16, 28, 20, 238), (40, 80, 52, 255), (80, 150, 96, 255), (6, 14, 8, 255), (124, 204, 144, 255)],
    "ruby": [(30, 16, 16, 238), (96, 40, 40, 255), (170, 70, 70, 255), (16, 6, 6, 255), (224, 112, 112, 255)],
}


def draw(name, p):
    fill, band, ring, outline, stud = p
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, S - 1, S - 1], fill=fill)
    d.rectangle([0, 0, S - 1, S - 1], outline=outline, width=1)
    d.rectangle([1, 1, S - 2, S - 2], outline=band, width=2)
    d.rectangle([3, 3, S - 4, S - 4], outline=ring, width=1)
    for cx, cy in [(2, 2), (S - 5, 2), (2, S - 5), (S - 5, S - 5)]:
        d.rectangle([cx, cy, cx + 2, cy + 2], fill=stud)
    out = OUT_DIR / f"panel-{name}.png"
    img.save(out)
    return out


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, p in VARIANTS.items():
        print(f"wrote {draw(name, p).name} ({S}x{S})")


if __name__ == "__main__":
    raise SystemExit(main())
