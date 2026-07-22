"""The ``graphify`` route — rebuild the tiered semantic knowledge graph.

Re-extracts code symbols and precomputes the directory→file→symbol LOD chunks
consumed by the dashboard Graph Explorer (and derived by the
``/api/graphify/monorepo.json`` endpoint). Delegates to the
``graphify-wrapper:build-tiered`` nx target, which pins networkx/numpy/scipy so
the force layout is deterministic — the graph moves only when code changes, not
when a dependency floats.

Registered on the ``weekly`` cadence: a monorepo-wide symbol re-extraction is
too heavy for nightly, and the layout changes slowly. The first weekly run may
emit a one-time coordinate-shift PR if today's committed graph was generated
with different networkx/numpy/scipy versions than the pinned set; it is stable
after that.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from ..builder import BuildContext, BuildResult, PlanResult, repo_root_for
from ..router import route

_BUILD_TIMEOUT = 1800

_DEFAULT_CMD = ["pnpm", "nx", "run", "graphify-wrapper:build-tiered"]


def _warn(msg: str) -> None:
    print("::warning::graphify route: %s" % msg, file=sys.stderr)


@route("graphify", "weekly", needs=("node", "graphify"))
class GraphifyRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult(
            "graphify",
            True,
            "rebuild tiered graph (git-diff guard drops no-ops)",
            [],
        )

    def build(self, ctx: BuildContext) -> BuildResult:
        repo_root = repo_root_for(ctx.content_root)
        out_dir = repo_root / "apps" / "kbve" / "astro-kbve" / "public" / "graphify"
        cmd = ctx.inputs.get("build_cmd") or _DEFAULT_CMD

        if not ctx.dry_run:
            try:
                subprocess.run(
                    cmd,
                    cwd=str(repo_root),
                    check=True,
                    timeout=_BUILD_TIMEOUT,
                )
            except (
                subprocess.CalledProcessError,
                subprocess.TimeoutExpired,
                OSError,
            ) as exc:
                _warn("tiered rebuild failed (%s) — skipping" % exc)
                return BuildResult("graphify", [], True, "build failed: %s" % exc)

        changed = [os.path.relpath(out_dir, repo_root)]
        return BuildResult("graphify", changed, False, "rebuilt tiered graph")
