"""Tests for the ``activity`` route (GitHub fetch bypassed via inputs)."""

from __future__ import annotations

import json

from kbve.nx.activity import aggregate, since_day, since_iso
from kbve.nx.builder import BuildContext
from kbve.nx.router import get


def _ctx(tmp_path, inputs):
    content_root = tmp_path / "apps/kbve/astro-kbve/src/content/docs"
    public_dir = tmp_path / "apps/kbve/astro-kbve/public/data/nx"
    content_root.mkdir(parents=True)
    (tmp_path / "nx.json").write_text("{}")
    return BuildContext(
        content_root=content_root, public_dir=public_dir,
        timestamp="2026-07-19T12:00:00Z", inputs=inputs,
    )


def _commit(login, sha, msg):
    return {
        "sha": sha, "html_url": f"https://github.com/x/{sha}",
        "author": {"login": login},
        "commit": {"message": msg, "author": {"date": "2026-07-19T10:00:00Z"}},
    }


def test_activity_needs_tags():
    assert get("activity").needs == ("token",)


def test_activity_skips_without_token(tmp_path, monkeypatch):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    assert get("activity").build(_ctx(tmp_path, {})).skipped is True


def test_since_helpers():
    assert since_day("2026-07-19T12:00:00Z", 7) == "2026-07-12"
    assert since_iso("2026-07-19T12:00:00Z", 1) == "2026-07-18T12:00:00Z"


def test_aggregate_leaderboard():
    commits = [
        _commit("h0lybyte", "aaaaaaa", "feat: x"),
        _commit("h0lybyte", "bbbbbbb", "fix: y"),
        _commit("bot", "ccccccc", "chore: z"),
    ]
    agg = aggregate(commits, {"total": 4, "items": []},
                    {"total": 2}, {"total": 1}, "2026-07-12T00:00:00Z", 7)
    assert agg["commits"]["total"] == 3
    assert agg["commits"]["authors"] == 2
    assert agg["commits"]["leaderboard"][0] == {
        "author": "h0lybyte", "commits": 2}
    assert agg["pull_requests"]["merged"] == 4
    assert agg["issues"]["opened"] == 2 and agg["issues"]["closed"] == 1


def test_activity_build_writes(tmp_path):
    seam = {
        "activity": {
            "commits": [_commit("h0lybyte", "aaaaaaa", "feat: x")],
            "prs": {"total": 1, "items": [
                {"number": 5, "title": "PR", "user": {"login": "h0lybyte"},
                 "html_url": "https://github.com/x/5"}]},
            "issues_opened": {"total": 2},
            "issues_closed": {"total": 1},
        }
    }
    ctx = _ctx(tmp_path, seam)
    result = get("activity").build(ctx)
    assert result.skipped is False and len(result.changed) == 2

    data = json.loads((ctx.public_dir / "nx-activity.json").read_text())
    assert data["generated_at"] == "2026-07-19T12:00:00Z"
    assert data["commits"]["total"] == 1

    mdx = (ctx.content_root / "dashboard" / "activity.mdx").read_text()
    assert "template: splash" in mdx and "CardGrid" not in mdx
    assert mdx.count("<BentoProse") == mdx.count("</BentoProse>")
    assert "```mermaid" in mdx
