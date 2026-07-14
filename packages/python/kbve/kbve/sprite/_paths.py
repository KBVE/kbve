"""Locate the monorepo root so relocated bake/codegen tools still hit the arpg tree.

The original scripts lived in apps/agones/arpg/web/scripts and anchored their I/O
off `__file__` (../../../.. hops). Now that they live in the kbve package, that math
no longer points at the repo, so we walk up from the CWD to the repo root instead.
"""
import os

ROOT_MARKERS = (".git", "nx.json")


def repo_root(start=None):
    """Walk up from `start` (default CWD) to the dir holding a repo-root marker."""
    d = os.path.abspath(start or os.getcwd())
    while True:
        if any(os.path.exists(os.path.join(d, m)) for m in ROOT_MARKERS):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            raise SystemExit(
                "repo root not found above CWD (need a .git or nx.json ancestor)"
            )
        d = parent


def arpg_web(start=None):
    """apps/agones/arpg/web inside the repo."""
    return os.path.join(repo_root(start), "apps", "agones", "arpg", "web")
