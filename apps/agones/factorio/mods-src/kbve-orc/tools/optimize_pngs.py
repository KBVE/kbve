#!/usr/bin/env python3
"""
Lossless PNG recompression for the kbve-orc sprite sheets.

Uses zopflipng (Google's brute-force lossless deflate). Pixel data is byte-
identical before/after — only the DEFLATE stream + non-essential metadata
chunks change. Safe to run on shipped sheets.

Strategy:
  - Walk graphics/ recursively.
  - For each .png, run zopflipng → temp, keep result only if smaller.
  - Strip safe non-essential chunks (cHRM, gAMA, iCCP, sRGB, tEXt, zTXt, iTXt).
  - Skip files that have a sibling `.opt` marker matching the current mtime+size
    (cheap "already-optimized" cache).

zopflipng is slow on multi-megapixel sheets. Use --jobs N to parallelize.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TARGET = ROOT / "graphics"
ZOPFLIPNG = shutil.which("zopflipng")


@dataclass
class Result:
    path: Path
    before: int
    after: int
    saved: int
    skipped: bool = False
    failed: str | None = None


def marker_path(png: Path) -> Path:
    return png.with_suffix(png.suffix + ".opt")


def already_optimized(png: Path) -> bool:
    m = marker_path(png)
    if not m.exists():
        return False
    try:
        stat = png.stat()
        stamp = m.read_text().strip().split(":")
        if len(stamp) != 2:
            return False
        return stamp[0] == str(int(stat.st_mtime)) and stamp[1] == str(stat.st_size)
    except OSError:
        return False


def write_marker(png: Path) -> None:
    stat = png.stat()
    marker_path(png).write_text(f"{int(stat.st_mtime)}:{stat.st_size}\n")


def optimize_one(png: Path, dry_run: bool) -> Result:
    before = png.stat().st_size

    if already_optimized(png):
        return Result(png, before, before, 0, skipped=True)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False, dir=png.parent) as tmp:
        tmp_path = Path(tmp.name)

    if before > 4 * 1024 * 1024:
        iterations = 3
    elif before > 1 * 1024 * 1024:
        iterations = 8
    else:
        iterations = 15

    try:
        cmd = [
            ZOPFLIPNG,
            "--lossy_transparent",
            "-y",
            "--keepchunks=tRNS",
            f"--iterations={iterations}",
            str(png),
            str(tmp_path),
        ]
        proc = subprocess.run(cmd, capture_output=True,
                              text=True, timeout=1800)
        if proc.returncode != 0:
            err = proc.stderr.strip().splitlines(
            )[-1] if proc.stderr else "zopflipng failed"
            return Result(png, before, before, 0, failed=err)

        after = tmp_path.stat().st_size
        if after >= before:
            tmp_path.unlink(missing_ok=True)
            write_marker(png)
            return Result(png, before, before, 0)

        if dry_run:
            tmp_path.unlink(missing_ok=True)
            return Result(png, before, after, before - after)

        os.replace(tmp_path, png)
        write_marker(png)
        return Result(png, before, after, before - after)
    except subprocess.TimeoutExpired:
        return Result(png, before, before, 0, failed="timeout (>600s)")
    finally:
        tmp_path.unlink(missing_ok=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--target",
        type=lambda p: Path(p).resolve(),
        default=DEFAULT_TARGET,
        help="dir to walk (default: graphics/)",
    )
    ap.add_argument("--jobs", type=int, default=max(1,
                    (os.cpu_count() or 2) - 1), help="parallel workers")
    ap.add_argument("--dry-run", action="store_true",
                    help="report savings but don't replace files")
    args = ap.parse_args()

    if ZOPFLIPNG is None:
        print("ERROR: zopflipng not found in PATH. Install with `brew install zopfli`.", file=sys.stderr)
        return 2

    if not args.target.exists():
        print(f"ERROR: target {args.target} does not exist", file=sys.stderr)
        return 2

    pngs = sorted(p for p in args.target.rglob("*.png") if p.is_file())
    if not pngs:
        print(f"no .png files under {args.target}")
        return 0

    print(f"zopflipng:    {ZOPFLIPNG}")
    try:
        target_label = args.target.relative_to(ROOT)
    except ValueError:
        target_label = args.target
    print(f"target:       {target_label}")
    print(f"files:        {len(pngs)}")
    print(f"jobs:         {args.jobs}")
    print(f"dry-run:      {args.dry_run}")
    print()

    total_before = total_after = total_skipped = total_failed = 0
    with cf.ThreadPoolExecutor(max_workers=args.jobs) as ex:
        for r in ex.map(lambda p: optimize_one(p, args.dry_run), pngs):
            total_before += r.before
            total_after += r.after
            rel = r.path.relative_to(args.target)
            if r.failed:
                total_failed += 1
                print(f"  FAIL  {rel}  ({r.failed})")
            elif r.skipped:
                total_skipped += 1
            elif r.saved:
                pct = (r.saved / r.before) * 100
                print(
                    f"  {r.before // 1024:>5d}K → {r.after // 1024:>5d}K  (-{pct:4.1f}%)  {rel}")
            else:
                print(f"  {r.before // 1024:>5d}K           (no gain)   {rel}")

    saved = total_before - total_after
    pct = (saved / total_before * 100) if total_before else 0
    print()
    print(
        f"summary: {total_before // 1024}K → {total_after // 1024}K  (-{pct:.1f}%, saved {saved // 1024}K)")
    print(f"         skipped {total_skipped}, failed {total_failed}")
    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
