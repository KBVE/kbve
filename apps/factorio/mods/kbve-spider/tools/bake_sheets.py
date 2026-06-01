#!/usr/bin/env python3
"""
Bake per-direction Spider256 sprite sheets into Factorio direction-major sheets.

Source layout (per animation):
  Spider256/<Anim>/<Anim>_<Layer>_<deg>.png
  where:
    Anim   ∈ {Idle, Walk, Run, Attack1..3, Death1..2, Hit_Front/Back/Left/Right, Nervous}
    Layer  ∈ {Body, Shadow}
    deg    ∈ {000, 022, 045, 067, 090, 112, 135, 157, 180, 202, 225, 247, 270, 292, 315, 337}
  Each PNG is a grid of 256×256 frames (left→right, top→bottom).

Output layout (per animation × layer):
  <out>/<Anim>_<Layer>.png  →  width = frame_count * 256, height = 16 * 256
  Each row = one direction (0°→337.5°), columns = animation frames.

Factorio direction order: north=0, clockwise. Source 0° is render-forward (south-facing
camera by default). Run with --direction-shift to rotate the row order if in-game
heading looks wrong; default writes rows in source order (0°..337.5°).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from PIL import Image

FRAME = 256
DIRECTIONS = [0, 22, 45, 67, 90, 112, 135, 157,
              180, 202, 225, 247, 270, 292, 315, 337]
LAYERS = ("Body", "Shadow")
ANIMS = (
    "Idle", "Walk", "Run",
    "Attack1", "Attack2", "Attack3",
    "Death1", "Death2",
    "Hit_Front", "Hit_Back", "Hit_Left", "Hit_Right",
    "Nervous",
)


def slice_frames(sheet: Image.Image) -> list[Image.Image]:
    w, h = sheet.size
    if w % FRAME or h % FRAME:
        raise ValueError(f"sheet {sheet.size} not multiple of {FRAME}")
    cols, rows = w // FRAME, h // FRAME
    out = []
    for r in range(rows):
        for c in range(cols):
            box = (c * FRAME, r * FRAME, (c + 1) * FRAME, (r + 1) * FRAME)
            out.append(sheet.crop(box))
    return out


def bake_animation(src_dir: Path, anim: str, layer: str, out_dir: Path, shift: int) -> dict:
    rows = []
    frame_count = None
    for deg in DIRECTIONS:
        path = src_dir / anim / f"{anim}_{layer}_{deg:03d}.png"
        if not path.exists():
            raise FileNotFoundError(path)
        frames = slice_frames(Image.open(path).convert("RGBA"))
        if frame_count is None:
            frame_count = len(frames)
        elif len(frames) != frame_count:
            raise ValueError(
                f"{path}: {len(frames)} frames, expected {frame_count}")
        rows.append(frames)

    if shift:
        rows = rows[shift:] + rows[:shift]

    out_w = frame_count * FRAME
    out_h = 16 * FRAME
    canvas = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    for dir_idx, frames in enumerate(rows):
        for f_idx, frame in enumerate(frames):
            canvas.paste(frame, (f_idx * FRAME, dir_idx * FRAME))

    out_path = out_dir / f"{anim}_{layer}.png"
    canvas.save(out_path, optimize=True)
    return {"anim": anim, "layer": layer, "frames": frame_count, "size": canvas.size, "path": out_path}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, type=Path,
                    help="Spider256 root (contains Idle/, Walk/, ...)")
    ap.add_argument("--out", required=True, type=Path,
                    help="output dir for baked sheets")
    ap.add_argument("--direction-shift", type=int, default=0,
                    help="rotate rows N positions clockwise (each step = 22.5°). Use if in-game heading is off.")
    ap.add_argument("--only", nargs="*", help="bake only these animations")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    targets = args.only if args.only else ANIMS

    print(f"src={args.src}  out={args.out}  shift={args.direction_shift}")
    for anim in targets:
        for layer in LAYERS:
            info = bake_animation(args.src, anim, layer,
                                  args.out, args.direction_shift)
            print(
                f"  {info['anim']:10s} {info['layer']:6s}  "
                f"frames={info['frames']:2d}  size={info['size']}  → {info['path'].name}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
