"""Tests for the ``report`` route (acquisition bypassed via ``inputs``)."""

from __future__ import annotations

import json

from kbve.nx.builder import BuildContext
from kbve.nx.render import parse_report
from kbve.nx.router import get

_SAMPLE_NX_REPORT = """
 NX   Report complete - copy this into the issue template

Node           : 24.18.0
OS             : linux-x64
Native Target  : x86_64-linux
pnpm           : 10.33.0
daemon         : Disabled

nx                     : 23.0.2
@nx/js                 : 23.0.2
typescript             : 5.9.3
---------------------------------------
Community plugins:
@monodon/rust          : 3.0.0
---------------------------------------
Cache Usage: 0.00 B / 14.43 GB
"""


def _report_fixture() -> dict:
    return {
        "generated_at": "2026-07-18T00:00:00Z",
        "environment": {
            "node": "24.18.0",
            "nx": "23.0.2",
            "pnpm": "10.33.0",
            "os": "linux-x64",
        },
        "nx_report": _SAMPLE_NX_REPORT,
        "loc_stats": (
            "Language   Files  Lines  Code\n"
            "TypeScript   10    500   400\n"
        ),
        "coverage": (
            "::group::✅ > nx run laser:coverage\n"
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
    js = ctx.public_dir / "nx-report.json"
    assert mdx.exists()
    assert js.exists()

    text = mdx.read_text()
    assert text.startswith("---\n")
    assert "title: NX Workspace Report" in text
    assert "template: splash" in text
    assert "import BentoShell" in text
    assert "import AstroNxReport" in text
    assert "<AstroNxReport />" in text
    assert "bento-stat" in text
    assert "<BentoProse" in text
    assert "<CardGrid>" not in text
    assert "24.18.0" in text
    assert "23.0.2" in text
    assert "10.33.0" in text
    assert "linux-x64" in text
    assert "&lt;anonymous>" in text


def test_report_build_json_matches_frozen_contract(tmp_path):
    ctx = _ctx(tmp_path, {"report_data": _report_fixture()})
    get("report").build(ctx)

    payload = json.loads((ctx.public_dir / "nx-report.json").read_text())
    assert set(payload) == {
        "generated_at",
        "environment",
        "nx_report",
        "loc_stats",
        "coverage",
    }
    assert set(payload["environment"]) == {"node", "nx", "pnpm", "os"}
    fixture = _report_fixture()
    assert payload["nx_report"] == fixture["nx_report"]
    assert payload["loc_stats"] == fixture["loc_stats"]
    assert payload["coverage"] == fixture["coverage"]


def test_report_build_coverage_none_when_empty(tmp_path):
    data = _report_fixture()
    data["coverage"] = None
    ctx = _ctx(tmp_path, {"report_data": data})
    get("report").build(ctx)

    payload = json.loads((ctx.public_dir / "nx-report.json").read_text())
    assert payload["coverage"] is None
    text = (ctx.content_root / "dashboard" / "report.mdx").read_text()
    assert "### Coverage" not in text


def test_parse_report_extracts_environment():
    env = parse_report(_SAMPLE_NX_REPORT)
    assert env["node"] == "24.18.0"
    assert env["os"] == "linux-x64"
    assert env["nx"] == "23.0.2"
    assert env["pnpm"] == "10.33.0"
