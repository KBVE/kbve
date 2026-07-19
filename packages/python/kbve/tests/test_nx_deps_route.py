"""Tests for the ``deps`` route (pnpm/cargo bypassed via inputs)."""

from __future__ import annotations

import json

from kbve.nx.builder import BuildContext
from kbve.nx.deps_fresh import aggregate
from kbve.nx.router import get


def _ctx(tmp_path, inputs):
    content_root = tmp_path / "apps/kbve/astro-kbve/src/content/docs"
    public_dir = tmp_path / "apps/kbve/astro-kbve/public/data/nx"
    content_root.mkdir(parents=True)
    (tmp_path / "nx.json").write_text("{}")
    return BuildContext(
        content_root=content_root, public_dir=public_dir,
        timestamp="2026-07-19T00:00:00Z", inputs=inputs,
    )


def test_deps_needs_tags():
    assert get("deps").needs == ("node", "rust")


def test_aggregate_counts_majors():
    node = [
        {"name": "react", "current": "18.0.0", "wanted": "18.2.0",
         "latest": "19.0.0", "major": True},
        {"name": "vite", "current": "5.1.0", "wanted": "5.2.0",
         "latest": "5.2.0", "major": False},
    ]
    rust = [{"name": "serde", "current": "1.0.0", "latest": "1.0.9",
             "major": False}]
    agg = aggregate(node, rust)
    assert agg["total"] == 3
    assert agg["major_total"] == 1
    assert agg["node"]["count"] == 2 and agg["node"]["major"] == 1
    assert agg["rust"]["count"] == 1


def test_deps_build_writes(tmp_path):
    ctx = _ctx(tmp_path, {
        "deps_node": [{"name": "react", "current": "18.0.0",
                       "wanted": "18.2.0", "latest": "19.0.0",
                       "major": True}],
        "deps_rust": [],
    })
    result = get("deps").build(ctx)
    assert result.skipped is False and len(result.changed) == 2

    data = json.loads((ctx.public_dir / "nx-deps.json").read_text())
    assert data["total"] == 1 and data["major_total"] == 1

    mdx = (ctx.content_root / "dashboard" / "deps.mdx").read_text()
    assert "template: splash" in mdx
    assert "CardGrid" not in mdx
    assert mdx.count("<BentoProse") == mdx.count("</BentoProse>")


def test_deps_build_fresh(tmp_path):
    ctx = _ctx(tmp_path, {"deps_node": [], "deps_rust": []})
    get("deps").build(ctx)
    data = json.loads((ctx.public_dir / "nx-deps.json").read_text())
    assert data["total"] == 0
