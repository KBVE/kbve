#!/usr/bin/env python3
"""
Extract icon + mipmap strip + mod-portal thumbnail from the baked Idle_Armed_Body sheet.

Picks the camera-facing pose (direction 8 = 180°, ninth row of 16) and the
first animation frame. Emits:
  - graphics/icon.png         (120x64)  — 64 base + 32/16/8 mipmaps stacked
                                           horizontally as Factorio expects
                                           when icon_mipmaps = 4.
  - graphics/icon-tribute.png (120x64)  — same layout, derived from the same
                                           tile with a gold tint as a
                                           placeholder for the Tribute item icon
                                           (replace with proper art later).
  - thumbnail.png             (144x144) — mod portal listing thumbnail.
"""

from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "graphics" / "entity" / "orc" / "Idle_Armed_Body.png"

FRAME = 256
DIR_INDEX = 8
FRAME_INDEX = 0
BASE_SIZE = 64
MIPMAP_LEVELS = 4  # 64 → 32 → 16 → 8


def write_mipmap_strip(tile: Image.Image, out_path: Path) -> None:
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


def tribute_icon() -> Image.Image:
    ss = 4
    n = FRAME * ss
    canvas = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    cx, cy = n / 2, n * 0.52
    w, top, bot = n * 0.34, n * 0.20, n * 0.86
    girdle = n * 0.42
    crown = cy - (bot - cy) * 0.55

    gem = [(cx, top), (cx + w, crown), (cx + w * 0.62, girdle),
           (cx, bot), (cx - w * 0.62, girdle), (cx - w, crown)]
    draw.polygon(gem, fill=(214, 168, 46, 255),
                 outline=(120, 84, 12, 255), width=max(2, ss))

    draw.polygon([(cx, top), (cx + w, crown), (cx, girdle)],
                 fill=(245, 208, 96, 255))
    draw.polygon([(cx, top), (cx - w, crown), (cx, girdle)],
                 fill=(196, 150, 40, 255))
    draw.polygon([(cx, girdle), (cx + w * 0.62, girdle), (cx, bot)],
                 fill=(168, 120, 24, 255))
    draw.polygon([(cx, girdle), (cx - w * 0.62, girdle), (cx, bot)],
                 fill=(140, 98, 18, 255))
    draw.line([(cx - w * 0.5, top + (crown - top) * 0.5),
               (cx - w * 0.2, top + (crown - top) * 0.9)],
              fill=(255, 240, 190, 235), width=max(2, ss))

    out = canvas.resize((FRAME, FRAME), Image.LANCZOS)
    return out


def main() -> int:
    if not SHEET.exists():
        print(f"ERROR: baked sheet not found at {SHEET.relative_to(ROOT)}")
        print("       Run `nx run kbve-orc:bake` first.")
        return 2

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

    write_mipmap_strip(tribute_icon(), ROOT /
                       "graphics" / "icon-tribute.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
