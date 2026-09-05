"""The ``releases`` route — release radar (manifest vs git tag) MDX + JSON."""

from __future__ import annotations

import sys

from ..builder import BuildContext, BuildResult, PlanResult, emit_page, repo_root_for
from ..releases import StatusError, aggregate, status_rows
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
        rows = status_rows(repo_root_for(ctx.content_root))
    return aggregate(rows)


@route("releases", "daily", needs=("node", "moon", "tags"))
class ReleasesRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult("releases", True, "regenerate (git-diff guard drops no-ops)", [])

    def build(self, ctx: BuildContext) -> BuildResult:
        try:
            agg = _acquire(ctx)
        except StatusError as exc:
            _warn("%s — skipping releases regeneration" % exc)
            return BuildResult("releases", [], True, "acquire failed: %s" % exc)

        payload = build_release_payload(agg, ctx.timestamp)

        return emit_page(
            ctx,
            "releases",
            page="releases.mdx",
            mdx_text=render_release_mdx(payload, ctx.timestamp),
            json_name="nx-releases.json",
            json_text=render_release_json(payload),
        )
