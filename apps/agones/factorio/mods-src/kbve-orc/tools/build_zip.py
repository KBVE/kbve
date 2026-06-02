#!/usr/bin/env python3
"""
Package the mod as `<name>_<version>.zip` per Factorio release format.

Factorio expects the zip to contain a single top-level folder named exactly
`<name>_<version>/`, with info.json at its root. We mirror that layout from
the working tree.

Excludes: tools/, tests/, dist/, *.py, __pycache__, .DS_Store, .original.* —
anything that isn't a runtime asset.
"""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

EXCLUDE_DIRS = {"tools", "tests", "dist",
                "__pycache__", ".git", ".nx", "node_modules"}
EXCLUDE_SUFFIXES = {".py", ".pyc", ".opt"}
EXCLUDE_NAMES = {".DS_Store", "project.json"}


def included(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    parts = rel.parts
    if any(p in EXCLUDE_DIRS for p in parts):
        return False
    if path.name in EXCLUDE_NAMES:
        return False
    if path.suffix in EXCLUDE_SUFFIXES:
        return False
    if path.name.endswith(".original.md"):
        return False
    return True


def main() -> int:
    info = json.loads((ROOT / "info.json").read_text())
    name = info["name"]
    version = info["version"]
    bundle = f"{name}_{version}"

    DIST.mkdir(exist_ok=True)
    zip_path = DIST / f"{bundle}.zip"
    if zip_path.exists():
        zip_path.unlink()

    count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file() or not included(path):
                continue
            arcname = f"{bundle}/{path.relative_to(ROOT).as_posix()}"
            zf.write(path, arcname)
            count += 1

        thumb = ROOT / "thumbnail.png"
        if thumb.exists():
            zf.write(thumb, "thumbnail.png")
            count += 1

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(
        f"packaged {count} files → {zip_path.relative_to(ROOT)} ({size_mb:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
