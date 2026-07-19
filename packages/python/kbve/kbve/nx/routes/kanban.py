"""The ``kanban`` route — KBVE Projects v2 board snapshot (MDX + raw JSON).

Mirrors the ``ci-dashboard`` kanban job: page the org project over GraphQL
(``UNITY_PAT`` token), bucket items into the nine board columns, then render
the Bento MDX plus the ``nx-kanban.json`` contract consumed by the interactive
dashboard island and runtime fetch. The token is read from the environment and
a missing/empty token degrades to a graceful skip rather than a hard failure.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from ..builder import BuildContext, BuildResult, PlanResult, repo_root_for
from ..kanban_board import bucket, fetch_items
from ..render import build_kanban_payload, render_kanban_json, render_kanban_mdx
from ..router import route

_FETCH_TIMEOUT = 30.0


def _warn(msg: str) -> None:
    print("::warning::kanban route: %s" % msg, file=sys.stderr)


def _acquire(ctx: BuildContext) -> dict | None:
    seam = ctx.inputs.get("kanban_board")
    if isinstance(seam, dict):
        project = seam.get("project", {})
        items = seam.get("items", [])
    else:
        token = os.environ.get("UNITY_PAT", "").strip()
        if not token:
            _warn("UNITY_PAT not set — skipping kanban sync")
            return None
        try:
            fetched = fetch_items(token, timeout=_FETCH_TIMEOUT)
        except Exception as exc:  # noqa: BLE001 — degrade, never hard-fail
            _warn("board fetch failed (%s)" % exc)
            return None
        project = {"title": fetched["title"], "url": fetched["url"]}
        items = fetched["items"]

    columns, summary = bucket(items)
    project = {**project, "total_items": len(items)}
    return build_kanban_payload(project, columns, summary, ctx.timestamp)


@route("kanban", "daily", needs=("token",))
class KanbanRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult(
            "kanban", True, "regenerate (git-diff guard drops no-ops)", []
        )

    def build(self, ctx: BuildContext) -> BuildResult:
        payload = _acquire(ctx)
        if payload is None:
            return BuildResult("kanban", [], True, "acquire failed")

        content_root = Path(ctx.content_root)
        public_dir = Path(ctx.public_dir)
        src_data = content_root.parent.parent / "data"
        json_public = public_dir / "nx-kanban.json"
        json_src = src_data / "nx-kanban.json"
        mdx_out = content_root / "dashboard" / "kanban-data.mdx"

        if not ctx.dry_run:
            public_dir.mkdir(parents=True, exist_ok=True)
            src_data.mkdir(parents=True, exist_ok=True)
            mdx_out.parent.mkdir(parents=True, exist_ok=True)
            json_text = render_kanban_json(payload)
            with open(json_public, "w") as f:
                f.write(json_text)
            with open(json_src, "w") as f:
                f.write(json_text)
            with open(mdx_out, "w") as f:
                f.write(render_kanban_mdx(payload, ctx.timestamp))

        repo_root = repo_root_for(content_root)
        changed = [
            os.path.relpath(mdx_out, repo_root),
            os.path.relpath(json_src, repo_root),
            os.path.relpath(json_public, repo_root),
        ]
        return BuildResult("kanban", changed, False, "generated")
