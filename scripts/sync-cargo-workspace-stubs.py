#!/usr/bin/env python3
"""Mirror the root Cargo.toml [workspace.dependencies] table into every
apps/**/Cargo.workspace.toml Docker stub manifest.

Docker builds copy the stub as /app/Cargo.toml, so any workspace-inherited
dependency (`dep.workspace = true`) fails with "`workspace.dependencies` was
not defined" unless the stub carries the same table.

Usage:
    python3 scripts/sync-cargo-workspace-stubs.py           # rewrite stubs
    python3 scripts/sync-cargo-workspace-stubs.py --check   # CI drift check
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SECTION = "[workspace.dependencies]"


def extract_section(text: str) -> str:
    lines = text.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == SECTION)
    except StopIteration:
        raise SystemExit(f"root Cargo.toml is missing {SECTION}")
    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("["):
            end = i
            break
    body = "\n".join(lines[start:end]).rstrip()
    return body + "\n"


def strip_section(text: str) -> str:
    lines = text.splitlines()
    out, i = [], 0
    while i < len(lines):
        if lines[i].strip() == SECTION:
            i += 1
            while i < len(lines) and not lines[i].startswith("["):
                i += 1
            while out and not out[-1].strip():
                out.pop()
            if out:
                out.append("")
            continue
        out.append(lines[i])
        i += 1
    return "\n".join(out).rstrip() + "\n"


def render(stub_text: str, section: str) -> str:
    base = strip_section(stub_text)
    lines = base.splitlines()
    anchor = next((i for i, l in enumerate(lines) if l.startswith("[profile")), len(lines))
    head = "\n".join(lines[:anchor]).rstrip()
    tail = "\n".join(lines[anchor:]).rstrip()
    parts = [head, section.rstrip()]
    if tail:
        parts.append(tail)
    return "\n\n".join(p for p in parts if p) + "\n"


def main() -> int:
    check = "--check" in sys.argv
    section = extract_section((ROOT / "Cargo.toml").read_text())
    stubs = sorted((ROOT / "apps").rglob("Cargo.workspace.toml"))
    if not stubs:
        raise SystemExit("no Cargo.workspace.toml stubs found under apps/")

    drifted = []
    for stub in stubs:
        current = stub.read_text()
        desired = render(current, section)
        if current == desired:
            continue
        drifted.append(stub.relative_to(ROOT))
        if not check:
            stub.write_text(desired)

    if check and drifted:
        print("Cargo.workspace.toml stubs out of sync with root [workspace.dependencies]:")
        for path in drifted:
            print(f"  {path}")
        print("Run: python3 scripts/sync-cargo-workspace-stubs.py")
        return 1

    print(f"{'drift' if check else 'synced'}: {len(drifted)}/{len(stubs)} stubs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
