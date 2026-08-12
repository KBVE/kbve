"""Packs baked AO and roughness into the ORM layout the ground shader reads.

Plain Python on purpose. Doing this inside Blender meant assigning to a
generated image's pixel buffer and saving it back out, which wrote an empty
file without reporting an error -- the packing is easier to trust when it can
be run and checked on its own.

    python -m kbve.blender.pack_orm <dir> [--prefix turf_baked]

Red is ambient occlusion, green is roughness, blue is unused.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def pack(directory: Path, prefix: str) -> Path:
    ao = Image.open(directory / f"{prefix}_ao.png").convert("L")
    rough = Image.open(directory / f"{prefix}_roughness.png").convert("L")
    if ao.size != rough.size:
        raise SystemExit(f"size mismatch: ao {ao.size} vs roughness {rough.size}")

    out = directory / f"{prefix}_orm.png"
    Image.merge("RGB", (ao, rough, Image.new("L", ao.size))).save(out)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(prog="pack-orm")
    ap.add_argument("directory", type=Path)
    ap.add_argument("--prefix", default="turf_baked")
    a = ap.parse_args()

    out = pack(a.directory, a.prefix)
    with Image.open(out) as im:
        print(f"[pack_orm] wrote {out} {im.size} {im.mode}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
