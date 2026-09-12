#!/usr/bin/env python3
"""Fail when a tracked binary under a game's LFS prefix has no LFS filter.

The `.gitattributes` rules name product directories literally, and the repo
renames product directories: `apps/rareicon/unreal` becomes
`apps/rareicon/unreal-rareicon`, and every `.uasset` rule pinned to the old
name stops matching. Nothing announces that. The rename commit is green, the
next art commit writes real `.umap` bytes into plain git on GitHub, and the
only fix left is a history rewrite.

The check reads `tools/lfs/remotes.tsv` for what each game owns, then asks
`git check-attr` what every tracked binary under those prefixes actually
resolves to. A path that is not `filter=lfs` and not in the baseline fails.

The baseline is the set of such paths as of the day this landed -- vendored
NuGet DLLs, tauri app icons, playwright screenshots, plus real gaps worth
their own migration (see `lfs-coverage-baseline.txt`). It is a burn-down
list, not a permanent exemption: an entry that stops matching also fails, so
the file cannot quietly outlive the paths it covers.

    python3 tools/guards/check-lfs-coverage.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REMOTES = Path("tools/lfs/remotes.tsv")
BASELINE = Path("tools/guards/lfs-coverage-baseline.txt")

EXTS = (
    ".uasset", ".umap", ".fbx", ".obj", ".blend", ".psd", ".png", ".jpg",
    ".jpeg", ".tga", ".exr", ".hdr", ".r16", ".glb", ".gltf", ".vrm", ".vrma",
    ".bin", ".ktx2", ".wav", ".mp3", ".ogg", ".flac", ".ttf", ".otf", ".webp",
    ".dll", ".dylib", ".so", ".a", ".bundle", ".wasm",
)


def read_list(path: Path) -> list[str]:
    if not path.exists():
        return []
    return [
        line.strip()
        for line in path.read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]


def prefixes() -> list[tuple[str, str]]:
    out = []
    for line in read_list(REMOTES):
        game, _url, prefix = line.split("\t")
        out.append((game, prefix.rstrip("/")))
    return out


def tracked_binaries() -> list[str]:
    raw = subprocess.run(
        ["git", "ls-files", "-z"], capture_output=True, text=True, check=True
    ).stdout
    return [p for p in raw.split("\0") if p.lower().endswith(EXTS)]


def attr_filters(paths: list[str]) -> dict[str, str]:
    if not paths:
        return {}
    result = subprocess.run(
        ["git", "check-attr", "--stdin", "-z", "filter"],
        input="\0".join(paths),
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    fields = result.split("\0")
    return {fields[i]: fields[i + 2] for i in range(0, len(fields) - 2, 3)}


def owning_game(path: str, games: list[tuple[str, str]]) -> str | None:
    for game, prefix in games:
        if path == prefix or path.startswith(prefix + "/"):
            return game
    return None


def main() -> int:
    games = prefixes()
    attrs = attr_filters(tracked_binaries())
    baseline = set(read_list(BASELINE))

    uncovered = {
        path
        for path, value in attrs.items()
        if value != "lfs" and owning_game(path, games)
    }

    if "--write" in sys.argv:
        header = BASELINE.read_text().split("\n\n", 1)[0] if BASELINE.exists() else ""
        body = "\n".join(sorted(uncovered))
        BASELINE.write_text(f"{header}\n\n{body}\n" if header else f"{body}\n")
        print(f"wrote {len(uncovered)} paths to {BASELINE}")
        return 0

    new = sorted(uncovered - baseline)
    stale = sorted(baseline - uncovered)

    if new:
        print(
            f"{len(new)} tracked binaries under a game LFS prefix resolve to no "
            "LFS filter:\n",
            file=sys.stderr,
        )
        for path in new:
            print(f"  {path}  ({owning_game(path, games)})", file=sys.stderr)
        print(
            "\nThese would commit as plain git blobs on GitHub. Add a matching "
            f"rule to .gitattributes, or append them to {BASELINE} with a "
            "reason if they are meant to stay plain.",
            file=sys.stderr,
        )

    if stale:
        print(
            f"\n{len(stale)} baseline entries no longer apply -- the path is gone "
            f"or now covered. Delete them from {BASELINE}:\n",
            file=sys.stderr,
        )
        for path in stale:
            print(f"  {path}", file=sys.stderr)

    if new or stale:
        return 1

    print(f"LFS coverage OK ({len(attrs)} binaries, {len(baseline)} baselined)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
