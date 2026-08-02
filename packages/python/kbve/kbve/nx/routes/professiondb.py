"""The ``professiondb`` route — weekly integrity audit for the unified DB.

Runs ``nx run astro-kbve:sync:professiondb`` (which regenerates the professiondb
data + runtime view and runs the hard-fail xref validator). A validator failure
raises out of ``build`` so the weekly job fails; regen drift is reported as
changed files and auto-PR'd like every other route.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from ..builder import BuildContext, BuildResult, PlanResult, repo_root_for
from ..router import route

_GEN_TIMEOUT = 600
_DRIFT_PATHS = (
    "packages/data/codegen/generated/professiondb-data.json",
    "packages/data/codegen/generated/professiondb-data.binpb",
    "packages/data/codegen/generated/professiondb-runtime.json",
    "packages/data/codegen/generated/xref-index.json",
    "apps/rareicon/unity-rareicon/Assets/StreamingAssets/professiondb-runtime.json",
)


class ProfessiondbValidationError(Exception):
    """Raised when the professiondb xref validator hard-fails."""


def _run(cmd: list[str], cwd: Path, timeout: int = _GEN_TIMEOUT) -> str:
    proc = subprocess.run(
        cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout
    )
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout).strip()[-600:]
        raise ProfessiondbValidationError(
            "%s failed (exit %d): %s" % (" ".join(cmd), proc.returncode, tail)
        )
    return proc.stdout


def _changed(repo_root: Path) -> list[str]:
    out = subprocess.run(
        ["git", "diff", "--name-only", "--", *_DRIFT_PATHS],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    ).stdout
    return [f for f in out.splitlines() if f]


@route("professiondb", "weekly", needs=("node",))
class ProfessiondbRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult(
            "professiondb",
            True,
            "revalidate professiondb + regen (git-diff guard drops no-ops)",
            [],
        )

    def build(self, ctx: BuildContext) -> BuildResult:
        repo_root = repo_root_for(ctx.content_root)
        _run(
            ["npx", "nx", "run", "astro-kbve:sync:professiondb", "--skip-nx-cache"],
            repo_root,
        )
        return BuildResult("professiondb", _changed(repo_root), False, "validated")
