"""The ``graph`` route — Nx dependency-graph dashboard (MDX + raw JSON).

Mirrors the ``ci-dashboard`` report job: run ``pnpm nx graph`` to acquire the
project graph JSON, parse via :func:`parse_graph`, and render the Starlight
MDX with output parity to ``scripts/nx-graph-to-mdx.py``. The raw graph JSON
is copied verbatim into the Astro public data dir.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from ..builder import BuildContext, BuildResult, PlanResult, repo_root_for
from ..graph import parse_graph
from ..render import render_graph_mdx
from ..router import route


def _run_nx_graph(repo_root: Path, out_file: Path) -> None:
    """Invoke ``pnpm nx graph`` writing the project graph to ``out_file``."""
    out_file.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["pnpm", "nx", "graph", "--file=%s" % out_file, "--open=false"],
        cwd=str(repo_root),
        check=True,
    )


def _acquire(ctx: BuildContext) -> dict:
    src = ctx.inputs.get("graph_json")
    if src is not None:
        if isinstance(src, dict):
            return src
        return json.loads(Path(src).read_text())

    repo_root = repo_root_for(ctx.content_root)
    workdir = Path(ctx.workdir) if ctx.workdir else repo_root
    graph_file = workdir / "nx-graph.json"
    _run_nx_graph(repo_root, graph_file)
    return json.loads(graph_file.read_text())


@route("graph", "daily", needs=("node",))
class GraphRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult(
            "graph", True, "regenerate (git-diff guard drops no-ops)", []
        )

    def build(self, ctx: BuildContext) -> BuildResult:
        raw = _acquire(ctx)
        graph = parse_graph(raw)

        public_dir = Path(ctx.public_dir)
        content_root = Path(ctx.content_root)
        mdx_out = content_root / "dashboard" / "graph.mdx"
        json_out = public_dir / "nx-graph.json"

        if not ctx.dry_run:
            mdx_out.parent.mkdir(parents=True, exist_ok=True)
            public_dir.mkdir(parents=True, exist_ok=True)
            with open(mdx_out, "w") as f:
                f.write(render_graph_mdx(graph, ctx.timestamp))
            with open(json_out, "w") as f:
                json.dump(raw, f, indent=2)

        repo_root = repo_root_for(content_root)
        changed = [
            os.path.relpath(mdx_out, repo_root),
            os.path.relpath(json_out, repo_root),
        ]
        return BuildResult("graph", changed, False, "generated")
