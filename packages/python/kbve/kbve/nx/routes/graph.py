"""The ``graph`` route — dependency-graph dashboard (MDX + raw JSON).

Acquires the project graph from moon, parses it via :func:`parse_graph`, and
renders the Starlight MDX. The raw graph JSON is written to the Astro public
data dir, where the ``/graph/`` hub and the home dashboard read it.

The payload keeps the shape Nx produced -- ``{graph: {nodes, dependencies}}``
with ``app``/``lib``/``e2e`` node types -- because the site, the MDX renderer
and the published ``/data/nx/nx-graph.json`` URL all read it. Translating at
acquisition keeps that contract while the graph underneath it changed.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from ..builder import BuildContext, BuildResult, PlanResult, repo_root_for
from ..graph import parse_graph
from ..render import render_graph_mdx
from ..router import route

_GRAPH_TIMEOUT = 300


class GraphAcquireError(Exception):
    """Raised when the project graph cannot be produced or parsed."""


def _warn(msg: str) -> None:
    print("::warning::graph route: %s" % msg, file=sys.stderr)


def _node_type(project: dict) -> str:
    """The node type the dashboard colours by.

    ``e2e`` is its own category rather than a layer, so it is read off the id
    the way the Nx tags used to say it.
    """
    if project["id"].endswith("-e2e"):
        return "e2e"
    return "app" if project.get("layer") == "application" else "lib"


def _from_moon(payload: dict) -> dict:
    """Translate ``moon query projects`` into the graph shape the site reads."""
    nodes = {}
    dependencies = {}
    for project in payload.get("projects", []):
        pid = project["id"]
        nodes[pid] = {
            "name": pid,
            "type": _node_type(project),
            "data": {
                "root": project.get("source", ""),
                "name": pid,
                "projectType": project.get("layer", ""),
                "tags": project.get("config", {}).get("tags", []),
            },
        }
        dependencies[pid] = [
            {"source": pid, "target": dep["id"], "type": "static"} for dep in project.get("dependencies", [])
        ]
    return {"graph": {"nodes": nodes, "dependencies": dependencies}}


def _run_moon_query(repo_root: Path) -> dict:
    """Invoke ``moon query projects`` and return the parsed payload."""
    out = subprocess.run(
        ["moon", "query", "projects"],
        cwd=str(repo_root),
        check=True,
        capture_output=True,
        text=True,
        timeout=_GRAPH_TIMEOUT,
    ).stdout
    return json.loads(out)


def _validate_graph(raw) -> dict:
    """Ensure the payload has the expected graph shape before parsing."""
    if not isinstance(raw, dict) or "nodes" not in (raw.get("graph") or {}):
        raise GraphAcquireError("unexpected graph schema (missing graph.nodes)")
    if not raw["graph"]["nodes"]:
        raise GraphAcquireError("graph has zero nodes")
    return raw


def _acquire(ctx: BuildContext) -> dict:
    src = ctx.inputs.get("graph_json")
    if src is not None:
        raw = src if isinstance(src, dict) else json.loads(Path(src).read_text())
        return _validate_graph(raw)

    repo_root = repo_root_for(ctx.content_root)
    try:
        raw = _from_moon(_run_moon_query(repo_root))
    except (
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
        OSError,
        ValueError,
        KeyError,
        json.JSONDecodeError,
    ) as exc:
        raise GraphAcquireError("graph acquisition failed (%s)" % exc) from exc
    return _validate_graph(raw)


@route("graph", "daily", needs=("moon",))
class GraphRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult("graph", True, "regenerate (git-diff guard drops no-ops)", [])

    def build(self, ctx: BuildContext) -> BuildResult:
        try:
            raw = _acquire(ctx)
        except GraphAcquireError as exc:
            _warn("%s — skipping graph regeneration" % exc)
            return BuildResult("graph", [], True, "acquire failed: %s" % exc)

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
