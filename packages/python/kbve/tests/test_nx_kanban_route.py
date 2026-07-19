"""Tests for the ``kanban`` route (GraphQL fetch bypassed via inputs)."""

from __future__ import annotations

import json

from kbve.nx.builder import BuildContext
from kbve.nx.kanban_board import bucket
from kbve.nx.router import get


def _ctx(tmp_path, inputs):
    content_root = tmp_path / "apps/kbve/astro-kbve/src/content/docs"
    public_dir = tmp_path / "apps/kbve/astro-kbve/public/data/nx"
    content_root.mkdir(parents=True)
    (tmp_path / "nx.json").write_text("{}")
    return BuildContext(
        content_root=content_root,
        public_dir=public_dir,
        timestamp="2026-07-19T00:00:00Z",
        inputs=inputs,
    )


def _item(status, number, title, matrix=None, labels=None, itype="ISSUE"):
    return {
        "type": itype,
        "fieldValues": {"nodes": [
            {"field": {"name": "Status"}, "name": status},
            {"field": {"name": "Matrix"}, "number": matrix},
        ]},
        "content": {
            "number": number,
            "title": title,
            "state": "OPEN",
            "url": f"https://github.com/KBVE/kbve/issues/{number}",
            "labels": {"nodes": [{"name": n} for n in (labels or [])]},
            "assignees": {"nodes": [{"login": "h0lybyte"}]},
            "milestone": None,
        },
    }


def _seam(items):
    return {
        "kanban_board": {
            "project": {"title": "KBVE", "url": "https://github.com/orgs/KBVE/projects/5"},
            "items": items,
        }
    }


def test_kanban_needs_tags():
    assert get("kanban").needs == ("token",)


def test_kanban_plan_needs_work(tmp_path):
    assert get("kanban").plan(_ctx(tmp_path, {})).needs_work is True


def test_kanban_skips_without_token(tmp_path, monkeypatch):
    monkeypatch.delenv("UNITY_PAT", raising=False)
    result = get("kanban").build(_ctx(tmp_path, {}))
    assert result.skipped is True


def test_kanban_build_writes_all_three(tmp_path):
    items = [
        _item("Todo", 1, "Fix bug", matrix=5, labels=["bug"]),
        _item("Todo", 2, "Add feature", matrix=9, labels=["feature", "bug"]),
        _item("Done", 3, "Ship it", matrix=3),
        _item("Error", 4, "Broken", matrix=1),
    ]
    ctx = _ctx(tmp_path, _seam(items))
    result = get("kanban").build(ctx)
    assert result.skipped is False
    assert len(result.changed) == 3

    json_src = tmp_path / "apps/kbve/astro-kbve/src/data/nx-kanban.json"
    json_pub = ctx.public_dir / "nx-kanban.json"
    mdx = ctx.content_root / "dashboard" / "kanban-data.mdx"
    assert json_src.exists() and json_pub.exists() and mdx.exists()
    # both JSON copies byte-identical
    assert json_src.read_text() == json_pub.read_text()

    data = json.loads(json_src.read_text())
    assert data["generated_at"] == "2026-07-19T00:00:00Z"
    assert data["project"]["total_items"] == 4
    assert data["summary"]["Todo"] == 2
    assert data["summary"]["Done"] == 1
    assert list(data["columns"].keys()) == [
        "Theory", "AI", "Todo", "Backlog", "Error",
        "Support", "Staging", "Review", "Done",
    ]
    # matrix priority sort — higher first
    assert data["columns"]["Todo"][0]["number"] == 2
    assert "views" in data


def test_kanban_mdx_is_bento(tmp_path):
    ctx = _ctx(tmp_path, _seam([_item("Todo", 1, "X")]))
    get("kanban").build(ctx)
    mdx = (ctx.content_root / "dashboard" / "kanban-data.mdx").read_text()
    assert "template: splash" in mdx
    assert "import BentoShell" in mdx
    assert "CardGrid" not in mdx
    assert mdx.count("<BentoProse") == mdx.count("</BentoProse>")
    assert "```mermaid" in mdx


def test_kanban_json_key_order(tmp_path):
    ctx = _ctx(tmp_path, _seam([_item("Todo", 1, "X")]))
    get("kanban").build(ctx)
    data = json.loads(
        (ctx.public_dir / "nx-kanban.json").read_text())
    assert list(data.keys()) == [
        "generated_at", "project", "summary", "columns", "views"]


def test_bucket_ignores_unknown_status():
    cols, summ = bucket([
        {"type": "ISSUE", "fieldValues": {"nodes": [
            {"field": {"name": "Status"}, "name": "Nonexistent"}]},
         "content": {"number": 1, "title": "x"}},
    ])
    assert sum(summ.values()) == 0
