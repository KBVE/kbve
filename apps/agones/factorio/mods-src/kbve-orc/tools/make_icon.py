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
from PIL import Image

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


def gold_tint(tile: Image.Image) -> Image.Image:
    # Placeholder Tribute icon: same orc pose, tinted gold. Swap with proper
    # art when available.
    base = tile.convert("RGBA")
    r, g, b, a = base.split()
    tinted = Image.merge("RGB", (
        r.point(lambda v: min(255, int(v * 1.25))),
        g.point(lambda v: min(255, int(v * 1.05))),
        b.point(lambda v: int(v * 0.6)),
    ))
    out = Image.new("RGBA", base.size)
    out.paste(tinted, mask=a)
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

        write_mipmap_strip(gold_tint(tile), ROOT /
                           "graphics" / "icon-tribute.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
