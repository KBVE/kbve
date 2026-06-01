#!/usr/bin/env python3
"""
Extract icon + mod-portal thumbnail from the baked Idle_Body sheet.

Picks the camera-facing pose (direction 8 = 180°, ninth row of 16) and the
first animation frame. Emits:
  - graphics/icon.png  (64x64)   — entity / HUD / alert icon
  - thumbnail.png      (144x144) — mod portal listing thumbnail

The mod portal looks for thumbnail.png at the zip root.
"""

from __future__ import annotations

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "graphics" / "entity" / "spider" / "Idle_Body.png"

FRAME = 256
DIR_INDEX = 8
FRAME_INDEX = 0

OUTPUTS = [
    (ROOT / "graphics" / "icon.png", 64),
    (ROOT / "thumbnail.png", 144),
]


def main() -> int:
    with Image.open(SHEET) as img:
        img = img.convert("RGBA")
        box = (FRAME_INDEX * FRAME, DIR_INDEX * FRAME,
               (FRAME_INDEX + 1) * FRAME, (DIR_INDEX + 1) * FRAME)
        tile = img.crop(box)
        for out_path, size in OUTPUTS:
            resized = tile.resize((size, size), Image.LANCZOS)
            resized.save(out_path, optimize=True)
            print(f"wrote {out_path.relative_to(ROOT)}  ({size}x{size})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
