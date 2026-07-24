"""Unit tests for the unified-graph enrichment (no graphify binary needed)."""

from __future__ import annotations

import copy

from enrich_unified import (
    doc_ref_for,
    enrich,
    longest_prefix_dir,
    _slug_index,
)


def overview():
    return {
        "meta": {
            "relations": [
                "imports",
                "calls",
                "references",
                "contains",
                "extends",
                "other",
            ],
        },
        "dirs": [
            {"id": "apps__kbve", "label": "apps/kbve", "n": 10, "files": 3},
            {"id": "packages__rust", "label": "packages/rust", "n": 20, "files": 5},
            {"id": "docs", "label": "docs", "n": 1, "files": 1},
        ],
        "dirEdges": [[0, 1, 1, 0]],
    }


def nx_graph():
    return {
        "graph": {
            "nodes": {
                "axum-kbve": {"type": "app", "data": {"root": "apps/kbve/axum-kbve"}},
                "jedi": {"type": "lib", "data": {"root": "packages/rust/jedi"}},
                "kbve": {"type": "lib", "data": {"root": "packages/rust/kbve"}},
            },
            "dependencies": {
                "axum-kbve": [{"target": "jedi"}, {"target": "kbve"}],
                "kbve": [{"target": "jedi"}],  # same dir -> no cross edge
                "jedi": [],
            },
        }
    }


DOCS = ["application/rust", "application/docker", "guides/unrelated", "index"]


def test_longest_prefix_dir_picks_deepest_container():
    labels = ["apps", "apps/kbve", "packages/rust"]
    assert longest_prefix_dir("apps/kbve/axum-kbve", labels) == 1
    assert longest_prefix_dir("packages/rust/jedi", labels) == 2
    assert longest_prefix_dir("nowhere/x", labels) is None


def test_slug_index_prefers_application_namespace():
    idx = _slug_index(["guides/rust", "application/rust"])
    assert idx["rust"] == "application/rust"


def test_doc_ref_matches_first_candidate():
    idx = _slug_index(DOCS)
    assert doc_ref_for(["rust", "jedi"], idx) == "/application/rust/"
    assert doc_ref_for(["nomatch"], idx) is None


def test_enrich_attaches_nx_projects_to_containing_dir():
    o = enrich(overview(), nx_graph(), DOCS)
    kbve_dir = o["dirs"][0]
    rust_dir = o["dirs"][1]
    assert {p["name"] for p in kbve_dir["nx"]["projects"]} == {"axum-kbve"}
    assert {p["name"] for p in rust_dir["nx"]["projects"]} == {"jedi", "kbve"}


def test_enrich_adds_cross_dir_depends_edges_only():
    o = enrich(overview(), nx_graph(), DOCS)
    rel = o["meta"]["relations"]
    assert rel[-1] == "depends"
    di = rel.index("depends")
    depends_edges = [e for e in o["dirEdges"] if e[3] == di]
    # axum-kbve(dir0) -> jedi(dir1) and -> kbve(dir1): both collapse to (0,1) w=2
    assert depends_edges == [[0, 1, 2, di]]
    # kbve->jedi is intra-dir (both dir1) -> excluded
    assert o["meta"]["nxEdges"] == 1


def test_enrich_sets_doc_refs_by_leaf_then_project():
    o = enrich(overview(), nx_graph(), DOCS)
    assert o["dirs"][1]["ref"] == "/application/rust/"  # leaf "rust"
    assert "ref" not in o["dirs"][0]  # no application/kbve or axum-kbve doc
    assert o["meta"]["docRefs"] == 1


def test_enrich_is_idempotent():
    once = enrich(overview(), nx_graph(), DOCS)
    twice = enrich(copy.deepcopy(once), nx_graph(), DOCS)
    assert twice["dirEdges"] == once["dirEdges"]
    assert twice["meta"]["relations"] == once["meta"]["relations"]
    assert twice["meta"]["nxEdges"] == once["meta"]["nxEdges"]
