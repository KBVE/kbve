#!/usr/bin/env python3
"""Launcher entrypoint for the Blender headless sprite baker.

`model_sprites.py` imports `bpy`, so it can only run inside Blender's bundled
python — not via plain `uv run`. This thin launcher finds a Blender binary and
execs it headless against the baker, forwarding every arg after `--`:

    uv run kbve-model-sprites -- --model fighter1.obj --skin idolknight.jpg \
        --out render_flat --frames 16 --res 256 --pitch 90

Set BLENDER_BIN to override binary discovery.
"""
import os
import shutil
import subprocess
import sys

# Discovery order: env override, PATH, then the macOS app bundle (mac-blender runner).
_CANDIDATES = (
    "blender",
    "/Applications/Blender.app/Contents/MacOS/Blender",
)


def find_blender():
    override = os.environ.get("BLENDER_BIN")
    if override and os.path.exists(override):
        return override
    for c in _CANDIDATES:
        if os.sep in c:
            if os.path.exists(c):
                return c
        else:
            found = shutil.which(c)
            if found:
                return found
    return None


def main():
    blender = find_blender()
    if not blender:
        raise SystemExit(
            "Blender not found. Install it (brew install --cask blender) or set BLENDER_BIN."
        )
    baker = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_sprites.py")
    argv = sys.argv[1:]
    # accept both `kbve-model-sprites --model ...` and `... -- --model ...`
    if argv and argv[0] == "--":
        argv = argv[1:]
    cmd = [blender, "-b", "-P", baker, "--", *argv]
    raise SystemExit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
