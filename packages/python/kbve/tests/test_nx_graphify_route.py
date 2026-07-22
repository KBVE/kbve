"""Tests for the ``graphify`` route (tiered-graph rebuild).

The rebuild subprocess is bypassed via ``inputs["build_cmd"]`` so the test
never needs the ``graphify`` CLI or the pnpm/nx toolchain.
"""

from __future__ import annotations

from pathlib import Path

from kbve.nx.builder import BuildContext, repo_root_for
from kbve.nx.router import get


def _ctx(tmp_path, inputs):
    content_root = tmp_path / "content" / "docs"
    content_root.mkdir(parents=True)
    return BuildContext(
        content_root=content_root,
        timestamp="2026-07-22T00:00:00Z",
        inputs=inputs,
    )


def _out_dir(ctx) -> Path:
    repo_root = repo_root_for(ctx.content_root)
    return repo_root / "apps" / "kbve" / "astro-kbve" / "public" / "graphify"


def test_graphify_needs_tags():
    assert get("graphify").needs == ("node", "graphify")


def test_graphify_plan_needs_work(tmp_path):
    plan = get("graphify").plan(_ctx(tmp_path, {}))
    assert plan.needs_work is True


def test_graphify_build_reports_output_on_success(tmp_path):
    ctx = _ctx(tmp_path, {})
    out_dir = _out_dir(ctx)
    ctx.inputs["build_cmd"] = [
        "bash",
        "-c",
        'mkdir -p "%s" && printf "{}" > "%s/overview.json"'
        % (out_dir, out_dir),
    ]

    result = get("graphify").build(ctx)

    assert result.skipped is False
    assert result.route == "graphify"
    assert (out_dir / "overview.json").exists()
    assert any("public/graphify" in c for c in result.changed)


def test_graphify_build_skips_gracefully_on_failure(tmp_path):
    ctx = _ctx(tmp_path, {"build_cmd": ["false"]})

    result = get("graphify").build(ctx)

    assert result.skipped is True
    assert result.changed == []


def test_graphify_build_dry_run_does_not_invoke(tmp_path):
    ctx = _ctx(tmp_path, {"build_cmd": ["false"]})
    ctx.dry_run = True

    result = get("graphify").build(ctx)

    assert result.skipped is False
