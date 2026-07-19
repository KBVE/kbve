"""Tests for the ``graph`` route (nx subprocess bypassed via ``inputs``)."""

from __future__ import annotations

import json

from kbve.nx.builder import BuildContext
from kbve.nx.router import get


def _graph_fixture() -> dict:
    return {
        "graph": {
            "nodes": {
                "web": {
                    "type": "app",
                    "data": {"root": "apps/web"},
                },
                "ui": {
                    "type": "lib",
                    "data": {"root": "libs/ui"},
                },
            },
            "dependencies": {
                "web": [
                    {"source": "web", "target": "ui", "type": "static"}
                ],
                "ui": [],
            },
        }
    }


def _ctx(tmp_path, inputs):
    content_root = tmp_path / "content" / "docs"
    public_dir = tmp_path / "public" / "data" / "nx"
    content_root.mkdir(parents=True)
    return BuildContext(
        content_root=content_root,
        public_dir=public_dir,
        timestamp="2026-07-18T00:00:00Z",
        inputs=inputs,
    )


def test_graph_needs_tags():
    assert get("graph").needs == ("node",)


def test_graph_plan_needs_work(tmp_path):
    plan = get("graph").plan(_ctx(tmp_path, {}))
    assert plan.needs_work is True


def test_graph_build_writes_mdx_and_copies_json(tmp_path):
    ctx = _ctx(tmp_path, {"graph_json": _graph_fixture()})
    result = get("graph").build(ctx)

    assert result.skipped is False
    assert result.route == "graph"

    mdx = ctx.content_root / "dashboard" / "graph.mdx"
    js = ctx.public_dir / "nx-graph.json"
    assert mdx.exists()
    assert js.exists()

    text = mdx.read_text()
    assert text.startswith("---\n")
    assert "title: NX Dependency Graph" in text
    assert "web" in text
    assert "ui" in text

    copied = json.loads(js.read_text())
    assert copied["graph"]["nodes"].keys() == {"web", "ui"}


def test_graph_build_accepts_path_input(tmp_path):
    graph_file = tmp_path / "nx-graph.json"
    graph_file.write_text(json.dumps(_graph_fixture()))
    ctx = _ctx(tmp_path, {"graph_json": str(graph_file)})
    get("graph").build(ctx)
    assert (ctx.content_root / "dashboard" / "graph.mdx").exists()
    assert (ctx.public_dir / "nx-graph.json").exists()


def test_graph_build_skips_on_bad_schema(tmp_path):
    ctx = _ctx(tmp_path, {"graph_json": {"bogus": 1}})
    result = get("graph").build(ctx)
    assert result.skipped is True
    assert not (ctx.content_root / "dashboard" / "graph.mdx").exists()


def test_graph_build_skips_on_empty_nodes(tmp_path):
    ctx = _ctx(tmp_path, {"graph_json": {"graph": {"nodes": {}, "dependencies": {}}}})
    result = get("graph").build(ctx)
    assert result.skipped is True
    assert not (ctx.public_dir / "nx-graph.json").exists()
