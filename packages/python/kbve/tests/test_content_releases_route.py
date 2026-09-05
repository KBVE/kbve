"""Tests for the ``releases`` route (``release-tools:status`` bypassed via inputs)."""

from __future__ import annotations

import json

from kbve.content.builder import BuildContext
from kbve.content.releases import aggregate
from kbve.content.router import get


def _ctx(tmp_path, inputs):
    content_root = tmp_path / "apps/kbve/astro-kbve/src/content/docs"
    public_dir = tmp_path / "apps/kbve/astro-kbve/public/data/nx"
    content_root.mkdir(parents=True)
    (tmp_path / ".moon").mkdir()
    return BuildContext(
        content_root=content_root,
        public_dir=public_dir,
        timestamp="2026-07-19T00:00:00Z",
        inputs=inputs,
    )


def _row(project, state, lanes="crate", manifest="1.0.0", released="1.0.0", since=0):
    return {
        "project": project,
        "lanes": lanes,
        "manifest": manifest,
        "released": released,
        "commitsSince": since,
        "state": state,
    }


def test_releases_needs_moon_and_tags():
    assert get("releases").needs == ("node", "moon", "tags")


def test_aggregate_counts_states_and_lanes():
    agg = aggregate(
        [
            _row("a", "tag-pending", manifest="1.1.0"),
            _row("b", "current"),
            _row("c", "never-released", lanes="npm", released=None, since=None),
        ]
    )
    assert agg["total"] == 3
    assert agg["summary"]["tag-pending"] == 1
    assert agg["summary"]["never-released"] == 1
    assert agg["waiting"] == 1
    assert agg["lanes"]["crate"] == {"total": 2, "waiting": 1}
    assert agg["lanes"]["npm"] == {"total": 1, "waiting": 0}


def test_aggregate_orders_waiting_first():
    agg = aggregate([_row("z", "current"), _row("a", "changes-unreleased", since=3)])
    assert [r["project"] for r in agg["rows"]] == ["a", "z"]


def test_aggregate_splits_multi_lane_rows():
    agg = aggregate([_row("a", "tag-pending", lanes="crate,docker")])
    assert agg["rows"][0]["lanes"] == ["crate", "docker"]
    assert agg["lanes"]["docker"]["waiting"] == 1


def test_releases_build_writes(tmp_path):
    ctx = _ctx(tmp_path, {"release_rows": [_row("unr", "current")]})
    result = get("releases").build(ctx)
    assert result.skipped is False and len(result.changed) == 2

    data = json.loads((ctx.public_dir / "nx-releases.json").read_text())
    assert data["total"] == 1
    assert data["summary"]["current"] == 1

    mdx = (ctx.content_root / "dashboard" / "releases.mdx").read_text()
    assert "template: splash" in mdx and "CardGrid" not in mdx
    assert mdx.count("<BentoProse") == mdx.count("</BentoProse>")
    assert "| unr |" in mdx


def test_releases_build_skips_when_status_fails(tmp_path, monkeypatch):
    from kbve.content import routes

    def boom(_root, timeout=0):
        raise routes.releases.StatusError("moon missing")

    monkeypatch.setattr(routes.releases, "status_rows", boom)
    ctx = _ctx(tmp_path, {})
    result = get("releases").build(ctx)
    assert result.skipped is True
    assert not (ctx.public_dir / "nx-releases.json").exists()
