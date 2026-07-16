"""Tests for kbve.nx.render and kbve.nx.cli."""

import json

from kbve.nx.cli import graph_main, security_main
from kbve.nx.graph import parse_graph
from kbve.nx.render import (
    render_graph_mdx,
    render_security_json,
    render_security_mdx,
)
from kbve.nx.security import parse_all_ecosystems

TS = "2026-07-14T10:00:00Z"


def _security_data(raw):
    parsed = parse_all_ecosystems(raw)
    return {
        "generated_at": TS,
        "summary": parsed["summary"],
        "ecosystems": parsed["ecosystems"],
    }


# ── cargo yanked advisory:null (regression #14103) ──────────────────

def test_cargo_yanked_null_advisory_renders():
    raw = {
        "cargo": {
            "vulnerabilities": {"list": []},
            "warnings": {
                "yanked": [
                    {"kind": "yanked", "advisory": None,
                     "package": {"name": "spin"}},
                ],
            },
        },
    }
    data = _security_data(raw)
    assert data["ecosystems"]["cargo"]["total"] == 1
    mdx = render_security_mdx(data, TS)
    assert "spin" in mdx
    assert render_security_json(data)


# ── security render shape ───────────────────────────────────────────

def test_security_mdx_frontmatter_and_clear():
    data = _security_data({})
    mdx = render_security_mdx(data, TS)
    assert mdx.startswith("---\ntitle: Security Audit Report\n")
    assert "All Clear" in mdx
    assert TS in mdx


def test_security_json_roundtrip():
    data = _security_data({})
    out = json.loads(render_security_json(data))
    assert out["generated_at"] == TS
    assert set(out["ecosystems"]) == {
        "npm", "cargo", "python", "codeql", "dependabot"}


# ── graph render shape ──────────────────────────────────────────────

def _graph_fixture():
    return {
        "graph": {
            "nodes": {
                "web": {"type": "app", "data": {"root": "apps/web"}},
                "ui": {"type": "lib", "data": {"root": "libs/ui"}},
            },
            "dependencies": {
                "web": [{"source": "web", "target": "ui",
                         "type": "static"}],
                "ui": [],
            },
        },
    }


def test_graph_mdx_render():
    graph = parse_graph(_graph_fixture())
    mdx = render_graph_mdx(graph, TS)
    assert mdx.startswith("---\ntitle: NX Dependency Graph\n")
    assert "web" in mdx and "ui" in mdx
    assert "```mermaid" in mdx


# ── CLI entry points ────────────────────────────────────────────────

def test_security_main_writes(tmp_path):
    raw = tmp_path / "raw.json"
    raw.write_text(json.dumps({}))
    mdx = tmp_path / "out.mdx"
    js = tmp_path / "out.json"
    rc = security_main([
        "--input", str(raw), "--mdx-out", str(mdx),
        "--json-out", str(js), "--timestamp", TS])
    assert rc == 0
    assert mdx.read_text().startswith("---\n")
    assert json.loads(js.read_text())["generated_at"] == TS


def test_security_main_requires_output(tmp_path):
    raw = tmp_path / "raw.json"
    raw.write_text(json.dumps({}))
    rc = security_main(["--input", str(raw), "--timestamp", TS])
    assert rc == 1


def test_graph_main_writes(tmp_path):
    graph = tmp_path / "graph.json"
    graph.write_text(json.dumps(_graph_fixture()))
    out = tmp_path / "graph.mdx"
    rc = graph_main([str(graph), str(out), TS])
    assert rc == 0
    assert "NX Dependency Graph" in out.read_text()
