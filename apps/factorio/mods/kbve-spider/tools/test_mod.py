#!/usr/bin/env python3
"""
Static validation for the kbve-spider Factorio mod. No Factorio required.

Checks:
  1. info.json shape (required keys, version format, factorio_version present).
  2. All animation sheets declared in prototypes/spider.lua exist on disk.
  3. Each sheet's pixel dimensions match (frame_count * 256) × (16 * 256).
  4. All PNG files are readable (no corruption, RGBA mode).
  5. Animations referenced in spider.lua (run_animation, attack_parameters.animation)
     point at anims that have been baked + declared in FRAMES.

Exits non-zero on first failure. Designed to be wired as an nx `test` target.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GRAPHICS = ROOT / "graphics" / "entity" / "spider"
INFO_PATH = ROOT / "info.json"
PROTO_PATH = ROOT / "prototypes" / "spider.lua"

FRAME = 256
DIRECTIONS = 16
LAYERS = ("Body", "Shadow")

REQUIRED_INFO_KEYS = {
    "name", "version", "factorio_version", "title", "author", "description",
}

VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
FACTORIO_VERSION_RE = re.compile(r"^\d+\.\d+$")
FRAMES_TABLE_RE = re.compile(r"local\s+FRAMES\s*=\s*\{(.+?)\}", re.DOTALL)
FRAMES_ENTRY_RE = re.compile(r"(\w+)\s*=\s*(\d+)")


class TestFail(SystemExit):
    def __init__(self, msg: str) -> None:
        super().__init__(f"FAIL: {msg}")


def parse_frames(proto_src: str) -> dict[str, int]:
    m = FRAMES_TABLE_RE.search(proto_src)
    if not m:
        raise TestFail("could not locate `local FRAMES = {...}` in spider.lua")
    body = m.group(1)
    body = re.sub(r"--.*", "", body)
    out: dict[str, int] = {}
    for name, count in FRAMES_ENTRY_RE.findall(body):
        out[name] = int(count)
    if not out:
        raise TestFail("FRAMES table parsed as empty")
    return out


def find_rotated_calls(proto_src: str) -> list[str]:
    """All anims passed to rotated(...) or corpse_proto(...) in spider.lua."""
    direct = re.findall(r'rotated\(\s*"([^"]+)"', proto_src)
    via_corpse = re.findall(r'corpse_proto\(\s*"([^"]+)"', proto_src)
    return direct + via_corpse


def check_info() -> dict:
    if not INFO_PATH.exists():
        raise TestFail(f"missing {INFO_PATH}")
    try:
        info = json.loads(INFO_PATH.read_text())
    except json.JSONDecodeError as e:
        raise TestFail(f"info.json invalid JSON: {e}")

    missing = REQUIRED_INFO_KEYS - info.keys()
    if missing:
        raise TestFail(f"info.json missing keys: {sorted(missing)}")

    if not VERSION_RE.match(info["version"]):
        raise TestFail(
            f"info.json version '{info['version']}' must match X.Y.Z")

    if not FACTORIO_VERSION_RE.match(info["factorio_version"]):
        raise TestFail(
            f"info.json factorio_version '{info['factorio_version']}' must match X.Y")

    name = info["name"]
    if not re.match(r"^[a-z0-9][a-z0-9_-]*$", name):
        raise TestFail(
            f"info.json name '{name}' invalid for Factorio mod (lowercase, dashes only)")

    print(
        f"  info.json OK  (name={name} version={info['version']} fv={info['factorio_version']})")
    return info


def check_sheet(anim: str, layer: str, frame_count: int) -> None:
    path = GRAPHICS / f"{anim}_{layer}.png"
    if not path.exists():
        raise TestFail(f"missing sheet: {path.relative_to(ROOT)}")

    try:
        with Image.open(path) as img:
            img.load()
            mode = img.mode
            size = img.size
    except Exception as e:
        raise TestFail(f"{path.name}: cannot open ({e})")

    # Factorio accepts RGBA, RGB+tRNS, palette+tRNS (P), LA. Reject only modes
    # the engine can't render (1, F, I).
    if mode not in ("RGBA", "RGB", "LA", "L", "P", "PA"):
        raise TestFail(f"{path.name}: unsupported PNG mode {mode!r}")

    want = (frame_count * FRAME, DIRECTIONS * FRAME)
    if size != want:
        raise TestFail(
            f"{path.name}: size {size}, expected {want} "
            f"(={frame_count} frames × {FRAME}, ={DIRECTIONS} dirs × {FRAME})"
        )


def check_all_sheets(frames: dict[str, int]) -> None:
    total = 0
    for anim, count in sorted(frames.items()):
        for layer in LAYERS:
            check_sheet(anim, layer, count)
            total += 1
    print(
        f"  graphics OK   ({total} sheets, {len(frames)} anims × {len(LAYERS)} layers)")


EXTRA_PNGS = (
    "graphics/icon.png",
    "thumbnail.png",
    "graphics/item/spider-egg.png",
)


def check_extras() -> None:
    for rel in EXTRA_PNGS:
        path = ROOT / rel
        if not path.exists():
            raise TestFail(f"missing {rel}")
        try:
            with Image.open(path) as img:
                img.load()
        except Exception as e:
            raise TestFail(f"{rel}: cannot open ({e})")
    print(f"  extras OK     ({len(EXTRA_PNGS)} required assets)")


def check_wired_anims(frames: dict[str, int]) -> None:
    src = PROTO_PATH.read_text()
    wired = set(find_rotated_calls(src))
    if not wired:
        raise TestFail(
            "no rotated(...) calls found in spider.lua — nothing is wired")
    unknown = wired - frames.keys()
    if unknown:
        raise TestFail(
            f"spider.lua wires anim(s) not declared in FRAMES: {sorted(unknown)}")
    print(f"  wiring OK     ({sorted(wired)} active in proto)")


def main() -> int:
    print(f"kbve-spider test_mod  root={ROOT}")
    check_info()

    if not PROTO_PATH.exists():
        raise TestFail(f"missing {PROTO_PATH}")
    proto_src = PROTO_PATH.read_text()
    frames = parse_frames(proto_src)
    print(f"  FRAMES OK     ({len(frames)} anims declared)")

    check_all_sheets(frames)
    check_wired_anims(frames)
    check_extras()

    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
