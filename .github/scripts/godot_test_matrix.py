#!/usr/bin/env python3
"""Which Godot projects a change touches, as a GitHub Actions matrix.

Reads the same dispatch manifest ci-godot.yml is dispatched from, so a second
Godot app is a manifest entry and nothing else. A project is picked when the
diff hits its project_path or the crate behind its gdextension.package -- the
extension is compiled into the suite's world, so a change on the Rust side can
break a GDScript test without a single .gd file moving.

Usage: godot_test_matrix.py <manifest.json> <changed-files.txt>
       ALL=1 to take every project regardless of the diff.
"""

import json
import os
import re
import sys
from pathlib import Path

NAME = re.compile(r'^\s*name\s*=\s*"([^"]+)"', re.M)


def crate_dirs() -> dict[str, str]:
    """Every workspace crate by name, as a repo-relative directory.

    Read off the manifests rather than out of `cargo metadata`: this runs on a
    checkout with no toolchain, and the answer is one line of each file.
    """
    out: dict[str, str] = {}
    for manifest in Path(".").rglob("Cargo.toml"):
        parts = manifest.parts
        if "target" in parts or "node_modules" in parts:
            continue
        try:
            text = manifest.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        # `[package]` only. A virtual workspace root has no name, and a
        # `[dependencies]` entry naming a crate is not that crate.
        head = text.split("[dependencies", 1)[0]
        found = NAME.search(head)
        if found:
            out[found.group(1)] = manifest.parent.as_posix().lstrip("./")
    return out


def touched(changed: list[str], prefix: str) -> bool:
    if not prefix:
        return False
    prefix = prefix.rstrip("/") + "/"
    return any(path.startswith(prefix) for path in changed)


def main() -> int:
    manifest_path, changed_path = sys.argv[1], sys.argv[2]
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    changed = [
        line.strip()
        for line in Path(changed_path).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    take_all = os.environ.get("ALL") == "1"
    crates = crate_dirs() if not take_all else {}

    matrix = []
    for entry in manifest.get("godot", []):
        engine = entry.get("engine", {})
        project_path = engine.get("project_path", "")
        if not project_path:
            continue
        extension = engine.get("gdextension") or {}
        package = extension.get("package", "")

        why = ""
        if take_all:
            why = "manual run"
        elif touched(changed, project_path):
            why = project_path
        elif package and touched(changed, crates.get(package, "")):
            why = "%s (%s)" % (package, crates.get(package, ""))
        if not why:
            continue

        print("picked %s: %s" %
              (entry.get("app_name", "?"), why), file=sys.stderr)
        matrix.append(
            {
                "app_name": entry.get("app_name", ""),
                "project_path": project_path,
                "godot_version": engine.get("version", ""),
                "package": package,
                "addon_path": extension.get("addon_path", ""),
                "features": ",".join(engine.get("features", []) or []),
            }
        )

    json.dump(matrix, sys.stdout, separators=(",", ":"))
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
