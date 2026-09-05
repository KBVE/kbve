#!/usr/bin/env python3
"""Fail when a tracked path cannot be checked out on Windows.

Windows rejects <>:"|?* in a filename, along with a trailing dot or space and
the reserved device names (CON, NUL, COM1, ...). Git does not stop a commit
containing one -- it commits fine on macOS and Linux, and then every Windows
clone of the repository dies at checkout:

    error: invalid path 'apps/.../graphify/dir/astro:components.json'
    fatal: unable to checkout working tree

That happens in actions/checkout, before any step of any job runs, so a single
such file takes out every Windows job in the repository at once and the failure
points at the job rather than the file. Six graphify chunks named after import
specifiers (`node:fs`, `virtual:starlight/user-config`) did exactly that.

The generator that emitted them now sanitises its slugs; this is the backstop
for the next generator.
"""

from __future__ import annotations

import re
import subprocess
import sys

UNSAFE = set('<>:"|?*\\')

# Reserved regardless of extension: `NUL.json` is as unusable as `NUL`.
RESERVED = {"CON", "PRN", "AUX", "NUL"} | {
    f"{stem}{i}" for stem in ("COM", "LPT") for i in range(1, 10)
}

CONTROL = re.compile(r"[\x00-\x1f]")


def problems(path: str) -> list[str]:
    found = []
    for segment in path.split("/"):
        bad = sorted(UNSAFE & set(segment))
        if bad:
            plural = "s" if len(bad) > 1 else ""
            found.append(f"illegal character{plural} {' '.join(bad)}")
        if CONTROL.search(segment):
            found.append("control character")
        if segment != segment.rstrip(". "):
            found.append("trailing dot or space")
        if segment.split(".")[0].upper() in RESERVED:
            found.append(f"reserved device name {segment.split('.')[0].upper()}")
    return found


def main() -> int:
    tracked = subprocess.run(
        ["git", "ls-files", "-z"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split("\0")

    broken = [(p, issues) for p in tracked if p for issues in [problems(p)] if issues]

    if broken:
        print(
            f"{len(broken)} tracked path(s) cannot be checked out on Windows.\n"
            "git fails the clone with `invalid path` before any job step runs, "
            "so every Windows job in the repository breaks at once.\n",
            file=sys.stderr,
        )
        for path, issues in broken:
            print(f"  {path}\n      {', '.join(sorted(set(issues)))}", file=sys.stderr)
        return 1

    print(f"{len(tracked) - 1} tracked path(s) are checkout-safe on Windows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
