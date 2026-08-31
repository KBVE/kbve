"""Tests for the ``report`` route (acquisition bypassed via ``inputs``)."""

from __future__ import annotations

import json

from kbve.nx.builder import BuildContext
from kbve.nx.router import get


def _report_fixture() -> dict:
    return {
        "generated_at": "2026-07-18T00:00:00Z",
        "toolchain": [
            {"name": "node", "version": "24.10.0"},
            {"name": "pnpm", "version": "11.15.0"},
            {"name": "moon", "version": "2.5.3"},
            {"name": "rust", "version": "1.98.0"},
            {"name": "os", "version": "Linux 6.8.0 x86_64"},
        ],
        "workspace": {
            "projects": 156,
            "tasks": 982,
            "by_language": {"typescript": 85, "rust": 60},
        },
        "loc_stats": ("Language   Files  Lines  Code\nTypeScript   10    500   400\n"),
        "coverage": (
            "::group::✅ > laser:coverage\n"
            "All files | 75.46 | 57.22 | 75.07 | 76.66 |\n"
            "new Promise (<anonymous>)\n"
            "::endgroup::\n"
        ),
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


def test_report_needs_tags():
    assert get("report").needs == ("node",)


def test_report_plan_needs_work(tmp_path):
    plan = get("report").plan(_ctx(tmp_path, {}))
    assert plan.needs_work is True


def test_report_build_writes_mdx_and_json(tmp_path):
    ctx = _ctx(tmp_path, {"report_data": _report_fixture()})
    result = get("report").build(ctx)

    assert result.skipped is False
    assert result.route == "report"

    mdx = ctx.content_root / "dashboard" / "report.mdx"
    js = ctx.public_dir / "report.json"
    assert mdx.exists()
    assert js.exists()

    text = mdx.read_text()
    assert text.startswith("---\n")
    assert "title: Workspace Report" in text
    assert "template: splash" in text
    assert "import BentoShell" in text
    assert "import AstroWorkspaceReport" in text
    assert "<AstroWorkspaceReport />" in text
    assert "bento-stat" in text
    assert "<BentoProse" in text
    assert "<CardGrid>" not in text
    # The four stat tiles, and the counts in the lede.
    assert "24.10.0" in text
    assert "2.5.3" in text
    assert "11.15.0" in text
    assert "156 projects" in text
    assert "982 tasks" in text
    # A `<` inside coverage output would otherwise open a JSX tag.
    assert "&lt;anonymous>" in text


def test_report_build_json_matches_frozen_contract(tmp_path):
    ctx = _ctx(tmp_path, {"report_data": _report_fixture()})
    get("report").build(ctx)

    payload = json.loads((ctx.public_dir / "report.json").read_text())
    assert set(payload) == {
        "generated_at",
        "toolchain",
        "workspace",
        "loc_stats",
        "coverage",
    }
    assert set(payload["workspace"]) == {"projects", "tasks", "by_language"}
    fixture = _report_fixture()
    assert payload["toolchain"] == fixture["toolchain"]
    assert payload["loc_stats"] == fixture["loc_stats"]
    assert payload["coverage"] == fixture["coverage"]


def test_report_build_coverage_none_when_empty(tmp_path):
    data = _report_fixture()
    data["coverage"] = None
    ctx = _ctx(tmp_path, {"report_data": data})
    get("report").build(ctx)

    payload = json.loads((ctx.public_dir / "report.json").read_text())
    assert payload["coverage"] is None
    text = (ctx.content_root / "dashboard" / "report.mdx").read_text()
    assert "### Coverage" not in text


def test_toolchain_read_from_prototools(tmp_path):
    """The versions come from .prototools, not from this machine's PATH."""
    from kbve.nx.routes.report import _acquire_toolchain

    (tmp_path / ".prototools").write_text('# a comment\nnode = "24.10.0"\nmoon = "2.5.3"\n\n[plugins]\n')
    entries = {e["name"]: e["version"] for e in _acquire_toolchain(tmp_path)}
    assert entries["node"] == "24.10.0"
    assert entries["moon"] == "2.5.3"
