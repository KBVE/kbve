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


def test_security_mdx_bento_structure():
    data = _security_data({})
    mdx = render_security_mdx(data, TS)
    assert "template: splash" in mdx
    assert "import BentoShell from '@/components/hero/BentoShell.astro';" in mdx
    assert "import BentoProse from '@/components/hero/BentoProse.astro';" in mdx
    assert "bento-stat" in mdx
    assert "bento-linkcard" in mdx
    assert "<BentoProse" in mdx
    assert "<CardGrid>" not in mdx
    assert "<Card " not in mdx
    assert 'id="findings"' in mdx
    assert 'id="ecosystems"' in mdx


def test_security_mdx_renders_counts_and_ecosystems():
    data = {
        "generated_at": TS,
        "summary": {"critical": 2, "high": 1, "medium": 0,
                    "low": 0, "info": 0},
        "ecosystems": {
            "npm": {
                "total": 3,
                "severities": {"critical": 2, "high": 1, "medium": 0,
                               "low": 0, "info": 0},
                "advisories": [
                    {"severity": "critical", "package": "leftpad",
                     "title": "RCE", "url": "https://x", "id": 1},
                ],
            },
            "cargo": {"total": 0, "severities": {}, "advisories": []},
            "python": {"total": 0, "severities": {}, "advisories": []},
            "codeql": {"total": 0, "severities": {}, "alerts": []},
            "dependabot": {"total": 0, "severities": {}, "alerts": []},
        },
    }
    mdx = render_security_mdx(data, TS)
    assert ">Critical<" in mdx
    assert 'id="eco-npm"' in mdx
    assert "Cargo" in mdx and "Python" in mdx
    assert "CodeQL" in mdx and "Dependabot" in mdx
    assert '"Critical" : 2' in mdx
    assert "leftpad" in mdx
    assert '<span class="bento-stat__value">2</span>' in mdx


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


def _big_graph(n=60):
    nodes = {"core": {"type": "lib", "data": {"root": "libs/core"}}}
    deps = {"core": []}
    for i in range(n):
        name = f"lib{i}"
        nodes[name] = {"type": "lib", "data": {"root": f"libs/{name}"}}
        deps[name] = [{"source": name, "target": "core", "type": "static"}]
    return {"graph": {"nodes": nodes, "dependencies": deps}}


def test_graph_mdx_caps_large_diagram():
    import re

    from kbve.nx.render import _MAX_DIAGRAM_NODES

    graph = parse_graph(_big_graph(60))
    mdx = render_graph_mdx(graph, TS)
    # capped note is present for oversized graphs
    assert "most-connected projects" in mdx
    # the mermaid diagram renders at most _MAX_DIAGRAM_NODES distinct nodes
    start = mdx.index("graph LR")
    block = mdx[start:mdx.index("```", start)]
    labels = set(re.findall(r'\["([^"]+)"\]', block))
    assert 0 < len(labels) <= _MAX_DIAGRAM_NODES
    # nothing hidden — every project still appears in the full index table
    assert "lib59" in mdx


def test_graph_mdx_small_not_capped():
    graph = parse_graph(_graph_fixture())
    mdx = render_graph_mdx(graph, TS)
    assert "most-connected projects" not in mdx


def test_graph_mdx_bento_structure():
    graph = parse_graph(_graph_fixture())
    mdx = render_graph_mdx(graph, TS)
    assert "template: splash" in mdx
    assert "import BentoShell from '@/components/hero/BentoShell.astro';" in mdx
    assert "import BentoProse from '@/components/hero/BentoProse.astro';" in mdx
    assert "bento-stat" in mdx
    assert "bento-linkcard" in mdx
    assert "<BentoProse" in mdx
    assert "<CardGrid>" not in mdx
    assert "<Card " not in mdx
    assert 'id="diagram"' in mdx
    assert 'id="project-index"' in mdx
    assert "graph LR" in mdx
    assert '<span class="bento-stat__label">Apps</span>' in mdx


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
