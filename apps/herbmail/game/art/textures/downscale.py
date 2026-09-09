#!/usr/bin/env python3
"""Clamp the shipped dungeon art in public/textures to the game's texture budget.

public/textures is a bake output, not a master, so the shipped files carry the
final resolution and dev and production serve the same bytes. Retarget by
editing SIZE here and rerunning; review the diff before committing since the
files are LFS-tracked.

Power-of-two sources stay power-of-two so tiling art keeps its wrap seams.
"""
from pathlib import Path

from PIL import Image

SIZE = 256
ROOT = Path(__file__).resolve().parents[2] / "public/textures"
SUFFIXES = {".png", ".jpg", ".jpeg"}


def is_pow2(n: int) -> bool:
    return n > 0 and (n & (n - 1)) == 0


def planned(width: int, height: int) -> tuple[int, int] | None:
    longest = max(width, height)
    if longest <= SIZE:
        return None
    scale = SIZE / longest
    return max(1, round(width * scale)), max(1, round(height * scale))


def main() -> None:
    shrunk = 0
    before = 0
    after = 0
    for path in sorted(ROOT.rglob("*")):
        if path.suffix.lower() not in SUFFIXES:
            continue
        with Image.open(path) as img:
            target = planned(img.width, img.height)
            if target is None:
                continue
            if (is_pow2(img.width) and is_pow2(img.height)) and not (
                is_pow2(target[0]) and is_pow2(target[1])
            ):
                raise SystemExit(
                    f"{path.relative_to(ROOT)} {img.width}x{img.height} -> "
                    f"{target[0]}x{target[1]} breaks power-of-two tiling"
                )
            src_size = path.stat().st_size
            out = img.resize(target, Image.LANCZOS)
            if img.format == "JPEG":
                out.convert("RGB").save(path, "JPEG", quality=92)
            else:
                out.save(path, img.format)

        before += src_size
        after += path.stat().st_size
        shrunk += 1
        print(f"  {path.relative_to(ROOT)} -> {target[0]}x{target[1]}")

    print(
        f"downscaled {shrunk} textures to max {SIZE}px, "
        f"{before // 1024}K -> {after // 1024}K"
    )


if __name__ == "__main__":
    main()
