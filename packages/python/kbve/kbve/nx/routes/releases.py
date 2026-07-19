"""The ``releases`` route — release radar (manifest vs registry) MDX + JSON."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from ..builder import BuildContext, BuildResult, PlanResult, repo_root_for
from ..releases import aggregate, load_manifest, resolve
from ..render import (
    build_release_payload,
    render_release_json,
    render_release_mdx,
)
from ..router import route


def _warn(msg: str) -> None:
    print("::warning::releases route: %s" % msg, file=sys.stderr)


def _acquire(ctx: BuildContext) -> dict:
    rows = ctx.inputs.get("release_rows")
    if not isinstance(rows, list):
        manifest = ctx.inputs.get("release_manifest")
        if not isinstance(manifest, dict):
            manifest = load_manifest(repo_root_for(ctx.content_root))
        rows = resolve(manifest)
    return aggregate(rows)


@route("releases", "daily", needs=())
class ReleasesRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult(
            "releases", True, "regenerate (git-diff guard drops no-ops)", []
        )

    def build(self, ctx: BuildContext) -> BuildResult:
        payload = build_release_payload(_acquire(ctx), ctx.timestamp)

        content_root = Path(ctx.content_root)
        public_dir = Path(ctx.public_dir)
        json_out = public_dir / "nx-releases.json"
        mdx_out = content_root / "dashboard" / "releases.mdx"

        if not ctx.dry_run:
            public_dir.mkdir(parents=True, exist_ok=True)
            mdx_out.parent.mkdir(parents=True, exist_ok=True)
            with open(json_out, "w") as f:
                f.write(render_release_json(payload))
            with open(mdx_out, "w") as f:
                f.write(render_release_mdx(payload, ctx.timestamp))

        repo_root = repo_root_for(content_root)
        changed = [
            os.path.relpath(mdx_out, repo_root),
            os.path.relpath(json_out, repo_root),
        ]
        return BuildResult("releases", changed, False, "generated")
