#!/usr/bin/env python3
"""Batch-resize images to 64x64 PNG with transparency preserved.

Usage:
    1. Drop source images into the `input/` folder (next to this script).
    2. Run:  python resize.py
    3. Resized 64x64 PNGs appear in the `output/` folder.

Supports PNG, JPG, JPEG, BMP, GIF, TIFF, and WEBP.
Non-RGBA images are converted to RGBA so the output always has an alpha channel.
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow is required.  Install it with:  pip install Pillow")
    sys.exit(1)

SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tiff", ".tif", ".webp"}
TARGET_SIZE = (64, 64)

def resize_image(src: Path, dst: Path) -> None:
    with Image.open(src) as img:
        img = img.convert("RGBA")
        img = img.resize(TARGET_SIZE, Image.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        img.save(dst, format="PNG")

def main() -> None:
    script_dir = Path(__file__).resolve().parent
    input_dir = script_dir / "input"
    output_dir = script_dir / "output"

    if not input_dir.exists():
        input_dir.mkdir(parents=True)
        print(f"Created {input_dir} — drop images there and re-run.")
        return

    output_dir.mkdir(parents=True, exist_ok=True)

    images = sorted(
        p for p in input_dir.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not images:
        print(f"No images found in {input_dir}")
        return

    for src in images:
        dst = output_dir / f"{src.stem}.png"
        resize_image(src, dst)
        print(f"  {src.name}  ->  {dst.name}")

    print(f"\nDone. {len(images)} image(s) resized to {TARGET_SIZE[0]}x{TARGET_SIZE[1]} in {output_dir}")

if __name__ == "__main__":
    main()
