"""Tests for the inline-SVG chart renderers in :mod:`kbve.svg`."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

import pytest

from kbve.svg import DagEdge, DagNode, Slice, dag_svg, donut_svg
from kbve.svg.escape import escape_svg


def _parse(svg: str) -> ET.Element:
    return ET.fromstring(svg)


# ── escaping ────────────────────────────────────────────────────────

def test_escape_svg_handles_markup_and_jsx_braces():
    assert escape_svg('a & b < c > d "e"') == (
        "a &amp; b &lt; c &gt; d &quot;e&quot;"
    )
    assert escape_svg("{expr}") == "&#123;expr&#125;"


# ── donut ───────────────────────────────────────────────────────────

def test_donut_svg_is_well_formed():
    svg = donut_svg("Projects by Type", [
        Slice("Apps", 62), Slice("Libs", 57), Slice("E2es", 24)])
    root = _parse(svg)
    assert root.tag == "svg"
    assert root.get("role") == "img"
    assert root.get("aria-label") == "Projects by Type"


def test_donut_svg_shows_values_and_percentages():
    svg = donut_svg("T", [Slice("A", 3), Slice("B", 1)])
    assert "A — 3 (75.0%)" in svg
    assert "B — 1 (25.0%)" in svg
    assert ">4<" in svg


def test_donut_svg_hides_values_when_asked():
    svg = donut_svg("T", [Slice("A", 3)], show_data=False)
    assert "75.0%" not in svg
    assert "3 (" not in svg


def test_donut_svg_drops_zero_slices():
    svg = donut_svg("T", [Slice("A", 5), Slice("Zero", 0)])
    assert "Zero" not in svg
    assert "A — 5 (100.0%)" in svg


def test_donut_svg_empty_when_nothing_to_draw():
    assert donut_svg("T", []) == ""
    assert donut_svg("T", [Slice("A", 0)]) == ""


def test_donut_svg_single_slice_uses_full_ring():
    svg = donut_svg("T", [Slice("Only", 9)])
    root = _parse(svg)
    assert root.find("circle") is not None
    assert root.find("path") is None


def test_donut_svg_arc_flag_set_for_majority_slice():
    svg = donut_svg("T", [Slice("Big", 9), Slice("Small", 1)])
    paths = [p.get("d") for p in _parse(svg).findall("path")]
    assert any(" 1 1 " in (d or "") for d in paths)


def test_donut_svg_escapes_labels():
    svg = donut_svg("T", [Slice("a<b>&{c}", 1)])
    assert "a&lt;b&gt;&amp;&#123;c&#125;" in svg
    _parse(svg)


def test_donut_svg_is_deterministic():
    args = ("T", [Slice("A", 2), Slice("B", 5)])
    assert donut_svg(*args) == donut_svg(*args)


def test_donut_svg_respects_explicit_colors():
    svg = donut_svg("T", [Slice("A", 1, "#ff0000")])
    assert "#ff0000" in svg


# ── dag ─────────────────────────────────────────────────────────────

def _nodes(*specs: tuple[str, str]) -> list[DagNode]:
    return [DagNode(name, kind) for name, kind in specs]


def test_dag_svg_is_well_formed():
    svg = dag_svg(
        _nodes(("web", "app"), ("ui", "lib")),
        [DagEdge("web", "ui")],
    )
    root = _parse(svg)
    assert root.tag == "svg"
    assert root.get("viewBox")
    assert root.find("defs/marker") is not None


def test_dag_svg_empty_without_nodes_or_edges():
    assert dag_svg([], []) == ""
    assert dag_svg(_nodes(("solo", "lib")), []) == ""


def test_dag_svg_drops_self_loops_and_unknown_endpoints():
    svg = dag_svg(
        _nodes(("a", "lib"), ("b", "lib")),
        [DagEdge("a", "a"), DagEdge("a", "ghost"), DagEdge("a", "b")],
    )
    assert svg.count("marker-end") == 1
    assert "1 edge<" in svg


def test_dag_svg_drops_isolated_nodes():
    svg = dag_svg(
        _nodes(("a", "lib"), ("b", "lib"), ("lonely", "app")),
        [DagEdge("a", "b")],
    )
    assert "lonely" not in svg
    assert "2 projects · 1 edge<" in svg


def test_dag_svg_dedupes_repeated_edges():
    svg = dag_svg(
        _nodes(("a", "lib"), ("b", "lib")),
        [DagEdge("a", "b"), DagEdge("a", "b")],
    )
    assert svg.count("marker-end") == 1


def test_dag_svg_layers_dependencies_left_to_right():
    svg = dag_svg(
        _nodes(("app", "app"), ("mid", "lib"), ("leaf", "lib")),
        [DagEdge("app", "mid"), DagEdge("mid", "leaf")],
    )
    xs = {}
    for group in _parse(svg).findall("g"):
        title = group.find("title")
        rect = group.find("rect")
        if title is not None and rect is not None:
            xs[title.text] = float(rect.get("x"))
    assert xs["app"] < xs["mid"] < xs["leaf"]


def test_dag_svg_marks_cycle_edge_dashed():
    svg = dag_svg(
        _nodes(("a", "lib"), ("b", "lib")),
        [DagEdge("a", "b"), DagEdge("b", "a")],
    )
    assert svg.count("marker-end") == 2
    assert svg.count("stroke-dasharray") == 1


def test_dag_svg_survives_a_three_node_cycle():
    svg = dag_svg(
        _nodes(("a", "lib"), ("b", "lib"), ("c", "lib")),
        [DagEdge("a", "b"), DagEdge("b", "c"), DagEdge("c", "a")],
    )
    _parse(svg)
    assert svg.count("marker-end") == 3


def test_dag_svg_truncates_long_labels_but_keeps_full_name_in_title():
    long_name = "a-very-long-project-name-that-will-not-fit-in-a-box"
    svg = dag_svg(
        _nodes((long_name, "lib"), ("b", "lib")),
        [DagEdge(long_name, "b")],
    )
    assert "…" in svg
    assert f"<title>{long_name}</title>" in svg


def test_dag_svg_colors_by_project_type():
    svg = dag_svg(
        _nodes(("web", "app"), ("ui", "lib"), ("e2e", "e2e")),
        [DagEdge("web", "ui"), DagEdge("e2e", "web")],
    )
    assert "#3b82f6" in svg
    assert "#10b981" in svg
    assert "#f59e0b" in svg


def test_dag_svg_unknown_type_gets_fallback_color():
    svg = dag_svg(
        _nodes(("a", "mystery"), ("b", "lib")),
        [DagEdge("a", "b")],
    )
    assert "#64748b" in svg


def test_dag_svg_escapes_node_names():
    svg = dag_svg(
        _nodes(("<script>", "lib"), ("b&c", "lib")),
        [DagEdge("<script>", "b&c")],
    )
    assert "<script>" not in svg
    _parse(svg)


def test_dag_svg_is_deterministic_regardless_of_input_order():
    nodes = _nodes(("a", "app"), ("b", "lib"), ("c", "lib"))
    edges = [DagEdge("a", "b"), DagEdge("a", "c"), DagEdge("b", "c")]
    first = dag_svg(nodes, edges)
    second = dag_svg(list(reversed(nodes)), list(reversed(edges)))
    assert first == second


def test_dag_svg_output_is_mdx_safe():
    svg = dag_svg(
        _nodes(("a{1}", "lib"), ("b", "lib")),
        [DagEdge("a{1}", "b")],
    )
    assert "{" not in svg and "}" not in svg


def test_dag_svg_scales_to_a_realistic_monorepo_slice():
    """40 projects, hub-shaped and shallow — the shape graph.mdx emits."""
    nodes = _nodes(("core", "lib"), ("shared", "lib"))
    edges = []
    for i in range(38):
        name = f"proj{i:02d}"
        nodes.append(DagNode(name, "app" if i % 2 else "lib"))
        edges.append(DagEdge(name, "core"))
        if i % 3 == 0:
            edges.append(DagEdge(name, "shared"))
    svg = dag_svg(nodes, edges)
    root = _parse(svg)
    width, height = (float(v) for v in root.get("viewBox").split()[2:])
    assert width < 1200
    assert height < 2200
    assert svg.count("marker-end") == len(edges)


def test_dag_svg_widens_with_dependency_depth():
    nodes, edges = _nodes(("p00", "app")), []
    for i in range(1, 8):
        nodes.append(DagNode(f"p{i:02d}", "lib"))
        edges.append(DagEdge(f"p{i - 1:02d}", f"p{i:02d}"))
    columns = {
        float(rect.get("x")) for rect in _parse(dag_svg(nodes, edges)).iter("rect")
    }
    assert len(columns) == 8


@pytest.mark.parametrize("count", [1, 2, 7, 25])
def test_dag_svg_viewbox_matches_declared_size(count):
    nodes = _nodes(("hub", "lib"))
    edges = []
    for i in range(count):
        nodes.append(DagNode(f"n{i}", "app"))
        edges.append(DagEdge(f"n{i}", "hub"))
    root = _parse(dag_svg(nodes, edges))
    box = root.get("viewBox").split()
    assert box[2] == root.get("width")
    assert box[3] == root.get("height")


def test_dag_svg_nodes_do_not_overlap_within_a_layer():
    nodes = _nodes(("hub", "lib"))
    edges = []
    for i in range(12):
        nodes.append(DagNode(f"n{i:02d}", "app"))
        edges.append(DagEdge(f"n{i:02d}", "hub"))
    svg = dag_svg(nodes, edges)
    boxes = [
        (float(r.get("x")), float(r.get("y")), float(r.get("height")))
        for r in _parse(svg).iter("rect")
    ]
    by_column: dict[float, list[tuple[float, float]]] = {}
    for x, y, h in boxes:
        by_column.setdefault(x, []).append((y, y + h))
    for spans in by_column.values():
        spans.sort()
        for (_, end), (start, _) in zip(spans, spans[1:]):
            assert start >= end


def test_dag_svg_reports_counts_in_footer():
    svg = dag_svg(
        _nodes(("a", "lib"), ("b", "lib"), ("c", "lib")),
        [DagEdge("a", "b"), DagEdge("b", "c")],
    )
    assert re.search(r"3 projects · 2 edges", svg)
