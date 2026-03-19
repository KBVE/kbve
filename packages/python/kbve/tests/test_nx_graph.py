"""Tests for kbve.nx.graph module."""

from kbve.nx.graph import (
    GraphData,
    collect_edges,
    group_projects_by_type,
    mermaid_id,
    parse_graph,
    top_hubs,
)

SAMPLE_GRAPH = {
    "graph": {
        "nodes": {
            "app-web": {"type": "app", "data": {"root": "apps/web"}},
            "lib-ui": {"type": "lib", "data": {"root": "packages/ui"}},
            "lib-utils": {"type": "lib", "data": {"root": "packages/utils"}},
            "app-web-e2e": {"type": "e2e", "data": {"root": "apps/web-e2e"}},
        },
        "dependencies": {
            "app-web": [
                {"source": "app-web", "target": "lib-ui", "type": "static"},
                {"source": "app-web", "target": "lib-utils", "type": "static"},
            ],
            "lib-ui": [
                {"source": "lib-ui", "target": "lib-utils", "type": "static"},
            ],
            "lib-utils": [],
            "app-web-e2e": [
                {"source": "app-web-e2e", "target": "app-web", "type": "implicit"},
            ],
        },
    }
}


def test_mermaid_id():
    assert mermaid_id("app-web") == "app_web"
    assert mermaid_id("@scope/pkg") == "_scope_pkg"
    assert mermaid_id("simple") == "simple"


def test_group_projects_by_type():
    nodes = SAMPLE_GRAPH["graph"]["nodes"]
    groups = group_projects_by_type(nodes)
    assert set(groups.keys()) == {"app", "lib", "e2e"}
    assert "app-web" in groups["app"]
    assert len(groups["lib"]) == 2


def test_collect_edges():
    deps = SAMPLE_GRAPH["graph"]["dependencies"]
    edges, by_source = collect_edges(deps)
    assert len(edges) == 4
    assert ("app-web", "lib-ui") in edges
    assert ("lib-ui", "lib-utils") in edges
    assert "app-web" in by_source
    assert "lib-utils" in by_source["app-web"]


def test_parse_graph_from_dict():
    gd = parse_graph(SAMPLE_GRAPH)
    assert isinstance(gd, GraphData)
    assert len(gd.nodes) == 4
    assert len(gd.rows) == 4
    assert len(gd.edges) == 4


def test_parse_graph_rows():
    gd = parse_graph(SAMPLE_GRAPH)
    utils_row = next(r for r in gd.rows if r.name == "lib-utils")
    assert utils_row.dep_count == 0
    assert utils_row.dependent_count == 2  # app-web + lib-ui depend on it

    web_row = next(r for r in gd.rows if r.name == "app-web")
    assert web_row.dep_count == 2
    assert web_row.dependent_count == 1  # app-web-e2e depends on it


def test_top_hubs():
    gd = parse_graph(SAMPLE_GRAPH)
    hubs = top_hubs(gd.rows, n=2)
    assert len(hubs) == 2
    assert hubs[0].name == "lib-utils"
    assert hubs[0].dependent_count == 2


def test_parse_graph_from_json_string():
    import json
    json_str = json.dumps(SAMPLE_GRAPH)
    gd = parse_graph(json_str)
    assert len(gd.nodes) == 4
