#!/usr/bin/env python3
"""
Extract icon + mipmap strip + mod-portal thumbnail from the baked Idle_Body sheet.

Picks the camera-facing pose (direction 8 = 180°, ninth row of 16) and the
first animation frame. Emits:
  - graphics/icon.png        (120x64)  — 64 base + 32/16/8 mipmaps stacked
                                          horizontally as Factorio expects
                                          when icon_mipmaps = 4.
  - graphics/icon-egg.png    (120x64)  — same layout for the Spider Egg item.
  - thumbnail.png            (144x144) — mod portal listing thumbnail.

The mipmap strip layout matches Factorio's wiki spec:
  | 64x64 (base) | 32x32 | 16x16 | 8x8 |  → total 120x64
With `icon_size = 64`, `icon_mipmaps = 4` the engine slices the strip
itself; no extra prototype work needed.

The mod portal looks for thumbnail.png at the zip root.
"""

from __future__ import annotations

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "graphics" / "entity" / "spider" / "Idle_Body.png"
EGG_SRC = ROOT / "graphics" / "item" / "spider-egg.png"

FRAME = 256
DIR_INDEX = 8
FRAME_INDEX = 0
BASE_SIZE = 64
MIPMAP_LEVELS = 4  # 64 → 32 → 16 → 8


def write_mipmap_strip(tile: Image.Image, out_path: Path) -> None:
    """Pack a 64x64 base + log2-down mipmaps into a single horizontal strip."""
    total_w = sum(BASE_SIZE >> i for i in range(MIPMAP_LEVELS))
    canvas = Image.new("RGBA", (total_w, BASE_SIZE), (0, 0, 0, 0))
    x = 0
    for i in range(MIPMAP_LEVELS):
        size = BASE_SIZE >> i
        level = tile.resize((size, size), Image.LANCZOS)
        canvas.paste(level, (x, 0))
        x += size
    canvas.save(out_path, optimize=True)
    print(
        f"wrote {out_path.relative_to(ROOT)}  ({canvas.size[0]}x{canvas.size[1]}, {MIPMAP_LEVELS} mipmaps)")


def main() -> int:
    with Image.open(SHEET) as img:
        img = img.convert("RGBA")
        box = (
            FRAME_INDEX * FRAME,
            DIR_INDEX * FRAME,
            (FRAME_INDEX + 1) * FRAME,
            (DIR_INDEX + 1) * FRAME,
        )
        tile = img.crop(box)

        write_mipmap_strip(tile, ROOT / "graphics" / "icon.png")

        thumb_path = ROOT / "thumbnail.png"
        tile.resize((144, 144), Image.LANCZOS).save(thumb_path, optimize=True)
        print(f"wrote {thumb_path.relative_to(ROOT)}  (144x144)")

    if EGG_SRC.exists():
        with Image.open(EGG_SRC) as egg_img:
            egg = egg_img.convert("RGBA")
            if egg.size != (BASE_SIZE, BASE_SIZE):
                egg = egg.resize((BASE_SIZE, BASE_SIZE), Image.LANCZOS)
            write_mipmap_strip(egg, ROOT / "graphics" / "icon-egg.png")
    else:
        print(f"skip: {EGG_SRC.relative_to(ROOT)} not present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
