"""Tests for the ``ci-health`` route (Actions fetch bypassed via inputs)."""

from __future__ import annotations

import json

from kbve.nx.builder import BuildContext
from kbve.nx.ci_health import aggregate, since_date
from kbve.nx.router import get


def _ctx(tmp_path, inputs):
    content_root = tmp_path / "apps/kbve/astro-kbve/src/content/docs"
    public_dir = tmp_path / "apps/kbve/astro-kbve/public/data/nx"
    content_root.mkdir(parents=True)
    (tmp_path / "nx.json").write_text("{}")
    return BuildContext(
        content_root=content_root,
        public_dir=public_dir,
        timestamp="2026-07-19T12:00:00Z",
        inputs=inputs,
    )


def _run(name, concl, start, end, attempt=1, branch="dev", event="push"):
    return {
        "name": name,
        "conclusion": concl,
        "run_attempt": attempt,
        "run_started_at": start,
        "updated_at": end,
        "head_branch": branch,
        "event": event,
        "html_url": "https://github.com/KBVE/kbve/actions/runs/1",
    }


def test_ci_health_needs_tags():
    assert get("ci-health").needs == ("token",)


def test_ci_health_plan_needs_work(tmp_path):
    assert get("ci-health").plan(_ctx(tmp_path, {})).needs_work is True


def test_ci_health_skips_without_token(tmp_path, monkeypatch):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    result = get("ci-health").build(_ctx(tmp_path, {}))
    assert result.skipped is True


def test_since_date_offsets_window():
    assert since_date("2026-07-19T12:00:00Z", 7) == "2026-07-12"


def test_aggregate_rates_and_flaky():
    runs = [
        _run("CI", "success", "2026-07-19T10:00:00Z", "2026-07-19T10:05:00Z"),
        _run("CI", "failure", "2026-07-19T09:00:00Z", "2026-07-19T09:04:00Z"),
        _run("CI", "success", "2026-07-18T09:00:00Z", "2026-07-18T09:02:00Z",
             attempt=2),
        _run("Deploy", "cancelled", "2026-07-15T09:00:00Z",
             "2026-07-15T09:01:00Z"),
    ]
    agg = aggregate(runs, "2026-07-12", "2026-07-19T12:00:00Z", days=7)
    assert agg["totals"]["runs"] == 4
    assert agg["totals"]["success"] == 2
    assert agg["totals"]["failure"] == 1
    assert agg["totals"]["success_rate"] == 66.7
    assert agg["totals"]["flaky"] == 1
    # 24h window: only the two 07-19 runs
    assert agg["totals_24h"]["runs"] == 2
    assert agg["totals_24h"]["failure"] == 1
    ci = next(w for w in agg["workflows"] if w["name"] == "CI")
    assert ci["runs"] == 3 and ci["flaky"] == 1
    assert len(agg["recent_failures"]) == 1


def test_ci_health_build_writes_json_and_mdx(tmp_path):
    runs = [
        _run("CI", "success", "2026-07-19T10:00:00Z", "2026-07-19T10:05:00Z"),
        _run("CI", "failure", "2026-07-19T09:00:00Z", "2026-07-19T09:04:00Z"),
    ]
    ctx = _ctx(tmp_path, {"ci_runs": runs})
    result = get("ci-health").build(ctx)
    assert result.skipped is False
    assert len(result.changed) == 2

    json_out = ctx.public_dir / "nx-ci-health.json"
    mdx = ctx.content_root / "dashboard" / "ci-health.mdx"
    assert json_out.exists() and mdx.exists()

    data = json.loads(json_out.read_text())
    assert data["generated_at"] == "2026-07-19T12:00:00Z"
    assert data["totals"]["runs"] == 2
    assert list(data.keys())[0] == "generated_at"

    body = mdx.read_text()
    assert "template: splash" in body
    assert "import BentoShell" in body
    assert "CardGrid" not in body
    assert body.count("<BentoProse") == body.count("</BentoProse>")
    assert "```mermaid" in body


def test_aggregate_empty():
    agg = aggregate([], "2026-07-12", "2026-07-19T12:00:00Z")
    assert agg["totals"]["runs"] == 0
    assert agg["totals"]["success_rate"] == 0.0
    assert agg["recent_failures"] == []
