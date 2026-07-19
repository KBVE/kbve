"""Dependency freshness — pnpm + cargo drift for the KBVE monorepo.

``pnpm outdated --format json`` yields the npm drift (current/wanted/latest);
``cargo update --dry-run`` surfaces the in-range crate updates. Both toolchains
are already installed by the builder's ``node``/``rust`` capability steps, so
the route adds no workflow edits. Fetching is tolerant — a failing feed
degrades to empty — and the pure :func:`aggregate` is unit-tested via the
route's ``inputs`` seam.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

_TIMEOUT = 600
_CARGO_LINE = re.compile(
    r"^\s*(?:Updating|Upgrading)\s+(\S+)\s+v(\S+)\s+->\s+v(\S+)", re.M)


def _major(version: str) -> str:
    return (version or "").lstrip("^~=v").split(".")[0]


def fetch_node(repo_root: Path) -> list[dict]:
    """Parse ``pnpm outdated --format json`` (exit 1 when drift exists)."""
    try:
        proc = subprocess.run(
            ["pnpm", "outdated", "--format", "json"],
            cwd=str(repo_root), capture_output=True, text=True,
            timeout=_TIMEOUT,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    raw = proc.stdout.strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    items = []
    for name, info in (data or {}).items():
        if not isinstance(info, dict):
            continue
        current = str(info.get("current", ""))
        latest = str(info.get("latest", ""))
        items.append({
            "name": name,
            "current": current,
            "wanted": str(info.get("wanted", "")),
            "latest": latest,
            "type": info.get("dependencyType", "dependencies"),
            "major": _major(current) != _major(latest),
        })
    items.sort(key=lambda d: d["name"])
    return items


def fetch_rust(repo_root: Path) -> list[dict]:
    """Parse ``cargo update --dry-run`` update lines into crate drift."""
    try:
        proc = subprocess.run(
            ["cargo", "update", "--dry-run"],
            cwd=str(repo_root), capture_output=True, text=True,
            timeout=_TIMEOUT,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    text = proc.stdout + proc.stderr
    items = []
    for name, cur, new in _CARGO_LINE.findall(text):
        items.append({
            "name": name,
            "current": cur,
            "latest": new,
            "major": _major(cur) != _major(new),
        })
    items.sort(key=lambda d: d["name"])
    return items


def aggregate(node: list[dict], rust: list[dict]) -> dict:
    """Roll node + rust drift into per-ecosystem counts."""
    node_major = sum(1 for d in node if d.get("major"))
    rust_major = sum(1 for d in rust if d.get("major"))
    return {
        "node": {"count": len(node), "major": node_major, "items": node},
        "rust": {"count": len(rust), "major": rust_major, "items": rust},
        "total": len(node) + len(rust),
        "major_total": node_major + rust_major,
    }
