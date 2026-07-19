"""The ``deps`` route — dependency freshness (npm + cargo) MDX + JSON."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from ..builder import BuildContext, BuildResult, PlanResult, repo_root_for
from ..deps_fresh import aggregate, fetch_node, fetch_rust
from ..render import build_deps_payload, render_deps_json, render_deps_mdx
from ..router import route


def _warn(msg: str) -> None:
    print("::warning::deps route: %s" % msg, file=sys.stderr)


def _acquire(ctx: BuildContext) -> dict:
    repo_root = repo_root_for(ctx.content_root)
    node = ctx.inputs.get("deps_node")
    rust = ctx.inputs.get("deps_rust")
    if not isinstance(node, list):
        node = fetch_node(repo_root)
    if not isinstance(rust, list):
        rust = fetch_rust(repo_root)
    return aggregate(node, rust)


@route("deps", "daily", needs=("node", "rust"))
class DepsRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult(
            "deps", True, "regenerate (git-diff guard drops no-ops)", []
        )

    def build(self, ctx: BuildContext) -> BuildResult:
        payload = build_deps_payload(_acquire(ctx), ctx.timestamp)

        content_root = Path(ctx.content_root)
        public_dir = Path(ctx.public_dir)
        json_out = public_dir / "nx-deps.json"
        mdx_out = content_root / "dashboard" / "deps.mdx"

        if not ctx.dry_run:
            public_dir.mkdir(parents=True, exist_ok=True)
            mdx_out.parent.mkdir(parents=True, exist_ok=True)
            with open(json_out, "w") as f:
                f.write(render_deps_json(payload))
            with open(mdx_out, "w") as f:
                f.write(render_deps_mdx(payload, ctx.timestamp))

        repo_root = repo_root_for(content_root)
        changed = [
            os.path.relpath(mdx_out, repo_root),
            os.path.relpath(json_out, repo_root),
        ]
        return BuildResult("deps", changed, False, "generated")
